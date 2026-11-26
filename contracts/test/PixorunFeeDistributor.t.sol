// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "../src/PixorunFeeDistributor.sol";

contract FeeSourceMock {
    address public immutable factory;
    constructor(address factory_) { factory = factory_; }
    function sendFee(PixorunFeeDistributor distributor, address creator) external payable {
        distributor.notifyTradeFee{value: msg.value}(creator);
    }
    function sendSwapFee(PixorunFeeDistributor distributor, address creator) external payable {
        distributor.notifySwapFee{value: msg.value}(creator);
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

contract PixorunFeeDistributorTest {
    receive() external payable {}

    function testSplitsFeeAndCreatorCanClaim() external {
        address launchFactory = address(0x1001);
        address swapFactory = address(0x1002);
        address team = address(0x1003);
        StakingFeeMock staking = new StakingFeeMock();
        PixorunFeeDistributor distributor = new PixorunFeeDistributor(team, address(staking));
        FeeSourceMock source = new FeeSourceMock(address(new FeeFactoryMock(address(distributor))));

        source.sendFee{value: 1 ether}(distributor, address(this));

        require(distributor.creatorClaimable(address(this)) == 0.5 ether, "creator 50%");
        require(distributor.teamClaimable() == 0.3 ether, "team 30%");
        require(staking.received() == 0.2 ether, "stakers 20%");
        require(distributor.totalStakerForwarded() == 0.2 ether, "forwarded total");

        uint256 beforeBalance = address(this).balance;
        distributor.claimCreatorFees();
        require(address(this).balance == beforeBalance + 0.5 ether, "creator payout");
        require(distributor.creatorClaimable(address(this)) == 0, "creator cleared");
    }

    function testNoStakersRedirectTheirShareToTeam() external {
        address launchFactory = address(0x1001);
        StakingFeeMock staking = new StakingFeeMock();
        staking.setRejectFees(true);
        PixorunFeeDistributor distributor = new PixorunFeeDistributor(address(0x1003), address(staking));
        FeeSourceMock source = new FeeSourceMock(launchFactory);
        source.sendFee{value: 1 ether}(distributor, address(this));

        require(distributor.teamClaimable() == 0.5 ether, "team receives unused staker share");
        require(distributor.creatorClaimable(address(this)) == 0.5 ether, "creator share preserved");
    }

    function testRejectsUnregisteredFeeSource() external {
        PixorunFeeDistributor distributor = new PixorunFeeDistributor(address(0x1003), address(0));
        FeeSourceMock attacker = new FeeSourceMock(address(new FeeFactoryMock(address(0x9999))));
        (bool ok,) = address(attacker).call{value: 1 ether}(
            abi.encodeCall(attacker.sendFee, (distributor, address(this)))
        );
        require(!ok, "unregistered source rejected");
    }
}
