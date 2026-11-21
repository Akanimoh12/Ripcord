// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IHooks} from "v4-core/src/interfaces/IHooks.sol";
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {Hooks} from "v4-core/src/libraries/Hooks.sol";
import {StateLibrary} from "v4-core/src/libraries/StateLibrary.sol";
import {TickMath} from "v4-core/src/libraries/TickMath.sol";
import {FullMath} from "v4-core/src/libraries/FullMath.sol";
import {FixedPoint96} from "v4-core/src/libraries/FixedPoint96.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {PoolId} from "v4-core/src/types/PoolId.sol";
import {Currency} from "v4-core/src/types/Currency.sol";
import {BalanceDelta} from "v4-core/src/types/BalanceDelta.sol";
import {BeforeSwapDelta, BeforeSwapDeltaLibrary} from "v4-core/src/types/BeforeSwapDelta.sol";
import {ModifyLiquidityParams, SwapParams} from "v4-core/src/types/PoolOperation.sol";
import {SafeCast} from "v4-core/src/libraries/SafeCast.sol";
import {LPFeeLibrary} from "v4-core/src/libraries/LPFeeLibrary.sol";
import {LiquidityAmounts} from "v4-core/test/utils/LiquidityAmounts.sol";
import {ERC20} from "solmate/src/tokens/ERC20.sol";
import {SafeTransferLib} from "solmate/src/utils/SafeTransferLib.sol";
import {ReentrancyGuard} from "solmate/src/utils/ReentrancyGuard.sol";

import {SortedBuckets} from "./libraries/SortedBuckets.sol";

