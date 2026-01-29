// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test, console} from "forge-std/Test.sol";
import {HardwarePriceFeed} from "../src/HardwarePriceFeed.sol";
import {IHardwarePriceFeed} from "../src/interfaces/IHardwarePriceFeed.sol";

contract HardwarePriceFeedTest is Test {
    HardwarePriceFeed public feed;

    address public owner = address(this);
    address public oracle1 = address(0x1);
    address public oracle2 = address(0x2);
    address public oracle3 = address(0x3);
    address public user = address(0x4);

    bytes32 public constant ASSET_ID = keccak256("GPU_RTX4090");
    string public constant DESCRIPTION = "NVIDIA RTX 4090 GPU / USD";
    uint256 public constant HEARTBEAT = 3600; // 1 hour

    function setUp() public {
        address[] memory oracles = new address[](3);
        oracles[0] = oracle1;
        oracles[1] = oracle2;
        oracles[2] = oracle3;

        feed = new HardwarePriceFeed(ASSET_ID, DESCRIPTION, HEARTBEAT, oracles);
    }

    // ============ Constructor Tests ============

    function test_Constructor() public view {
        assertEq(feed.assetId(), ASSET_ID);
        assertEq(feed.description(), DESCRIPTION);
        assertEq(feed.heartbeatInterval(), HEARTBEAT);
        assertEq(feed.decimals(), 8);
        assertEq(feed.version(), 1);
        assertEq(feed.owner(), owner);
    }

    function test_Constructor_SetsOracles() public view {
        assertTrue(feed.isOracle(oracle1));
        assertTrue(feed.isOracle(oracle2));
        assertTrue(feed.isOracle(oracle3));
        assertFalse(feed.isOracle(user));

        address[] memory oracles = feed.getOracles();
        assertEq(oracles.length, 3);
    }

    function test_Constructor_RevertZeroHeartbeat() public {
        address[] memory oracles = new address[](1);
        oracles[0] = oracle1;

        vm.expectRevert("Invalid heartbeat");
        new HardwarePriceFeed(ASSET_ID, DESCRIPTION, 0, oracles);
    }

    function test_Constructor_RevertNoOracles() public {
        address[] memory oracles = new address[](0);

        vm.expectRevert("Need at least one oracle");
        new HardwarePriceFeed(ASSET_ID, DESCRIPTION, HEARTBEAT, oracles);
    }

    // ============ Price Update Tests ============

    function test_UpdatePrice_SingleOracle() public {
        // With 3 oracles, need 2 submissions (majority)
        int256 price1 = 159999000000; // $1599.99

        vm.prank(oracle1);
        feed.updatePrice(price1);

        // Round not finalized yet (need majority)
        (uint80 roundId, int256 answer, , , ) = feed.latestRoundData();
        assertEq(roundId, 0); // No round yet
        assertEq(answer, 0);
    }

    function test_UpdatePrice_MajoritySubmissions() public {
        int256 price1 = 159999000000; // $1599.99
        int256 price2 = 160500000000; // $1605.00

        vm.prank(oracle1);
        feed.updatePrice(price1);

        vm.prank(oracle2);
        feed.updatePrice(price2);

        // Round should be finalized with median
        (uint80 roundId, int256 answer, , uint256 updatedAt, ) = feed.latestRoundData();
        assertEq(roundId, 1);

        // Median of [159999000000, 160500000000] = (159999000000 + 160500000000) / 2
        int256 expectedMedian = (price1 + price2) / 2;
        assertEq(answer, expectedMedian);
        assertEq(updatedAt, block.timestamp);
    }

    function test_UpdatePrice_MedianCalculation() public {
        int256 price1 = 150000000000; // $1500.00
        int256 price2 = 160000000000; // $1600.00
        int256 price3 = 170000000000; // $1700.00

        vm.prank(oracle1);
        feed.updatePrice(price1);

        vm.prank(oracle2);
        feed.updatePrice(price2);

        vm.prank(oracle3);
        feed.updatePrice(price3);

        (, int256 answer, , , ) = feed.latestRoundData();

        // Median of [150000000000, 160000000000, 170000000000] = 160000000000
        assertEq(answer, 160000000000);
    }

    function test_UpdatePrice_RevertNotOracle() public {
        vm.prank(user);
        vm.expectRevert("Not authorized oracle");
        feed.updatePrice(159999000000);
    }

    function test_UpdatePrice_RevertNegativePrice() public {
        vm.prank(oracle1);
        vm.expectRevert("Price must be positive");
        feed.updatePrice(-1);
    }

    function test_UpdatePrice_RevertZeroPrice() public {
        vm.prank(oracle1);
        vm.expectRevert("Price must be positive");
        feed.updatePrice(0);
    }

    // ============ Staleness Tests ============

    function test_IsStale_NoRounds() public view {
        assertTrue(feed.isStale());
    }

    function test_IsStale_FreshPrice() public {
        _submitMajorityPrices(159999000000);
        assertFalse(feed.isStale());
    }

    function test_IsStale_AfterHeartbeat() public {
        _submitMajorityPrices(159999000000);

        // Warp past heartbeat
        vm.warp(block.timestamp + HEARTBEAT + 1);

        assertTrue(feed.isStale());
    }

    // ============ Oracle Management Tests ============

    function test_AddOracle() public {
        address newOracle = address(0x5);

        feed.addOracle(newOracle);

        assertTrue(feed.isOracle(newOracle));
        assertEq(feed.getOracles().length, 4);
    }

    function test_AddOracle_RevertNotOwner() public {
        vm.prank(user);
        vm.expectRevert("Not owner");
        feed.addOracle(address(0x5));
    }

    function test_AddOracle_RevertDuplicate() public {
        vm.expectRevert("Already an oracle");
        feed.addOracle(oracle1);
    }

    function test_RemoveOracle() public {
        feed.removeOracle(oracle3);

        assertFalse(feed.isOracle(oracle3));
        assertEq(feed.getOracles().length, 2);
    }

    function test_RemoveOracle_RevertLastOracle() public {
        feed.removeOracle(oracle3);
        feed.removeOracle(oracle2);

        vm.expectRevert("Cannot remove last oracle");
        feed.removeOracle(oracle1);
    }

    // ============ Round Data Tests ============

    function test_GetRoundData() public {
        _submitMajorityPrices(159999000000);

        (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        ) = feed.getRoundData(1);

        assertEq(roundId, 1);
        assertGt(answer, 0);
        assertEq(startedAt, updatedAt);
        assertEq(answeredInRound, 1);
    }

    function test_GetRoundData_NonExistent() public view {
        (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        ) = feed.getRoundData(999);

        assertEq(roundId, 999);
        assertEq(answer, 0);
        assertEq(startedAt, 0);
        assertEq(updatedAt, 0);
        assertEq(answeredInRound, 0);
    }

    // ============ Admin Tests ============

    function test_SetHeartbeat() public {
        uint256 newHeartbeat = 7200;

        feed.setHeartbeat(newHeartbeat);

        assertEq(feed.heartbeatInterval(), newHeartbeat);
    }

    function test_TransferOwnership() public {
        address newOwner = address(0x10);

        feed.transferOwnership(newOwner);

        assertEq(feed.owner(), newOwner);
    }

    // ============ Helpers ============

    function _submitMajorityPrices(int256 price) internal {
        vm.prank(oracle1);
        feed.updatePrice(price);

        vm.prank(oracle2);
        feed.updatePrice(price);
    }
}
