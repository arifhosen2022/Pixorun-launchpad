// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "../src/PixorunLaunchpadFactory.sol";
import "../src/PixorunSwapFactory.sol";
import "../src/PixorunSwapPair.sol";
import "../src/PixorunBondingCurve.sol";
import "../src/PixorunMissionToken.sol";

interface VmLiftoff { function deal(address account,uint256 newBalance) external; }

contract GenesisPassMock {
    function balanceOf(address) external pure returns(uint256) { return 1; }
}
contract LiftoffFeeMock {
    uint256 public creationFees;
    uint256 public tradeFees;
    uint256 public liftoffFees;
    function notifyCreationFee() external payable { creationFees+=msg.value; }
    function notifyTradeFee(address) external payable { tradeFees+=msg.value; }
    function notifyLiftoffFee() external payable { liftoffFees+=msg.value; }
    function notifySwapFee(address) external payable {}
}

contract PixorunLiftoffTest {
    VmLiftoff private constant vm=VmLiftoff(address(uint160(uint256(keccak256("hevm cheat code")))));
    receive() external payable {}

    function testFinalBuyMigratesAndBurnsExcessReserveAtomically() external {
        vm.deal(address(this),2 ether);
        GenesisPassMock pass=new GenesisPassMock();
        LiftoffFeeMock fees=new LiftoffFeeMock();
        PixorunSwapFactory swapFactory=new PixorunSwapFactory(address(fees));
        PixorunLaunchpadFactory launchFactory=new PixorunLaunchpadFactory(address(pass),address(fees),0);
        swapFactory.configureLaunchpadFactory(address(launchFactory));
        launchFactory.configureSwapFactory(address(swapFactory));

        (address tokenAddress,address curveAddress)=launchFactory.createLaunch("Liftoff Test","LFT");
        PixorunMissionToken token=PixorunMissionToken(tokenAddress);
        PixorunBondingCurve curve=PixorunBondingCurve(payable(curveAddress));

        uint256 gross=0.282828282828282828 ether;
        uint256 received=curve.buy{value:gross}(793_100_000 ether);
        require(received==793_100_000 ether,"curve sold out");
        require(curve.graduated(),"curve graduated");
        require(launchFactory.liftoffCompleted(tokenAddress),"migration completed");

        address pairAddress=swapFactory.getPair(tokenAddress);
        require(pairAddress!=address(0),"pair created");
        PixorunSwapPair pair=PixorunSwapPair(payable(pairAddress));
        require(pair.initialized(),"pair initialized");
        require(pair.balanceOf(pair.DEAD())==pair.totalSupply(),"LP locked");
        require(fees.tradeFees()==gross/100,"trade fee routed");
        require(fees.liftoffFees()==0.0084 ether,"three percent Liftoff fee");
        require(token.balanceOf(address(launchFactory))==0,"reserve fully allocated or burned");
        require(token.balanceOf(pairAddress)>0,"matching tokens seeded");
        require(token.balanceOf(0x000000000000000000000000000000000000dEaD)>0,"excess reserve burned");
        require(curve.realNative()==0,"curve native moved");
    }

    function testSwapFactoryRejectsUnconfiguredCaller() external {
        LiftoffFeeMock fees=new LiftoffFeeMock();
        PixorunSwapFactory swapFactory=new PixorunSwapFactory(address(fees));
        (bool ok,)=address(swapFactory).call{value:1 ether}(
            abi.encodeCall(swapFactory.createAndSeed,(address(1),address(this),1 ether))
        );
        require(!ok,"only configured launchpad can seed");
    }
}