// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

interface IPixorunStakeToken {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// @title PIXORUN Staking Rewards
/// @notice Stake the ecosystem's designated $T0 token to receive native-coin fee rewards.
contract PixorunStakingRewards {
    uint256 private constant PRECISION = 1e18;

    IPixorunStakeToken public immutable stakingToken;
    address public immutable feeDistributor;

    uint256 public totalStaked;
    mapping(address => uint256) public balanceOf;
    uint256 public rewardPerTokenStored;
    mapping(address => uint256) public userRewardPerTokenPaid;
    mapping(address => uint256) public rewards;

    uint256 public pendingReward;
    uint256 public pendingFromBlock;

    uint256 private unlocked = 1;

    error ZeroAddress();
    error ZeroAmount();
    error NotFeeDistributor();
    error NoActiveStake();
    error InsufficientStake();
    error PendingRewardLock();
    error TransferFailed();
    error NothingToClaim();
    error ReentrantCall();

    event Staked(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);
    event RewardQueued(uint256 amount, uint256 effectiveBlock);
    event RewardActivated(uint256 amount, uint256 rewardPerToken);
    event RewardPaid(address indexed user, uint256 amount);

    modifier nonReentrant() {
        if (unlocked != 1) revert ReentrantCall();
        unlocked = 0;
        _;
        unlocked = 1;
    }

    constructor(address stakingToken_, address feeDistributor_) {
        if (stakingToken_ == address(0) || feeDistributor_ == address(0)) revert ZeroAddress();
        stakingToken = IPixorunStakeToken(stakingToken_);
        feeDistributor = feeDistributor_;
    }

    /// @notice Called only by FeeDistributor. New rewards activate next block.
    function notifyFee() external payable {
        if (msg.sender != feeDistributor) revert NotFeeDistributor();
        if (msg.value == 0) revert ZeroAmount();
        if (totalStaked == 0) revert NoActiveStake();

        _activatePending();
        pendingReward += msg.value;
        if (pendingFromBlock == 0) pendingFromBlock = block.number + 1;
        emit RewardQueued(msg.value, pendingFromBlock);
    }

    function stake(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        _updateReward(msg.sender);
        if (!stakingToken.transferFrom(msg.sender, address(this), amount)) revert TransferFailed();
        balanceOf[msg.sender] += amount;
        totalStaked += amount;
        emit Staked(msg.sender, amount);
    }

    function withdraw(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        _updateReward(msg.sender);
        if (balanceOf[msg.sender] < amount) revert InsufficientStake();
        // Prevent the final staker from removing the stake backing a queued next-block reward.
        if (pendingReward != 0 && totalStaked == amount) revert PendingRewardLock();

        balanceOf[msg.sender] -= amount;
        totalStaked -= amount;
        if (!stakingToken.transfer(msg.sender, amount)) revert TransferFailed();
        emit Withdrawn(msg.sender, amount);
    }

    function claimReward() external nonReentrant {
        _updateReward(msg.sender);
        uint256 amount = rewards[msg.sender];
        if (amount == 0) revert NothingToClaim();
        rewards[msg.sender] = 0;
        (bool ok,) = payable(msg.sender).call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit RewardPaid(msg.sender, amount);
    }

    function earned(address account) external view returns (uint256) {
        uint256 accumulator = rewardPerTokenStored;
        if (pendingReward != 0 && pendingFromBlock != 0 && block.number >= pendingFromBlock && totalStaked != 0) {
            accumulator += pendingReward * PRECISION / totalStaked;
        }
        return rewards[account] + balanceOf[account] * (accumulator - userRewardPerTokenPaid[account]) / PRECISION;
    }

    function _updateReward(address account) internal {
        _activatePending();
        if (account != address(0)) {
            rewards[account] += balanceOf[account] *
                (rewardPerTokenStored - userRewardPerTokenPaid[account]) / PRECISION;
            userRewardPerTokenPaid[account] = rewardPerTokenStored;
        }
    }

    function _activatePending() internal {
        if (pendingReward == 0 || pendingFromBlock == 0 || block.number < pendingFromBlock) return;
        uint256 amount = pendingReward;
        pendingReward = 0;
        pendingFromBlock = 0;
        if (totalStaked == 0) revert NoActiveStake();
        rewardPerTokenStored += amount * PRECISION / totalStaked;
        emit RewardActivated(amount, rewardPerTokenStored);
    }
}
