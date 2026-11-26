// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title PIXORUN Constant-Product Curve Math
/// @notice Deterministic integer math for the 79.31% mission-token bonding curve.
/// @dev Quotes use virtual reserves. All divisions round against the trader.
library PixorunCurveMath {
    uint256 internal constant BPS = 10_000;
    uint256 internal constant TRADE_FEE_BPS = 100;
    uint256 internal constant CURVE_SUPPLY = 793_100_000 ether;
    uint256 internal constant LIFTOFF_RESERVE = 206_900_000 ether;
    // Provisional calibration: 0.1 ETH virtual native + 0.28 ETH net buys
    // exhaust the 793.1M curve allocation. Reconfirm before deployment.
    uint256 internal constant VIRTUAL_TOKEN_RESERVE = 1_076_350_000 ether;

    error InvalidReserves();
    error ZeroAmount();
    error CurveExhausted();

    struct Reserves {
        uint256 virtualNative;
        uint256 virtualToken;
        uint256 realToken;
        uint256 realNative;
    }

    function fee(uint256 grossNative) internal pure returns (uint256) {
        return grossNative * TRADE_FEE_BPS / BPS;
    }

    function buyQuote(Reserves memory r, uint256 grossNative)
        internal pure returns (uint256 tokensOut, uint256 tradeFee, uint256 netNative)
    {
        if (grossNative == 0) revert ZeroAmount();
        if (r.virtualNative == 0 || r.virtualToken == 0) revert InvalidReserves();
        tradeFee = fee(grossNative);
        netNative = grossNative - tradeFee;
        // x*y=k; output is rounded down, favouring the curve.
        tokensOut = r.virtualToken * netNative / (r.virtualNative + netNative);
        if (tokensOut == 0 || tokensOut > r.realToken) revert CurveExhausted();
    }

    function netNativeForExactTokens(uint256 virtualNative, uint256 virtualToken, uint256 tokensOut)
        internal pure returns (uint256 netNative)
    {
        if (tokensOut == 0) revert ZeroAmount();
        if (virtualNative == 0 || virtualToken <= tokensOut) revert InvalidReserves();
        // Inverse of buyQuote, rounded up so the curve is never underpaid.
        uint256 numerator = virtualNative * tokensOut;
        uint256 denominator = virtualToken - tokensOut;
        netNative = numerator / denominator;
        if (numerator % denominator != 0) ++netNative;
    }

    function sellQuote(Reserves memory r, uint256 tokensIn)
        internal pure returns (uint256 grossNativeOut, uint256 tradeFee, uint256 netNativeOut)
    {
        if (tokensIn == 0) revert ZeroAmount();
        if (r.virtualNative == 0 || r.virtualToken == 0) revert InvalidReserves();
        // x*y=k; native output is rounded down, favouring the curve.
        grossNativeOut = r.virtualNative * tokensIn / (r.virtualToken + tokensIn);
        tradeFee = fee(grossNativeOut);
        netNativeOut = grossNativeOut - tradeFee;
        if (grossNativeOut > r.realNative) revert InvalidReserves();
    }

    function progress(uint256 sold) internal pure returns (uint256) {
        if (sold >= CURVE_SUPPLY) return BPS;
        return sold * BPS / CURVE_SUPPLY;
    }
}
