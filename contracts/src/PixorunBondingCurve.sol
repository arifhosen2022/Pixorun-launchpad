// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "./PixorunCurveMath.sol";

interface IPixorunCurveFeeDistributor { function notifyTradeFee(address creator) external payable; }
interface IPixorunCurveFactory {
    function completeLiftoff(address token, address creator, uint256 virtualNative, uint256 virtualToken) external payable;
}
interface IPixorunERC20 {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 value) external returns (bool);
    function transferFrom(address from, address to, uint256 value) external returns (bool);
}

/// @title PIXORUN Bonding Curve
/// @notice Robinhood Chain native-coin bonding curve with atomic Liftoff migration.
contract PixorunBondingCurve {
    uint256 public constant BPS = 10_000;
    uint256 public constant TRADE_FEE_BPS = 100;
    uint256 public constant CURVE_ALLOCATION = 793_100_000 ether;
    uint256 public constant INITIAL_VIRTUAL_NATIVE = 0.1 ether;
    uint256 public constant INITIAL_VIRTUAL_TOKEN = 1_076_350_000 ether;
    IPixorunERC20 public immutable token;
    IPixorunCurveFeeDistributor public immutable feeDistributor;
    address public immutable factory;
    address public immutable creator;
    uint256 public virtualNative = INITIAL_VIRTUAL_NATIVE;
    uint256 public virtualToken = INITIAL_VIRTUAL_TOKEN;
    uint256 public realNative;
    uint256 public realToken = CURVE_ALLOCATION;
    uint256 public totalSold;
    bool public graduated;
    uint256 private unlocked = 1;

    error ZeroAddress(); error ZeroAmount(); error SlippageExceeded(); error CurveExhausted();
    error InsufficientLiquidity(); error TransferFailed(); error AlreadyGraduated(); error ReentrantCall();

    event Bought(address indexed buyer, uint256 grossNative, uint256 fee, uint256 tokensOut);
    event Sold(address indexed seller, uint256 tokensIn, uint256 grossNative, uint256 fee, uint256 netNative);
    event GraduationFlagged(uint256 totalSold, uint256 realNative);

    modifier lock() { if (unlocked != 1) revert ReentrantCall(); unlocked=0; _; unlocked=1; }

    constructor(address token_, address feeDistributor_, address creator_) {
        if (token_ == address(0) || feeDistributor_ == address(0) || creator_ == address(0)) revert ZeroAddress();
        token=IPixorunERC20(token_); feeDistributor=IPixorunCurveFeeDistributor(feeDistributor_);
        factory=msg.sender; creator=creator_;
    }
    receive() external payable {}

    function quoteBuy(uint256 grossNative) public view returns (uint256 tokensOut,uint256 feeAmount,uint256 netNative) {
        return PixorunCurveMath.buyQuote(_reserves(),grossNative);
    }
    function quoteSell(uint256 tokensIn) public view returns (uint256 grossNative,uint256 feeAmount,uint256 netNative) {
        return PixorunCurveMath.sellQuote(_reserves(),tokensIn);
    }

    function buy(uint256 minTokensOut) external payable lock returns (uint256 tokensOut) {
        if (graduated) revert AlreadyGraduated();
        if (msg.value==0) revert ZeroAmount();
        uint256 acceptedGross=msg.value;
        uint256 feeAmount;
        uint256 netNative;
        if (realToken==0) revert CurveExhausted();
        uint256 quoted;
        uint256 feeFull;
        uint256 netFull;
        // A final purchase is partially filled rather than reverting on excess input.
        try this.externalQuoteBuy(msg.value) returns (uint256 q,uint256 f,uint256 n) {
            quoted=q; feeFull=f; netFull=n;
        } catch {
            uint256 exactNet=PixorunCurveMath.netNativeForExactTokens(virtualNative,virtualToken,realToken);
            acceptedGross=_grossForNet(exactNet);
            if (acceptedGross>msg.value) revert CurveExhausted();
            feeFull=acceptedGross*TRADE_FEE_BPS/BPS;
            netFull=acceptedGross-feeFull;
            quoted=realToken;
        }
        tokensOut=quoted; feeAmount=feeFull; netNative=netFull;
        if (tokensOut<minTokensOut) revert SlippageExceeded();
        uint256 refund=msg.value-acceptedGross;
        virtualNative+=netNative; virtualToken-=tokensOut; realNative+=netNative;
        realToken-=tokensOut; totalSold+=tokensOut;
        _safeTransfer(msg.sender,tokensOut);
        if (feeAmount!=0) feeDistributor.notifyTradeFee{value:feeAmount}(creator);
        if (refund!=0) _sendNative(payable(msg.sender),refund);
        emit Bought(msg.sender,acceptedGross,feeAmount,tokensOut);
        if (realToken==0) {
            graduated=true;
            uint256 migrationNative=realNative;
            realNative=0;
            emit GraduationFlagged(totalSold,migrationNative);
            IPixorunCurveFactory(factory).completeLiftoff{value:migrationNative}(
                address(token),creator,virtualNative,virtualToken
            );
        }
    }

    // External self-call gives buy() a catchable quote failure without changing quote semantics.
    function externalQuoteBuy(uint256 grossNative) external view returns (uint256,uint256,uint256) {
        if (msg.sender!=address(this)) revert CurveExhausted();
        return quoteBuy(grossNative);
    }

    function sell(uint256 tokensIn,uint256 minNativeOut) external lock returns (uint256 netNativeOut) {
        if (graduated) revert AlreadyGraduated();
        if (tokensIn==0) revert ZeroAmount();
        if (tokensIn>totalSold) revert InsufficientLiquidity();
        (uint256 grossNative,uint256 feeAmount,uint256 netNative)=quoteSell(tokensIn);
        // Never accept tokens for a zero-value payout after integer rounding.
        if (netNative==0) revert InsufficientLiquidity();
        if (netNative<minNativeOut || grossNative>realNative) revert SlippageExceeded();
        if (!token.transferFrom(msg.sender,address(this),tokensIn)) revert TransferFailed();
        virtualNative-=grossNative; virtualToken+=tokensIn; realNative-=grossNative;
        realToken+=tokensIn; totalSold-=tokensIn; netNativeOut=netNative;
        _sendNative(payable(msg.sender),netNative);
        if (feeAmount!=0) feeDistributor.notifyTradeFee{value:feeAmount}(creator);
        emit Sold(msg.sender,tokensIn,grossNative,feeAmount,netNative);
    }

    function _grossForNet(uint256 requiredNet) internal pure returns (uint256 gross) {
        gross=(requiredNet*BPS+(BPS-TRADE_FEE_BPS)-1)/(BPS-TRADE_FEE_BPS);
        while (gross-(gross*TRADE_FEE_BPS/BPS)<requiredNet) ++gross;
    }
    function _reserves() internal view returns (PixorunCurveMath.Reserves memory) {
        return PixorunCurveMath.Reserves(virtualNative,virtualToken,realToken,realNative);
    }
    function _safeTransfer(address to,uint256 amount) internal { if (!token.transfer(to,amount)) revert TransferFailed(); }
    function _sendNative(address payable to,uint256 amount) internal {
        (bool ok,)=to.call{value:amount}(""); if (!ok) revert TransferFailed();
    }
}