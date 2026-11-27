// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "../src/PixorunFeeDistributor.sol";

contract FeeFactoryMock {
    address public immutable feeDistributor;
    constructor(address distributor_) { feeDistributor = distributor_; }
    function sendCreationFee(PixorunFeeDistributor distributor) external payable {
        distributor.notifyCreationFee{value: msg.value}();
    }
}

contract FeeSourceMock {
    address public immutable factory;
    constructor(address factory_) { factory = factory_; }
    function sendFee(PixorunFeeDistributor distributor, address creator) external payable {
        distributor.notifyTradeFee{value: msg.value}(creator);
    }
}

contract StakingFeeMock {
    uint256 public received;
    bool public rejectFees;
    function setRejectFees(bool reject_) external { rejectFees = reject_; }
    function notifyFee() external payable {
        require(!rejectFees, "no active stakers");
        received += msg.value;
    }
}

contract StakingLinkAttacker {
    function tryConfigure(PixorunFeeDistributor distributor, address staking) external returns (bool) {
        (bool ok,) = address(distributor).call(abi.encodeWithSignature("setStakingRewards(address)", staking));
        return ok;
    }
}

contract PixorunFeeDistributorTest {
    receive() external payable {}

    function testStakingReceiverCanBeConfiguredExactlyOnceByDeployer() external {
        PixorunFeeDistributor distributor = new PixorunFeeDistributor(address(0x1003), address(0));
        StakingFeeMock staking = new StakingFeeMock();
        distributor.setStakingRewards(address(staking));
        require(distributor.stakingRewards() == address(staking), "staking receiver set");
        (bool second,) = address(distributor).call(
            abi.encodeWithSignature("setStakingRewards(address)", address(staking))
        );
        require(!second, "cannot replace staking receiver");
        require(!new StakingLinkAttacker().tryConfigure(distributor, address(staking)), "only deployer configures");
    }

    function testSplitsTradeFeeAndCreatorCanClaim() external {
        StakingFeeMock staking = new StakingFeeMock();
        PixorunFeeDistributor distributor = new PixorunFeeDistributor(address(0x1003), address(staking));
        FeeFactoryMock factory = new FeeFactoryMock(address(distributor));
        FeeSourceMock source = new FeeSourceMock(address(factory));

        source.sendFee{value: 1 ether}(distributor, address(this));
        require(distributor.creatorClaimable(address(this)) == 0.5 ether, "creator 50%");
        require(distributor.teamClaimable() == 0.3 ether, "team 30%");
        require(staking.received() == 0.2 ether, "stakers 20%");

        uint256 beforeBalance = address(this).balance;
        distributor.claimCreatorFees();
        require(address(this).balance == beforeBalance + 0.5 ether, "creator payout");
    }

    function testNoStakersRedirectTradeShareToTeam() external {
        StakingFeeMock staking = new StakingFeeMock();
        staking.setRejectFees(true);
        PixorunFeeDistributor distributor = new PixorunFeeDistributor(address(0x1003), address(staking));
        FeeFactoryMock factory = new FeeFactoryMock(address(distributor));
        FeeSourceMock source = new FeeSourceMock(address(factory));
        source.sendFee{value: 1 ether}(distributor, address(this));

        require(distributor.teamClaimable() == 0.5 ether, "unused staker share to team");
        require(distributor.creatorClaimable(address(this)) == 0.5 ether, "creator share preserved");
    }

    function testCreationFeeUsesSeventyThirtySplit() external {
        StakingFeeMock staking = new StakingFeeMock();
        PixorunFeeDistributor distributor = new PixorunFeeDistributor(address(0x1003), address(staking));
        FeeFactoryMock factory = new FeeFactoryMock(address(distributor));
        factory.sendCreationFee{value: 1 ether}(distributor);
        require(distributor.teamClaimable() == 0.7 ether, "team 70%");
        require(staking.received() == 0.3 ether, "stakers 30%");
    }

    function testRejectsUnlinkedFactory() external {
        PixorunFeeDistributor distributor = new PixorunFeeDistributor(address(0x1003), address(0));
        FeeFactoryMock wrongFactory = new FeeFactoryMock(address(0x9999));
        FeeSourceMock attacker = new FeeSourceMock(address(wrongFactory));
        (bool ok,) = address(attacker).call{value: 1 ether}(
            abi.encodeCall(attacker.sendFee, (distributor, address(this)))
        );
        require(!ok, "unlinked factory rejected");
    }
}
