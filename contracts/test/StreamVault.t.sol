// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

// DEMO ONLY — tests for the Stream Vault demo suite.

import {Test} from "forge-std/Test.sol";
import {MockUSD} from "../src/MockUSD.sol";
import {MockTBill} from "../src/MockTBill.sol";
import {StreamVault} from "../src/StreamVault.sol";
import {NAVOracle} from "../src/NAVOracle.sol";
import {IERC20} from "openzeppelin-contracts/token/ERC20/IERC20.sol";

uint256 constant SPM = 600; // secondsPerMonth, demo clock
uint256 constant CAPEX = 7_500_000e6;
uint256 constant REF_MWH = 49_275;
uint256 constant EXP_REV = 190e6;
uint32 constant TERM = 18;
uint256 constant MONTHLY_GROSS = (REF_MWH * EXP_REV) / TERM; // 520,125 dUSD

contract StreamVaultTestBase is Test {
    MockUSD usd;
    MockTBill tbill;
    StreamVault vault;
    NAVOracle oracle;

    address agent = makeAddr("agent");
    address engineer = makeAddr("engineer");
    address spv = makeAddr("spv");
    bytes32 MEGAWATT_ROLE;
    bytes32 AGENT_ROLE;

    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address carol = makeAddr("carol");

    function setUp() public virtual {
        usd = new MockUSD();
        tbill = new MockTBill(usd, 500, SPM);
        usd.setMinter(address(tbill), true);
        // this test contract = MEGAWATT signer + admin
        vault = new StreamVault(
            IERC20(address(usd)), tbill, SPM, 6100, 120, 2000, 50, 9000, address(this), agent, engineer
        );
        oracle = new NAVOracle(vault, tbill, 900);
        vault.setOracle(address(oracle));
        MEGAWATT_ROLE = vault.MEGAWATT_ROLE();
        AGENT_ROLE = vault.AGENT_ROLE();

        vault.createTranche(
            unicode"BESS Alba — 5 MW / 10 MWh", CAPEX, REF_MWH, EXP_REV, uint64(block.timestamp + 7 days), TERM, spv
        );
    }

    function _fund(address who, uint256 amount) internal {
        usd.mint(who, amount);
        vm.prank(who);
        usd.approve(address(vault), type(uint256).max);
    }

    function _depositAll() internal {
        _fund(alice, 3_000_000e6);
        _fund(bob, 2_500_000e6);
        _fund(carol, 2_000_000e6);
        vm.prank(alice);
        vault.deposit(0, 3_000_000e6);
        vm.prank(bob);
        vault.deposit(0, 2_500_000e6);
        vm.prank(carol);
        vault.deposit(0, 2_000_000e6);
    }

    function _sweepMonth(uint256 trancheId, uint256 gross) internal {
        usd.mint(address(this), gross);
        usd.approve(address(vault), type(uint256).max);
        vault.sweep(trancheId, gross, gross - (gross * 6100) / 10_000, keccak256("meter"), keccak256("tso"), keccak256("bank"));
    }

    function _drawdown(uint256 trancheId, uint256 amount, bytes32 cert, string memory memo) internal returns (uint256 id) {
        vm.prank(engineer);
        vault.postMilestoneCert(trancheId, cert, memo);
        id = vault.queueDrawdown(trancheId, amount, cert);
        vault.confirmDrawdown(id, MEGAWATT_ROLE);
        vm.prank(agent);
        vault.confirmDrawdown(id, AGENT_ROLE);
        vm.warp(block.timestamp + 121);
        vault.executeDrawdown(id);
    }
}

