// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "../src/PixorunCurveMath.sol";

contract PixorunCurveMathTest {
    using PixorunCurveMath for PixorunCurveMath.Reserves;

    function testFeeIsOnePercent() external pure {
        require(PixorunCurveMath.fee(1 ether) == 0.01 ether, "fee");
    }

    function testProgressCapsAtOneHundredPercent() external pure {
        require(PixorunCurveMath.progress(793_100_000 ether) == 10_000, "full");
        require(PixorunCurveMath.progress(900_000_000 ether) == 10_000, "cap");
    }

    function testBuyQuoteRoundsDown() external pure {
        PixorunCurveMath.Reserves memory r = PixorunCurveMath.Reserves({
            virtualNative: 0.1 ether,
            virtualToken: 793_100_000 ether,
            realToken: 793_100_000 ether,
            realNative: 0
        });
        (uint256 out, uint256 fee, uint256 net) = PixorunCurveMath.buyQuote(r, 0.01 ether);
        require(fee == 0.0001 ether, "fee");
        require(net == 0.0099 ether, "net");
        require(out > 0 && out < r.realToken, "output");
    }

    function testSellQuoteChargesFee() external pure {
        PixorunCurveMath.Reserves memory r = PixorunCurveMath.Reserves({
            virtualNative: 0.1 ether,
            virtualToken: 793_100_000 ether,
            realToken: 793_100_000 ether,
            realNative: 1 ether
        });
        (uint256 gross, uint256 fee, uint256 net) = PixorunCurveMath.sellQuote(r, 1_000_000 ether);
        require(gross > net && fee == gross / 100, "sell fee");
    }
}
