// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

// DEMO ONLY — compartment-segregation invariant for the Stream Vault demo.
//
// Hard rule under test: escrow funds (per-tranche `escrowShares`) and reserve
// funds (`reserveShares`) never cross. The handler fuzzes every state-changing
// entry point; the invariants assert that
//   1. the two ledgers exactly account for every T-bill share the vault holds
//      (so neither ledger can ever be fed from the other), and
//   2. the vault's raw dUSD balance is exactly the sum of construction
//      budgets (escrow exits only into drawdown-only budget).

import {Test} from "forge-std/Test.sol";
import {MockUSD} from "../src/MockUSD.sol";
import {MockTBill} from "../src/MockTBill.sol";
import {StreamVault} from "../src/StreamVault.sol";
import {NAVOracle} from "../src/NAVOracle.sol";
import {IERC20} from "openzeppelin-contracts/token/ERC20/IERC20.sol";
import {ERC1155Holder} from "openzeppelin-contracts/token/ERC1155/utils/ERC1155Holder.sol";

uint256 constant SPM = 600;

contract Handler is Test, ERC1155Holder {
    MockUSD public usd;
    MockTBill public tbill;
    StreamVault public vault;
    NAVOracle public oracle;
    address public spv = address(0xBE55);
    uint256 public certNonce;

    constructor() {
        usd = new MockUSD();
        tbill = new MockTBill(usd, 500, SPM);
        usd.setMinter(address(tbill), true);
        vault = new StreamVault(
            IERC20(address(usd)), tbill, SPM, 6100, 120, 2000, 50, 5000, address(this), address(this), address(this)
        );
        oracle = new NAVOracle(vault, tbill, 900);
        vault.setOracle(address(oracle));
        usd.approve(address(vault), type(uint256).max);
        vault.setApprovalForAll(address(vault), true);

        vault.createTranche("T0", 5_000_000e6, 30_000, 190e6, uint64(block.timestamp + 30 * SPM), 18, spv);
        vault.createTranche("T1", 1_000_000e6, 6_000, 190e6, uint64(block.timestamp + 10 * SPM), 12, spv);
    }

    function trancheIds(uint256 seed) internal pure returns (uint256) {
        return seed % 2;
    }

    function deposit(uint256 seed, uint256 amount) external {
        uint256 id = trancheIds(seed);
        StreamVault.Tranche memory t = vault.getTranche(id);
        if (t.state != StreamVault.TrancheState.Predeposit || block.timestamp > t.longstop) return;
        uint256 room = t.capexTarget - t.escrowPrincipal;
        if (room < 1e6) return;
        amount = bound(amount, 1e6, room);
        usd.mint(address(this), amount);
        vault.deposit(id, amount);
    }

    function convert(uint256 seed) external {
        uint256 id = trancheIds(seed);
        StreamVault.Tranche memory t = vault.getTranche(id);
        if (t.state != StreamVault.TrancheState.Predeposit) return;
        if (t.escrowPrincipal * 10_000 < t.capexTarget * 5000) return;
        if (vault.totalUnitsLive() > 0 && oracle.poolNav() == 0) return;
        vault.convertAtNTP(id);
    }

    function sweepMonth(uint256 seed, uint256 gross) external {
        uint256 id = trancheIds(seed);
        StreamVault.Tranche memory t = vault.getTranche(id);
        if (t.state != StreamVault.TrancheState.Streaming || t.monthsSwept >= t.termMonths) return;
        gross = bound(gross, 10_000e6, 1_000_000e6);
        uint256 swept = (gross * 6100) / 10_000;
        usd.mint(address(this), swept);
        vault.sweep(id, gross, gross - swept, keccak256("m"), keccak256("t"), keccak256("b"));
    }

    function drawdown(uint256 seed, uint256 amount) external {
        uint256 id = trancheIds(seed);
        StreamVault.Tranche memory t = vault.getTranche(id);
        if (t.state != StreamVault.TrancheState.Streaming || t.budgetRemaining == 0) return;
        amount = bound(amount, 1, t.budgetRemaining);
        bytes32 cert = keccak256(abi.encode("cert", certNonce++));
        vault.postMilestoneCert(id, cert, "fuzz milestone");
        uint256 dId = vault.queueDrawdown(id, amount, cert);
        vault.confirmDrawdown(dId, vault.MEGAWATT_ROLE());
        vault.confirmDrawdown(dId, vault.AGENT_ROLE());
        vm.warp(block.timestamp + 121);
        vault.executeDrawdown(dId);
    }

    function refundFlow(uint256 seed) external {
        uint256 id = trancheIds(seed);
        StreamVault.Tranche memory t = vault.getTranche(id);
        if (t.state == StreamVault.TrancheState.Predeposit && t.escrowPrincipal > 0) {
            if (block.timestamp <= t.longstop) vm.warp(uint256(t.longstop) + 1);
            vault.refund(id);
            vault.claimRefund(id);
        }
    }

    function requestRedeem(uint256 seed, uint256 units) external {
        uint256 id = trancheIds(seed);
        uint256 bal = vault.balanceOf(address(this), id);
        if (bal == 0) return;
        StreamVault.Tranche memory t = vault.getTranche(id);
        if (t.state != StreamVault.TrancheState.Streaming && t.state != StreamVault.TrancheState.Expired) return;
        units = bound(units, 1, bal);
        vault.requestRedeem(id, units);
    }

    function closeEpoch(uint256 warpSeed) external {
        vm.warp(block.timestamp + bound(warpSeed, SPM, 3 * SPM));
        vault.closeEpoch();
    }

    function expire(uint256 seed) external {
        uint256 id = trancheIds(seed);
        StreamVault.Tranche memory t = vault.getTranche(id);
        if (t.state == StreamVault.TrancheState.Streaming && t.monthsSwept == t.termMonths) {
            vault.expireVintage(id);
        }
    }

    function drift(uint256 warpSeed) external {
        vm.warp(block.timestamp + bound(warpSeed, 1, SPM));
    }
}

/// forge-config: default.invariant.runs = 40
/// forge-config: default.invariant.depth = 60
/// forge-config: default.invariant.fail-on-revert = true
contract SegregationInvariantTest is Test {
    Handler handler;

    function setUp() public {
        handler = new Handler();
        targetContract(address(handler));
    }

    /// Escrow ledgers + reserve ledger together account for every T-bill
    /// share the vault holds — value can never leak from one compartment to
    /// the other, only in/out of the vault through the whitelisted exits.
    function invariant_compartmentsNeverCross() public view {
        StreamVault vault = handler.vault();
        uint256 escrowTotal;
        uint256 n = vault.trancheCount();
        for (uint256 i = 0; i < n; i++) {
            escrowTotal += vault.getTranche(i).escrowShares;
        }
        assertEq(
            escrowTotal + vault.reserveShares(),
            handler.tbill().balanceOf(address(vault)),
            "escrow + reserve ledgers != vault T-bill shares"
        );
    }

    /// The vault's raw dUSD is exactly the undrawn construction budgets: the
    /// only way out of escrow besides refunds, and drawdown-only.
    function invariant_rawBalanceIsBudgets() public view {
        StreamVault vault = handler.vault();
        uint256 budgets;
        uint256 n = vault.trancheCount();
        for (uint256 i = 0; i < n; i++) {
            budgets += vault.getTranche(i).budgetRemaining;
        }
        assertEq(handler.usd().balanceOf(address(vault)), budgets, "raw dUSD != sum of budgets");
    }
}
