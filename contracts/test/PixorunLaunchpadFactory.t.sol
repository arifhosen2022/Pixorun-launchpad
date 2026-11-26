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

contract MockGenesisPass {
    mapping(address => uint256) public balanceOf;

    function setBalance(address account, uint256 amount) external {
        balanceOf[account] = amount;
    }
}

contract NoPassCaller {
    function create(PixorunLaunchpadFactory factory) external returns (address, address) {
        return factory.createLaunch("No Pass", "NONE");
    }
}

contract PixorunLaunchpadFactoryTest {
    receive() external payable {}

    function testGenesisHolderCanCreateLaunchWithCorrectAllocation() external {
        MockGenesisPass pass = new MockGenesisPass();
        pass.setBalance(address(this), 1);
        PixorunLaunchpadFactory factory = new PixorunLaunchpadFactory(
            address(pass), address(new MockLaunchFeeDistributor()), 0.01 ether
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

    function testNonGenesisAddressCannotCreateLaunch() external {
        MockGenesisPass pass = new MockGenesisPass();
        PixorunLaunchpadFactory factory = new PixorunLaunchpadFactory(
            address(pass), address(new MockLaunchFeeDistributor()), 0
        );
        NoPassCaller caller = new NoPassCaller();

        (bool ok,) = address(caller).call(
            abi.encodeCall(caller.create, (factory))
        );
        require(!ok, "non-holder must be rejected");
    }

    function testWrongCreationFeeIsRejected() external {
        MockGenesisPass pass = new MockGenesisPass();
        pass.setBalance(address(this), 1);
        PixorunLaunchpadFactory factory = new PixorunLaunchpadFactory(
            address(pass), address(new MockLaunchFeeDistributor()), 0.01 ether
        );

        (bool ok,) = address(factory).call(
            abi.encodeCall(factory.createLaunch, ("PIXORUN Test", "PTST"))
        );
        require(!ok, "incorrect fee must be rejected");
    }
}
