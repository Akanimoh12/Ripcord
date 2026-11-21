// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {IHooks} from "v4-core/src/interfaces/IHooks.sol";
import {PoolManager} from "v4-core/src/PoolManager.sol";
import {PoolSwapTest} from "v4-core/src/test/PoolSwapTest.sol";
import {Hooks} from "v4-core/src/libraries/Hooks.sol";
import {TickMath} from "v4-core/src/libraries/TickMath.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {Currency} from "v4-core/src/types/Currency.sol";

import {RipcordHook} from "../src/RipcordHook.sol";
import {FaucetToken} from "../src/tokens/FaucetToken.sol";
import {HookMiner} from "./HookMiner.sol";

/// @notice Deploys tokens, mines the hook address, opens the pool, seeds the vault.
/// forge script script/Deploy.s.sol --rpc-url unichain_sepolia --broadcast
contract Deploy is Script {
    uint24 constant FEE = 3000;
    int24 constant SPACING = 60;
    int24 constant START_TICK = -196260; // ~3,000 rUSDC per rWETH
    int24 constant LOWER = -203220; // ~1,500
    int24 constant UPPER = -189360; // ~6,000

    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);

        vm.startBroadcast(pk);

        IPoolManager manager = IPoolManager(_poolManager(deployer));

        // currency1 must be the quote asset, so redeploy rWETH until it sorts first
        FaucetToken usdc = new FaucetToken("Ripcord USDC", "rUSDC", 6, 20_000e6);
        FaucetToken weth = new FaucetToken("Ripcord WETH", "rWETH", 18, 5e18);
        for (uint256 i; address(weth) > address(usdc) && i < 16; ++i) {
            weth = new FaucetToken("Ripcord WETH", "rWETH", 18, 5e18);
        }
        require(address(weth) < address(usdc), "token order");

        uint160 flags = uint160(
            Hooks.BEFORE_INITIALIZE_FLAG | Hooks.BEFORE_ADD_LIQUIDITY_FLAG | Hooks.BEFORE_SWAP_FLAG
                | Hooks.AFTER_SWAP_FLAG
        );
        bytes memory args = abi.encode(manager, deployer, LOWER, UPPER);
        (address expected, bytes32 salt) = HookMiner.find(CREATE2_FACTORY, flags, type(RipcordHook).creationCode, args);
        RipcordHook hook = new RipcordHook{salt: salt}(manager, deployer, LOWER, UPPER);
        require(address(hook) == expected, "hook address");

        PoolKey memory key =
            PoolKey(Currency.wrap(address(weth)), Currency.wrap(address(usdc)), FEE, SPACING, IHooks(hook));
        manager.initialize(key, TickMath.getSqrtPriceAtTick(START_TICK));

        PoolSwapTest router = new PoolSwapTest(manager);

        // launch the boat: ~100k of value, no rope
        weth.mint(deployer, 100e18);
        usdc.mint(deployer, 200_000e6);
        weth.approve(address(hook), type(uint256).max);
        usdc.approve(address(hook), type(uint256).max);
        hook.seed(16.7e18, 50_000e6);
        // 10 rUSDC floor keeps dust ropes from filling the bucket list
        hook.setMinDeposit(10e6);

        vm.stopBroadcast();

        require(hook.poolSet() && hook.totalShares() > 0 && hook.liquidity() > 0, "launch failed");

        _record(address(manager), address(hook), address(router), address(weth), address(usdc));
    }

    function _poolManager(address deployer) internal returns (address) {
        if (block.chainid == 1301) return 0x00B036B58a818B1BC34d502D3fE730Db729e62AC; // Unichain Sepolia
        if (block.chainid == 84532) return 0x05E73354cFDd6745C338b50BcFDfA3Aa6fA03408; // Base Sepolia
        if (block.chainid == 11155111) return 0xE03A1074c86CFeDd5C142C4F04F1a1536e203543; // Sepolia
        if (block.chainid == 31337) return address(new PoolManager(deployer)); // anvil
        return vm.envAddress("POOL_MANAGER");
    }

    function _record(address manager, address hook, address router, address weth, address usdc) internal {
        string memory k = "deployment";
        vm.serializeUint(k, "chainId", block.chainid);
        vm.serializeUint(k, "startBlock", block.number);
        vm.serializeAddress(k, "poolManager", manager);
        vm.serializeAddress(k, "hook", hook);
        vm.serializeAddress(k, "router", router);
        vm.serializeAddress(k, "weth", weth);
        string memory json = vm.serializeAddress(k, "usdc", usdc);
        vm.writeJson(json, string.concat("./deployments/", vm.toString(block.chainid), ".json"));

        console2.log("--- paste into frontend/.env.local ---");
        console2.log(string.concat("NEXT_PUBLIC_CHAIN_ID=", vm.toString(block.chainid)));
        console2.log(string.concat("NEXT_PUBLIC_HOOK_ADDRESS=", vm.toString(hook)));
        console2.log(string.concat("NEXT_PUBLIC_ROUTER_ADDRESS=", vm.toString(router)));
        console2.log(string.concat("NEXT_PUBLIC_WETH_ADDRESS=", vm.toString(weth)));
        console2.log(string.concat("NEXT_PUBLIC_USDC_ADDRESS=", vm.toString(usdc)));
    }
}
