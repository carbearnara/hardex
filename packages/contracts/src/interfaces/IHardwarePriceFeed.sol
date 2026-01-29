// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {AggregatorV3Interface} from "./AggregatorV3Interface.sol";

/**
 * @title IHardwarePriceFeed
 * @notice Extended interface for hardware price feeds
 */
interface IHardwarePriceFeed is AggregatorV3Interface {
    /// @notice Emitted when a new price is submitted
    event PriceUpdated(
        uint80 indexed roundId,
        int256 price,
        uint256 timestamp,
        address indexed oracle
    );

    /// @notice Emitted when an oracle is added
    event OracleAdded(address indexed oracle);

    /// @notice Emitted when an oracle is removed
    event OracleRemoved(address indexed oracle);

    /// @notice Emitted when the heartbeat interval is updated
    event HeartbeatUpdated(uint256 oldHeartbeat, uint256 newHeartbeat);

    /// @notice Update the price (oracle only)
    /// @param price The new price in 8-decimal format
    function updatePrice(int256 price) external;

    /// @notice Check if the price feed is stale (beyond heartbeat)
    function isStale() external view returns (bool);

    /// @notice Get the asset identifier
    function assetId() external view returns (bytes32);

    /// @notice Get all authorized oracles
    function getOracles() external view returns (address[] memory);

    /// @notice Check if an address is an authorized oracle
    function isOracle(address account) external view returns (bool);
}
