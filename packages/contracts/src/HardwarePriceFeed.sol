// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IHardwarePriceFeed} from "./interfaces/IHardwarePriceFeed.sol";

/**
 * @title HardwarePriceFeed
 * @notice Price feed for hardware assets (GPUs, RAM) compatible with Chainlink's AggregatorV3Interface
 * @dev Supports multiple oracles with median price aggregation
 */
contract HardwarePriceFeed is IHardwarePriceFeed {
    // ============ Constants ============

    uint8 public constant override decimals = 8;
    uint256 public constant override version = 1;

    // ============ State Variables ============

    bytes32 public immutable override assetId;
    string private _description;

    address public owner;
    uint256 public heartbeatInterval;

    // Oracle management
    mapping(address => bool) private _isOracle;
    address[] private _oracles;

    // Round data
    uint80 private _latestRound;
    mapping(uint80 => RoundData) private _rounds;

    struct RoundData {
        int256 answer;
        uint256 startedAt;
        uint256 updatedAt;
        uint80 answeredInRound;
    }

    // Pending submissions for multi-oracle median
    mapping(uint80 => mapping(address => int256)) private _submissions;
    mapping(uint80 => address[]) private _submitters;

    // ============ Modifiers ============

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier onlyOracle() {
        require(_isOracle[msg.sender], "Not authorized oracle");
        _;
    }

    // ============ Constructor ============

    /**
     * @param _assetId Unique identifier for the hardware asset (e.g., keccak256("GPU_RTX4090"))
     * @param description_ Human-readable description
     * @param _heartbeat Maximum time between updates before price is considered stale
     * @param initialOracles Initial set of authorized oracles
     */
    constructor(
        bytes32 _assetId,
        string memory description_,
        uint256 _heartbeat,
        address[] memory initialOracles
    ) {
        require(_heartbeat > 0, "Invalid heartbeat");
        require(initialOracles.length > 0, "Need at least one oracle");

        assetId = _assetId;
        _description = description_;
        heartbeatInterval = _heartbeat;
        owner = msg.sender;

        for (uint256 i = 0; i < initialOracles.length; i++) {
            _addOracle(initialOracles[i]);
        }
    }

    // ============ AggregatorV3Interface ============

    function description() external view override returns (string memory) {
        return _description;
    }

    function latestRoundData()
        external
        view
        override
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        return getRoundData(_latestRound);
    }

    function getRoundData(
        uint80 _roundId
    )
        public
        view
        override
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        RoundData memory round = _rounds[_roundId];
        return (
            _roundId,
            round.answer,
            round.startedAt,
            round.updatedAt,
            round.answeredInRound
        );
    }

    // ============ IHardwarePriceFeed ============

    /**
     * @notice Submit a new price update
     * @param price The price in 8-decimal format (e.g., $1599.99 = 159999000000)
     */
    function updatePrice(int256 price) external override onlyOracle {
        require(price > 0, "Price must be positive");

        uint80 currentRound = _latestRound + 1;

        // Record submission
        _submissions[currentRound][msg.sender] = price;

        // Track submitter if not already submitted
        bool alreadySubmitted = false;
        for (uint256 i = 0; i < _submitters[currentRound].length; i++) {
            if (_submitters[currentRound][i] == msg.sender) {
                alreadySubmitted = true;
                break;
            }
        }
        if (!alreadySubmitted) {
            _submitters[currentRound].push(msg.sender);
        }

        // If we have enough submissions (majority of oracles), finalize the round
        uint256 threshold = (_oracles.length / 2) + 1;

        if (_submitters[currentRound].length >= threshold) {
            int256 medianPrice = _calculateMedian(currentRound);

            _rounds[currentRound] = RoundData({
                answer: medianPrice,
                startedAt: block.timestamp,
                updatedAt: block.timestamp,
                answeredInRound: currentRound
            });

            _latestRound = currentRound;

            emit PriceUpdated(currentRound, medianPrice, block.timestamp, msg.sender);
        }
    }

    function isStale() external view override returns (bool) {
        if (_latestRound == 0) return true;
        return block.timestamp > _rounds[_latestRound].updatedAt + heartbeatInterval;
    }

    function getOracles() external view override returns (address[] memory) {
        return _oracles;
    }

    function isOracle(address account) external view override returns (bool) {
        return _isOracle[account];
    }

    // ============ Admin Functions ============

    function addOracle(address oracle) external onlyOwner {
        _addOracle(oracle);
    }

    function removeOracle(address oracle) external onlyOwner {
        require(_isOracle[oracle], "Not an oracle");
        require(_oracles.length > 1, "Cannot remove last oracle");

        _isOracle[oracle] = false;

        // Remove from array
        for (uint256 i = 0; i < _oracles.length; i++) {
            if (_oracles[i] == oracle) {
                _oracles[i] = _oracles[_oracles.length - 1];
                _oracles.pop();
                break;
            }
        }

        emit OracleRemoved(oracle);
    }

    function setHeartbeat(uint256 newHeartbeat) external onlyOwner {
        require(newHeartbeat > 0, "Invalid heartbeat");
        emit HeartbeatUpdated(heartbeatInterval, newHeartbeat);
        heartbeatInterval = newHeartbeat;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid owner");
        owner = newOwner;
    }

    // ============ Internal Functions ============

    function _addOracle(address oracle) internal {
        require(oracle != address(0), "Invalid oracle address");
        require(!_isOracle[oracle], "Already an oracle");

        _isOracle[oracle] = true;
        _oracles.push(oracle);

        emit OracleAdded(oracle);
    }

    function _calculateMedian(uint80 roundId) internal view returns (int256) {
        address[] memory submitters = _submitters[roundId];
        uint256 n = submitters.length;

        // Collect all prices
        int256[] memory prices = new int256[](n);
        for (uint256 i = 0; i < n; i++) {
            prices[i] = _submissions[roundId][submitters[i]];
        }

        // Sort prices (simple bubble sort - fine for small arrays)
        for (uint256 i = 0; i < n; i++) {
            for (uint256 j = i + 1; j < n; j++) {
                if (prices[i] > prices[j]) {
                    int256 temp = prices[i];
                    prices[i] = prices[j];
                    prices[j] = temp;
                }
            }
        }

        // Return median
        if (n % 2 == 0) {
            return (prices[n / 2 - 1] + prices[n / 2]) / 2;
        } else {
            return prices[n / 2];
        }
    }
}
