// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ERC20} from "solmate/src/tokens/ERC20.sol";

/// @notice Testnet token with an open faucet so judges can try the vault.
contract FaucetToken is ERC20 {
    uint256 public immutable faucetAmount;
    address public immutable owner;

    constructor(string memory name, string memory symbol, uint8 decimals_, uint256 _faucetAmount)
        ERC20(name, symbol, decimals_)
    {
        faucetAmount = _faucetAmount;
        owner = msg.sender;
    }

    function faucet() external {
        _mint(msg.sender, faucetAmount);
    }

    function mint(address to, uint256 amount) external {
        require(msg.sender == owner, "not owner");
        _mint(to, amount);
    }
}
