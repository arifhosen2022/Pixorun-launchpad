// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

interface IPixorunPairToken {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

interface IPixorunFeeDistributor {
    function notifySwapFee(address creator) external payable;
}

/// @title PIXORUN Swap Pair
/// @notice Native-coin/token constant-product pool. Initial LP is permanently locked.
contract PixorunSwapPair {
    uint256 public constant BPS = 10_000;
    uint256 public constant SWAP_FEE_BPS = 100;
    address public constant DEAD = 0x000000000000000000000000000000000000dEaD;

    IPixorunPairToken public immutable token;
    IPixorunFeeDistributor public immutable feeDistributor;
    address public immutable creator;

    uint112 public reserveNative;
    uint112 public reserveToken;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    uint256 private unlocked = 1;

    string public constant name = "PIXORUN Swap LP";
    string public constant symbol = "PX-LP";
    uint8 public constant decimals = 18;

    error ZeroAddress();
    error ZeroAmount();
    error Locked();
    error InsufficientLiquidity();
    error SlippageExceeded();
    error TransferFailed();
    error ReserveOverflow();
    error AlreadyInitialized();
    error NotFactory();

    address public immutable factory;
    bool public initialized;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event Swap(address indexed sender, bool nativeToToken, uint256 amountIn, uint256 amountOut, uint256 fee);
    event MintLocked(uint256 nativeAmount, uint256 tokenAmount, uint256 liquidity);

    modifier lock() {
        if (unlocked != 1) revert Locked();
        unlocked = 0;
        _;
        unlocked = 1;
    }

    constructor(address token_, address creator_, address feeDistributor_) {
        if (token_ == address(0) || creator_ == address(0) || feeDistributor_ == address(0)) {
            revert ZeroAddress();
        }
        token = IPixorunPairToken(token_);
        creator = creator_;
        feeDistributor = IPixorunFeeDistributor(feeDistributor_);
        factory = msg.sender;
    }

    receive() external payable {}

    function initialize(uint256 tokenAmount) external payable lock {
        if (msg.sender != factory) revert NotFactory();
        if (initialized) revert AlreadyInitialized();
        if (msg.value == 0 || tokenAmount == 0) revert ZeroAmount();
        if (token.balanceOf(address(this)) != tokenAmount) revert InsufficientLiquidity();

        initialized = true;
        reserveNative = _to112(msg.value);
        reserveToken = _to112(tokenAmount);

        // LP is intentionally non-transferable in practice: all initial liquidity is dead-locked.
        uint256 liquidity = _sqrt(msg.value * tokenAmount);
        if (liquidity == 0) revert InsufficientLiquidity();
        totalSupply = liquidity;
        balanceOf[DEAD] = liquidity;
        emit Transfer(address(0), DEAD, liquidity);
        emit MintLocked(msg.value, tokenAmount, liquidity);
    }

    function swapNativeForToken(uint256 minTokensOut) external payable lock returns (uint256 amountOut) {
        if (!initialized || msg.value == 0) revert ZeroAmount();
        uint256 fee = msg.value * SWAP_FEE_BPS / BPS;
        uint256 amountInAfterFee = msg.value - fee;
        uint256 rN = reserveNative;
        uint256 rT = reserveToken;
        if (rN == 0 || rT == 0) revert InsufficientLiquidity();

        amountOut = (amountInAfterFee * rT) / (rN + amountInAfterFee);
        if (amountOut == 0 || amountOut < minTokensOut || amountOut >= rT) revert SlippageExceeded();

        reserveNative = _to112(rN + amountInAfterFee);
        reserveToken = _to112(rT - amountOut);
        if (!token.transfer(msg.sender, amountOut)) revert TransferFailed();
        if (fee != 0) feeDistributor.notifySwapFee{value: fee}(creator);
        emit Swap(msg.sender, true, msg.value, amountOut, fee);
    }

    function swapTokenForNative(uint256 tokensIn, uint256 minNativeOut)
        external lock returns (uint256 nativeOut)
    {
        if (!initialized || tokensIn == 0) revert ZeroAmount();
        uint256 rN = reserveNative;
        uint256 rT = reserveToken;
        if (rN == 0 || rT == 0) revert InsufficientLiquidity();
        if (!token.transferFrom(msg.sender, address(this), tokensIn)) revert TransferFailed();

        uint256 grossOut = (tokensIn * rN) / (rT + tokensIn);
        uint256 fee = grossOut * SWAP_FEE_BPS / BPS;
        nativeOut = grossOut - fee;
        if (nativeOut == 0 || nativeOut < minNativeOut || grossOut >= rN) revert SlippageExceeded();

        reserveToken = _to112(rT + tokensIn);
        reserveNative = _to112(rN - grossOut);
        (bool paid,) = payable(msg.sender).call{value: nativeOut}("");
        if (!paid) revert TransferFailed();
        if (fee != 0) feeDistributor.notifySwapFee{value: fee}(creator);
        emit Swap(msg.sender, false, tokensIn, nativeOut, fee);
    }

    function approve(address spender, uint256 value) external returns (bool) {
        allowance[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
        return true;
    }

    function transfer(address to, uint256 value) external returns (bool) {
        _transferLP(msg.sender, to, value);
        return true;
    }

    function transferFrom(address from, address to, uint256 value) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) {
            if (allowed < value) revert TransferFailed();
            allowance[from][msg.sender] = allowed - value;
        }
        _transferLP(from, to, value);
        return true;
    }

    function _transferLP(address from, address to, uint256 value) internal {
        if (to == address(0) || balanceOf[from] < value) revert TransferFailed();
        balanceOf[from] -= value;
        balanceOf[to] += value;
        emit Transfer(from, to, value);
    }

    function _to112(uint256 value) private pure returns (uint112) {
        if (value > type(uint112).max) revert ReserveOverflow();
        return uint112(value);
    }

    function _sqrt(uint256 y) private pure returns (uint256 z) {
        if (y > 3) {
            z = y;
            uint256 x = y / 2 + 1;
            while (x < z) {
                z = x;
                x = (y / x + x) / 2;
            }
        } else if (y != 0) {
            z = 1;
        }
    }
}
