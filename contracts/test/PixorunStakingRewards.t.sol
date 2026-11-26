// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "../src/PixorunStakingRewards.sol";

interface Vm {
    function deal(address account, uint256 newBalance) external;
    function roll(uint256 newHeight) external;
}

contract MockT0 {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    function mint(address to, uint256 amount) external { balanceOf[to] += amount; }
    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }
    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "balance");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }
    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(balanceOf[from] >= amount && allowance[from][msg.sender] >= amount, "allowance");
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract PixorunStakingRewardsTest {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    receive() external payable {}

    function testRewardsActivateFromNextBlockAndCanBeClaimed() external {
        vm.deal(address(this), 2 ether);
        MockT0 token = new MockT0();
        PixorunStakingRewards staking = new PixorunStakingRewards(address(token), address(this));
        token.mint(address(this), 100 ether);
        token.approve(address(staking), 100 ether);
        staking.stake(100 ether);

        uint256 currentBlock = block.number;
        staking.notifyFee{value: 1 ether}();
        require(staking.earned(address(this)) == 0, "not active in fee block");
        vm.roll(currentBlock + 1);
        require(staking.earned(address(this)) == 1 ether, "active next block");

        uint256 beforeBalance = address(this).balance;
        staking.claimReward();
        require(address(this).balance == beforeBalance + 1 ether, "native reward paid");
    }

    function testNoStakersCannotReceiveFee() external {
        vm.deal(address(this), 1 ether);
        MockT0 token = new MockT0();
        PixorunStakingRewards staking = new PixorunStakingRewards(address(token), address(this));
        (bool ok,) = address(staking).call{value: 1 ether}(abi.encodeCall(staking.notifyFee, ()));
        require(!ok, "no-staker fee rejected");
    }

    function testFinalStakerCannotExitBeforeQueuedRewardActivates() external {
        vm.deal(address(this), 1 ether);
        MockT0 token = new MockT0();
        PixorunStakingRewards staking = new PixorunStakingRewards(address(token), address(this));
        token.mint(address(this), 10 ether);
        token.approve(address(staking), 10 ether);
        staking.stake(10 ether);
        staking.notifyFee{value: 1 ether}();

        (bool ok,) = address(staking).call(abi.encodeCall(staking.withdraw, (10 ether)));
        require(!ok, "queued reward remains backed");
    }
}
