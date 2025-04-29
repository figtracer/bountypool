// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Test, console} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {BountyPool} from "../../../src/BountyPool.sol";
import {PoolHandlerStop} from "./PoolHandlerStop.sol";
import {IAToken} from "aave-v3-origin/contracts/interfaces/IAToken.sol";
import {AaveV3ArbitrumSepolia, AaveV3ArbitrumSepoliaAssets} from "aave-address-book/AaveV3ArbitrumSepolia.sol";

contract PoolInvariantsStopTest is StdInvariant, Test {
    BountyPool public pool;
    PoolHandlerStop public handler;
    IAToken public aToken;

    address public bountyManager;

    string public ARBITRUM_SEPOLIA_RPC_URL = "https://sepolia-rollup.arbitrum.io/rpc";
    uint256 public forkId;

    function setUp() public {
        forkId = vm.createFork(ARBITRUM_SEPOLIA_RPC_URL);
        vm.selectFork(forkId);

        bountyManager = makeAddr("bountyManager");

        aToken = IAToken(AaveV3ArbitrumSepoliaAssets.WETH_A_TOKEN);

        pool = new BountyPool(bountyManager, 1, "TestPool", "");

        handler = new PoolHandlerStop(pool, bountyManager);
        targetContract(address(handler));

        vm.deal(address(pool), 1000 ether);
    }

    // Invariant: The currentContributions should equal the sum of all active deposits
    function invariant_currentContributionsMustEqualSumOfDeposits() public view {
        uint256 currentContributions = pool.getCurrentContributions();
        uint256 calculatedTotal = 0;

        address[] memory contributors = pool.getContributors();
        for (uint256 i = 0; i < contributors.length; i++) {
            address contributor = contributors[i];
            BountyPool.Deposit[] memory deposits = pool.getContributorDeposits(contributor);
            for (uint256 j = 0; j < deposits.length; j++) {
                calculatedTotal += deposits[j].amount;
            }
        }

        assertEq(currentContributions, calculatedTotal, "Current contributions should equal sum of all deposits");
    }

    function invariant_yieldAccountingIsCorrect() public view {
        uint256 currentATokenBalance = aToken.balanceOf(address(pool));
        uint256 trackedYield = pool.getCurrentBountyYield() + pool.getCurrentContributorYield();

        uint256 ROUNDING_TOLERANCE = 1000;

        if (pool.getCurrentContributions() == 0) {
            console.log("tracked yield", trackedYield);
            console.log("currentATokenBalance", currentATokenBalance);

            if (trackedYield > currentATokenBalance) {
                uint256 difference = trackedYield - currentATokenBalance;
                assertTrue(
                    difference <= ROUNDING_TOLERANCE, "Tracked yield exceeds aToken balance by more than tolerance"
                );
            } else {
                assertTrue(true);
            }
        } else {
            uint256 availableBountyYield = pool.getAvailableBountyYield();
            uint256 totalAvailableContributorYield = 0;
            address[] memory contributorAddresses = pool.getContributors();
            for (uint256 i = 0; i < contributorAddresses.length; i++) {
                totalAvailableContributorYield += pool.getAvailableContributorYield(contributorAddresses[i]);
            }

            uint256 totalAvailableYield = availableBountyYield + totalAvailableContributorYield;

            console.log("tracked yield", trackedYield);
            console.log("total available yield", totalAvailableYield);

            if (trackedYield > totalAvailableYield) {
                uint256 difference = trackedYield - totalAvailableYield;
                assertTrue(
                    difference <= ROUNDING_TOLERANCE, "Tracked yield exceeds available yield by more than tolerance"
                );
            } else {
                assertTrue(true);
            }
        }
    }

    // Invariant: All getter functions should not revert
    function invariant_gettersShouldNotRevert() public view {
        pool.getId();
        pool.getName();
        pool.getImageUrl();
        pool.getCurrentContributions();
        pool.getCurrentBountyYield();
        pool.getCurrentContributorYield();
        pool.getContributors();
        pool.getContributorDeposits(address(0x1));
        pool.getLastWithdrawalTimestamp(address(0x1));
        pool.getAvailableBountyYield();
        pool.getAvailableContributorYield(address(0x1));
        assertTrue(true, "Getters should not revert");
    }
}
