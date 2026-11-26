// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "../src/PixorunTzeroSwapFactory.sol";
import "../src/PixorunMissionToken.sol";

interface Vm {
    function deal(address account, uint256 newBalance) external;
}

contract MockSwapFeeDistributor {
    uint256 public received;
    address public lastCreator;
    function notifySwapFee(address creator) external payable {
        received += msg.value;
        lastCreator = creator;
    }
}

contract PixorunTzeroSwapTest {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    receive() external payable {}

    function testCreatePoolLocksInitialLiquidityAndSwaps() external {
        vm.deal(address(this), 10 ether);
        MockSwapFeeDistributor fees = new MockSwapFeeDistributor();
        PixorunTzeroSwapFactory factory = new PixorunTzeroSwapFactory(address(fees));
        PixorunMissionToken token = new PixorunMissionToken("Swap Test", "SWP", address(this));

        uint256 seedTokens = 100_000 ether;
        require(token.approve(address(factory), seedTokens), "approve seed");
        address pairAddress = factory.createAndSeed{value: 1 ether}(
            address(token), address(this), seedTokens
        );
        PixorunTzeroSwapPair pair = PixorunTzeroSwapPair(payable(pairAddress));

        require(pair.reserveNative() == 1 ether, "native reserve");
        require(pair.reserveToken() == seedTokens, "token reserve");
        require(pair.balanceOf(pair.DEAD()) == pair.totalSupply(), "LP permanently locked");

        uint256 tokenBefore = token.balanceOf(address(this));
        uint256 out = pair.swapNativeForToken{value: 0.1 ether}(0);
        require(out > 0, "native swap output");
        require(token.balanceOf(address(this)) == tokenBefore + out, "tokens received");
        require(fees.received() == 0.001 ether, "one percent native fee");
        require(pair.reserveNative() == 1.099 ether, "fee excluded from pool reserve");
        require(fees.lastCreator() == address(this), "creator routed");

        uint256 nativeBefore = address(this).balance;
        require(token.approve(pairAddress, 1_000 ether), "approve sell");
        uint256 nativeOut = pair.swapTokenForNative(1_000 ether, 0);
        require(nativeOut > 0, "token swap output");
        require(address(this).balance > nativeBefore, "native received");
    }

    function testCannotCreateSecondPoolForSameToken() external {
        vm.deal(address(this), 2 ether);
        MockSwapFeeDistributor fees = new MockSwapFeeDistributor();
        PixorunTzeroSwapFactory factory = new PixorunTzeroSwapFactory(address(fees));
        PixorunMissionToken token = new PixorunMissionToken("Swap Test", "SWP", address(this));
        require(token.approve(address(factory), 2_000 ether), "approve");
        factory.createAndSeed{value: 1 ether}(address(token), address(this), 1_000 ether);

        (bool ok,) = address(factory).call{value: 1 ether}(
            abi.encodeCall(factory.createAndSeed, (address(token), address(this), 1_000 ether))
        );
        require(!ok, "duplicate pair rejected");
    }
}
