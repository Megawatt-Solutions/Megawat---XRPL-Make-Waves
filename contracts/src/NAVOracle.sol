// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

// DEMO ONLY — not audited, not for production use, no real funds.

import {StreamVault} from "./StreamVault.sol";
import {MockTBill} from "./MockTBill.sol";

/// @notice Pure-mechanical NAV maths for the Stream Vault — no admin keys,
/// no manual marks. NAV per unit = (reserves + PV of remaining expected
/// revenue) / units outstanding. Under-delivery marks the remaining PV down
/// via the rolling performance factor; over-delivery marks it up.
contract NAVOracle {
    StreamVault public immutable vault;
    MockTBill public immutable tbill;
    uint16 public immutable discountRateBps; // APR used to discount the stream

    // Rolling actual-vs-expected tracking per tranche.
    mapping(uint256 => uint256) public totalActualGross;
    mapping(uint256 => uint256) public monthsRecorded;

    struct NavPoint {
        uint64 timestamp;
        uint256 poolNav; // dUSD 6dp
        uint256 totalUnits; // 6dp
    }

    NavPoint[] public navHistory;

    event ActualRecorded(uint256 indexed trancheId, uint256 month, uint256 gross, uint256 perfFactorBps);
    event Snapshot(uint256 poolNav, uint256 totalUnits);

    modifier onlyVault() {
        require(msg.sender == address(vault), "oracle: not vault");
        _;
    }

    constructor(StreamVault vault_, MockTBill tbill_, uint16 discountRateBps_) {
        vault = vault_;
        tbill = tbill_;
        discountRateBps = discountRateBps_;
    }

    // ─── PV of the expected revenue stream ───────────────────────

    /// @notice PV of the vault's share of the tranche's remaining expected
    /// revenue: Σ over remaining months of
    ///   (refMWhTotal / termMonths) * expRevPerMWh * sweepShare * perfFactor,
    /// discounted at `discountRateBps` APR (monthly compounding on the demo's
    /// compressed clock — a "month" is whatever the vault says it is).
    /// Straight-line monthly schedule.
    /// TODO: production shape — warranty/degradation curve instead of
    /// straight-line (front-loaded throughput, tapering with cycle count).
    function pvOfTranche(uint256 trancheId) public view returns (uint256) {
        StreamVault.Tranche memory t = vault.getTranche(trancheId);
        uint256 remaining;
        if (t.state == StreamVault.TrancheState.Predeposit) {
            remaining = t.termMonths; // full stream ahead (used by the NTP mint)
        } else if (t.state == StreamVault.TrancheState.Streaming) {
            remaining = t.termMonths - t.monthsSwept;
        } else {
            return 0; // Expired / Refunded: no PV component
        }
        if (remaining == 0) return 0;

        uint256 expectedMonthlyGross = (t.refMWhTotal * t.expRevPerMWh) / t.termMonths;
        uint256 monthlySwept =
            (((expectedMonthlyGross * vault.sweepShareBps()) / 10_000) * t.perfFactorBps) / 10_000;

        // Per-month discount factor 1/(1 + apr/12), 1e18-scaled.
        uint256 f = (1e18 * 120_000) / (120_000 + uint256(discountRateBps));
        uint256 acc = 1e18;
        uint256 pv = 0;
        for (uint256 k = 0; k < remaining; k++) {
            acc = (acc * f) / 1e18;
            pv += (monthlySwept * acc) / 1e18;
        }
        return pv;
    }

    // ─── performance recording (vault-only) ──────────────────────

    /// @notice Called by the vault inside every sweep. Updates the tranche's
    /// rolling performance ratio, clamped to [0.5x, 1.5x], so the remaining
    /// PV marks down on under-delivery and up on over-delivery.
    function recordActual(uint256 trancheId, uint256 month, uint256 gross) external onlyVault {
        totalActualGross[trancheId] += gross;
        monthsRecorded[trancheId] += 1;

        StreamVault.Tranche memory t = vault.getTranche(trancheId);
        uint256 expectedMonthlyGross = (t.refMWhTotal * t.expRevPerMWh) / t.termMonths;
        uint256 perf = (totalActualGross[trancheId] * 10_000) / (expectedMonthlyGross * monthsRecorded[trancheId]);
        if (perf < 5_000) perf = 5_000;
        if (perf > 15_000) perf = 15_000;
        vault.setPerfFactor(trancheId, perf);
        emit ActualRecorded(trancheId, month, gross, perf);
    }

    // ─── NAV ─────────────────────────────────────────────────────

    /// @notice dUSD value of the vault's reserve compartment (T-bill shares).
    function reservesValue() public view returns (uint256) {
        return tbill.previewRedeem(vault.reserveShares());
    }

    /// @notice Pool NAV = reserves + Σ PV of live (Streaming) vintages.
    function poolNav() public view returns (uint256 nav) {
        nav = reservesValue();
        uint256 n = vault.convertedCount();
        for (uint256 i = 0; i < n; i++) {
            nav += pvOfTranche(vault.convertedIds(i));
        }
    }

    /// @notice NAV per whole unit (dUSD 6dp per 1e6 unit-wei) for a vintage.
    /// Streaming: this vintage's pro-rata slice of reserves plus its own PV.
    /// Expired: pure cash — the reserves slice only.
    function navPerUnit(uint256 trancheId) public view returns (uint256) {
        uint256 supply = vault.totalSupply(trancheId);
        uint256 totalLive = vault.totalUnitsLive();
        if (supply == 0 || totalLive == 0) return 0;
        uint256 reservesSlicePerUnit = (reservesValue() * 1e6) / totalLive;
        StreamVault.Tranche memory t = vault.getTranche(trancheId);
        if (t.state == StreamVault.TrancheState.Streaming) {
            return reservesSlicePerUnit + (pvOfTranche(trancheId) * 1e6) / supply;
        }
        if (t.state == StreamVault.TrancheState.Expired) {
            return reservesSlicePerUnit;
        }
        return 0;
    }

    // ─── history (frontend chart, no indexer needed) ─────────────

    /// @notice Called by the vault inside every sweep and epoch close (and at
    /// conversion) so the frontend can chart NAV straight from storage.
    function snapshot() external onlyVault {
        uint256 nav = poolNav();
        uint256 units = vault.totalUnitsLive();
        navHistory.push(NavPoint({timestamp: uint64(block.timestamp), poolNav: nav, totalUnits: units}));
        emit Snapshot(nav, units);
    }

    function navHistoryLength() external view returns (uint256) {
        return navHistory.length;
    }

    function getNavHistory() external view returns (NavPoint[] memory) {
        return navHistory;
    }
}
