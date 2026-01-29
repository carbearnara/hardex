// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IHardwarePriceFeed} from "./interfaces/IHardwarePriceFeed.sol";
import {HardwarePriceFeed} from "./HardwarePriceFeed.sol";

/**
 * @title OracleRegistry
 * @notice Registry for all hardware price feeds
 * @dev Provides discovery and factory functionality for price feeds
 */
contract OracleRegistry {
    // ============ Events ============

    event FeedRegistered(bytes32 indexed assetId, address indexed feed, string description);
    event FeedDeregistered(bytes32 indexed assetId, address indexed feed);
    event FeedDeployed(bytes32 indexed assetId, address indexed feed, string description);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    // ============ State Variables ============

    address public owner;

    // Asset ID => Price Feed address
    mapping(bytes32 => address) private _feeds;

    // List of all registered asset IDs
    bytes32[] private _assetIds;

    // Asset ID existence check
    mapping(bytes32 => bool) private _exists;

    // ============ Modifiers ============

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    // ============ Constructor ============

    constructor() {
        owner = msg.sender;
    }

    // ============ View Functions ============

    /**
     * @notice Get the price feed for an asset
     * @param assetId The asset identifier
     * @return The price feed address (or zero if not registered)
     */
    function getFeed(bytes32 assetId) external view returns (address) {
        return _feeds[assetId];
    }

    /**
     * @notice Get all registered asset IDs
     */
    function getAllAssetIds() external view returns (bytes32[] memory) {
        return _assetIds;
    }

    /**
     * @notice Get the number of registered feeds
     */
    function feedCount() external view returns (uint256) {
        return _assetIds.length;
    }

    /**
     * @notice Check if an asset is registered
     */
    function isRegistered(bytes32 assetId) external view returns (bool) {
        return _exists[assetId];
    }

    /**
     * @notice Get latest price for an asset (convenience function)
     * @param assetId The asset identifier
     * @return price The latest price
     * @return timestamp The update timestamp
     */
    function getLatestPrice(
        bytes32 assetId
    ) external view returns (int256 price, uint256 timestamp) {
        address feed = _feeds[assetId];
        require(feed != address(0), "Feed not found");

        (, int256 answer, , uint256 updatedAt, ) = IHardwarePriceFeed(feed).latestRoundData();
        return (answer, updatedAt);
    }

    /**
     * @notice Check if a price feed is stale
     */
    function isFeedStale(bytes32 assetId) external view returns (bool) {
        address feed = _feeds[assetId];
        require(feed != address(0), "Feed not found");

        return IHardwarePriceFeed(feed).isStale();
    }

    // ============ Admin Functions ============

    /**
     * @notice Register an existing price feed
     * @param assetId The asset identifier
     * @param feed The price feed address
     */
    function registerFeed(bytes32 assetId, address feed) external onlyOwner {
        require(feed != address(0), "Invalid feed address");
        require(!_exists[assetId], "Asset already registered");

        // Verify the feed implements the interface
        require(
            IHardwarePriceFeed(feed).assetId() == assetId,
            "Asset ID mismatch"
        );

        _feeds[assetId] = feed;
        _assetIds.push(assetId);
        _exists[assetId] = true;

        emit FeedRegistered(assetId, feed, IHardwarePriceFeed(feed).description());
    }

    /**
     * @notice Deploy and register a new price feed
     * @param assetId The asset identifier
     * @param description Human-readable description
     * @param heartbeat Heartbeat interval in seconds
     * @param oracles Initial oracle addresses
     * @return feed The deployed feed address
     */
    function deployFeed(
        bytes32 assetId,
        string calldata description,
        uint256 heartbeat,
        address[] calldata oracles
    ) external onlyOwner returns (address feed) {
        require(!_exists[assetId], "Asset already registered");

        // Deploy new price feed
        HardwarePriceFeed newFeed = new HardwarePriceFeed(
            assetId,
            description,
            heartbeat,
            oracles
        );

        feed = address(newFeed);

        _feeds[assetId] = feed;
        _assetIds.push(assetId);
        _exists[assetId] = true;

        emit FeedDeployed(assetId, feed, description);
    }

    /**
     * @notice Deregister a price feed
     * @param assetId The asset identifier
     */
    function deregisterFeed(bytes32 assetId) external onlyOwner {
        require(_exists[assetId], "Asset not registered");

        address feed = _feeds[assetId];

        delete _feeds[assetId];
        _exists[assetId] = false;

        // Remove from array
        for (uint256 i = 0; i < _assetIds.length; i++) {
            if (_assetIds[i] == assetId) {
                _assetIds[i] = _assetIds[_assetIds.length - 1];
                _assetIds.pop();
                break;
            }
        }

        emit FeedDeregistered(assetId, feed);
    }

    /**
     * @notice Transfer ownership
     */
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid owner");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }
}
