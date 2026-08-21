// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

// DEMO ONLY — not audited, not for production use, no real funds.

import {ERC1155} from "openzeppelin-contracts/token/ERC1155/ERC1155.sol";
import {ERC1155Supply} from "openzeppelin-contracts/token/ERC1155/extensions/ERC1155Supply.sol";
import {ERC1155Holder} from "openzeppelin-contracts/token/ERC1155/utils/ERC1155Holder.sol";
import {AccessControl} from "openzeppelin-contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "openzeppelin-contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "openzeppelin-contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "openzeppelin-contracts/token/ERC20/utils/SafeERC20.sol";
import {Strings} from "openzeppelin-contracts/utils/Strings.sol";
import {MockTBill} from "./MockTBill.sol";

interface INAVOracle {
    function pvOfTranche(uint256 trancheId) external view returns (uint256);
    function poolNav() external view returns (uint256);
    function navPerUnit(uint256 trancheId) external view returns (uint256);
    function recordActual(uint256 trancheId, uint256 month, uint256 gross) external;
    function snapshot() external;
}

/// @notice The Stream Vault: finances BESS construction from pre-deposits and
/// returns battery revenue to vintage-unit holders via NAV appreciation.
///
/// Vintage units are ERC-1155 series on this contract (`id = trancheId`):
/// one contract, fungible vintage-tagged series, mirroring the legal tap-bond
/// structure (one instrument, multiple vintages).
///
/// COMPARTMENT SEGREGATION (hard rule): escrow funds and reserve funds are
/// two separate share ledgers against MockTBill — per-tranche `escrowShares`
/// and the global `reserveShares`. No function moves value between them.
/// Escrow shares exit only via `claimRefund` (back to depositors) or
/// `convertAtNTP` (redeemed into `budgetRemaining`, which is drawdown-only).
/// Reserve shares enter only via `sweep` and exit only via `closeEpoch`.
contract StreamVault is ERC1155, ERC1155Supply, ERC1155Holder, AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant MEGAWATT_ROLE = keccak256("MEGAWATT_ROLE"); // protocol admin, signer 1
    bytes32 public constant AGENT_ROLE = keccak256("AGENT_ROLE"); // security agent, signer 2
    bytes32 public constant ENGINEER_ROLE = keccak256("ENGINEER_ROLE"); // independent engineer, signer 3
    bytes32 public constant ORACLE_ROLE = keccak256("ORACLE_ROLE"); // the NAVOracle contract

    enum TrancheState {
        Predeposit,
        Streaming,
        Expired,
        Refunded
    }

    struct Tranche {
        string name; // e.g. "BESS Alba — 5 MW / 10 MWh"
        TrancheState state;
        uint256 capexTarget; // dUSD 6dp
        uint256 refMWhTotal; // reference throughput over the term, integer MWh
        uint256 expRevPerMWh; // expected gross revenue per MWh, dUSD 6dp
        uint64 longstop; // pre-deposit deadline
        uint32 termMonths;
        uint64 streamStart; // set at conversion
        address spvAccount; // whitelisted drawdown destination, fixed at creation
        uint256 escrowShares; // MockTBill shares in this tranche's escrow compartment
        uint256 escrowPrincipal; // dUSD principal deposited
        uint256 budgetRemaining; // dUSD still drawable after conversion
        uint256 unitsMinted; // vintage supply at conversion (6dp: 1e6 = 1 unit = 1 ref MWh)
        uint64 monthsSwept;
        uint256 perfFactorBps; // 10000 = on-plan; oracle adjusts
    }

    struct Drawdown {
        uint256 trancheId;
        uint256 amount; // dUSD
        bytes32 certHash;
        uint64 eta; // earliest execution time
        bool executed;
        uint8 confirmations; // distinct-role confirmations
    }

    struct RedeemRequest {
        address owner;
        uint256 trancheId;
        uint256 units; // remaining unpaid units (6dp)
    }

    IERC20 public immutable usd;
    MockTBill public immutable tbill;
    INAVOracle public oracle;

    // Demo clock + economics, fixed at deploy.
    uint256 public immutable secondsPerMonth;
    uint16 public immutable sweepShareBps; // share of gross revenue swept to the vault
    uint64 public immutable drawdownTimelock;
    uint16 public immutable epochCapBps; // per-epoch redemption liquidity cap, % of reserves
    uint16 public immutable redeemSpreadBps; // redemption discount vs NAV
    uint16 public immutable subscriptionThresholdBps; // min % of capex subscribed to convert

    Tranche[] private _tranches;
    uint256[] public convertedIds; // tranches that have live vintage units

    // Locked, non-transferable pre-deposit receipts (plain mapping, NOT a token).
    mapping(uint256 => mapping(address => uint256)) public receipts;
    mapping(uint256 => address[]) private _depositors;
    mapping(uint256 => mapping(address => bool)) private _isDepositor;

    // Refund snapshot so pro-rata claims stay exact as escrow drains.
    mapping(uint256 => uint256) public refundShares;
    mapping(uint256 => uint256) public refundPrincipal;

    // Reserve compartment (revenue side). See segregation note in the header.
    uint256 public reserveShares;

    // Milestone certificates + drawdowns.
    mapping(uint256 => bytes32) public latestCert;
    mapping(bytes32 => bool) public certUsed;
    mapping(uint256 => Drawdown) public drawdowns;
    uint256 public drawdownCount;
    mapping(uint256 => mapping(bytes32 => bool)) public drawdownConfirmedByRole;

    // Redemption epochs: global FIFO queue.
    RedeemRequest[] public redeemQueue;
    uint256 public queueHead;
    uint64 public lastEpochClose;
    uint256 public epochCount;

    event TrancheCreated(uint256 indexed trancheId, string name, uint256 capexTarget, uint64 longstop, address spvAccount);
    event PreDeposited(uint256 indexed trancheId, address indexed depositor, uint256 amount);
    event Refunded(uint256 indexed trancheId);
    event RefundClaimed(uint256 indexed trancheId, address indexed depositor, uint256 assets);
    event ConvertedAtNTP(uint256 indexed trancheId, uint256 unitsMinted, uint256 pvNew, uint256 poolNavBefore);
    event MilestoneCertified(uint256 indexed trancheId, bytes32 certHash, string memo);
    event DrawdownQueued(uint256 indexed drawdownId, uint256 indexed trancheId, uint256 amount, bytes32 certHash, uint64 eta);
    event DrawdownConfirmed(uint256 indexed drawdownId, bytes32 role, uint8 confirmations);
    event DrawdownExecuted(uint256 indexed drawdownId, uint256 indexed trancheId, uint256 amount, address spvAccount);
    event SweepReceived(
        uint256 indexed trancheId,
        uint64 month,
        uint256 grossRevenue,
        uint256 sweptAmount,
        uint256 ownerRemainder,
        bytes32 meterRef,
        bytes32 tsoRef,
        bytes32 bankRef
    );
    event VintageExpired(uint256 indexed trancheId);
    event RedeemQueued(uint256 indexed requestId, uint256 indexed trancheId, address indexed owner, uint256 units);
    event RedeemPaid(uint256 indexed requestId, uint256 indexed trancheId, address indexed owner, uint256 units, uint256 assets, uint256 redeemNav);
    event EpochClosed(uint256 indexed epoch, uint256 paidRequests, uint256 paidAssets, uint256 reservesAfter);

    constructor(
        IERC20 usd_,
        MockTBill tbill_,
        uint256 secondsPerMonth_,
        uint16 sweepShareBps_,
        uint64 drawdownTimelock_,
        uint16 epochCapBps_,
        uint16 redeemSpreadBps_,
        uint16 subscriptionThresholdBps_,
        address megawatt,
        address agent,
        address engineer
    ) ERC1155("") {
        usd = usd_;
        tbill = tbill_;
        secondsPerMonth = secondsPerMonth_;
        sweepShareBps = sweepShareBps_;
        drawdownTimelock = drawdownTimelock_;
        epochCapBps = epochCapBps_;
        redeemSpreadBps = redeemSpreadBps_;
        subscriptionThresholdBps = subscriptionThresholdBps_;

        _grantRole(DEFAULT_ADMIN_ROLE, megawatt);
        _grantRole(MEGAWATT_ROLE, megawatt);
        _grantRole(AGENT_ROLE, agent);
        _grantRole(ENGINEER_ROLE, engineer);

        // The vault only ever deposits dUSD into the T-bill vault.
        usd_.forceApprove(address(tbill_), type(uint256).max);

        lastEpochClose = uint64(block.timestamp);
    }

    /// @notice One-time wiring of the NAV oracle (deployed after the vault).
    function setOracle(address oracle_) external onlyRole(MEGAWATT_ROLE) {
        require(address(oracle) == address(0), "vault: oracle set");
        oracle = INAVOracle(oracle_);
        _grantRole(ORACLE_ROLE, oracle_);
    }

    /// @notice Oracle writes the performance factor after each recorded month.
    function setPerfFactor(uint256 trancheId, uint256 bps) external onlyRole(ORACLE_ROLE) {
        _tranches[trancheId].perfFactorBps = bps;
    }

    // ─── views ───────────────────────────────────────────────────

    function trancheCount() external view returns (uint256) {
        return _tranches.length;
    }

    function getTranche(uint256 trancheId) external view returns (Tranche memory) {
        return _tranches[trancheId];
    }

    /// @notice Units outstanding across all converted vintages (queued-for-
    /// redemption units stay outstanding until burned at epoch close).
    function totalUnitsLive() public view returns (uint256 total) {
        for (uint256 i = 0; i < convertedIds.length; i++) {
            total += totalSupply(convertedIds[i]);
        }
    }

    function convertedCount() external view returns (uint256) {
        return convertedIds.length;
    }

    function depositorCount(uint256 trancheId) external view returns (uint256) {
        return _depositors[trancheId].length;
    }

    function depositorAt(uint256 trancheId, uint256 index) external view returns (address) {
        return _depositors[trancheId][index];
    }

    function redeemQueueLength() external view returns (uint256) {
        return redeemQueue.length;
    }

    function uri(uint256 trancheId) public view override returns (string memory) {
        Tranche storage t = _tranches[trancheId];
        string[4] memory states = ["Predeposit", "Streaming", "Expired", "Refunded"];
        string memory state = states[uint256(t.state)];
        return string.concat(
            'data:application/json,{"name":"',
            t.name,
            '","term_months":',
            Strings.toString(t.termMonths),
            ',"state":"',
            state,
            '"}'
        );
    }

    // ─── lifecycle ───────────────────────────────────────────────

    function createTranche(
        string calldata name,
        uint256 capexTarget,
        uint256 refMWhTotal,
        uint256 expRevPerMWh,
        uint64 longstop,
        uint32 termMonths,
        address spvAccount
    ) external onlyRole(MEGAWATT_ROLE) returns (uint256 trancheId) {
        require(capexTarget > 0 && refMWhTotal > 0 && termMonths > 0, "vault: bad params");
        require(spvAccount != address(0), "vault: zero spv");
        trancheId = _tranches.length;
        _tranches.push(
            Tranche({
                name: name,
                state: TrancheState.Predeposit,
                capexTarget: capexTarget,
                refMWhTotal: refMWhTotal,
                expRevPerMWh: expRevPerMWh,
                longstop: longstop,
                termMonths: termMonths,
                streamStart: 0,
                spvAccount: spvAccount,
                escrowShares: 0,
                escrowPrincipal: 0,
                budgetRemaining: 0,
                unitsMinted: 0,
                monthsSwept: 0,
                perfFactorBps: 10_000
            })
        );
        emit TrancheCreated(trancheId, name, capexTarget, longstop, spvAccount);
    }

    /// @notice Pre-deposit escrow: dUSD in, parked in the T-bill vault, locked
    /// receipt recorded. Yield accrues to the depositor (it either buys extra
    /// units at conversion or is refunded on longstop failure).
    function deposit(uint256 trancheId, uint256 amount) external nonReentrant {
        Tranche storage t = _tranches[trancheId];
        require(t.state == TrancheState.Predeposit, "vault: not predeposit");
        require(block.timestamp <= t.longstop, "vault: past longstop");
        require(amount > 0, "vault: zero amount");
        require(t.escrowPrincipal + amount <= t.capexTarget, "vault: exceeds capex target");

        usd.safeTransferFrom(msg.sender, address(this), amount);
        uint256 shares = tbill.deposit(amount, address(this));
        t.escrowShares += shares;
        t.escrowPrincipal += amount;
        receipts[trancheId][msg.sender] += amount;
        if (!_isDepositor[trancheId][msg.sender]) {
            _isDepositor[trancheId][msg.sender] = true;
            _depositors[trancheId].push(msg.sender);
        }
        emit PreDeposited(trancheId, msg.sender, amount);
    }

    /// @notice Anyone can flip a tranche that missed its longstop to Refunded.
    function refund(uint256 trancheId) external {
        Tranche storage t = _tranches[trancheId];
        require(t.state == TrancheState.Predeposit, "vault: not predeposit");
        require(block.timestamp > t.longstop, "vault: longstop not passed");
        t.state = TrancheState.Refunded;
        refundShares[trancheId] = t.escrowShares;
        refundPrincipal[trancheId] = t.escrowPrincipal;
        emit Refunded(trancheId);
    }

    /// @notice Par + pro-rata accrued T-bill yield, straight from escrow.
    function claimRefund(uint256 trancheId) external nonReentrant returns (uint256 assets) {
        Tranche storage t = _tranches[trancheId];
        require(t.state == TrancheState.Refunded, "vault: not refunded");
        uint256 principal = receipts[trancheId][msg.sender];
        require(principal > 0, "vault: no receipt");
        receipts[trancheId][msg.sender] = 0;
        uint256 shares = (refundShares[trancheId] * principal) / refundPrincipal[trancheId];
        t.escrowShares -= shares;
        assets = tbill.redeem(shares, msg.sender, address(this));
        emit RefundClaimed(trancheId, msg.sender, assets);
    }

    /// @notice RTB gate: convert locked receipts into fungible vintage units
    /// at a PV-parity mint. Nobody sets the ratio by hand:
    ///  - first live tranche: `units = refMWhTotal * 1e6` (1 unit ≙ 1 reference MWh);
    ///  - otherwise: `units = pvNew * totalUnitsLive / poolNav`, so PV per unit
    ///    is identical across old and new vintages — existing holders are
    ///    neither diluted nor enriched by the new mint.
    /// The whole escrow value converts: accrued T-bill yield simply buys each
    /// depositor proportionally more of the construction budget (and units are
    /// minted pro-rata to principal, which carries the same proportions).
    function convertAtNTP(uint256 trancheId) external onlyRole(MEGAWATT_ROLE) nonReentrant {
        Tranche storage t = _tranches[trancheId];
        require(t.state == TrancheState.Predeposit, "vault: not predeposit");
        require(
            t.escrowPrincipal * 10_000 >= t.capexTarget * subscriptionThresholdBps,
            "vault: undersubscribed"
        );

        uint256 pvNew = oracle.pvOfTranche(trancheId);
        uint256 totalLive = totalUnitsLive();
        uint256 units;
        uint256 poolNavBefore = 0;
        if (totalLive == 0) {
            units = t.refMWhTotal * 1e6;
        } else {
            poolNavBefore = oracle.poolNav();
            require(poolNavBefore > 0, "vault: zero pool nav");
            // PV-parity: (poolNav + pvNew) / (totalLive + units) == poolNav / totalLive
            units = (pvNew * totalLive) / poolNavBefore;
        }
        require(units > 0, "vault: zero units");

        // Redeem the whole escrow compartment; principal + accrued becomes the
        // drawdown-only construction budget.
        uint256 escrowShares_ = t.escrowShares;
        t.escrowShares = 0;
        uint256 assets = tbill.redeem(escrowShares_, address(this), address(this));
        t.budgetRemaining = assets;
        t.unitsMinted = units;
        t.state = TrancheState.Streaming;
        t.streamStart = uint64(block.timestamp);
        convertedIds.push(trancheId);

        // Mint vintage units pro-rata to receipts; last depositor takes the
        // rounding remainder so the sum is exact.
        address[] storage deps = _depositors[trancheId];
        uint256 mintedSoFar = 0;
        for (uint256 i = 0; i < deps.length; i++) {
            uint256 share;
            if (i == deps.length - 1) {
                share = units - mintedSoFar;
            } else {
                share = (units * receipts[trancheId][deps[i]]) / t.escrowPrincipal;
            }
            mintedSoFar += share;
            if (share > 0) _mint(deps[i], trancheId, share, "");
        }

        emit ConvertedAtNTP(trancheId, units, pvNew, poolNavBefore);
        oracle.snapshot();
    }

    // ─── drawdown flow: cert → queue → 2-of-3 confirm → timelock → execute ──
    // Built-in 2-of-3 for the demo. PRODUCTION: Gnosis Safe module instead.

    function postMilestoneCert(uint256 trancheId, bytes32 certHash, string calldata memo)
        external
        onlyRole(ENGINEER_ROLE)
    {
        require(trancheId < _tranches.length, "vault: no tranche");
        require(certHash != bytes32(0), "vault: empty cert");
        latestCert[trancheId] = certHash;
        emit MilestoneCertified(trancheId, certHash, memo);
    }

    function queueDrawdown(uint256 trancheId, uint256 amount, bytes32 certHash)
        external
        returns (uint256 drawdownId)
    {
        require(_isSigner(msg.sender), "vault: not a signer");
        Tranche storage t = _tranches[trancheId];
        require(t.state == TrancheState.Streaming, "vault: not streaming");
        require(amount > 0 && amount <= t.budgetRemaining, "vault: exceeds budget");
        require(certHash == latestCert[trancheId] && certHash != bytes32(0), "vault: stale cert");
        require(!certUsed[certHash], "vault: cert used");

        drawdownId = drawdownCount++;
        Drawdown storage d = drawdowns[drawdownId];
        d.trancheId = trancheId;
        d.amount = amount;
        d.certHash = certHash;
        d.eta = uint64(block.timestamp) + drawdownTimelock;
        emit DrawdownQueued(drawdownId, trancheId, amount, certHash, d.eta);
    }

    /// @notice Confirm as one of the three signer roles. Each role counts once;
    /// two distinct roles are required before execution.
    function confirmDrawdown(uint256 drawdownId, bytes32 role) external {
        require(role == MEGAWATT_ROLE || role == AGENT_ROLE || role == ENGINEER_ROLE, "vault: bad role");
        require(hasRole(role, msg.sender), "vault: missing role");
        Drawdown storage d = drawdowns[drawdownId];
        require(d.amount > 0, "vault: no drawdown");
        require(!d.executed, "vault: executed");
        require(!drawdownConfirmedByRole[drawdownId][role], "vault: role confirmed");
        drawdownConfirmedByRole[drawdownId][role] = true;
        d.confirmations += 1;
        emit DrawdownConfirmed(drawdownId, role, d.confirmations);
    }

    /// @notice Anyone can execute after the timelock with 2-of-3 confirmations.
    /// Funds can only ever land on the tranche's fixed `spvAccount` — there is
    /// deliberately no recipient parameter.
    function executeDrawdown(uint256 drawdownId) external nonReentrant {
        Drawdown storage d = drawdowns[drawdownId];
        require(d.amount > 0, "vault: no drawdown");
        require(!d.executed, "vault: executed");
        require(block.timestamp >= d.eta, "vault: timelocked");
        require(d.confirmations >= 2, "vault: need 2 of 3");
        require(!certUsed[d.certHash], "vault: cert used");
        Tranche storage t = _tranches[d.trancheId];
        require(t.state == TrancheState.Streaming, "vault: not streaming");
        require(d.amount <= t.budgetRemaining, "vault: exceeds budget");

        d.executed = true;
        certUsed[d.certHash] = true;
        t.budgetRemaining -= d.amount;
        usd.safeTransfer(t.spvAccount, d.amount);
        emit DrawdownExecuted(drawdownId, d.trancheId, d.amount, t.spvAccount);
    }

    // ─── monthly revenue sweep ───────────────────────────────────

    /// @notice Record a month of battery revenue. The swept share is pulled
    /// from the caller (demo: a funded revenue-simulator wallet plays the
    /// SPV/exchange leg), parked in the T-bill vault, and credited to the
    /// reserve compartment. `ownerRemainder` is event-only — it documents the
    /// owner's unconditional release. The vault does NOT distribute: NAV per
    /// unit rises instead.
    function sweep(
        uint256 trancheId,
        uint256 grossRevenue,
        uint256 ownerRemainder,
        bytes32 meterRef,
        bytes32 tsoRef,
        bytes32 bankRef
    ) external onlyRole(MEGAWATT_ROLE) nonReentrant {
        Tranche storage t = _tranches[trancheId];
        require(t.state == TrancheState.Streaming, "vault: not streaming");
        require(t.monthsSwept < t.termMonths, "vault: term complete");

        uint256 swept = (grossRevenue * sweepShareBps) / 10_000;
        usd.safeTransferFrom(msg.sender, address(this), swept);
        uint256 shares = tbill.deposit(swept, address(this));
        reserveShares += shares;
        t.monthsSwept += 1;

        oracle.recordActual(trancheId, t.monthsSwept, grossRevenue);
        emit SweepReceived(trancheId, t.monthsSwept, grossRevenue, swept, ownerRemainder, meterRef, tsoRef, bankRef);
        oracle.snapshot();
    }

    /// @notice Once the full term is swept the vintage expires: its units are
    /// redeemable at terminal NAV only (pure reserves, no PV component).
    function expireVintage(uint256 trancheId) external {
        Tranche storage t = _tranches[trancheId];
        require(t.state == TrancheState.Streaming, "vault: not streaming");
        require(t.monthsSwept == t.termMonths, "vault: term not complete");
        t.state = TrancheState.Expired;
        emit VintageExpired(trancheId);
        oracle.snapshot();
    }

    // ─── redemption epochs: FIFO, forward-priced ─────────────────
    // Redemptions pay `navPerUnit * (1 - spread)` while deposits/mints always
    // occur at full (optimistic) NAV. The asymmetry is the same anti-timing
    // ("forward pricing") mechanism USD.AI uses: capturing a sweep by entering
    // just before it and exiting just after costs more than the gain.

    function requestRedeem(uint256 trancheId, uint256 units) external nonReentrant returns (uint256 requestId) {
        Tranche storage t = _tranches[trancheId];
        require(t.state == TrancheState.Streaming || t.state == TrancheState.Expired, "vault: not redeemable");
        require(units > 0, "vault: zero units");
        safeTransferFrom(msg.sender, address(this), trancheId, units, ""); // lock in the vault
        requestId = redeemQueue.length;
        redeemQueue.push(RedeemRequest({owner: msg.sender, trancheId: trancheId, units: units}));
        emit RedeemQueued(requestId, trancheId, msg.sender, units);
    }

    /// @notice Anyone can close an epoch once per epoch length. Pays the queue
    /// in order from the reserve compartment at the spread-discounted NAV,
    /// stopping when the epoch's liquidity cap is exhausted; the remainder
    /// stays queued for the next epoch.
    function closeEpoch() external nonReentrant {
        require(block.timestamp >= lastEpochClose + secondsPerMonth, "vault: epoch not elapsed");
        lastEpochClose = uint64(block.timestamp);
        epochCount += 1;

        uint256 reservesVal = tbill.previewRedeem(reserveShares);
        uint256 capLeft = (reservesVal * epochCapBps) / 10_000;
        uint256 paidRequests = 0;
        uint256 paidAssets = 0;

        while (queueHead < redeemQueue.length && capLeft > 0) {
            RedeemRequest storage r = redeemQueue[queueHead];
            uint256 redeemNav = (oracle.navPerUnit(r.trancheId) * (10_000 - redeemSpreadBps)) / 10_000;
            if (redeemNav == 0) break; // nothing to price against — leave queued
            uint256 payUnits = r.units;
            uint256 owed = (payUnits * redeemNav) / 1e6;
            if (owed > capLeft) {
                payUnits = (capLeft * 1e6) / redeemNav;
                owed = (payUnits * redeemNav) / 1e6;
            }
            if (payUnits == 0) break;

            r.units -= payUnits;
            _burn(address(this), r.trancheId, payUnits);
            uint256 sharesBurned = tbill.withdraw(owed, r.owner, address(this));
            reserveShares -= sharesBurned;
            capLeft -= owed;
            paidAssets += owed;
            paidRequests += 1;
            emit RedeemPaid(queueHead, r.trancheId, r.owner, payUnits, owed, redeemNav);

            if (r.units == 0) {
                queueHead += 1;
            } else {
                break; // cap exhausted mid-request
            }
        }

        emit EpochClosed(epochCount, paidRequests, paidAssets, tbill.previewRedeem(reserveShares));
        oracle.snapshot();
    }

    // ─── internals ───────────────────────────────────────────────

    function _isSigner(address who) internal view returns (bool) {
        return hasRole(MEGAWATT_ROLE, who) || hasRole(AGENT_ROLE, who) || hasRole(ENGINEER_ROLE, who);
    }

    function _update(address from, address to, uint256[] memory ids, uint256[] memory values)
        internal
        override(ERC1155, ERC1155Supply)
    {
        super._update(from, to, ids, values);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC1155, ERC1155Holder, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
