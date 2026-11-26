// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "./PixorunMissionToken.sol";
import "./PixorunBondingCurve.sol";

interface IPixorunLaunchFeeDistributor {
    function notifyCreationFee() external payable;
    function notifyLiftoffFee() external payable;
}
interface IGenesisPassBalance { function balanceOf(address account) external view returns (uint256); }
interface IPixorunSwapFactory {
    function createAndSeed(address token,address creator,uint256 tokenAmount) external payable returns (address);
}
interface IPixorunLaunchToken {
    function balanceOf(address account) external view returns (uint256);
    function approve(address spender,uint256 amount) external returns (bool);
    function transfer(address to,uint256 amount) external returns (bool);
}

/// @title PIXORUN Launchpad Factory
/// @notice Genesis Pass-gated token creation and permissioned, atomic Liftoff migration.
contract PixorunLaunchpadFactory {
    uint256 public constant TOTAL_SUPPLY=1_000_000_000 ether;
    uint256 public constant CURVE_ALLOCATION=793_100_000 ether;
    uint256 public constant LIFTOFF_RESERVE=206_900_000 ether;
    uint256 public constant LIFTOFF_FEE_BPS=300;
    address public constant DEAD=0x000000000000000000000000000000000000dEaD;

    IGenesisPassBalance public immutable genesisPass;
    IPixorunLaunchFeeDistributor public immutable feeDistributor;
    uint256 public immutable creationFee;
    address public immutable configurator;
    IPixorunSwapFactory public swapFactory;
    mapping(address=>address) public curveOf;
    mapping(address=>address) public creatorOf;
    mapping(address=>bool) public liftoffCompleted;

    error ZeroAddress(); error GenesisPassRequired(); error IncorrectCreationFee();
    error TokenTransferFailed(); error UnauthorizedCurve(); error SwapFactoryAlreadyConfigured();
    error SwapFactoryNotConfigured(); error InvalidMigration(); error LiftoffAlreadyCompleted();

    event LaunchCreated(address indexed creator,address indexed token,address indexed curve,string name,string symbol);
    event SwapFactoryConfigured(address indexed swapFactory);
    event LiftoffCompleted(address indexed token,address indexed pair,uint256 grossNative,uint256 fee,uint256 nativeLiquidity,uint256 tokenLiquidity,uint256 burnedTokens);

    constructor(address genesisPass_,address feeDistributor_,uint256 creationFee_) {
        if (genesisPass_==address(0)||feeDistributor_==address(0)) revert ZeroAddress();
        genesisPass=IGenesisPassBalance(genesisPass_);
        feeDistributor=IPixorunLaunchFeeDistributor(feeDistributor_);
        creationFee=creationFee_;
        configurator=msg.sender;
    }

    /// @notice One-time post-deployment link; deploy SwapFactory first, then lock it here.
    function configureSwapFactory(address swapFactory_) external {
        if (msg.sender!=configurator) revert UnauthorizedCurve();
        if (address(swapFactory)!=address(0)) revert SwapFactoryAlreadyConfigured();
        if (swapFactory_==address(0)) revert ZeroAddress();
        swapFactory=IPixorunSwapFactory(swapFactory_);
        emit SwapFactoryConfigured(swapFactory_);
    }

    function createLaunch(string calldata name,string calldata symbol)
        external payable returns(address tokenAddress,address curveAddress)
    {
        if (genesisPass.balanceOf(msg.sender)==0) revert GenesisPassRequired();
        if (msg.value!=creationFee) revert IncorrectCreationFee();
        PixorunMissionToken token=new PixorunMissionToken(name,symbol,address(this));
        PixorunBondingCurve curve=new PixorunBondingCurve(address(token),address(feeDistributor),msg.sender);
        if (!token.transfer(address(curve),CURVE_ALLOCATION)) revert TokenTransferFailed();
        tokenAddress=address(token); curveAddress=address(curve);
        curveOf[tokenAddress]=curveAddress; creatorOf[tokenAddress]=msg.sender;
        if (creationFee!=0) feeDistributor.notifyCreationFee{value:creationFee}();
        emit LaunchCreated(msg.sender,tokenAddress,curveAddress,name,symbol);
    }

    /// @notice Called only by the registered curve when its final token is sold.
    function completeLiftoff(address token,address creator,uint256 virtualNative,uint256 virtualToken)
        external payable returns(address pairAddress)
    {
        if (curveOf[token]!=msg.sender || creatorOf[token]!=creator) revert UnauthorizedCurve();
        if (liftoffCompleted[token]) revert LiftoffAlreadyCompleted();
        if (address(swapFactory)==address(0)) revert SwapFactoryNotConfigured();
        if (msg.value==0 || virtualNative==0 || virtualToken==0) revert InvalidMigration();
        liftoffCompleted[token]=true;

        uint256 liftoffFee=msg.value*LIFTOFF_FEE_BPS/10_000;
        uint256 nativeLiquidity=msg.value-liftoffFee;
        uint256 reserve=IPixorunLaunchToken(token).balanceOf(address(this));
        uint256 tokenLiquidity=nativeLiquidity*virtualToken/virtualNative;
        if (tokenLiquidity==0 || tokenLiquidity>reserve) revert InvalidMigration();

        if (liftoffFee!=0) feeDistributor.notifyLiftoffFee{value:liftoffFee}();
        if (!IPixorunLaunchToken(token).approve(address(swapFactory),tokenLiquidity)) revert TokenTransferFailed();
        pairAddress=swapFactory.createAndSeed{value:nativeLiquidity}(token,creator,tokenLiquidity);

        uint256 excess=reserve-tokenLiquidity;
        if (excess!=0 && !IPixorunLaunchToken(token).transfer(DEAD,excess)) revert TokenTransferFailed();
        emit LiftoffCompleted(token,pairAddress,msg.value,liftoffFee,nativeLiquidity,tokenLiquidity,excess);
    }

    function liftoffReserveOf(address tokenAddress) external view returns(uint256) {
        if (curveOf[tokenAddress]==address(0)) return 0;
        return IPixorunLaunchToken(tokenAddress).balanceOf(address(this));
    }
}