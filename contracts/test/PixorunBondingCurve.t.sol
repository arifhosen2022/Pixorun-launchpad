// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "../src/PixorunBondingCurve.sol";
import "../src/PixorunMissionToken.sol";

contract PixorunBondingCurveTest {
    function testCalibrationAndBuyQuote() external {
        PixorunMissionToken token = new PixorunMissionToken("PIXORUN Test", "PTST", address(this));
        PixorunBondingCurve curve = new PixorunBondingCurve(
            address(token), payable(address(this)), address(this)
        );
        require(token.transfer(address(curve), 793_100_000 ether), "seed curve inventory");

        (uint256 tokensOut, uint256 feeAmount, uint256 netNative) =
            curve.quoteBuy(0.282828282828282828 ether);
        require(feeAmount == 0.002828282828282828 ether, "one percent fee");
        require(netNative == 0.28 ether, "net native calibration");
        require(tokensOut == 793_100_000 ether, "entire curve allocation");
    }

    function testBuyQuoteRespectsCurveInventory() external {
        PixorunMissionToken token = new PixorunMissionToken("PIXORUN Test", "PTST", address(this));
        PixorunBondingCurve curve = new PixorunBondingCurve(
            address(token), payable(address(this)), address(this)
        );
        require(token.transfer(address(curve), 793_100_000 ether), "seed curve inventory");

        (uint256 tokensOut,,) = curve.quoteBuy(0.01 ether);
        require(tokensOut > 0 && tokensOut < curve.realToken(), "bounded output");
    }
}