contract HappyPathTest is StreamVaultTestBase {
    /// Full lifecycle: create → 3 deposits → convert (k=1) → 2 drawdowns →
    /// 6 sweeps with strictly increasing NAV → redeem in epoch at spread →
    /// expire → terminal redemption.
    function test_fullHappyPath() public {
        _depositAll();

        // convert after some escrow accrual
        vm.warp(block.timestamp + 3600);
        vault.convertAtNTP(0);

        StreamVault.Tranche memory t = vault.getTranche(0);
        assertEq(uint8(t.state), uint8(StreamVault.TrancheState.Streaming), "streaming");
        assertEq(t.unitsMinted, REF_MWH * 1e6, "k=1 mint: 1 unit per reference MWh");
        assertEq(vault.totalSupply(0), REF_MWH * 1e6);
        // pro-rata units (alice 3M / 7.5M = 40%)
        assertEq(vault.balanceOf(alice, 0), (REF_MWH * 1e6 * 2) / 5);
        // whole escrow (principal + accrued) became the construction budget
        assertGt(t.budgetRemaining, CAPEX, "budget = principal + accrued");
        assertEq(usd.balanceOf(address(vault)), t.budgetRemaining, "budget held as raw dUSD");

        // two drawdowns through cert + timelock + 2-of-3
        _drawdown(0, 2_000_000e6, keccak256("cert-m1"), "site prep + foundations");
        _drawdown(0, 1_500_000e6, keccak256("cert-m2"), "battery containers delivered");
        assertEq(usd.balanceOf(spv), 3_500_000e6, "spv received both drawdowns");
        assertEq(vault.getTranche(0).budgetRemaining, t.budgetRemaining - 3_500_000e6);

        // six on-plan sweeps; NAV per unit strictly increases
        uint256 lastNav = oracle.navPerUnit(0);
        for (uint256 m = 0; m < 6; m++) {
            vm.warp(block.timestamp + SPM);
            _sweepMonth(0, MONTHLY_GROSS);
            uint256 nav = oracle.navPerUnit(0);
            assertGt(nav, lastNav, "NAV strictly increases");
            lastNav = nav;
        }
        assertEq(vault.getTranche(0).monthsSwept, 6);
        assertEq(vault.getTranche(0).perfFactorBps, 10_000, "on-plan performance");
        assertEq(oracle.navHistoryLength(), 7, "snapshot per conversion + sweep");

        // redeem in an epoch at the spread
        uint256 redeemUnits = 1_000e6;
        vm.prank(alice);
        vault.requestRedeem(0, redeemUnits);
        vm.warp(block.timestamp + SPM);
        uint256 quoted = (oracle.navPerUnit(0) * (10_000 - 50)) / 10_000;
        uint256 before = usd.balanceOf(alice);
        vault.closeEpoch();
        uint256 paid = usd.balanceOf(alice) - before;
        assertApproxEqAbs(paid, (redeemUnits * quoted) / 1e6, 2, "paid at spread-discounted NAV");
        assertEq(vault.totalSupply(0), REF_MWH * 1e6 - redeemUnits, "paid units burned");

        // finish the term, expire, terminal redemption at pure-cash NAV
        for (uint256 m = 6; m < TERM; m++) {
            vm.warp(block.timestamp + SPM);
            _sweepMonth(0, MONTHLY_GROSS);
        }
        vault.expireVintage(0);
        assertEq(uint8(vault.getTranche(0).state), uint8(StreamVault.TrancheState.Expired));
        assertEq(oracle.pvOfTranche(0), 0, "no PV after expiry");
        uint256 terminalNav = oracle.navPerUnit(0);
        assertGt(terminalNav, 0, "terminal NAV is the reserves slice");

        vm.prank(bob);
        vault.requestRedeem(0, 2_000e6);
        vm.warp(block.timestamp + SPM);
        uint256 bobBefore = usd.balanceOf(bob);
        vault.closeEpoch();
        assertGt(usd.balanceOf(bob) - bobBefore, 0, "terminal redemption paid from reserves");
    }
}

