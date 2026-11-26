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
