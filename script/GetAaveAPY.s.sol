// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {Script, console} from "forge-std/Script.sol";
import {AaveV3ArbitrumSepolia, AaveV3ArbitrumSepoliaAssets} from "aave-address-book/AaveV3ArbitrumSepolia.sol";
import {IPoolDataProvider} from "aave-v3-origin/contracts/interfaces/IPoolDataProvider.sol";

contract GetAaveAPY is Script {
    function run() external view {
        IPoolDataProvider dataProvider = IPoolDataProvider(AaveV3ArbitrumSepolia.AAVE_PROTOCOL_DATA_PROVIDER);
        address wethAddress = AaveV3ArbitrumSepoliaAssets.WETH_UNDERLYING;

        (,,,,, bool usageAsCollateralEnabled, bool borrowingEnabled,, bool isActive, bool isFrozen) =
            dataProvider.getReserveConfigurationData(wethAddress);

        (
            uint256 availableLiquidity,
            uint256 totalStableDebt,
            uint256 totalVariableDebt,
            uint256 liquidityRate,
            uint256 variableBorrowRate,
            uint256 stableBorrowRate,
            ,
            ,
            ,
            uint256 lastUpdateTimestamp,
            ,
        ) = dataProvider.getReserveData(wethAddress);
        console.log("WETH Reserve Data on Aave Arbitrum Sepolia:");
        console.log("---------------------------------------------");
        console.log("Deposit APR (approximate):", liquidityRate, "%"); // Convert to human-readable percentage
        console.log("Variable Borrow Rate:", variableBorrowRate, "%");
        console.log("Stable Borrow Rate:", stableBorrowRate, "%");
        console.log("Available Liquidity:", availableLiquidity, "WETH");
        console.log("Total Variable Debt:", totalVariableDebt, "WETH");
        console.log("Total Stable Debt:", totalStableDebt, "WETH");
        console.log("Usage as Collateral:", usageAsCollateralEnabled ? "Yes" : "No");
        console.log("Borrowing Enabled:", borrowingEnabled ? "Yes" : "No");
        console.log("Is Market Active:", isActive ? "Yes" : "No");
        console.log("Is Market Frozen:", isFrozen ? "Yes" : "No");
        console.log("Last Updated:", lastUpdateTimestamp, "(timestamp)");
    }
}