contract RefundPathTest is StreamVaultTestBase {
    /// Longstop passes → refund pays par + accrued > principal.
    function test_refundParPlusAccrued() public {
        _fund(alice, 1_000_000e6);
        _fund(bob, 500_000e6);
        vm.prank(alice);
        vault.deposit(0, 1_000_000e6);
        vm.prank(bob);
        vault.deposit(0, 500_000e6);

        vm.warp(block.timestamp + 7 days + 1);
        vm.expectRevert("vault: past longstop");
        vm.prank(alice);
        vault.deposit(0, 1e6);

        vault.refund(0);
        assertEq(uint8(vault.getTranche(0).state), uint8(StreamVault.TrancheState.Refunded));

        vm.prank(alice);
        uint256 aliceOut = vault.claimRefund(0);
        assertGt(aliceOut, 1_000_000e6, "par + accrued > principal");
        assertEq(usd.balanceOf(alice), aliceOut);

        vm.prank(bob);
        uint256 bobOut = vault.claimRefund(0);
        assertGt(bobOut, 500_000e6);
        // pro-rata: alice deposited 2x bob
        assertApproxEqAbs(aliceOut, bobOut * 2, 20);

        vm.expectRevert("vault: no receipt");
        vm.prank(alice);
        vault.claimRefund(0);
    }

    function test_cannotConvertAfterRefund() public {
        _depositAll();
        vm.warp(block.timestamp + 7 days + 1);
        vault.refund(0);
        vm.expectRevert("vault: not predeposit");
        vault.convertAtNTP(0);
    }
}

contract PvParityTest is StreamVaultTestBase {
    /// Converting tranche 2 while tranche 1 is live must not move tranche 1's
    /// NAV per unit: the PV-parity mint prices the new vintage at the pool's
    /// prevailing NAV so existing holders are neither diluted nor enriched.
    function test_pvParityMint() public {
        _depositAll();
        vault.convertAtNTP(0);
        uint256 nav1Before = oracle.navPerUnit(0);
        uint256 poolNavBefore = oracle.poolNav();
        uint256 unitsBefore = vault.totalUnitsLive();

        vault.createTranche(
            unicode"BESS Beta — 2 MW / 4 MWh", 2_000_000e6, 12_000, EXP_REV, uint64(block.timestamp + 7 days), TERM, spv
        );
        _fund(bob, 2_000_000e6);
        vm.prank(bob);
        vault.deposit(1, 2_000_000e6);
        vault.convertAtNTP(1);

        // tranche 1 unchanged (±rounding on the truncated unit mint)
        assertApproxEqAbs(oracle.navPerUnit(0), nav1Before, 2, "tranche 1 NAV/unit unchanged by the mint");
        // pool NAV per unit preserved: (nav + pvNew)/(units + newUnits) == nav/units
        uint256 avgBefore = (poolNavBefore * 1e6) / unitsBefore;
        uint256 avgAfter = (oracle.poolNav() * 1e6) / vault.totalUnitsLive();
        assertApproxEqAbs(avgAfter, avgBefore, 2, "pool NAV per unit preserved");
        // and the formula itself: units2 = pv2 * unitsLive / poolNav
        uint256 pv2 = oracle.pvOfTranche(1);
        assertApproxEqAbs(vault.totalSupply(1), (pv2 * unitsBefore) / poolNavBefore, 1e6, "PV-parity unit count");
    }
}

