// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title PIXORUN Mission Token
/// @notice Immutable-supply ERC-20 primitive for a PIXORUN launch.
/// @dev No owner, mint, pause, blacklist, or transfer-tax functionality.
contract PixorunMissionToken {
    string public name;
    string public symbol;
    uint8 public constant decimals = 18;
    uint256 public constant TOTAL_SUPPLY = 1_000_000_000 ether;

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    error ZeroAddress();
    error InsufficientBalance();
    error InsufficientAllowance();
    error InvalidMetadata();

    constructor(string memory name_, string memory symbol_, address curve_) {
        if (curve_ == address(0)) revert ZeroAddress();
        if (bytes(name_).length == 0 || bytes(name_).length > 32 ||
            bytes(symbol_).length == 0 || bytes(symbol_).length > 10) revert InvalidMetadata();
        name = name_;
        symbol = symbol_;
        totalSupply = TOTAL_SUPPLY;
        balanceOf[curve_] = TOTAL_SUPPLY;
        emit Transfer(address(0), curve_, TOTAL_SUPPLY);
    }

    function approve(address spender, uint256 value) external returns (bool) {
        if (spender == address(0)) revert ZeroAddress();
        allowance[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
        return true;
    }

    function transfer(address to, uint256 value) external returns (bool) {
        _transfer(msg.sender, to, value);
        return true;
    }

    function transferFrom(address from, address to, uint256 value) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) {
            if (allowed < value) revert InsufficientAllowance();
            unchecked { allowance[from][msg.sender] = allowed - value; }
            emit Approval(from, msg.sender, allowance[from][msg.sender]);
        }
        _transfer(from, to, value);
        return true;
    }

    function _transfer(address from, address to, uint256 value) internal {
        if (to == address(0)) revert ZeroAddress();
        uint256 balance = balanceOf[from];
        if (balance < value) revert InsufficientBalance();
        unchecked {
            balanceOf[from] = balance - value;
            balanceOf[to] += value;
        }
        emit Transfer(from, to, value);
    }
}