/// @title Ripcord
/// @notice A curated v4 vault where each depositor sets their own floor ("rope").
///         The curator steers one shared LP position. After every swap the hook
///         checks the share price and exits every rope it has reached.
/// @dev currency1 is the quote asset. Shares are non-transferable.
contract RipcordHook is IHooks, IUnlockCallback, ReentrancyGuard {
    using StateLibrary for IPoolManager;
    using SafeTransferLib for ERC20;
    using SortedBuckets for uint32[];
    using SafeCast for uint256;
    using LPFeeLibrary for uint24;

    // --- errors ---
    error NotPoolManager();
    error NotCurator();
    error PoolAlreadySet();
    error PoolNotSet();
    error InvalidPool();
    error InvalidRange();
    error InvalidDrop();
    error ExternalLiquidityDisabled();
    error HookNotImplemented();
    error ZeroAmount();
    error Slippage();
    error RopeTooShort();
    error TooManyRopes();
    error NoPosition();
    error AlreadyPulled();
    error NotPulled();
    error ClaimFirst();
    error NotLaunched();
    error AlreadyLaunched();
    error OutOfRange();
    error BelowMinimum();
    error InvalidCurator();

    // --- events ---
    event Deposited(address indexed user, uint256 amountIn, uint256 shares, uint256 sharePrice);
    event RopeSet(address indexed user, uint16 dropBps, uint32 bucket);
    event Surfaced(address indexed user, uint256 shares, uint256 amount0, uint256 amount1);
    event RopePulled(
        uint32 indexed bucket, uint32 round, uint256 shares, uint256 amount0, uint256 amount1, uint256 sharePrice
    );
    event Claimed(address indexed user, uint256 amount0, uint256 amount1);
    event Rebalanced(int24 tickLower, int24 tickUpper, uint128 liquidity);
    event CuratorChanged(address curator);
    event MinDepositChanged(uint256 minDeposit);

    // --- types ---
    enum Action {
        Seed,
        Deposit,
        Surface,
        SellBase,
        Haul,
        Rebalance
    }

    struct Bucket {
        uint128 shares; // shares tied to this trigger in the current round
        uint32 round; // bumps every time the bucket is pulled
    }

    struct Pull {
        uint128 shares;
        uint128 amount0;
        uint128 amount1;
        uint128 sharePrice;
        uint64 blockNumber;
    }

    struct Rope {
        uint128 shares;
        uint128 entryPrice; // value-weighted share price at entry, 1e18 = 1.0
        uint32 bucket; // 0 = no rope
        uint32 round;
        uint16 dropBps;
    }

    // --- constants ---
    uint256 public constant ONE = 1e18;
    /// @dev bucket grid: one bucket per 0.1% of the opening share price
    uint256 public constant PRICE_STEP = 1e15;
    uint256 public constant MAX_BUCKETS = 96;
    uint256 public constant MAX_PULLS_PER_SWAP = 4;
    uint16 public constant MAX_DROP_BPS = 9000;
    /// @dev ropes come in whole percents; keeps the bucket list from being sprayed with odd triggers
    uint16 public constant DROP_STEP_BPS = 100;

    IPoolManager public immutable poolManager;
    address public curator;
    /// @notice smallest deposit (and smallest position left after a partial surface), in quote units
    uint256 public minDeposit;

    PoolKey internal _key;
    PoolId public poolId;
    bool public poolSet;

    int24 public tickLower;
    int24 public tickUpper;
    uint128 public liquidity;

    uint256 public totalShares;
    uint256 public idle0;
    uint256 public idle1;
    uint256 public reserved0; // owed to pulled ropes
    uint256 public reserved1;

    // first price seen in the current block; ropes read this so one trade can't cut anyone loose
    uint64 public lastSwapBlock;
    uint160 public blockOpenSqrtPrice;

    mapping(uint32 => Bucket) public buckets;
    mapping(uint32 => mapping(uint32 => Pull)) public pulls;
    mapping(address => Rope) public ropes;
    uint32[] internal _active; // ascending trigger ids

    modifier onlyPoolManager() {
        if (msg.sender != address(poolManager)) revert NotPoolManager();
        _;
    }

    modifier onlyCurator() {
        if (msg.sender != curator) revert NotCurator();
        _;
    }

    constructor(IPoolManager _poolManager, address _curator, int24 _tickLower, int24 _tickUpper) {
        poolManager = _poolManager;
        curator = _curator;
        if (_tickLower >= _tickUpper) revert InvalidRange();
        tickLower = _tickLower;
        tickUpper = _tickUpper;
        Hooks.validateHookPermissions(IHooks(address(this)), getHookPermissions());
    }

    function getHookPermissions() public pure returns (Hooks.Permissions memory) {
        return Hooks.Permissions({
            beforeInitialize: true,
            afterInitialize: false,
            beforeAddLiquidity: true,
            afterAddLiquidity: false,
            beforeRemoveLiquidity: false,
            afterRemoveLiquidity: false,
            beforeSwap: true,
            afterSwap: true,
            beforeDonate: false,
            afterDonate: false,
            beforeSwapReturnDelta: false,
            afterSwapReturnDelta: false,
            afterAddLiquidityReturnDelta: false,
            afterRemoveLiquidityReturnDelta: false
        });
    }

    // ------------------------------------------------------------------
    // Depositor actions
    // ------------------------------------------------------------------

    /// @notice Board with quote tokens and cut your rope.
    /// @param dropBps how far your share may fall before exit, 0 = no rope
    function deposit(uint256 amountIn, uint16 dropBps, uint256 minShares)
        external
        nonReentrant
        returns (uint256 shares)
    {
        if (totalShares == 0 || liquidity == 0) revert NotLaunched();
        if (amountIn == 0) revert ZeroAmount();
        if (amountIn < minDeposit) revert BelowMinimum();
        _checkDrop(dropBps);

        Rope storage r = ropes[msg.sender];
        if (_isPulled(r)) revert ClaimFirst();

        ERC20(Currency.unwrap(_key.currency1)).safeTransferFrom(msg.sender, address(this), amountIn);

        uint256 price;
        (shares, price) = abi.decode(
            poolManager.unlock(abi.encode(Action.Deposit, abi.encode(uint256(0), amountIn))), (uint256, uint256)
        );
        if (shares < minShares) revert Slippage();

        if (r.shares > 0) {
            _leaveBucket(r, r.shares);
            r.entryPrice =
                ((uint256(r.shares) * r.entryPrice + shares * price) / (uint256(r.shares) + shares)).toUint128();
        } else {
            r.entryPrice = price.toUint128();
        }
        r.shares += shares.toUint128();
        _joinBucket(r, dropBps);

        emit Deposited(msg.sender, amountIn, shares, price);
        emit RopeSet(msg.sender, dropBps, r.bucket);
    }

    /// @notice Lengthen, shorten or drop your rope. Trigger stays anchored to your entry price.
    function setRope(uint16 dropBps) external nonReentrant {
        _checkDrop(dropBps);
        Rope storage r = ropes[msg.sender];
        if (r.shares == 0) revert NoPosition();
        if (_isPulled(r)) revert AlreadyPulled();
        _leaveBucket(r, r.shares);
        _joinBucket(r, dropBps);
        emit RopeSet(msg.sender, dropBps, r.bucket);
    }

    /// @notice Exit by hand. shares = 0 exits everything.
    /// @param toQuote sell the base side so you receive only quote tokens
    function surface(uint256 shares, bool toQuote, uint256 minQuote)
        external
        nonReentrant
        returns (uint256 amount0, uint256 amount1)
    {
        Rope storage r = ropes[msg.sender];
        if (r.shares == 0) revert NoPosition();
        if (_isPulled(r)) revert AlreadyPulled();
        if (shares == 0 || shares > r.shares) shares = r.shares;
        // a partial exit may not leave dust behind (dust ropes would clog the bucket list)
        if (shares < r.shares && FullMath.mulDiv(r.shares - shares, sharePrice(), ONE) < minDeposit) {
            revert BelowMinimum();
        }

        _leaveBucket(r, shares);
        r.shares -= shares.toUint128();
        if (r.shares == 0) delete ropes[msg.sender];

        (amount0, amount1) =
            abi.decode(poolManager.unlock(abi.encode(Action.Surface, abi.encode(shares, toQuote))), (uint256, uint256));
        if (toQuote && amount1 < minQuote) revert Slippage();

        _payout(msg.sender, amount0, amount1);
        emit Surfaced(msg.sender, shares, amount0, amount1);
    }

    /// @notice Collect what your rope hauled up.
    function claim(bool toQuote, uint256 minQuote) external nonReentrant returns (uint256 amount0, uint256 amount1) {
        Rope memory r = ropes[msg.sender];
        if (!_isPulled(ropes[msg.sender])) revert NotPulled();

        Pull memory p = pulls[r.bucket][r.round];
        amount0 = uint256(p.amount0) * r.shares / p.shares;
        amount1 = uint256(p.amount1) * r.shares / p.shares;
        reserved0 -= amount0;
        reserved1 -= amount1;
        delete ropes[msg.sender];

        if (toQuote && amount0 > 0) {
            (uint256 out, uint256 unsold) =
                abi.decode(poolManager.unlock(abi.encode(Action.SellBase, abi.encode(amount0))), (uint256, uint256));
            amount1 += out;
            amount0 = unsold;
            if (amount1 < minQuote) revert Slippage();
        }

        _payout(msg.sender, amount0, amount1);
        emit Claimed(msg.sender, amount0, amount1);
    }

    /// @notice Anyone can haul ropes without swapping (keeper / demo path).
    function haul(uint256 maxPulls) external nonReentrant returns (uint256 pulled) {
        if (!poolSet) revert PoolNotSet();
        pulled = abi.decode(poolManager.unlock(abi.encode(Action.Haul, abi.encode(maxPulls))), (uint256));
    }

    // ------------------------------------------------------------------
    // Curator
    // ------------------------------------------------------------------

    /// @notice Move the whole position to a new range. Depositors' ropes are untouched.
    function rebalance(int24 newLower, int24 newUpper) external onlyCurator nonReentrant {
        if (!poolSet) revert PoolNotSet();
        _checkRange(newLower, newUpper);
        poolManager.unlock(abi.encode(Action.Rebalance, abi.encode(newLower, newUpper)));
    }

    /// @notice Launch the boat with both tokens. The zap needs liquidity to trade against.
    function seed(uint256 amount0, uint256 amount1) external onlyCurator nonReentrant returns (uint256 shares) {
        if (!poolSet) revert PoolNotSet();
        if (totalShares != 0) revert AlreadyLaunched();
        ERC20(Currency.unwrap(_key.currency0)).safeTransferFrom(msg.sender, address(this), amount0);
        ERC20(Currency.unwrap(_key.currency1)).safeTransferFrom(msg.sender, address(this), amount1);

        (shares,) =
            abi.decode(poolManager.unlock(abi.encode(Action.Seed, abi.encode(amount0, amount1))), (uint256, uint256));
        Rope storage r = ropes[msg.sender];
        r.shares += shares.toUint128();
        r.entryPrice = uint128(ONE);
        emit Deposited(msg.sender, amount1, shares, ONE);
    }

    function setCurator(address next) external onlyCurator {
        if (next == address(0)) revert InvalidCurator();
        curator = next;
        emit CuratorChanged(next);
    }

    function setMinDeposit(uint256 amount) external onlyCurator {
        minDeposit = amount;
        emit MinDepositChanged(amount);
    }

    // ------------------------------------------------------------------
    // Hook callbacks
    // ------------------------------------------------------------------

    function beforeInitialize(address sender, PoolKey calldata key, uint160) external onlyPoolManager returns (bytes4) {
        if (poolSet) revert PoolAlreadySet();
        if (sender != curator) revert NotCurator();
        // one static-fee ERC20 pool per hook; native ETH is not supported by the vault's transfers
        if (address(key.hooks) != address(this) || key.currency0.isAddressZero() || key.fee.isDynamicFee()) {
            revert InvalidPool();
        }
        if (tickLower % key.tickSpacing != 0 || tickUpper % key.tickSpacing != 0) revert InvalidRange();
        _key = key;
        poolId = key.toId();
        poolSet = true;
        return IHooks.beforeInitialize.selector;
    }

    /// @dev all liquidity goes through deposit(); the hook's own calls skip this
    function beforeAddLiquidity(address, PoolKey calldata, ModifyLiquidityParams calldata, bytes calldata)
        external
        view
        onlyPoolManager
        returns (bytes4)
    {
        revert ExternalLiquidityDisabled();
    }

    function beforeSwap(address, PoolKey calldata, SwapParams calldata, bytes calldata)
        external
        onlyPoolManager
        returns (bytes4, BeforeSwapDelta, uint24)
    {
        _markBlockOpen();
        return (IHooks.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, 0);
    }

    function afterSwap(address, PoolKey calldata, SwapParams calldata, BalanceDelta, bytes calldata)
        external
        onlyPoolManager
        returns (bytes4, int128)
    {
        _haul(MAX_PULLS_PER_SWAP);
        return (IHooks.afterSwap.selector, 0);
    }

    function unlockCallback(bytes calldata data) external onlyPoolManager returns (bytes memory) {
        (Action action, bytes memory args) = abi.decode(data, (Action, bytes));
        _markBlockOpen();

        if (action == Action.Seed || action == Action.Deposit) {
            (uint256 in0, uint256 in1) = abi.decode(args, (uint256, uint256));
            if (action == Action.Deposit) _checkDepositPrice();
            (uint256 shares, uint256 price) = _deposit(in0, in1);
            return abi.encode(shares, price);
        }
        if (action == Action.Surface) {
            (uint256 shares, bool toQuote) = abi.decode(args, (uint256, bool));
            (uint256 a0, uint256 a1) = _surface(shares, toQuote);
            return abi.encode(a0, a1);
        }
        if (action == Action.SellBase) {
            (uint256 out, uint256 unsold) = _sellBase(abi.decode(args, (uint256)));
            return abi.encode(out, unsold);
        }
        if (action == Action.Haul) return abi.encode(_haul(abi.decode(args, (uint256))));

        (int24 lower, int24 upper) = abi.decode(args, (int24, int24));
        _rebalance(lower, upper);
        return "";
    }

    // ------------------------------------------------------------------
    // Internal: vault mechanics (all run inside unlock)
    // ------------------------------------------------------------------

    /// @dev Shares are priced at the settled (block-open) price and at the pre-deposit spot price, and the depositor
    ///      gets the smaller count. A gap between the two inside a block can therefore never be used to mint cheap.
    function _deposit(uint256 in0, uint256 in1) internal returns (uint256 shares, uint256 price) {
        _collectFees();
        uint160 settled = settledSqrtPrice();
        uint160 spot0 = _spot();
        uint256 beforeSettled = _totalValue(settled);
        uint256 beforeSpot = spot0 == settled ? beforeSettled : _totalValue(spot0);

        int256 have0 = in0.toInt256();
        int256 have1 = in1.toInt256();

        // zap: quote-only deposits swap the base share so they fit the range
        uint256 swapIn = in0 == 0 ? _zapAmount(in1, spot0) : 0;
        if (swapIn > 0) {
            BalanceDelta sd = _swap(false, swapIn);
            have0 += sd.amount0();
            have1 += sd.amount1();
        }

        uint128 l = LiquidityAmounts.getLiquidityForAmounts(
            _spot(),
            TickMath.getSqrtPriceAtTick(tickLower),
            TickMath.getSqrtPriceAtTick(tickUpper),
            uint256(have0),
            uint256(have1)
        );
        if (l > 0) {
            BalanceDelta ld = _modify(int256(uint256(l)));
            liquidity += l;
            have0 += ld.amount0();
            have1 += ld.amount1();
        }

        // hook already holds the inputs; settle only the difference with the manager
        _settle(have0 - int256(in0), have1 - int256(in1));
        idle0 += uint256(have0);
        idle1 += uint256(have1);

        uint256 afterSettled = _totalValue(settled);
        uint256 afterSpot = spot0 == settled ? afterSettled : _totalValue(spot0);
        if (afterSettled <= beforeSettled || afterSpot <= beforeSpot) revert ZeroAmount();

        uint256 supply = totalShares;
        if (supply == 0) {
            shares = afterSettled;
            price = ONE;
        } else {
            price = FullMath.mulDiv(beforeSettled, ONE, supply);
            uint256 atSettled = FullMath.mulDiv(afterSettled - beforeSettled, supply, beforeSettled);
            uint256 atSpot = FullMath.mulDiv(afterSpot - beforeSpot, supply, beforeSpot);
            shares = atSettled < atSpot ? atSettled : atSpot;
        }
        if (shares == 0) revert ZeroAmount();
        totalShares = supply + shares;
    }

    function _surface(uint256 shares, bool toQuote) internal returns (uint256 amount0, uint256 amount1) {
        _collectFees();
        (amount0, amount1) = _carve(shares);
        if (toQuote && amount0 > 0) {
            (uint256 out, uint256 unsold) = _sellBase(amount0);
            amount1 += out;
            amount0 = unsold;
        }
    }

    /// @dev pulls the highest triggers first; each pull is pro rata so the share price doesn't move
    function _haul(uint256 maxPulls) internal returns (uint256 pulled) {
        uint256 n = _active.length;
        if (n == 0 || totalShares == 0) return 0;

        uint256 price = sharePrice();
        while (n > 0 && pulled < maxPulls) {
            uint32 id = _active[n - 1];
            if (uint256(id) * PRICE_STEP < price) break;
            if (pulled == 0) _collectFees();

            Bucket storage b = buckets[id];
            (uint256 a0, uint256 a1) = _carve(b.shares);
            pulls[id][b.round] = Pull(b.shares, a0.toUint128(), a1.toUint128(), price.toUint128(), uint64(block.number));
            reserved0 += a0;
            reserved1 += a1;
            emit RopePulled(id, b.round, b.shares, a0, a1, price);

            b.shares = 0;
            b.round++;
            _active.pop();
            n--;
            pulled++;
        }
    }

    function _rebalance(int24 lower, int24 upper) internal {
        _collectFees();
        if (liquidity > 0) {
            BalanceDelta d = _modify(-int256(uint256(liquidity)));
            _settle(d.amount0(), d.amount1());
            idle0 += uint256(int256(d.amount0()));
            idle1 += uint256(int256(d.amount1()));
            liquidity = 0;
        }
        tickLower = lower;
        tickUpper = upper;

        uint128 l = LiquidityAmounts.getLiquidityForAmounts(
            _spot(), TickMath.getSqrtPriceAtTick(lower), TickMath.getSqrtPriceAtTick(upper), idle0, idle1
        );
        if (l > 0) {
            BalanceDelta d = _modify(int256(uint256(l)));
            _settle(d.amount0(), d.amount1());
            idle0 -= uint256(-int256(d.amount0()));
            idle1 -= uint256(-int256(d.amount1()));
            liquidity = l;
        }
        emit Rebalanced(lower, upper, l);
    }

    /// @dev removes a pro-rata slice of liquidity + idle and burns the shares; tokens end up in the hook
    function _carve(uint256 shares) internal returns (uint256 amount0, uint256 amount1) {
        uint256 supply = totalShares;
        uint128 l = uint128(uint256(liquidity) * shares / supply);
        amount0 = idle0 * shares / supply;
        amount1 = idle1 * shares / supply;
        idle0 -= amount0;
        idle1 -= amount1;
        totalShares = supply - shares;

        if (l > 0) {
            BalanceDelta d = _modify(-int256(uint256(l)));
            liquidity -= l;
            _settle(d.amount0(), d.amount1());
            amount0 += uint256(int256(d.amount0()));
            amount1 += uint256(int256(d.amount1()));
        }
    }

    /// @return out quote received
    /// @return unsold base the range could not absorb; handed back as base
    function _sellBase(uint256 amount0) internal returns (uint256 out, uint256 unsold) {
        BalanceDelta d = _swap(true, amount0);
        _settle(d.amount0(), d.amount1());
        out = uint256(int256(d.amount1()));
        unsold = amount0 - uint256(-int256(d.amount0()));
    }

    /// @dev pokes the position so accrued fees land in idle before anyone's value is measured
    function _collectFees() internal {
        if (liquidity == 0) return;
        BalanceDelta d = _modify(0);
        _settle(d.amount0(), d.amount1());
        idle0 += uint256(int256(d.amount0()));
        idle1 += uint256(int256(d.amount1()));
    }

    function _modify(int256 delta) internal returns (BalanceDelta callerDelta) {
        (callerDelta,) = poolManager.modifyLiquidity(
            _key,
            ModifyLiquidityParams({
                tickLower: tickLower, tickUpper: tickUpper, liquidityDelta: delta, salt: bytes32(0)
            }),
            ""
        );
    }

    /// @dev The hook never trades past its own range. The vault is the pool's only LP, so beyond the range
    ///      there is no liquidity and an unbounded swap would run the price to the tick bounds.
    function _swap(bool zeroForOne, uint256 amountIn) internal returns (BalanceDelta) {
        uint160 limit = TickMath.getSqrtPriceAtTick(zeroForOne ? tickLower : tickUpper);
        uint160 spot = _spot();
        if (zeroForOne ? spot <= limit : spot >= limit) return BalanceDelta.wrap(0);
        return poolManager.swap(
            _key,
            SwapParams({zeroForOne: zeroForOne, amountSpecified: -amountIn.toInt256(), sqrtPriceLimitX96: limit}),
            ""
        );
    }

    function _settle(int256 d0, int256 d1) internal {
        _settleOne(_key.currency0, d0);
        _settleOne(_key.currency1, d1);
    }

    function _settleOne(Currency c, int256 d) internal {
        if (d < 0) {
            poolManager.sync(c);
            ERC20(Currency.unwrap(c)).safeTransfer(address(poolManager), uint256(-d));
            poolManager.settle();
        } else if (d > 0) {
            poolManager.take(c, address(this), uint256(d));
        }
    }

    function _markBlockOpen() internal {
        if (lastSwapBlock != block.number || blockOpenSqrtPrice == 0) {
            blockOpenSqrtPrice = _spot();
            lastSwapBlock = uint64(block.number);
        }
    }

    function _payout(address to, uint256 amount0, uint256 amount1) internal {
        if (amount0 > 0) ERC20(Currency.unwrap(_key.currency0)).safeTransfer(to, amount0);
        if (amount1 > 0) ERC20(Currency.unwrap(_key.currency1)).safeTransfer(to, amount1);
    }

    // ------------------------------------------------------------------
    // Internal: ropes
    // ------------------------------------------------------------------

    function _joinBucket(Rope storage r, uint16 dropBps) internal {
        r.dropBps = dropBps;
        if (dropBps == 0) {
            r.bucket = 0;
            return;
        }
        uint32 id = triggerBucket(r.entryPrice, dropBps);
        if (uint256(id) * PRICE_STEP >= sharePrice()) revert RopeTooShort();

        Bucket storage b = buckets[id];
        if (b.shares == 0) {
            if (_active.length >= MAX_BUCKETS) revert TooManyRopes();
            _active.insert(id);
        }
        b.shares += r.shares;
        r.bucket = id;
        r.round = b.round;
    }

    function _leaveBucket(Rope storage r, uint256 shares) internal {
        if (r.bucket == 0) return;
        Bucket storage b = buckets[r.bucket];
        b.shares -= shares.toUint128();
        if (b.shares == 0) _active.remove(r.bucket);
    }

    function _checkDrop(uint16 dropBps) internal pure {
        if (dropBps == 0) return;
        if (dropBps < DROP_STEP_BPS || dropBps > MAX_DROP_BPS || dropBps % DROP_STEP_BPS != 0) revert InvalidDrop();
    }

    /// @dev Outside the range the vault is the pool's only LP and has no liquidity there, so the price can be pushed
    ///      anywhere for free. Valuing new shares at such a price is unsafe; deposits wait for the curator to rebalance.
    function _checkDepositPrice() internal view {
        uint160 lo = TickMath.getSqrtPriceAtTick(tickLower);
        uint160 hi = TickMath.getSqrtPriceAtTick(tickUpper);
        uint160 settled = settledSqrtPrice();
        uint160 spot = _spot();
        if (settled < lo || settled > hi || spot < lo || spot > hi) revert OutOfRange();
    }

    function _isPulled(Rope storage r) internal view returns (bool) {
        return r.bucket != 0 && buckets[r.bucket].round > r.round;
    }

    function _checkRange(int24 lower, int24 upper) internal view {
        if (
            lower >= upper || lower < TickMath.MIN_TICK || upper > TickMath.MAX_TICK || lower % _key.tickSpacing != 0
                || upper % _key.tickSpacing != 0
        ) revert InvalidRange();
    }

    // ------------------------------------------------------------------
    // Views
    // ------------------------------------------------------------------

    /// @notice Price used for valuation: the block's opening price once anyone has traded in it.
    function settledSqrtPrice() public view returns (uint160) {
        return lastSwapBlock == block.number && blockOpenSqrtPrice != 0 ? blockOpenSqrtPrice : _spot();
    }

    /// @notice Quote value per share, 1e18 = 1.0
    function sharePrice() public view returns (uint256) {
        if (totalShares == 0) return ONE;
        return FullMath.mulDiv(_totalValue(settledSqrtPrice()), ONE, totalShares);
    }

    function spotSqrtPrice() external view returns (uint160) {
        return _spot();
    }

    function totalValue() external view returns (uint256) {
        return _totalValue(settledSqrtPrice());
    }

    /// @notice Rounds the trigger up, so a rope never runs longer than asked.
    function triggerBucket(uint256 entryPrice, uint16 dropBps) public pure returns (uint32) {
        uint256 trigger = entryPrice * (10_000 - dropBps) / 10_000;
        uint256 id = (trigger + PRICE_STEP - 1) / PRICE_STEP;
        return uint32(id == 0 ? 1 : id);
    }

    function poolKey() external view returns (PoolKey memory) {
        return _key;
    }

    function activeBuckets()
        external
        view
        returns (uint32[] memory ids, uint256[] memory triggers, uint256[] memory shares)
    {
        uint256 n = _active.length;
        ids = new uint32[](n);
        triggers = new uint256[](n);
        shares = new uint256[](n);
        for (uint256 i; i < n; ++i) {
            uint32 id = _active[n - 1 - i]; // highest trigger first
            ids[i] = id;
            triggers[i] = uint256(id) * PRICE_STEP;
            shares[i] = buckets[id].shares;
        }
    }

    /// @notice Everything the app needs for one depositor.
    function ropeOf(address user)
        external
        view
        returns (
            uint256 shares,
            uint256 entryPrice,
            uint16 dropBps,
            uint256 triggerPrice,
            uint256 value,
            bool pulled,
            uint256 claim0,
            uint256 claim1,
            uint256 pullPrice,
            uint256 pullBlock
        )
    {
        Rope storage r = ropes[user];
        shares = r.shares;
        entryPrice = r.entryPrice;
        dropBps = r.dropBps;
        triggerPrice = uint256(r.bucket) * PRICE_STEP;
        pulled = _isPulled(r);
        if (pulled) {
            Pull memory p = pulls[r.bucket][r.round];
            claim0 = uint256(p.amount0) * shares / p.shares;
            claim1 = uint256(p.amount1) * shares / p.shares;
            pullPrice = p.sharePrice;
            pullBlock = p.blockNumber;
            value = claim1 + _toQuote(claim0, _spot());
        } else {
            value = FullMath.mulDiv(shares, sharePrice(), ONE);
        }
    }

    function _totalValue(uint160 sqrtPrice) internal view returns (uint256) {
        (uint256 a0, uint256 a1) = LiquidityAmounts.getAmountsForLiquidity(
            sqrtPrice, TickMath.getSqrtPriceAtTick(tickLower), TickMath.getSqrtPriceAtTick(tickUpper), liquidity
        );
        return a1 + idle1 + _toQuote(a0 + idle0, sqrtPrice);
    }

    function _toQuote(uint256 amount0, uint160 sqrtPrice) internal pure returns (uint256) {
        return FullMath.mulDiv(FullMath.mulDiv(amount0, sqrtPrice, FixedPoint96.Q96), sqrtPrice, FixedPoint96.Q96);
    }

    /// @dev quote needed on the base side so the deposit lands in range shape
    function _zapAmount(uint256 amountIn, uint160 spot) internal view returns (uint256) {
        (uint256 a0, uint256 a1) = LiquidityAmounts.getAmountsForLiquidity(
            spot, TickMath.getSqrtPriceAtTick(tickLower), TickMath.getSqrtPriceAtTick(tickUpper), 1e18
        );
        uint256 v0 = _toQuote(a0, spot);
        if (v0 == 0) return 0;
        if (a1 == 0) return amountIn;
        return amountIn * v0 / (v0 + a1);
    }

    function _spot() internal view returns (uint160 sqrtPrice) {
        (sqrtPrice,,,) = poolManager.getSlot0(poolId);
    }

    // --- unused callbacks ---
    function afterInitialize(address, PoolKey calldata, uint160, int24) external pure returns (bytes4) {
        revert HookNotImplemented();
    }

    function afterAddLiquidity(
        address,
        PoolKey calldata,
        ModifyLiquidityParams calldata,
        BalanceDelta,
        BalanceDelta,
        bytes calldata
    ) external pure returns (bytes4, BalanceDelta) {
        revert HookNotImplemented();
    }

    function beforeRemoveLiquidity(address, PoolKey calldata, ModifyLiquidityParams calldata, bytes calldata)
        external
        pure
        returns (bytes4)
    {
        revert HookNotImplemented();
    }

    function afterRemoveLiquidity(
        address,
        PoolKey calldata,
        ModifyLiquidityParams calldata,
        BalanceDelta,
        BalanceDelta,
        bytes calldata
    ) external pure returns (bytes4, BalanceDelta) {
        revert HookNotImplemented();
    }

    function beforeDonate(address, PoolKey calldata, uint256, uint256, bytes calldata) external pure returns (bytes4) {
        revert HookNotImplemented();
    }

    function afterDonate(address, PoolKey calldata, uint256, uint256, bytes calldata) external pure returns (bytes4) {
        revert HookNotImplemented();
    }
}
