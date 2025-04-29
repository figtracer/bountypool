// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {BountyPool} from "./BountyPool.sol";

contract PoolFactory is Initializable, OwnableUpgradeable, UUPSUpgradeable {
    /*//////////////////////////////////////////////////////////////
                    STATE VARIABLES
    //////////////////////////////////////////////////////////////*/
    address private bountyManager;
    address private protocolWallet;
    uint256 private poolCount;
    uint256 private constant POOL_CREATION_FEE = 0.02 ether;
    mapping(address => address) public poolToOwner;
    mapping(uint256 => address) public idToPool;

    /*//////////////////////////////////////////////////////////////
                        EVENTS
    //////////////////////////////////////////////////////////////*/
    event PoolCreated(uint256 indexed id, address indexed pool, address indexed owner, string imageUrl);

    /*//////////////////////////////////////////////////////////////
                    ERRORS
    //////////////////////////////////////////////////////////////*/
    error PoolFactory__PoolAlreadyExists();
    error PoolFactory__InsufficientFee();
    error PoolFactory__FailedToSendFee();
    error PoolFactory__InvalidAddress();

    /*//////////////////////////////////////////////////////////////
                        FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    function initialize(address _bountyManager, address _protocolWallet) external initializer {
        __Ownable_init(msg.sender);
        __UUPSUpgradeable_init();
        if (_bountyManager == address(0) || _protocolWallet == address(0)) revert PoolFactory__InvalidAddress();
        bountyManager = _bountyManager;
        protocolWallet = _protocolWallet;
        poolCount = 0;
    }

    /**
     * @notice Creates a new ContributionPool with a given id and name.
     * @dev Reverts if a pool already exists with the same id.
     * @param id The ID of the pool.
     * @param name The name of the pool.
     * @param imageUrl The IPFS URL for the pool image.
     */
    function createPool(uint256 id, string memory name, string memory imageUrl) external payable {
        if (idToPool[id] != address(0)) revert PoolFactory__PoolAlreadyExists();
        if (msg.value < POOL_CREATION_FEE) revert PoolFactory__InsufficientFee();

        BountyPool pool = new BountyPool(bountyManager, id, name, imageUrl);
        address poolAddress = address(pool);
        poolToOwner[poolAddress] = msg.sender;
        idToPool[id] = poolAddress;
        poolCount++;

        emit PoolCreated(id, address(pool), msg.sender, imageUrl);
        (bool success,) = payable(protocolWallet).call{value: POOL_CREATION_FEE}("");
        if (!success) revert PoolFactory__FailedToSendFee();
    }

    /*//////////////////////////////////////////////////////////////
                    INTERNAL FUNCTIONS
    //////////////////////////////////////////////////////////////*/
    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    /*//////////////////////////////////////////////////////////////
                    PUBLIC AND EXTERNAL VIEW FUNCTIONS
    //////////////////////////////////////////////////////////////*/
    function getPoolById(uint256 id) external view returns (address) {
        return idToPool[id];
    }

    function getPoolOwner(address pool) external view returns (address) {
        return poolToOwner[pool];
    }

    function getPoolCount() external view returns (uint256) {
        return poolCount;
    }

    function getPoolCreationFee() external pure returns (uint256) {
        return POOL_CREATION_FEE;
    }
}
