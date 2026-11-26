// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "../src/PixorunBondingCurve.sol";
import "../src/PixorunMissionToken.sol";


contract ReentrantCurveFeeDistributor {
    PixorunBondingCurve public curve;
    bool public attempted;
    bool public reentrySucceeded;
    function setCurve(PixorunBondingCurve curve_) external { curve=curve_; }
    function notifyTradeFee(address) external payable {
        attempted=true;
        (reentrySucceeded,)=address(curve).call(abi.encodeWithSignature("buy(uint256)",0));
    }

    function testFeeDistributorCallbackCannotReenterBuy() external {
        ReentrantCurveFeeDistributor fees=new ReentrantCurveFeeDistributor();
        PixorunMissionToken token=new PixorunMissionToken("PIXORUN Test","PTST",address(this));
        PixorunBondingCurve curve=new PixorunBondingCurve(address(token),address(fees),address(this));
        require(token.transfer(address(curve),793_100_000 ether),"seed curve inventory");
        fees.setCurve(curve);

        vm.deal(address(this),1 ether);
        CurveBuyer buyer=new CurveBuyer();
        uint256 beforeTokens=token.balanceOf(address(buyer));
        buyer.buy{value:0.01 ether}(curve);

        require(fees.attempted(),"fee callback attempted");
        require(!fees.reentrySucceeded(),"nested buy rejected");
        require(token.balanceOf(address(buyer))>beforeTokens,"outer buy completed");
        require(curve.realNative()>0,"outer reserves updated");
    }

}

contract CurveBuyer {
    receive() external payable {}
    function buy(PixorunBondingCurve curve) external payable returns(uint256) {
        return curve.buy{value:msg.value}(0);
    }
}

interface VmCurve { function deal(address account,uint256 newBalance) external; }

contract PixorunBondingCurveTest {
    VmCurve private constant vm=VmCurve(address(uint160(uint256(keccak256("hevm cheat code")))));
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
