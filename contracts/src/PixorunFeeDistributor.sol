// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

interface IPixorunFeeSource {
    function factory() external view returns (address);
}

interface IPixorunFeeFactoryLink {
    function feeDistributor() external view returns (address);
}

interface IPixorunStakingFeeReceiver {
    /// @dev Revert when no eligible stake exists; reward accounting starts next block.
    function notifyFee() external payable;
}

/// @title PIXORUN Fee Distributor
/// @notice Trade fees split 30% team, 20% stakers, 50% creator; creation/Liftoff fees use 70/30.
contract PixorunFeeDistributor {
    uint256 public constant BPS = 10_000;
    address public immutable teamWallet;
    address public stakingRewards;
    address public immutable configurator;

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
    error UnauthorizedConfigurator();
    error StakingAlreadyConfigured();

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

    constructor(address teamWallet_, address stakingRewards_) {
        if (teamWallet_ == address(0)) revert ZeroAddress();
        teamWallet = teamWallet_;
        configurator = msg.sender;
        stakingRewards = stakingRewards_;
    }

    /// @notice Set the staking receiver once after deploying it against this distributor.
    /// @dev Only the original deployer can configure this, and it cannot be changed later.
    function setStakingRewards(address stakingRewards_) external {
        if (msg.sender != configurator) revert UnauthorizedConfigurator();
        if (stakingRewards != address(0)) revert StakingAlreadyConfigured();
        if (stakingRewards_ == address(0) || stakingRewards_.code.length == 0) revert ZeroAddress();
        stakingRewards = stakingRewards_;
    }

    /// @notice Creation fee: 70% team and 30% stakers.
    function notifyCreationFee() external payable {
        if (!_isLinkedFactory(msg.sender)) revert UnauthorizedSource();
        if (msg.value == 0) revert NothingToClaim();
        uint256 teamShare = msg.value * 7_000 / BPS;
        uint256 stakerShare = msg.value - teamShare;
        _creditTeam(teamShare);
        _forwardStakerOrTeam(stakerShare);
        emit FeeAllocated(msg.sender, address(0), msg.value, teamShare, stakerShare, 0);
    }

    /// @notice Liftoff fee: 70% team and 30% stakers.
    function notifyLiftoffFee() external payable {
        if (!_isLinkedFactory(msg.sender)) revert UnauthorizedSource();
        if (msg.value == 0) revert NothingToClaim();
        uint256 teamShare = msg.value * 7_000 / BPS;
        uint256 stakerShare = msg.value - teamShare;
        _creditTeam(teamShare);
        _forwardStakerOrTeam(stakerShare);
        emit FeeAllocated(msg.sender, address(0), msg.value, teamShare, stakerShare, 0);
    }

    function notifySwapFee(address creator) external payable { _allocateTradeFee(creator); }
    function notifyTradeFee(address creator) external payable { _allocateTradeFee(creator); }

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

    function _allocateTradeFee(address creator) internal {
        if (msg.value == 0) revert NothingToClaim();
        if (creator == address(0)) revert ZeroCreator();
        address sourceFactory;
        try IPixorunFeeSource(msg.sender).factory() returns (address f) {
            sourceFactory = f;
        } catch {
            revert UnauthorizedSource();
        }
        if (!_isLinkedFactory(sourceFactory)) revert UnauthorizedSource();

        uint256 teamShare = msg.value * 3_000 / BPS;
        uint256 stakerShare = msg.value * 2_000 / BPS;
        uint256 creatorShare = msg.value - teamShare - stakerShare;
        creatorClaimable[creator] += creatorShare;
        totalCreatorAccrued += creatorShare;
        _creditTeam(teamShare);
        _forwardStakerOrTeam(stakerShare);
        emit FeeAllocated(msg.sender, creator, msg.value, teamShare, stakerShare, creatorShare);
    }

    function _creditTeam(uint256 amount) internal {
        if (amount == 0) return;
        teamClaimable += amount;
        totalTeamAccrued += amount;
    }

    function _forwardStakerOrTeam(uint256 amount) internal {
        if (amount == 0) return;
        if (stakingRewards == address(0)) {
            _creditTeam(amount);
            emit StakerFeeRedirectedToTeam(amount);
            return;
        }
        try IPixorunStakingFeeReceiver(stakingRewards).notifyFee{value: amount}() {
            totalStakerForwarded += amount;
            emit StakerFeeForwarded(amount);
        } catch {
            _creditTeam(amount);
            emit StakerFeeRedirectedToTeam(amount);
        }
    }

    function _isLinkedFactory(address candidate) internal view returns (bool) {
        if (candidate == address(0)) return false;
        try IPixorunFeeFactoryLink(candidate).feeDistributor() returns (address configured) {
            return configured == address(this);
        } catch {
            return false;
        }
    }
}
