// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test, console} from "forge-std/Test.sol";
import {OracleRegistry} from "../src/OracleRegistry.sol";
import {HardwarePriceFeed} from "../src/HardwarePriceFeed.sol";

contract OracleRegistryTest is Test {
    OracleRegistry public registry;

    address public owner = address(this);
    address public oracle1 = address(0x1);
    address public oracle2 = address(0x2);
    address public user = address(0x3);

    bytes32 public constant GPU_RTX4090 = keccak256("GPU_RTX4090");
    bytes32 public constant GPU_RTX4080 = keccak256("GPU_RTX4080");
    bytes32 public constant RAM_DDR5_32 = keccak256("RAM_DDR5_32");

    function setUp() public {
        registry = new OracleRegistry();
    }

    // ============ Constructor Tests ============

    function test_Constructor() public view {
        assertEq(registry.owner(), owner);
        assertEq(registry.feedCount(), 0);
    }

    // ============ Deploy Feed Tests ============

    function test_DeployFeed() public {
        address[] memory oracles = new address[](2);
        oracles[0] = oracle1;
        oracles[1] = oracle2;

        address feed = registry.deployFeed(
            GPU_RTX4090,
            "NVIDIA RTX 4090 / USD",
            3600,
            oracles
        );

        assertNotEq(feed, address(0));
        assertEq(registry.getFeed(GPU_RTX4090), feed);
        assertTrue(registry.isRegistered(GPU_RTX4090));
        assertEq(registry.feedCount(), 1);
    }

    function test_DeployFeed_MultipleFeeds() public {
        address[] memory oracles = new address[](1);
        oracles[0] = oracle1;

        registry.deployFeed(GPU_RTX4090, "RTX 4090", 3600, oracles);
        registry.deployFeed(GPU_RTX4080, "RTX 4080", 3600, oracles);
        registry.deployFeed(RAM_DDR5_32, "DDR5 32GB", 3600, oracles);

        assertEq(registry.feedCount(), 3);

        bytes32[] memory allAssets = registry.getAllAssetIds();
        assertEq(allAssets.length, 3);
    }

    function test_DeployFeed_RevertDuplicate() public {
        address[] memory oracles = new address[](1);
        oracles[0] = oracle1;

        registry.deployFeed(GPU_RTX4090, "RTX 4090", 3600, oracles);

        vm.expectRevert("Asset already registered");
        registry.deployFeed(GPU_RTX4090, "RTX 4090 v2", 3600, oracles);
    }

    function test_DeployFeed_RevertNotOwner() public {
        address[] memory oracles = new address[](1);
        oracles[0] = oracle1;

        vm.prank(user);
        vm.expectRevert("Not owner");
        registry.deployFeed(GPU_RTX4090, "RTX 4090", 3600, oracles);
    }

    // ============ Register Feed Tests ============

    function test_RegisterFeed() public {
        address[] memory oracles = new address[](1);
        oracles[0] = oracle1;

        HardwarePriceFeed feed = new HardwarePriceFeed(
            GPU_RTX4090,
            "RTX 4090",
            3600,
            oracles
        );

        registry.registerFeed(GPU_RTX4090, address(feed));

        assertEq(registry.getFeed(GPU_RTX4090), address(feed));
        assertTrue(registry.isRegistered(GPU_RTX4090));
    }

    function test_RegisterFeed_RevertAssetMismatch() public {
        address[] memory oracles = new address[](1);
        oracles[0] = oracle1;

        HardwarePriceFeed feed = new HardwarePriceFeed(
            GPU_RTX4080, // Different asset ID
            "RTX 4080",
            3600,
            oracles
        );

        vm.expectRevert("Asset ID mismatch");
        registry.registerFeed(GPU_RTX4090, address(feed)); // Trying to register as different asset
    }

    // ============ Deregister Feed Tests ============

    function test_DeregisterFeed() public {
        address[] memory oracles = new address[](1);
        oracles[0] = oracle1;

        registry.deployFeed(GPU_RTX4090, "RTX 4090", 3600, oracles);
        assertTrue(registry.isRegistered(GPU_RTX4090));

        registry.deregisterFeed(GPU_RTX4090);

        assertFalse(registry.isRegistered(GPU_RTX4090));
        assertEq(registry.getFeed(GPU_RTX4090), address(0));
        assertEq(registry.feedCount(), 0);
    }

    function test_DeregisterFeed_RevertNotRegistered() public {
        vm.expectRevert("Asset not registered");
        registry.deregisterFeed(GPU_RTX4090);
    }

    // ============ Price Query Tests ============

    function test_GetLatestPrice() public {
        address[] memory oracles = new address[](1);
        oracles[0] = oracle1;

        address feedAddr = registry.deployFeed(GPU_RTX4090, "RTX 4090", 3600, oracles);

        // Submit price
        HardwarePriceFeed feed = HardwarePriceFeed(feedAddr);
        vm.prank(oracle1);
        feed.updatePrice(159999000000);

        (int256 price, uint256 timestamp) = registry.getLatestPrice(GPU_RTX4090);

        assertEq(price, 159999000000);
        assertEq(timestamp, block.timestamp);
    }

    function test_GetLatestPrice_RevertNotFound() public {
        vm.expectRevert("Feed not found");
        registry.getLatestPrice(GPU_RTX4090);
    }

    function test_IsFeedStale() public {
        address[] memory oracles = new address[](1);
        oracles[0] = oracle1;

        address feedAddr = registry.deployFeed(GPU_RTX4090, "RTX 4090", 3600, oracles);

        // Initially stale (no prices)
        assertTrue(registry.isFeedStale(GPU_RTX4090));

        // Submit price
        HardwarePriceFeed feed = HardwarePriceFeed(feedAddr);
        vm.prank(oracle1);
        feed.updatePrice(159999000000);

        // Now fresh
        assertFalse(registry.isFeedStale(GPU_RTX4090));

        // Warp past heartbeat
        vm.warp(block.timestamp + 3601);
        assertTrue(registry.isFeedStale(GPU_RTX4090));
    }

    // ============ Ownership Tests ============

    function test_TransferOwnership() public {
        address newOwner = address(0x10);

        registry.transferOwnership(newOwner);

        assertEq(registry.owner(), newOwner);
    }

    function test_TransferOwnership_RevertZeroAddress() public {
        vm.expectRevert("Invalid owner");
        registry.transferOwnership(address(0));
    }
}
