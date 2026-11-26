// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "../src/PixorunLaunchpadFactory.sol";

contract MockLaunchFeeDistributor {
    uint256 public creationFees;
    uint256 public tradeFees;
    receive() external payable {}
    function notifyCreationFee() external payable { creationFees += msg.value; }
    function notifyTradeFee(address) external payable { tradeFees += msg.value; }
}

contract MockSwapFactoryConfig {
    address public immutable feeDistributor;
    address public immutable launchpadFactory;
    constructor(address fee_, address launchpad_) { feeDistributor=fee_; launchpadFactory=launchpad_; }
}

contract PixorunLaunchpadFactoryTest {
    receive() external payable {}

    function testAnyWalletCanCreateLaunchWithCorrectAllocation() external {
        PixorunLaunchpadFactory factory = new PixorunLaunchpadFactory(
            address(new MockLaunchFeeDistributor()), 0.01 ether
        );
        (address tokenAddress, address curveAddress) =
            factory.createLaunch{value: 0.01 ether}("PIXORUN Test", "PTST");
        PixorunMissionToken token = PixorunMissionToken(tokenAddress);
        PixorunBondingCurve curve = PixorunBondingCurve(payable(curveAddress));
        require(factory.curveOf(tokenAddress) == curveAddress, "curve registry");
        require(factory.creatorOf(tokenAddress) == address(this), "creator registry");
        require(token.totalSupply() == 1_000_000_000 ether, "fixed supply");
        require(token.balanceOf(curveAddress) == 793_100_000 ether, "curve allocation");
        require(factory.liftoffReserveOf(tokenAddress) == 206_900_000 ether, "liftoff reserve");
        require(address(curve.token()) == tokenAddress, "curve token");
    }

    function testWrongCreationFeeIsRejected() external {
        PixorunLaunchpadFactory factory = new PixorunLaunchpadFactory(
            address(new MockLaunchFeeDistributor()), 0.01 ether
        );
        (bool ok,) = address(factory).call(
            abi.encodeCall(factory.createLaunch, ("PIXORUN Test", "PTST"))
        );
        require(!ok, "incorrect fee must be rejected");
    }

    function testSwapFactoryConfigurationChecksBothLinks() external {
        MockLaunchFeeDistributor fees = new MockLaunchFeeDistributor();
        PixorunLaunchpadFactory factory = new PixorunLaunchpadFactory(address(fees), 0);
        MockSwapFactoryConfig wrongFee = new MockSwapFactoryConfig(address(1), address(factory));
        (bool wrongFeeOk,) = address(factory).call(
            abi.encodeCall(factory.configureSwapFactory, (address(wrongFee)))
        );
        require(!wrongFeeOk, "wrong fee distributor rejected");
        MockSwapFactoryConfig wrongLaunchpad = new MockSwapFactoryConfig(address(fees), address(2));
        (bool wrongLaunchpadOk,) = address(factory).call(
            abi.encodeCall(factory.configureSwapFactory, (address(wrongLaunchpad)))
        );
        require(!wrongLaunchpadOk, "wrong launchpad rejected");
        MockSwapFactoryConfig valid = new MockSwapFactoryConfig(address(fees), address(factory));
        factory.configureSwapFactory(address(valid));
        require(address(factory.swapFactory()) == address(valid), "valid factory linked");
    }
}
