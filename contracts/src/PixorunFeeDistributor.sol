// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

interface IPixorunFeeSource {
    function factory() external view returns (address);
}

interface IPixorunStakingFeeReceiver {
    /// @notice Must revert when there are no eligible stakers; rewards start next block.
    function notifyFee() external payable;
}

/// @title PIXORUN Fee Distributor
/// @notice Accounts for 30% team, 20% stakers and 50% creator from 1% trade fees.
/// @dev Team and creator shares are pull-claimed; failed team payouts never block trades.
contract PixorunFeeDistributor {
    uint256 public constant BPS = 10_000;
    uint256 public constant TEAM_BPS = 3_000;
    uint256 public constant STAKER_BPS = 2_000;

    address public immutable teamWallet;
    address public immutable stakingRewards;
    address public immutable launchpadFactory;
    address public immutable swapFactory;

    mapping(address => uint256) public creatorClaimable;
    uint256 public teamClaimable;
    uint256 public totalCreatorAccrued;
    uint256 public totalTeamAccrued;
    uint256 public totalStakerForwarded;
    uint256 private unlocked = 1;

    error ZeroAddress();
    error UnauthorizedSource();
    error ZeroCreator();
    error NothingToClaim();
    error TransferFailed();
    error ReentrantCall();

    event FeeAllocated(address indexed source, address indexed creator, uint256 totalFee, uint256 team, uint256 stakers, uint256 creatorShare);
    event CreatorClaimed(address indexed creator, uint256 amount);
    event TeamClaimed(address indexed recipient, uint256 amount);
    event StakerFeeForwarded(uint256 amount);
    event StakerFeeRedirectedToTeam(uint256 amount);

    modifier nonReentrant() {
        if (unlocked != 1) revert ReentrantCall();
        unlocked = 0;
        _;
        unlocked = 1;
    }

    constructor(address teamWallet_, address stakingRewards_, address launchpadFactory_, address swapFactory_) {
        if (teamWallet_ == address(0) || launchpadFactory_ == address(0) || swapFactory_ == address(0)) {
            revert ZeroAddress();
        }
        teamWallet = teamWallet_;
        stakingRewards = stakingRewards_;
        launchpadFactory = launchpadFactory_;
        swapFactory = swapFactory_;
    }

    /// @notice Called by a registered launch curve or TzeroSwap pair.
    function notifySwapFee(address creator) external payable {
        _allocate(creator);
    }

    /// @notice Same accounting path for bonding-curve trade fees.
    function notifyTradeFee(address creator) external payable {
        _allocate(creator);
    }

    function claimCreatorFees() external nonReentrant {
        uint256 amount = creatorClaimable[msg.sender];
        if (amount == 0) revert NothingToClaim();
        creatorClaimable[msg.sender] = 0;
        (bool ok,) = payable(msg.sender).call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit CreatorClaimed(msg.sender, amount);
    }

    function claimTeamFees() external nonReentrant {
        uint256 amount = teamClaimable;
        if (amount == 0) revert NothingToClaim();
        teamClaimable = 0;
        (bool ok,) = payable(teamWallet).call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit TeamClaimed(teamWallet, amount);
    }

    function _allocate(address creator) internal {
        if (msg.value == 0) revert NothingToClaim();
        if (creator == address(0)) revert ZeroCreator();

        address sourceFactory;
        try IPixorunFeeSource(msg.sender).factory() returns (address f) {
            sourceFactory = f;
        } catch {
            revert UnauthorizedSource();
        }
        if (sourceFactory != launchpadFactory && sourceFactory != swapFactory) revert UnauthorizedSource();

        uint256 teamShare = msg.value * TEAM_BPS / BPS;
        uint256 stakerShare = msg.value * STAKER_BPS / BPS;
        uint256 creatorShare = msg.value - teamShare - stakerShare;

        creatorClaimable[creator] += creatorShare;
        totalCreatorAccrued += creatorShare;
        teamClaimable += teamShare;
        totalTeamAccrued += teamShare;

        if (stakerShare != 0) {
            if (stakingRewards == address(0)) {
                teamClaimable += stakerShare;
                totalTeamAccrued += stakerShare;
                emit StakerFeeRedirectedToTeam(stakerShare);
            } else {
                try IPixorunStakingFeeReceiver(stakingRewards).notifyFee{value: stakerShare}() {
                    totalStakerForwarded += stakerShare;
                    emit StakerFeeForwarded(stakerShare);
                } catch {
                    teamClaimable += stakerShare;
                    totalTeamAccrued += stakerShare;
                    emit StakerFeeRedirectedToTeam(stakerShare);
                }
            }
        }
        emit FeeAllocated(msg.sender, creator, msg.value, teamShare, stakerShare, creatorShare);
    }
}
