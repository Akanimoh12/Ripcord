// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {Deployers} from "v4-core/test/utils/Deployers.sol";
import {PoolSwapTest} from "v4-core/src/test/PoolSwapTest.sol";
import {IHooks} from "v4-core/src/interfaces/IHooks.sol";
import {Hooks} from "v4-core/src/libraries/Hooks.sol";
import {TickMath} from "v4-core/src/libraries/TickMath.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {Currency} from "v4-core/src/types/Currency.sol";
import {SwapParams, ModifyLiquidityParams} from "v4-core/src/types/PoolOperation.sol";

import {RipcordHook} from "../src/RipcordHook.sol";
import {FaucetToken} from "../src/tokens/FaucetToken.sol";

contract RipcordTest is Test, Deployers {
    RipcordHook hook;
    FaucetToken weth;
    FaucetToken usdc;
    PoolKey poolKey;

    int24 constant SPACING = 60;
    int24 constant START_TICK = -196260; // ~3,000 USDC per WETH
    int24 constant LOWER = -203220; // ~1,500
    int24 constant UPPER = -189360; // ~6,000
    int24 constant CRASH_TICK = START_TICK - 2220; // ETH -20%, vault share ~-10%

    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address carol = makeAddr("carol");
    address trader = makeAddr("trader");

    function setUp() public {
        deployFreshManagerAndRouters();

        // currency1 must be the quote asset
        usdc = new FaucetToken("Ripcord USDC", "rUSDC", 6, 20_000e6);
        weth = new FaucetToken("Ripcord WETH", "rWETH", 18, 10e18);
        while (address(weth) > address(usdc)) {
            weth = new FaucetToken("Ripcord WETH", "rWETH", 18, 10e18);
        }

        uint160 flags = uint160(
            Hooks.BEFORE_INITIALIZE_FLAG | Hooks.BEFORE_ADD_LIQUIDITY_FLAG | Hooks.BEFORE_SWAP_FLAG
                | Hooks.AFTER_SWAP_FLAG
        );
        address hookAddr = address(flags ^ (uint160(0x4444) << 144));
        deployCodeTo("RipcordHook.sol:RipcordHook", abi.encode(manager, address(this), LOWER, UPPER), hookAddr);
        hook = RipcordHook(hookAddr);

        poolKey = PoolKey(Currency.wrap(address(weth)), Currency.wrap(address(usdc)), 3000, SPACING, IHooks(hookAddr));
        manager.initialize(poolKey, TickMath.getSqrtPriceAtTick(START_TICK));

        _fund(alice, 0, 10_000e6);
        _fund(bob, 0, 10_000e6);
        _fund(carol, 0, 10_000e6);
        _fund(trader, 500e18, 2_000_000e6);

        // curator launches the boat two-sided: ~16.7 WETH + 50k USDC
        weth.mint(address(this), 100e18);
        usdc.mint(address(this), 100_000e6);
        weth.approve(address(hook), type(uint256).max);
        usdc.approve(address(hook), type(uint256).max);
        hook.seed(16.7e18, 50_000e6);
    }

    function _fund(address who, uint256 w, uint256 u) internal {
        if (w > 0) weth.mint(who, w);
        if (u > 0) usdc.mint(who, u);
        vm.startPrank(who);
        weth.approve(address(hook), type(uint256).max);
        usdc.approve(address(hook), type(uint256).max);
        weth.approve(address(swapRouter), type(uint256).max);
        usdc.approve(address(swapRouter), type(uint256).max);
        vm.stopPrank();
    }

    /// @dev dumps WETH until the pool reaches `tick`
    function _crashTo(int24 tick) internal {
        vm.prank(trader);
        swapRouter.swap(
            poolKey,
            SwapParams({
                zeroForOne: true, amountSpecified: -int256(400e18), sqrtPriceLimitX96: TickMath.getSqrtPriceAtTick(tick)
            }),
            PoolSwapTest.TestSettings({takeClaims: false, settleUsingBurn: false}),
            ""
        );
    }

    function _smallBuy() internal {
        vm.prank(trader);
        swapRouter.swap(
            poolKey,
            SwapParams({zeroForOne: false, amountSpecified: -int256(1e6), sqrtPriceLimitX96: MAX_PRICE_LIMIT}),
            PoolSwapTest.TestSettings({takeClaims: false, settleUsingBurn: false}),
            ""
        );
    }

    function _nextBlock() internal {
        vm.roll(block.number + 1);
    }

    function _freshHook(uint160 salt) internal returns (RipcordHook) {
        uint160 flags = uint160(
            Hooks.BEFORE_INITIALIZE_FLAG | Hooks.BEFORE_ADD_LIQUIDITY_FLAG | Hooks.BEFORE_SWAP_FLAG
                | Hooks.AFTER_SWAP_FLAG
        );
        address a = address(flags ^ (salt << 144));
        deployCodeTo("RipcordHook.sol:RipcordHook", abi.encode(manager, address(this), LOWER, UPPER), a);
        return RipcordHook(a);
    }

    /// @dev swaps toward `tick`, whichever side it is on
    function _swapTo(int24 tick) internal {
        bool down = TickMath.getTickAtSqrtPrice(hook.spotSqrtPrice()) > tick;
        vm.prank(trader);
        swapRouter.swap(
            poolKey,
            SwapParams({
                zeroForOne: down,
                amountSpecified: down ? -int256(400e18) : -int256(1_500_000e6),
                sqrtPriceLimitX96: TickMath.getSqrtPriceAtTick(tick)
            }),
            PoolSwapTest.TestSettings({takeClaims: false, settleUsingBurn: false}),
            ""
        );
    }

    /// @dev trader's holdings marked at the starting price
    function _traderWorth() internal view returns (int256) {
        return int256(usdc.balanceOf(trader)) + int256(weth.balanceOf(trader) * 3000e6 / 1e18);
    }

    /// @dev the hook always holds at least what its books say is idle or owed
    function _assertSolvent() internal view {
        assertGe(weth.balanceOf(address(hook)), hook.idle0() + hook.reserved0(), "base books");
        assertGe(usdc.balanceOf(address(hook)), hook.idle1() + hook.reserved1(), "quote books");
    }

    function test_firstDepositPricesAtOne() public view {
        assertEq(hook.sharePrice(), 1e18);
        assertGt(hook.liquidity(), 0);
        assertApproxEqRel(hook.totalValue(), 100_000e6, 0.03e18);
    }

    function test_seedOnlyOnce() public {
        assertGt(hook.totalShares(), 0);
        vm.expectRevert(RipcordHook.AlreadyLaunched.selector);
        hook.seed(1e18, 1e6);
    }

    function test_depositNeedsLaunch() public {
        RipcordHook fresh = _freshHook(0x5555);
        manager.initialize(
            PoolKey(Currency.wrap(address(weth)), Currency.wrap(address(usdc)), 3000, SPACING, IHooks(address(fresh))),
            TickMath.getSqrtPriceAtTick(START_TICK)
        );
        vm.prank(alice);
        vm.expectRevert(RipcordHook.NotLaunched.selector);
        fresh.deposit(1_000e6, 0, 0);
    }

    function test_quoteDepositZapsAtFairValue() public {
        uint256 priceBefore = hook.sharePrice();
        vm.prank(alice);
        hook.deposit(5_000e6, 0, 0);
        (,,,, uint256 value,,,,,) = hook.ropeOf(alice);
        assertApproxEqRel(value, 5_000e6, 0.01e18);
        assertApproxEqRel(hook.sharePrice(), priceBefore, 0.001e18);
    }

    function test_depositSetsRope() public {
        vm.prank(alice);
        uint256 shares = hook.deposit(1_000e6, 1000, 0);
        (uint256 s,, uint16 drop, uint256 trigger,, bool pulled,,,,) = hook.ropeOf(alice);
        assertEq(s, shares);
        assertEq(drop, 1000);
        assertFalse(pulled);
        assertApproxEqRel(trigger, 0.9e18, 0.002e18);

        (uint32[] memory ids,, uint256[] memory bucketShares) = hook.activeBuckets();
        assertEq(ids.length, 1);
        assertEq(bucketShares[0], shares);
    }

    function test_ropePullsAfterDrawdown() public {
        vm.prank(alice);
        hook.deposit(1_000e6, 500, 0);
        vm.prank(bob);
        hook.deposit(1_000e6, 2000, 0);
        vm.prank(carol);
        hook.deposit(1_000e6, 0, 0);

        _crashTo(CRASH_TICK);
        _nextBlock();
        _smallBuy(); // any swap in a later block checks the ropes

        (,,,,, bool alicePulled,,,,) = hook.ropeOf(alice);
        (,,,,, bool bobPulled,,,,) = hook.ropeOf(bob);
        assertTrue(alicePulled, "5% rope should pull");
        assertFalse(bobPulled, "20% rope still in the water");
        assertLe(hook.sharePrice(), 0.95e18);
        assertGt(hook.sharePrice(), 0.8e18);

        uint256 before = usdc.balanceOf(alice);
        vm.prank(alice);
        hook.claim(true, 0);
        uint256 got = usdc.balanceOf(alice) - before;
        assertGt(got, 850e6);
        assertLt(got, 960e6);
    }

    function test_flashTradeCannotCutRopes() public {
        vm.prank(alice);
        hook.deposit(1_000e6, 500, 0);

        _crashTo(CRASH_TICK);
        hook.haul(10); // same block: valued at the block's opening price
        (,,,,, bool pulled,,,,) = hook.ropeOf(alice);
        assertFalse(pulled);

        _nextBlock();
        hook.haul(10);
        (,,,,, pulled,,,,) = hook.ropeOf(alice);
        assertTrue(pulled);
    }

    function test_surfaceByHand() public {
        vm.prank(alice);
        hook.deposit(1_000e6, 1000, 0);
        _nextBlock();

        uint256 before = usdc.balanceOf(alice);
        vm.prank(alice);
        hook.surface(0, true, 0);
        assertApproxEqRel(usdc.balanceOf(alice) - before, 1_000e6, 0.01e18);
        (uint256 s,,,,,,,,,) = hook.ropeOf(alice);
        assertEq(s, 0);
        (uint32[] memory ids,,) = hook.activeBuckets();
        assertEq(ids.length, 0);
    }

    function test_changeRope() public {
        vm.prank(alice);
        hook.deposit(1_000e6, 500, 0);
        vm.prank(alice);
        hook.setRope(2000);
        (,, uint16 drop, uint256 trigger,,,,,,) = hook.ropeOf(alice);
        assertEq(drop, 2000);
        assertApproxEqRel(trigger, 0.8e18, 0.002e18);
    }

    function test_revertsWhenRopeAlreadyReached() public {
        vm.prank(alice);
        hook.deposit(1_000e6, 2000, 0);
        _crashTo(CRASH_TICK);
        _nextBlock();
        _smallBuy();

        vm.prank(alice);
        vm.expectRevert(RipcordHook.RopeTooShort.selector);
        hook.setRope(500);
    }

    function test_sharedBucketPullsTogether() public {
        vm.prank(alice);
        hook.deposit(1_000e6, 500, 0);
        vm.prank(bob);
        hook.deposit(2_000e6, 500, 0);
        (uint32[] memory ids,,) = hook.activeBuckets();
        assertEq(ids.length, 1);

        _crashTo(CRASH_TICK);
        _nextBlock();
        hook.haul(1);

        vm.prank(alice);
        (, uint256 a1) = hook.claim(true, 0);
        vm.prank(bob);
        (, uint256 b1) = hook.claim(true, 0);
        assertApproxEqRel(b1, a1 * 2, 0.02e18);
    }

    function test_externalLiquidityBlocked() public {
        vm.expectRevert();
        modifyLiquidityRouter.modifyLiquidity(
            poolKey, ModifyLiquidityParams({tickLower: LOWER, tickUpper: UPPER, liquidityDelta: 1e12, salt: 0}), ""
        );
    }

    function test_curatorRebalance() public {
        uint256 before = hook.totalValue();
        hook.rebalance(-201000, -191400);
        assertEq(hook.tickLower(), -201000);
        assertApproxEqRel(hook.totalValue(), before, 0.0001e18);

        vm.prank(alice);
        vm.expectRevert(RipcordHook.NotCurator.selector);
        hook.rebalance(-201000, -191400);
    }

    // --- price safety ---

    function test_bigExitStopsAtRangeEdge() public {
        vm.prank(trader);
        hook.deposit(500_000e6, 0, 0);
        _nextBlock();
        _swapTo(LOWER + 600);
        _nextBlock();

        uint256 wethBefore = weth.balanceOf(trader);
        vm.prank(trader);
        (uint256 a0,) = hook.surface(0, true, 0);
        assertGe(hook.spotSqrtPrice(), TickMath.getSqrtPriceAtTick(LOWER), "price left the range");
        assertGt(a0, 0, "unsold base is handed back");
        assertEq(weth.balanceOf(trader) - wethBefore, a0);
        _assertSolvent();
    }

    function test_bigDepositZapStopsAtRangeEdge() public {
        vm.prank(trader);
        hook.deposit(1_000_000e6, 0, 0);
        assertLe(hook.spotSqrtPrice(), TickMath.getSqrtPriceAtTick(UPPER), "price left the range");
        (,,,, uint256 value,,,,,) = hook.ropeOf(trader);
        assertLe(value, 1_000_000e6, "no free value");
        _assertSolvent();
    }

    /// crash -> deposit -> restore inside one block must not beat doing the same trades without the deposit
    function test_sameBlockManipulationDoesNotPay() public {
        uint256 snap = vm.snapshotState();
        int256 start = _traderWorth();
        _swapTo(CRASH_TICK);
        _swapTo(START_TICK);
        _nextBlock();
        int256 baseline = _traderWorth() - start;
        vm.revertToState(snap);

        start = _traderWorth();
        _swapTo(CRASH_TICK);
        vm.prank(trader);
        hook.deposit(50_000e6, 0, 0);
        _swapTo(START_TICK);
        _nextBlock();
        vm.prank(trader);
        hook.surface(0, false, 0);
        assertLt(_traderWorth() - start, baseline, "manipulated deposit paid off");
    }

    function test_depositOutOfRangeReverts() public {
        _swapTo(LOWER - 600); // runs through the range into empty ticks
        _nextBlock();
        vm.prank(alice);
        vm.expectRevert(RipcordHook.OutOfRange.selector);
        hook.deposit(1_000e6, 0, 0);
    }

    // --- ropes ---

    function test_invalidDropsRejected() public {
        uint16[3] memory bad = [uint16(50), 150, 9100];
        for (uint256 i; i < bad.length; ++i) {
            vm.prank(alice);
            vm.expectRevert(RipcordHook.InvalidDrop.selector);
            hook.deposit(1_000e6, bad[i], 0);
        }
        vm.prank(alice);
        hook.deposit(1_000e6, 500, 0);
        vm.prank(alice);
        vm.expectRevert(RipcordHook.InvalidDrop.selector);
        hook.setRope(250);
    }

    function test_swapPullsAtMostFourBuckets() public {
        address[6] memory who = [alice, bob, carol, makeAddr("d"), makeAddr("e"), makeAddr("f")];
        for (uint256 i; i < 6; ++i) {
            if (i > 2) _fund(who[i], 0, 10_000e6);
            vm.prank(who[i]);
            hook.deposit(1_000e6, uint16(300 + i * 100), 0);
        }
        _crashTo(CRASH_TICK);
        _nextBlock();
        _smallBuy();
        (uint32[] memory ids,,) = hook.activeBuckets();
        assertEq(ids.length, 2, "four pulled on the swap");
        hook.haul(10);
        (ids,,) = hook.activeBuckets();
        assertEq(ids.length, 0, "haul takes the rest");

        for (uint256 i; i < 6; ++i) {
            vm.prank(who[i]);
            hook.claim(false, 0);
        }
        _assertSolvent();
    }

    // --- dust and admin ---

    function test_minDeposit() public {
        vm.prank(alice);
        vm.expectRevert(RipcordHook.NotCurator.selector);
        hook.setMinDeposit(100e6);

        hook.setMinDeposit(100e6);
        vm.prank(alice);
        vm.expectRevert(RipcordHook.BelowMinimum.selector);
        hook.deposit(50e6, 0, 0);

        vm.prank(alice);
        uint256 shares = hook.deposit(200e6, 500, 0);
        _nextBlock();
        vm.prank(alice);
        vm.expectRevert(RipcordHook.BelowMinimum.selector);
        hook.surface(shares * 3 / 4, true, 0); // would leave ~50 behind

        vm.prank(alice);
        hook.surface(0, true, 0);
        (uint32[] memory ids,,) = hook.activeBuckets();
        assertEq(ids.length, 0);
    }

    function test_setCuratorRejectsZero() public {
        vm.expectRevert(RipcordHook.InvalidCurator.selector);
        hook.setCurator(address(0));
        hook.setCurator(alice);
        assertEq(hook.curator(), alice);
    }

    function test_dynamicFeePoolRejected() public {
        RipcordHook fresh = _freshHook(0x6666);
        vm.expectRevert();
        manager.initialize(
            PoolKey(
                Currency.wrap(address(weth)), Currency.wrap(address(usdc)), 0x800000, SPACING, IHooks(address(fresh))
            ),
            TickMath.getSqrtPriceAtTick(START_TICK)
        );
    }

    function test_secondPoolRejected() public {
        vm.expectRevert();
        manager.initialize(
            PoolKey(Currency.wrap(address(weth)), Currency.wrap(address(usdc)), 500, 10, IHooks(address(hook))),
            TickMath.getSqrtPriceAtTick(START_TICK)
        );
    }

    // --- fuzz ---

    /// joining and leaving never makes the people who stay poorer, and the books always balance
    function testFuzz_roundTripNeverDilutes(uint256 amount, uint16 dropPct) public {
        amount = bound(amount, 10e6, 9_000e6);
        uint16 drop = uint16(bound(dropPct, 0, 30)) * 100;
        uint256 priceBefore = hook.sharePrice();

        vm.prank(alice);
        hook.deposit(amount, drop, 0);
        assertGe(hook.sharePrice() + 1, priceBefore, "deposit diluted holders");
        _nextBlock();

        uint256 before = usdc.balanceOf(alice);
        vm.prank(alice);
        hook.surface(0, true, 0);
        uint256 got = usdc.balanceOf(alice) - before;

        assertGe(hook.sharePrice() + 1, priceBefore, "exit diluted holders");
        assertApproxEqRel(got, amount, 0.02e18, "round trip cost");
        _assertSolvent();
    }
}
