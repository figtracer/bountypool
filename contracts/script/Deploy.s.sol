// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {BountyManager} from "../src/BountyManager.sol";
import {PoolFactory} from "../src/PoolFactory.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

contract Deploy is Script {
    function run() public returns (PoolFactory, BountyManager) {
        vm.startBroadcast();

        /// @dev Deploy implementation contracts
        PoolFactory poolFactoryImpl = new PoolFactory();
        BountyManager bountyManagerImpl = new BountyManager();

        /// @dev Deploy proxies without initialization data
        ERC1967Proxy bountyManagerProxy = new ERC1967Proxy(address(bountyManagerImpl), "");
        ERC1967Proxy poolFactoryProxy = new ERC1967Proxy(address(poolFactoryImpl), "");

        /// @dev Cast proxies to their respective interfaces
        BountyManager bountyManager = BountyManager(payable(address(bountyManagerProxy)));
        PoolFactory poolFactory = PoolFactory(address(poolFactoryProxy));

        /// @dev Initialize contracts manually after both proxies exist
        bountyManager.initialize(address(poolFactory));
        address protocolWallet = msg.sender;
        poolFactory.initialize(address(bountyManager), protocolWallet);

        console.log("PoolFactory Proxy deployed at:", address(poolFactory));
        console.log("BountyManager Proxy deployed at:", address(bountyManager));
        console.log("Protocol Wallet set to:", protocolWallet);

        vm.stopBroadcast();
        return (poolFactory, bountyManager);
    }
}
