// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "./PixorunSwapPair.sol";

interface IPixorunSeedToken { function transferFrom(address from,address to,uint256 amount) external returns(bool); }

/// @title PIXORUN Swap Factory
/// @notice Creates one pool per launch token; only the configured Launchpad may seed a pool.
contract PixorunSwapFactory {
    address public immutable feeDistributor;
    address public immutable configurator;
    address public launchpadFactory;
    mapping(address=>address) public getPair;
    address[] public allPairs;

    error ZeroAddress(); error PairExists(); error TokenTransferFailed();
    error InvalidSeed(); error Unauthorized(); error AlreadyConfigured();

    event PairCreated(address indexed token,address indexed pair,address indexed creator,uint256 index);
    event LaunchpadConfigured(address indexed launchpadFactory);

    constructor(address feeDistributor_) {
        if (feeDistributor_==address(0)) revert ZeroAddress();
        feeDistributor=feeDistributor_; configurator=msg.sender;
    }

    function configureLaunchpadFactory(address launchpadFactory_) external {
        if (msg.sender!=configurator) revert Unauthorized();
        if (launchpadFactory!=address(0)) revert AlreadyConfigured();
        if (launchpadFactory_==address(0)) revert ZeroAddress();
        launchpadFactory=launchpadFactory_;
        emit LaunchpadConfigured(launchpadFactory_);
    }

    function allPairsLength() external view returns(uint256) { return allPairs.length; }

    function createAndSeed(address token,address creator,uint256 tokenAmount)
        external payable returns(address pairAddress)
    {
        if (msg.sender!=launchpadFactory || launchpadFactory==address(0)) revert Unauthorized();
        if (token==address(0)||creator==address(0)) revert ZeroAddress();
        if (getPair[token]!=address(0)) revert PairExists();
        if (msg.value==0||tokenAmount==0) revert InvalidSeed();
        PixorunSwapPair pair=new PixorunSwapPair(token,creator,feeDistributor);
        if (!IPixorunSeedToken(token).transferFrom(msg.sender,address(pair),tokenAmount)) revert TokenTransferFailed();
        pair.initialize{value:msg.value}(tokenAmount);
        pairAddress=address(pair); getPair[token]=pairAddress; allPairs.push(pairAddress);
        emit PairCreated(token,pairAddress,creator,allPairs.length);
    }
}