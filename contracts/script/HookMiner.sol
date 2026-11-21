// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Hooks} from "v4-core/src/libraries/Hooks.sol";

/// @notice Finds a CREATE2 salt whose address carries exactly the hook's permission bits.
library HookMiner {
    uint160 constant FLAG_MASK = Hooks.ALL_HOOK_MASK;
    uint256 constant MAX_LOOP = 160_444;

    function find(address deployer, uint160 flags, bytes memory creationCode, bytes memory args)
        internal
        view
        returns (address hookAddress, bytes32 salt)
    {
        flags = flags & FLAG_MASK;
        bytes32 initCodeHash = keccak256(abi.encodePacked(creationCode, args));

        for (uint256 i; i < MAX_LOOP; ++i) {
            salt = bytes32(i);
            hookAddress =
                address(uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), deployer, salt, initCodeHash)))));
            if (uint160(hookAddress) & FLAG_MASK == flags && hookAddress.code.length == 0) {
                return (hookAddress, salt);
            }
        }
        revert("HookMiner: no salt found");
    }
}
