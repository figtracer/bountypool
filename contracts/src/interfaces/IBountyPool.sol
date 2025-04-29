// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

interface IBountyPool {
    struct Deposit {
        uint256 amount;
        uint256 allocation;
        uint256 timestamp;
        uint256 yield;
    }

    function getId() external view returns (uint256);
    function getName() external view returns (string memory);
    function getImageUrl() external view returns (string memory);
    function getCurrentContributions() external view returns (uint256);
    function getCurrentBountyYield() external view returns (uint256);
    function getCurrentContributorYield() external view returns (uint256);
    function getContributors() external view returns (address[] memory);
    function getContributorDeposits(address contributor) external view returns (Deposit[] memory);
    function getAvailableBountyYield() external view returns (uint256);
    function getAvailableContributorYield(address contributor) external view returns (uint256);
    function getLastWithdrawalTimestamp(address contributor) external view returns (uint256);
    function checkATokenBalance(uint256 amount) external view returns (bool sufficient, uint256 balance);
    function deposit(uint256 allocation) external payable;
    function fundBounty(uint256 _bountyId, uint256 amount) external returns (uint256);
    function withdrawYield(uint256 depositId) external;
    function withdrawPrincipal(uint256 depositId) external;
    function distributeYield() external;
}
