// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "../src/PixorunBondingCurve.sol";
import "../src/PixorunMissionToken.sol";


contract ReentrantCurveFeeDistributor {
    address public curveAddress;
    bool public attempted;
    bool public reentrySucceeded;
    function setCurve(address curve_) external { curveAddress=curve_; }
    function notifyTradeFee(address) external payable {
        attempted=true;
        (reentrySucceeded,)=curveAddress.call(abi.encodeWithSignature("buy(uint256)",0));
    }



}

contract NoopCurveFeeDistributor { function notifyTradeFee(address) external payable {} }

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

    function testFeeDistributorCallbackCannotReenterBuy() external {
        ReentrantCurveFeeDistributor fees=new ReentrantCurveFeeDistributor();
        PixorunMissionToken token=new PixorunMissionToken("PIXORUN Test","PTST",address(this));
        PixorunBondingCurve curve=new PixorunBondingCurve(address(token),address(fees),address(this));
        require(token.transfer(address(curve),793_100_000 ether),"seed curve inventory");
        fees.setCurve(address(curve));

        vm.deal(address(this),1 ether);
        CurveBuyer buyer=new CurveBuyer();
        uint256 beforeTokens=token.balanceOf(address(buyer));
        buyer.buy{value:0.01 ether}(curve);

        require(fees.attempted(),"fee callback attempted");
        require(!fees.reentrySucceeded(),"nested buy rejected");
        require(token.balanceOf(address(buyer))>beforeTokens,"outer buy completed");
        require(curve.realNative()>0,"outer reserves updated");
    }

    function testSellRejectsZeroNativePayoutAfterRounding() external {
        vm.deal(address(this), 1 ether);
        PixorunMissionToken token = new PixorunMissionToken("PIXORUN Test", "PTST", address(this));
        NoopCurveFeeDistributor fees = new NoopCurveFeeDistributor();
        PixorunBondingCurve curve = new PixorunBondingCurve(
            address(token), address(fees), address(this)
        );
        require(token.transfer(address(curve), 793_100_000 ether), "seed curve inventory");
        curve.buy{value:0.01 ether}(0);
        require(token.approve(address(curve), 1), "approve dust sell");
        uint256 beforeBalance = token.balanceOf(address(this));
        (bool ok,) = address(curve).call(abi.encodeWithSelector(curve.sell.selector, 1, 0));
        require(!ok, "zero-payout sell must revert");
        require(token.balanceOf(address(this)) == beforeBalance, "seller token balance unchanged");
    }
}
