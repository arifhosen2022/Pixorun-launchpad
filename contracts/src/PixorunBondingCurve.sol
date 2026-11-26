// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "./PixorunCurveMath.sol";

interface IPixorunERC20 {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 value) external returns (bool);
    function transferFrom(address from, address to, uint256 value) external returns (bool);
}

/// @title PIXORUN Bonding Curve
/// @notice Robinhood Chain native-coin bonding curve with 1% trade fee.
/// @dev Fee routing and Liftoff migration are intentionally separate modules.
///      Deploy only through a reviewed factory; do not use as a standalone launch.
contract PixorunBondingCurve {
    uint256 public constant BPS = 10_000;
    uint256 public constant TRADE_FEE_BPS = 100;
    uint256 public constant CURVE_ALLOCATION = 793_100_000 ether;
    uint256 public constant INITIAL_VIRTUAL_NATIVE = 0.1 ether;
    uint256 public constant INITIAL_VIRTUAL_TOKEN = 1_076_350_000 ether;

    IPixorunERC20 public immutable token;
    address payable public immutable feeRecipient;
    address public immutable creator;

    uint256 public virtualNative = INITIAL_VIRTUAL_NATIVE;
    uint256 public virtualToken = INITIAL_VIRTUAL_TOKEN;
    uint256 public realNative;
    uint256 public realToken = CURVE_ALLOCATION;
    uint256 public totalSold;
    bool public graduated;

    error ZeroAddress();
    error ZeroAmount();
    error InvalidRecipient();
    error SlippageExceeded();
    error CurveExhausted();
    error InsufficientLiquidity();
    error TransferFailed();
    error AlreadyGraduated();

    event Bought(address indexed buyer, uint256 grossNative, uint256 fee, uint256 tokensOut);
    event Sold(address indexed seller, uint256 tokensIn, uint256 grossNative, uint256 fee, uint256 netNative);
    event GraduationFlagged(uint256 totalSold, uint256 realNative);

    constructor(address token_, address payable feeRecipient_, address creator_) {
        if (token_ == address(0) || feeRecipient_ == address(0) || creator_ == address(0)) {
            revert ZeroAddress();
        }
        token = IPixorunERC20(token_);
        feeRecipient = feeRecipient_;
        creator = creator_;
    }

    receive() external payable {}

    function quoteBuy(uint256 grossNative)
        public view returns (uint256 tokensOut, uint256 feeAmount, uint256 netNative)
    {
        PixorunCurveMath.Reserves memory r = _reserves();
        return PixorunCurveMath.buyQuote(r, grossNative);
    }

    function quoteSell(uint256 tokensIn)
        public view returns (uint256 grossNative, uint256 feeAmount, uint256 netNative)
    {
        PixorunCurveMath.Reserves memory r = _reserves();
        return PixorunCurveMath.sellQuote(r, tokensIn);
    }

    function buy(uint256 minTokensOut) external payable returns (uint256 tokensOut) {
        if (graduated) revert AlreadyGraduated();
        if (msg.value == 0) revert ZeroAmount();

        uint256 feeAmount;
        uint256 netNative;
        (tokensOut, feeAmount, netNative) = quoteBuy(msg.value);
        if (tokensOut < minTokensOut) revert SlippageExceeded();

        virtualNative += netNative;
        virtualToken -= tokensOut;
        realNative += netNative;
        realToken -= tokensOut;
        totalSold += tokensOut;

        _safeTransfer(msg.sender, tokensOut);
        _sendFee(feeAmount);
        emit Bought(msg.sender, msg.value, feeAmount, tokensOut);

        if (realToken == 0) {
            graduated = true;
            emit GraduationFlagged(totalSold, realNative);
        }
    }

    function sell(uint256 tokensIn, uint256 minNativeOut) external returns (uint256 netNativeOut) {
        if (graduated) revert AlreadyGraduated();
        if (tokensIn == 0) revert ZeroAmount();

        (uint256 grossNative, uint256 feeAmount, uint256 netNative) = quoteSell(tokensIn);
        if (netNative < minNativeOut) revert SlippageExceeded();
        if (grossNative > realNative) revert InsufficientLiquidity();

        if (!token.transferFrom(msg.sender, address(this), tokensIn)) revert TransferFailed();
        virtualNative -= grossNative;
        virtualToken += tokensIn;
        realNative -= grossNative;
        realToken += tokensIn;
        totalSold -= tokensIn;
        netNativeOut = netNative;

        _sendNative(payable(msg.sender), netNative);
        _sendFee(feeAmount);
        emit Sold(msg.sender, tokensIn, grossNative, feeAmount, netNative);
    }

    function _reserves() internal view returns (PixorunCurveMath.Reserves memory) {
        return PixorunCurveMath.Reserves({
            virtualNative: virtualNative,
            virtualToken: virtualToken,
            realToken: realToken,
            realNative: realNative
        });
    }

    function _safeTransfer(address to, uint256 amount) internal {
        if (!token.transfer(to, amount)) revert TransferFailed();
    }

    function _sendFee(uint256 amount) internal {
        if (amount != 0) _sendNative(feeRecipient, amount);
    }

    function _sendNative(address payable to, uint256 amount) internal {
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }
}
