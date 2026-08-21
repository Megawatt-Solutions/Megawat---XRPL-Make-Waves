// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

// DEMO ONLY — not audited, not for production use, no real funds.
//
// Demo shortcut: the accrued interest is not backed by anything — on
// withdrawal the vault mints the MockUSD shortfall to itself. A production
// deployment would hold a whitelisted tokenized T-bill instrument instead.
// PRODUCTION: replace with the real T-bill wrapper (e.g. a permissioned
// ERC-4626 over a money-market fund token).

import {ERC20} from "openzeppelin-contracts/token/ERC20/ERC20.sol";
import {ERC4626} from "openzeppelin-contracts/token/ERC20/extensions/ERC4626.sol";
import {IERC20} from "openzeppelin-contracts/token/ERC20/IERC20.sol";
import {Ownable} from "openzeppelin-contracts/access/Ownable.sol";
import {MockUSD} from "./MockUSD.sol";

/// @notice ERC-4626 vault over MockUSD accruing a fixed APR as a per-second
/// linear index: `index = storedIndex * (1 + apr * elapsed / YEAR)`, scaled
/// 1e18. YEAR = 12 * secondsPerMonth so the demo's compressed clock applies
/// (with secondsPerMonth = 600 a full "year" of accrual takes 2 hours).
/// Share value is defined off the index, not the token balance, so the vault
/// is immune to donation skew: totalAssets() = totalSupply * index / 1e18.
contract MockTBill is ERC4626, Ownable {
    uint16 public aprBps;
    uint256 public immutable YEAR; // seconds, on the compressed clock

    uint256 private storedIndex = 1e18;
    uint64 private lastAccrual;

    event AprSet(uint16 aprBps);

    constructor(MockUSD asset_, uint16 aprBps_, uint256 secondsPerMonth)
        ERC4626(asset_)
        ERC20("Demo T-Bill Vault", "dTBILL")
        Ownable(msg.sender)
    {
        aprBps = aprBps_;
        YEAR = 12 * secondsPerMonth;
        lastAccrual = uint64(block.timestamp);
    }

    /// @notice Current accrual index, 1e18-scaled. Linear between APR changes.
    function index() public view returns (uint256) {
        uint256 elapsed = block.timestamp - lastAccrual;
        return storedIndex + (storedIndex * aprBps * elapsed) / (10_000 * YEAR);
    }

    function setApr(uint16 bps) external onlyOwner {
        // Checkpoint the index so past accrual keeps the old rate.
        storedIndex = index();
        lastAccrual = uint64(block.timestamp);
        aprBps = bps;
        emit AprSet(bps);
    }

    function totalAssets() public view override returns (uint256) {
        return (totalSupply() * index()) / 1e18;
    }

    /// @dev Mint the interest shortfall before paying out (demo shortcut, see
    /// header). Requires this contract to be a MockUSD minter.
    function _withdraw(address caller, address receiver, address owner_, uint256 assets, uint256 shares)
        internal
        override
    {
        uint256 bal = IERC20(asset()).balanceOf(address(this));
        if (assets > bal) {
            MockUSD(asset()).mint(address(this), assets - bal);
        }
        super._withdraw(caller, receiver, owner_, assets, shares);
    }
}
