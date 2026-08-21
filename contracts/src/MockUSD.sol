// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

// DEMO ONLY — not audited, not for production use, no real funds.

import {ERC20} from "openzeppelin-contracts/token/ERC20/ERC20.sol";
import {Ownable} from "openzeppelin-contracts/access/Ownable.sol";

/// @notice Demo stablecoin for the Stream Vault demo. 6 decimals like USDC.
/// Anyone can pull 10,000 dUSD from the faucet once per hour; designated
/// minters (the MockTBill, the deploy script) can mint freely.
contract MockUSD is ERC20, Ownable {
    uint256 public constant FAUCET_AMOUNT = 10_000e6;
    uint256 public constant FAUCET_COOLDOWN = 1 hours;

    mapping(address => uint256) public lastFaucet;
    mapping(address => bool) public minters;

    event FaucetDrip(address indexed to, uint256 amount);

    constructor() ERC20("Demo USD", "dUSD") Ownable(msg.sender) {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function faucet() external {
        require(block.timestamp >= lastFaucet[msg.sender] + FAUCET_COOLDOWN, "dUSD: faucet cooldown");
        lastFaucet[msg.sender] = block.timestamp;
        _mint(msg.sender, FAUCET_AMOUNT);
        emit FaucetDrip(msg.sender, FAUCET_AMOUNT);
    }

    function setMinter(address minter, bool allowed) external onlyOwner {
        minters[minter] = allowed;
    }

    function mint(address to, uint256 amount) external {
        require(minters[msg.sender] || msg.sender == owner(), "dUSD: not a minter");
        _mint(to, amount);
    }
}
