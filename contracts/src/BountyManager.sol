// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {PoolFactory} from "./PoolFactory.sol";
import {IBountyPool} from "./interfaces/IBountyPool.sol";

/**
 * @title BountyManager
 * @author Gustavo Figueiredo
 * @dev
 * - Allow repo owners to propose bounties with task details and reward amounts (sourced from yield)
 * - Limit participation to one solver who stakes a percentage of the bounty value as collateral
 * - Enforce a deadline in seconds (e.g: 30 days)
 * - Enable repo owners to select the winning submission
 * - Handle reward release and manage the solver's collateral
 */
contract BountyManager is Initializable, OwnableUpgradeable, UUPSUpgradeable, ReentrancyGuardUpgradeable {
    using Math for uint256;

    /*//////////////////////////////////////////////////////////////
                    TYPE DECLARATIONS
    //////////////////////////////////////////////////////////////*/
    enum BountyStatus {
        OPEN,
        CLOSED,
        FINISHED
    }

    struct Bounty {
        uint256 id;
        uint256 poolId;
        string details;
        uint256 reward;
        uint256 joinFeePercentage;
        uint256 collateral;
        uint256 deadline;
        address solver;
        string submission;
        BountyStatus status;
    }

    /*//////////////////////////////////////////////////////////////
                    STATE VARIABLES
    //////////////////////////////////////////////////////////////*/
    uint256 public bountyId;
    uint256 public constant ALLOCATION_PERCENTAGE_BASE = 100;

    mapping(uint256 => Bounty) public bounties;
    mapping(uint256 => uint256[]) private poolBounties;

    PoolFactory public poolFactory;

    /*//////////////////////////////////////////////////////////////
                    EVENTS
    //////////////////////////////////////////////////////////////*/
    event BountyCreated(uint256 indexed bountyId, uint256 poolId, uint256 reward);
    event SolverJoined(uint256 indexed bountyId, address solver, uint256 collateral);
    event SolutionSubmitted(uint256 indexed bountyId, address solver, string solutionUrl);
    event SubmissionsClosed(uint256 indexed bountyId);
    event WinnerSelected(uint256 indexed bountyId, address winner);
    event RewardsReleased(uint256 indexed bountyId, address winner, uint256 amount);
    event CollateralRefunded(uint256 indexed bountyId, address solver, uint256 amount);
    event BountyFunded(uint256 indexed bountyId, uint256 amount);
    event SolutionRejected(uint256 indexed bountyId, bool refundCollateral);

    /*//////////////////////////////////////////////////////////////
                    ERRORS
    //////////////////////////////////////////////////////////////*/
    error BountyManager__NotPoolOwner();
    error BountyManager__PoolDoesNotExist();
    error BountyManager__OnlyCallableByPool();
    error BountyManager__IncorrectCollateralAmount();
    error BountyManager__SolverAlreadyParticipated();
    error BountyManager__NotSolver();
    error BountyManager__SolutionAlreadySubmitted();
    error BountyManager__NoSolutionSubmitted();
    error BountyManager__BountyNotOpen();
    error BountyManager__BountyNotClosed();
    error BountyManager__BountyNotFinished();
    error BountyManager__FailedToReleaseRewards();
    error BountyManager__FailedToRefundCollateral();
    error BountyManager__InsufficientEscrowBalance();
    error BountyManager__NotEnoughYield();
    error BountyManager__InvalidPoolFactory();
    error BountyManager__NoCollateralToRefund();

    /*//////////////////////////////////////////////////////////////
                    MODIFIERS
    //////////////////////////////////////////////////////////////*/

    modifier onlyCallableByPoolOwner(uint256 _poolId) {
        if (poolFactory.getPoolOwner(poolFactory.getPoolById(_poolId)) != msg.sender) {
            revert BountyManager__NotPoolOwner();
        }
        _;
    }

    modifier onlyCallableByPool(uint256 _poolId) {
        if (poolFactory.getPoolById(_poolId) != msg.sender) revert BountyManager__OnlyCallableByPool();
        _;
    }

    modifier onlyIfBountyClosed(uint256 _bountyId) {
        if (bounties[_bountyId].status != BountyStatus.CLOSED) revert BountyManager__BountyNotClosed();
        _;
    }

    modifier onlyIfBountySolver(uint256 _bountyId, address _solver) {
        if (bounties[_bountyId].solver != _solver) revert BountyManager__NotSolver();
        _;
    }

    /*//////////////////////////////////////////////////////////////
                    FUNCTIONS
    //////////////////////////////////////////////////////////////*/
    function initialize(address _poolFactory) external initializer {
        __Ownable_init(msg.sender);
        __UUPSUpgradeable_init();
        if (_poolFactory == address(0)) revert BountyManager__InvalidPoolFactory();
        poolFactory = PoolFactory(_poolFactory);
        bountyId = 0;
    }

    receive() external payable {}

    /**
     * @notice Create a bounty
     * @param poolId The ID of the repository
     * @param details The details of the task
     * @param reward The amount of reward for the bounty
     */
    function createBounty(
        uint256 poolId,
        string memory details,
        uint256 reward,
        uint256 joinFeePercentage,
        uint256 deadline
    ) external nonReentrant onlyCallableByPoolOwner(poolId) {
        address poolAddr = poolFactory.getPoolById(poolId);
        if (poolAddr == address(0)) revert BountyManager__PoolDoesNotExist();

        uint256 availableYield = IBountyPool(poolAddr).getAvailableBountyYield();
        if (availableYield < reward) revert BountyManager__NotEnoughYield();

        bountyId++;
        Bounty storage newBounty = bounties[bountyId];
        newBounty.id = bountyId;
        newBounty.poolId = poolId;
        newBounty.details = details;
        newBounty.reward = reward;
        newBounty.joinFeePercentage = joinFeePercentage;

        uint256 collateral = (reward * joinFeePercentage) / ALLOCATION_PERCENTAGE_BASE;
        newBounty.collateral = collateral;

        newBounty.deadline = block.timestamp + deadline;
        newBounty.solver = address(0);
        newBounty.submission = "";
        newBounty.status = BountyStatus.OPEN;

        poolBounties[poolId].push(bountyId);

        emit BountyCreated(bountyId, poolId, reward);

        // --- Reserve the bounty reward in escrow immediately ---
        uint256 withdrawn = IBountyPool(poolAddr).fundBounty(bountyId, reward);
        // Sanity‑check: pool should transfer exactly the requested amount
        if (withdrawn != reward) revert BountyManager__FailedToReleaseRewards();
        emit BountyFunded(bountyId, withdrawn);
    }

    /**
     * @notice Claim a bounty
     * @param _bountyId The ID of the bounty to claim
     * @dev This can only be called if the bounty is open.
     */
    function claimBounty(uint256 _bountyId) external payable {
        Bounty storage bounty = bounties[_bountyId];
        if (bounty.status == BountyStatus.CLOSED) revert BountyManager__BountyNotOpen();
        if (bounty.solver != address(0)) revert BountyManager__SolverAlreadyParticipated();
        if (msg.value != bounty.collateral) revert BountyManager__IncorrectCollateralAmount();

        emit SolverJoined(_bountyId, msg.sender, msg.value);
        bounty.solver = msg.sender;

        emit SubmissionsClosed(_bountyId);
        bounty.status = BountyStatus.CLOSED;
    }

    /**
     * @notice Submit a solution
     * @param _bountyId The ID of the bounty to submit a solution for
     * @param _solutionUrl The URL of the solution
     * @dev This can only be called if the bounty is closed and the solver is a participant.
     */
    function submitSolution(uint256 _bountyId, string memory _solutionUrl) external onlyIfBountyClosed(_bountyId) {
        Bounty storage bounty = bounties[_bountyId];
        if (bounty.solver != msg.sender) revert BountyManager__NotSolver();
        if (bytes(bounty.submission).length != 0) revert BountyManager__SolutionAlreadySubmitted();

        bounty.submission = _solutionUrl;
        emit SolutionSubmitted(_bountyId, msg.sender, _solutionUrl);
    }

    /**
     * @notice Approve the solution and release rewards
     * @param _bountyId The ID of the bounty to approve solution for
     * @dev This can only be called by the pool owner after a soluti    on has been submitted.
     */
    function approveSolution(uint256 _bountyId)
        external
        onlyCallableByPoolOwner(bounties[_bountyId].poolId)
        onlyIfBountyClosed(_bountyId)
    {
        Bounty storage bounty = bounties[_bountyId];
        if (bytes(bounty.submission).length == 0) revert BountyManager__NoSolutionSubmitted();

        emit WinnerSelected(_bountyId, bounty.solver);
        bounty.status = BountyStatus.FINISHED;

        _processRewardsAndRefundCollateral(bounty);
    }

    /**
     * @notice Reject the solution and optionally refund collateral
     * @param _bountyId The ID of the bounty to reject the solution for
     * @param refundCollateral Whether to refund the solver's collateral
     * @dev Callable only by the pool owner after a solution is submitted
     */
    function rejectSolution(uint256 _bountyId, bool refundCollateral)
        external
        onlyCallableByPoolOwner(bounties[_bountyId].poolId)
        onlyIfBountyClosed(_bountyId)
    {
        Bounty storage bounty = bounties[_bountyId];
        if (bytes(bounty.submission).length == 0) revert BountyManager__NoSolutionSubmitted();

        address solver = bounty.solver;

        bounty.status = BountyStatus.OPEN;
        bounty.solver = address(0);
        bounty.submission = "";

        /// @dev Refund the collateral
        if (refundCollateral) {
            _refundCollateral(bounty, solver);
        } else {
            /// @dev If solution was spam/fraud don't refund the collateral and add it to the total reward.
            bounty.reward += bounty.collateral;

            uint256 newCollateral = (bounty.reward * bounty.joinFeePercentage) / ALLOCATION_PERCENTAGE_BASE;

            bounty.collateral = newCollateral;
        }

        emit SolutionRejected(_bountyId, refundCollateral);
    }

    /*//////////////////////////////////////////////////////////////
                        INTERNAL FUNCTIONS
    //////////////////////////////////////////////////////////////*/
    /**
     * @notice Process the rewards for a bounty
     * @param _bounty The bounty to process the rewards for
     */
    function _processRewardsAndRefundCollateral(Bounty storage _bounty) internal nonReentrant {
        if (_bounty.status != BountyStatus.FINISHED) revert BountyManager__BountyNotFinished();

        address poolAddr = poolFactory.getPoolById(_bounty.poolId);
        if (poolAddr == address(0)) revert BountyManager__PoolDoesNotExist();

        uint256 requiredTotal = _bounty.reward + _bounty.collateral;
        uint256 currentBalance = address(this).balance;

        if (currentBalance < requiredTotal) {
            uint256 deficit = requiredTotal - currentBalance;

            if (deficit > _bounty.reward) {
                deficit = _bounty.reward;
            }

            uint256 fetched = IBountyPool(poolAddr).fundBounty(_bounty.id, deficit);
            if (fetched != deficit) revert BountyManager__FailedToReleaseRewards();
            emit BountyFunded(_bounty.id, fetched);
        }

        uint256 reward = _bounty.reward;
        uint256 collateral = _bounty.collateral;

        _bounty.reward = 0;
        _bounty.collateral = 0;

        if (address(this).balance < reward + collateral) {
            revert BountyManager__InsufficientEscrowBalance();
        }

        (bool success,) = payable(_bounty.solver).call{value: reward + collateral}("");
        if (!success) revert BountyManager__FailedToReleaseRewards();
        emit RewardsReleased(_bounty.id, _bounty.solver, reward);
    }

    /**
     * @notice Refund the collateral for a solver
     * @param _bounty The bounty to refund the collateral for
     * @param _solver The address of the solver to refund the collateral for
     */
    function _refundCollateral(Bounty storage _bounty, address _solver) internal {
        if (_bounty.collateral == 0) revert BountyManager__NoCollateralToRefund();
        (bool success,) = payable(_solver).call{value: _bounty.collateral}("");
        if (!success) revert BountyManager__FailedToRefundCollateral();
        emit CollateralRefunded(_bounty.id, _solver, _bounty.collateral);
    }

    /**
     * @notice Authorize the upgrade
     * @param _newImplementation The address of the new implementation
     */
    // aderyn-ignore-next-line(empty-block)
    function _authorizeUpgrade(address _newImplementation) internal override {}

    /*//////////////////////////////////////////////////////////////
                    PUBLIC AND EXTERNAL VIEW FUNCTIONS
    //////////////////////////////////////////////////////////////*/
    /**
     * @notice Get pool diagnostic information before creating a bounty
     * @param poolId The pool ID to check
     * @param amount The amount to check against
     * @return poolAddress The address of the pool
     * @return bountyYield The current bounty yield
     * @return hasEnoughYield Whether there's enough yield
     * @return hasEnoughAToken Whether there's enough aToken balance
     * @return aTokenBalance The current aToken balance
     */
    function getPoolDiagnostics(uint256 poolId, uint256 amount)
        external
        view
        returns (
            address poolAddress,
            uint256 bountyYield,
            bool hasEnoughYield,
            bool hasEnoughAToken,
            uint256 aTokenBalance
        )
    {
        address poolAddr = poolFactory.getPoolById(poolId);
        if (poolAddr == address(0)) {
            return (address(0), 0, false, false, 0);
        }

        IBountyPool pool = IBountyPool(poolAddr);
        uint256 yield = pool.getAvailableBountyYield();
        (bool hasAToken, uint256 aBalance) = pool.checkATokenBalance(amount);

        return (poolAddr, yield, yield >= amount, hasAToken, aBalance);
    }

    function getBountyDetails(uint256 _bountyId)
        external
        view
        returns (
            string memory details,
            uint256 reward,
            uint256 joinFeePercentage,
            uint256 deadline,
            address solver,
            BountyStatus status,
            string memory submission
        )
    {
        Bounty storage bounty = bounties[_bountyId];
        return (
            bounty.details,
            bounty.reward,
            bounty.joinFeePercentage,
            bounty.deadline,
            bounty.solver,
            bounty.status,
            bounty.submission
        );
    }

    function getPoolBounties(uint256 _poolId) external view returns (uint256[] memory) {
        return poolBounties[_poolId];
    }

    function getPoolBountyCount(uint256 _poolId) external view returns (uint256) {
        return poolBounties[_poolId].length;
    }

    function getBountyStatus(uint256 _bountyId) external view returns (BountyStatus) {
        return bounties[_bountyId].status;
    }

    function getBountyPoolId(uint256 _bountyId) external view returns (uint256) {
        return bounties[_bountyId].poolId;
    }
}