contract DrawdownSafetyTest is StreamVaultTestBase {
    bytes32 constant CERT = keccak256("cert-1");

    function setUp() public override {
        super.setUp();
        _depositAll();
        vault.convertAtNTP(0);
    }

    function test_revertsWithoutCert() public {
        vm.expectRevert("vault: stale cert");
        vault.queueDrawdown(0, 1_000_000e6, CERT);
    }

    function test_fullSafetyGauntlet() public {
        vm.prank(engineer);
        vault.postMilestoneCert(0, CERT, "milestone 1");

        // non-signer cannot queue
        vm.expectRevert("vault: not a signer");
        vm.prank(alice);
        vault.queueDrawdown(0, 1_000_000e6, CERT);

        uint256 id = vault.queueDrawdown(0, 1_000_000e6, CERT);

        // cannot execute with 0 or 1 confirmations
        vm.warp(block.timestamp + 121);
        vm.expectRevert("vault: need 2 of 3");
        vault.executeDrawdown(id);
        vault.confirmDrawdown(id, MEGAWATT_ROLE);
        vm.expectRevert("vault: need 2 of 3");
        vault.executeDrawdown(id);

        // same role cannot double-confirm; roles the caller lacks are rejected
        vm.expectRevert("vault: role confirmed");
        vault.confirmDrawdown(id, MEGAWATT_ROLE);
        vm.expectRevert("vault: missing role");
        vm.prank(alice);
        vault.confirmDrawdown(id, AGENT_ROLE);

        vm.prank(agent);
        vault.confirmDrawdown(id, AGENT_ROLE);

        // queue a second drawdown against the same (still unused) cert; the
        // first execution burns the cert and strands the second
        uint256 id2 = vault.queueDrawdown(0, 500_000e6, CERT);

        vault.executeDrawdown(id);
        assertEq(usd.balanceOf(spv), 1_000_000e6, "funds land only on the fixed spvAccount");

        vm.expectRevert("vault: executed");
        vault.executeDrawdown(id);

        vault.confirmDrawdown(id2, MEGAWATT_ROLE);
        vm.prank(agent);
        vault.confirmDrawdown(id2, AGENT_ROLE);
        vm.warp(block.timestamp + 121);
        vm.expectRevert("vault: cert used");
        vault.executeDrawdown(id2);

        // reused cert cannot even be queued again
        vm.expectRevert("vault: cert used");
        vault.queueDrawdown(0, 500_000e6, CERT);
    }

    function test_timelockEnforced() public {
        vm.prank(engineer);
        vault.postMilestoneCert(0, CERT, "milestone 1");
        uint256 id = vault.queueDrawdown(0, 1_000_000e6, CERT);
        vault.confirmDrawdown(id, MEGAWATT_ROLE);
        vm.prank(agent);
        vault.confirmDrawdown(id, AGENT_ROLE);
        vm.warp(block.timestamp + 119);
        vm.expectRevert("vault: timelocked");
        vault.executeDrawdown(id);
        vm.warp(block.timestamp + 2);
        vault.executeDrawdown(id);
    }
}

contract ForwardPricingTest is StreamVaultTestBase {
    /// Deposits/mints happen at full (optimistic) NAV while redemptions pay
    /// the spread-discounted NAV, so a round-trip timed around a sweep nets
    /// less than the optimistic NAV at exit — no free NAV capture.
    function test_immediateRedeemLosesSpread() public {
        _depositAll();
        vault.convertAtNTP(0);

        // build some reserves, then time the entry right before a sweep
        for (uint256 m = 0; m < 3; m++) {
            vm.warp(block.timestamp + SPM);
            _sweepMonth(0, MONTHLY_GROSS);
        }
        vm.warp(block.timestamp + SPM);
        _sweepMonth(0, MONTHLY_GROSS); // the sweep the timer tries to capture

        uint256 units = 1_000e6;
        vm.prank(alice);
        vault.requestRedeem(0, units);
        vm.warp(block.timestamp + SPM);
        uint256 navQuote = oracle.navPerUnit(0); // the optimistic NAV at exit time
        vault.closeEpoch();

        // paid strictly below the optimistic NAV a depositor would mint at,
        // and the discount is exactly the configured spread (±rounding)
        uint256 paid = usd.balanceOf(alice);
        uint256 paidPerUnit = (paid * 1e6) / units;
        assertLt(paidPerUnit, navQuote, "redeem pays under optimistic NAV");
        assertApproxEqAbs(paidPerUnit, (navQuote * (10_000 - 50)) / 10_000, 5, "spread applied");
    }
}
