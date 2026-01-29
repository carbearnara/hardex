// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {OracleRegistry} from "../src/OracleRegistry.sol";

contract DeployScript is Script {
    // Asset IDs
    bytes32 public constant GPU_RTX4090 = keccak256("GPU_RTX4090");
    bytes32 public constant GPU_RTX4080 = keccak256("GPU_RTX4080");
    bytes32 public constant GPU_RTX3090 = keccak256("GPU_RTX3090");
    bytes32 public constant RAM_DDR5_32 = keccak256("RAM_DDR5_32");
    bytes32 public constant RAM_DDR5_64 = keccak256("RAM_DDR5_64");

    function run() public {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address oracle = vm.envAddress("ORACLE_ADDRESS");

        vm.startBroadcast(deployerPrivateKey);

        // Deploy registry
        OracleRegistry registry = new OracleRegistry();
        console.log("OracleRegistry deployed at:", address(registry));

        // Prepare oracle array
        address[] memory oracles = new address[](1);
        oracles[0] = oracle;

        // 1 hour heartbeat
        uint256 heartbeat = 3600;

        // Deploy price feeds for each asset
        address rtx4090Feed = registry.deployFeed(
            GPU_RTX4090,
            "NVIDIA RTX 4090 / USD",
            heartbeat,
            oracles
        );
        console.log("GPU_RTX4090 feed deployed at:", rtx4090Feed);

        address rtx4080Feed = registry.deployFeed(
            GPU_RTX4080,
            "NVIDIA RTX 4080 / USD",
            heartbeat,
            oracles
        );
        console.log("GPU_RTX4080 feed deployed at:", rtx4080Feed);

        address rtx3090Feed = registry.deployFeed(
            GPU_RTX3090,
            "NVIDIA RTX 3090 / USD",
            heartbeat,
            oracles
        );
        console.log("GPU_RTX3090 feed deployed at:", rtx3090Feed);

        address ddr5_32Feed = registry.deployFeed(
            RAM_DDR5_32,
            "DDR5 RAM 32GB / USD",
            heartbeat,
            oracles
        );
        console.log("RAM_DDR5_32 feed deployed at:", ddr5_32Feed);

        address ddr5_64Feed = registry.deployFeed(
            RAM_DDR5_64,
            "DDR5 RAM 64GB / USD",
            heartbeat,
            oracles
        );
        console.log("RAM_DDR5_64 feed deployed at:", ddr5_64Feed);

        vm.stopBroadcast();

        console.log("\n=== Deployment Summary ===");
        console.log("Registry:", address(registry));
        console.log("Total feeds deployed:", 5);
    }
}
