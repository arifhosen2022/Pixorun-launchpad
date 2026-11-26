// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "./PixorunMissionToken.sol";
import "./PixorunBondingCurve.sol";

interface IGenesisPassBalance {
    function balanceOf(address account) external view returns (uint256);
}

/// @title PIXORUN Launchpad Factory
/// @notice Creates fixed-supply launch tokens and their bonding curves.
/// @dev Genesis Pass ownership is checked on-chain. Configuration is immutable.
contract PixorunLaunchpadFactory {
    uint256 public constant TOTAL_SUPPLY = 1_000_000_000 ether;
    uint256 public constant CURVE_ALLOCATION = 793_100_000 ether;
    uint256 public constant LIFTOFF_RESERVE = 206_900_000 ether;

    IGenesisPassBalance public immutable genesisPass;
    address payable public immutable feeRecipient;
    uint256 public immutable creationFee;

    mapping(address => address) public curveOf;
    mapping(address => address) public creatorOf;

    error ZeroAddress();
    error GenesisPassRequired();
    error IncorrectCreationFee();
    error FeeTransferFailed();
    error TokenTransferFailed();

    event LaunchCreated(
        address indexed creator,
        address indexed token,
        address indexed curve,
        string name,
        string symbol
    );

    constructor(address genesisPass_, address payable feeRecipient_, uint256 creationFee_) {
        if (genesisPass_ == address(0) || feeRecipient_ == address(0)) revert ZeroAddress();
        genesisPass = IGenesisPassBalance(genesisPass_);
        feeRecipient = feeRecipient_;
        creationFee = creationFee_;
    }

    function createLaunch(string calldata name, string calldata symbol)
        external payable returns (address tokenAddress, address curveAddress)
    {
        if (genesisPass.balanceOf(msg.sender) == 0) revert GenesisPassRequired();
        if (msg.value != creationFee) revert IncorrectCreationFee();

        PixorunMissionToken token = new PixorunMissionToken(name, symbol, address(this));
        PixorunBondingCurve curve = new PixorunBondingCurve(
            address(token), feeRecipient, msg.sender
        );

        if (!token.transfer(address(curve), CURVE_ALLOCATION)) revert TokenTransferFailed();

        tokenAddress = address(token);
        curveAddress = address(curve);
        curveOf[tokenAddress] = curveAddress;
        creatorOf[tokenAddress] = msg.sender;

        if (creationFee != 0) {
            (bool paid,) = feeRecipient.call{value: creationFee}("");
            if (!paid) revert FeeTransferFailed();
        }

        emit LaunchCreated(msg.sender, tokenAddress, curveAddress, name, symbol);
    }

    function liftoffReserveOf(address tokenAddress) external view returns (uint256) {
        address curveAddress = curveOf[tokenAddress];
        if (curveAddress == address(0)) return 0;
        return PixorunMissionToken(tokenAddress).balanceOf(address(this));
    }
}
