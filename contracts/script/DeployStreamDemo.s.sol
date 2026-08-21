// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

// DEMO ONLY — deploys the Stream Vault demo suite to Base Sepolia.
//
//   forge script script/DeployStreamDemo.s.sol --rpc-url https://sepolia.base.org \
//     --broadcast --verify -vvv
//
// Env: PRIVATE_KEY (required); AGENT_ADDRESS / ENGINEER_ADDRESS (optional —
// default to the deployer so one wallet can run the whole stage demo);
// SECONDS_PER_MONTH (optional, default 600 = 10 minutes per "month").

import {Script, console2} from "forge-std/Script.sol";
import {MockUSD} from "../src/MockUSD.sol";
import {MockTBill} from "../src/MockTBill.sol";
import {StreamVault} from "../src/StreamVault.sol";
import {NAVOracle} from "../src/NAVOracle.sol";
import {IERC20} from "openzeppelin-contracts/token/ERC20/IERC20.sol";

contract DeployStreamDemo is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);
        address agent = vm.envOr("AGENT_ADDRESS", deployer);
        address engineer = vm.envOr("ENGINEER_ADDRESS", deployer);
        uint256 secondsPerMonth = vm.envOr("SECONDS_PER_MONTH", uint256(600));
        console2.log("deployer:", deployer);

        vm.startBroadcast(pk);

        MockUSD usd = new MockUSD();
        MockTBill tbill = new MockTBill(usd, 500, secondsPerMonth); // 5% APR on the demo clock
        usd.setMinter(address(tbill), true); // demo shortcut: T-bill mints its own interest

        StreamVault vault = new StreamVault(
            IERC20(address(usd)),
            tbill,
            secondsPerMonth,
            6100, // sweepShareBps — 61% of gross revenue is swept
            120, // drawdown timelock, seconds
            2000, // epoch liquidity cap — 20% of reserves
            50, // redeem spread — 50 bps under NAV
            9000, // convertible at >= 90% subscription
            deployer, // MEGAWATT_ROLE
            agent, // AGENT_ROLE
            engineer // ENGINEER_ROLE
        );
        NAVOracle oracle = new NAVOracle(vault, tbill, 900); // 9% APR discount rate
        vault.setOracle(address(oracle));

        // Tranche 1: flagship, ready for the stage demo.
        // refMWhTotal = 10 MWh/day * 365 * 15y * 0.9 availability = 49,275 MWh
        vault.createTranche(
            unicode"BESS Alba — 5 MW / 10 MWh",
            7_500_000e6,
            49_275,
            190e6,
            uint64(block.timestamp + 7 days),
            18, // compressed term: 18 demo-months
            deployer // demo SPV account; PRODUCTION: the project SPV's account
        );

        // Tranche 2: smaller, kept in Pre-deposit to demo the PV-parity mint.
        // refMWhTotal = 4 MWh/day * 365 * 15y * 0.9 = 19,710 MWh
        vault.createTranche(
            unicode"BESS Beta — 2 MW / 4 MWh",
            3_000_000e6,
            19_710,
            190e6,
            uint64(block.timestamp + 14 days),
            18,
            deployer
        );

        // Fund the deployer: depositor money + the revenue-simulator budget.
        usd.mint(deployer, 25_000_000e6);

        vm.stopBroadcast();

        console2.log("MockUSD:    ", address(usd));
        console2.log("MockTBill:  ", address(tbill));
        console2.log("StreamVault:", address(vault));
        console2.log("NAVOracle:  ", address(oracle));

        string memory json = "deploy";
        vm.serializeUint(json, "chainId", block.chainid);
        vm.serializeAddress(json, "deployer", deployer);
        vm.serializeAddress(json, "mockUsd", address(usd));
        vm.serializeAddress(json, "mockTBill", address(tbill));
        vm.serializeAddress(json, "streamVault", address(vault));
        vm.serializeUint(json, "secondsPerMonth", secondsPerMonth);
        vm.serializeUint(json, "deployBlock", block.number); // event-scan start for the frontend
        string memory out = vm.serializeAddress(json, "navOracle", address(oracle));
        vm.writeJson(out, "./deployments/base-sepolia-stream.json");
    }
}
