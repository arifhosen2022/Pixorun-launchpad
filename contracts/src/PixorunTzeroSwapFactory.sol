// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "./PixorunTzeroSwapPair.sol";

interface IPixorunSeedToken {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// @title PIXORUN TzeroSwap Factory
/// @notice Creates one native-coin/token pool per launch token and seeds it atomically.
contract PixorunTzeroSwapFactory {
    address public immutable feeDistributor;
    mapping(address => address) public getPair;
    address[] public allPairs;

    error ZeroAddress();
    error PairExists();
    error TokenTransferFailed();
    error InvalidSeed();

    event PairCreated(address indexed token, address indexed pair, address indexed creator, uint256 index);

    constructor(address feeDistributor_) {
        if (feeDistributor_ == address(0)) revert ZeroAddress();
        feeDistributor = feeDistributor_;
    }

    function allPairsLength() external view returns (uint256) {
        return allPairs.length;
    }

    function createAndSeed(address token, address creator, uint256 tokenAmount)
        external payable returns (address pairAddress)
    {
        if (token == address(0) || creator == address(0)) revert ZeroAddress();
        if (getPair[token] != address(0)) revert PairExists();
        if (msg.value == 0 || tokenAmount == 0) revert InvalidSeed();

        PixorunTzeroSwapPair pair = new PixorunTzeroSwapPair(token, creator, feeDistributor);
        if (!IPixorunSeedToken(token).transferFrom(msg.sender, address(pair), tokenAmount)) {
            revert TokenTransferFailed();
        }
        pair.initialize{value: msg.value}(tokenAmount);

        pairAddress = address(pair);
        getPair[token] = pairAddress;
        allPairs.push(pairAddress);
        emit PairCreated(token, pairAddress, creator, allPairs.length);
    }
}
