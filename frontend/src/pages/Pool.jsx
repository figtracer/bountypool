import React, { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { useParams, useNavigate, Link, useSearchParams } from 'react-router-dom';
import {
    useDeposit,
    useGetContributorDeposits,
    useGetCurrentContributions,
    useGetAvailableBountyYield,
    useGetAvailableContributorYield,
    useWithdrawYield,
    useWithdrawPrincipal,
    useGetPoolById,
    usePoolBounties,
    useIsPoolOwner,
    useGetCurrentYield
} from '../hooks/useContractInteractions';
import { formatEth, formatDate, advanceTime, formatAllocationPercent } from '../utils/helpers';
import { toast } from 'react-hot-toast';
import Leaderboard from '../components/Leaderboard';
import BountyCard from '../components/BountyCard';
import { readContract, writeContract } from 'wagmi/actions';
import { CONTRACTS } from '../utils/contracts';
import { PoolABI } from '../utils/ContractABIs';

// Allocation percentage base (100%)
const ALLOCATION_PERCENTAGE_BASE = 100;

// Ethereum logo SVG component for consistency
const EthereumLogo = ({ className = "h-4 w-4" }) => (
    <svg className={className} viewBox="0 0 784.37 1277.39" xmlns="http://www.w3.org/2000/svg">
        <g>
            <polygon fill="currentColor" fillRule="nonzero" points="392.07,0 383.5,29.11 383.5,873.74 392.07,882.29 784.13,650.54" />
            <polygon fill="currentColor" fillRule="nonzero" points="392.07,0 -0,650.54 392.07,882.29 392.07,472.33" />
            <polygon fill="currentColor" fillRule="nonzero" points="392.07,956.52 387.24,962.41 387.24,1263.28 392.07,1277.38 784.37,724.89" />
            <polygon fill="currentColor" fillRule="nonzero" points="392.07,1277.38 392.07,956.52 0,724.89" />
            <polygon fill="currentColor" fillRule="nonzero" points="392.07,882.29 784.13,650.54 392.07,472.33" />
            <polygon fill="currentColor" fillRule="nonzero" points="0,650.54 392.07,882.29 392.07,472.33" />
        </g>
    </svg>
);

const Pool = () => {
    const { address, isConnected } = useAccount();
    const { poolId: routePoolId } = useParams(); // Get pool ID from URL
    const [searchParams, setSearchParams] = useSearchParams();
    const navigate = useNavigate();
    const [amount, setAmount] = useState('');
    const [yieldAllocation, setYieldAllocation] = useState(30);
    const [withdrawingYieldIndex, setWithdrawingYieldIndex] = useState(null);
    const [withdrawingPrincipalIndex, setWithdrawingPrincipalIndex] = useState(null);
    const [activeTab, setActiveTab] = useState(() => {
        // Initialize from URL parameter or default to 'contribute'
        return searchParams.get('tab') || 'contribute';
    });
    const [poolName, setPoolName] = useState('');
    const [poolOwner, setPoolOwner] = useState(null);
    const [loadingPoolName, setLoadingPoolName] = useState(false);

    // Use the pool ID from the URL parameter, ensuring it's a valid number before converting to BigInt
    const poolId = routePoolId && !isNaN(routePoolId) ? routePoolId : '';

    // Update URL when tab changes
    const handleTabChange = (tab) => {
        setActiveTab(tab);
        setSearchParams({ tab });
    };

    // Get pool address from pool ID
    const { data: poolAddress } = useGetPoolById(
        poolId ? BigInt(poolId) : undefined
    );

    const poolExists = poolAddress && poolAddress !== '0x0000000000000000000000000000000000000000';

    // Get the pool owner
    const { data: isOwner } = useIsPoolOwner(poolAddress);

    // Get pool bounties
    const { bounties, loading: loadingBounties, error: bountiesError, refetch: refetchBounties } = usePoolBounties(poolId);

    // Redirect if pool doesn't exist after checking
    useEffect(() => {
        if (poolId && !poolExists && poolAddress !== undefined) {
            toast.error("This pool does not exist");
            navigate('/pools');
        }
    }, [poolId, poolExists, poolAddress, navigate]);

    // Contract reads
    const { data: deposits, isLoading: isLoadingDeposits, refetch: refetchDeposits } = useGetContributorDeposits(poolAddress, address);
    const { data: totalStaked, isLoading: isLoadingTotalStaked, refetch: refetchTotalStaked } = useGetCurrentContributions(poolAddress);
    const { data: bountyYield, isLoading: isLoadingBountyYield, refetch: refetchBountyYield } = useGetAvailableBountyYield(poolAddress);
    const { data: availableContributorYield, isLoading: isLoadingContributorYield } = useGetAvailableContributorYield(poolAddress, address);

    // Contract writes
    const {
        write: deposit,
        isLoading: isDepositing,
        isSuccess: isDepositSuccess
    } = useDeposit(poolAddress, amount, yieldAllocation);

    // Real-time yield calculation is now used instead of distributeYield
    const isDistributing = false;
    const isDistributeSuccess = false;

    const {
        write: withdrawYield,
        isLoading: isWithdrawingYield,
        isSuccess: isWithdrawYieldSuccess,
        error: withdrawYieldError
    } = useWithdrawYield(
        poolAddress,
        withdrawingYieldIndex !== null ? withdrawingYieldIndex : undefined
    );

    const {
        write: withdrawPrincipal,
        isLoading: isWithdrawingPrincipal,
        isSuccess: isWithdrawPrincipalSuccess,
        error: withdrawPrincipalError
    } = useWithdrawPrincipal(
        poolAddress,
        withdrawingPrincipalIndex !== null ? withdrawingPrincipalIndex : undefined
    );

    // Calculate total accumulated yield across all deposits (tracked yield from deposits)
    const trackedYield = deposits?.reduce((sum, deposit) => sum + BigInt(deposit.yield), BigInt(0)) || BigInt(0);

    // Use real-time yield information if available, otherwise fall back to tracked yield
    // Ensure we're properly converting to BigInt and handling undefined/null values
    const totalAccumulatedYield = availableContributorYield ? BigInt(availableContributorYield.toString()) : trackedYield;

    // Calculate total pool yield as the sum of available bounty yield and contributor yield
    const totalPoolYield = (bountyYield || BigInt(0)) + (availableContributorYield || BigInt(0));

    // For debugging
    useEffect(() => {
        console.log('Available contributor yield:', availableContributorYield ? availableContributorYield.toString() : 'undefined');
        console.log('Tracked yield:', trackedYield.toString());
        console.log('Deposits:', deposits);
        console.log('Connected address:', address);
        console.log('Pool address:', poolAddress);
    }, [availableContributorYield, trackedYield, deposits, address, poolAddress]);

    // Listen for refreshBounties events
    useEffect(() => {
        const handleRefreshBounties = (event) => {
            console.log('Refreshing bounties after solution rejection', event.detail);
            // Refetch bounties when the event is triggered
            refetchBounties?.();
        };

        // Add event listener
        window.addEventListener('refreshBounties', handleRefreshBounties);

        // Clean up event listener
        return () => {
            window.removeEventListener('refreshBounties', handleRefreshBounties);
        };
    }, [refetchBounties]);

    // Get the pool owner address directly using readContract
    useEffect(() => {
        const fetchPoolOwner = async () => {
            if (poolAddress && poolAddress !== '0x0000000000000000000000000000000000000000') {
                try {
                    const ownerAddress = await readContract({
                        ...CONTRACTS.poolFactory,
                        functionName: 'getPoolOwner',
                        args: [poolAddress],
                    });
                    setPoolOwner(ownerAddress);
                } catch (error) {
                    console.error("Error fetching pool owner:", error);
                }
            }
        };

        fetchPoolOwner();
    }, [poolAddress]);

    // Get the pool name
    useEffect(() => {
        const fetchPoolName = async () => {
            if (poolAddress && poolAddress !== '0x0000000000000000000000000000000000000000') {
                setLoadingPoolName(true);
                try {
                    const name = await readContract({
                        address: poolAddress,
                        abi: PoolABI,
                        functionName: 'getName',
                    });
                    setPoolName(name);
                } catch (error) {
                    console.error("Error fetching pool name:", error);
                } finally {
                    setLoadingPoolName(false);
                }
            }
        };

        fetchPoolName();
    }, [poolAddress]);

    // Refetch data after successful operations
    useEffect(() => {
        if (isDepositSuccess) {
            refetchDeposits();
            refetchTotalStaked();
            // Show a single success message
            toast.success('Successfully contributed ETH!', { id: "deposit-success" });
            setAmount('');
        }
    }, [isDepositSuccess, refetchDeposits, refetchTotalStaked]);

    useEffect(() => {
        if (isDistributeSuccess) {
            refetchDeposits();
            refetchBountyYield();
            refetchTotalStaked();
            // Show a single success message with an ID to prevent duplicates
            toast.success('Yield distributed!', { id: "distribute-success" });
        }
    }, [isDistributeSuccess, refetchDeposits, refetchBountyYield, refetchTotalStaked]);

    useEffect(() => {
        if (isWithdrawYieldSuccess) {
            // Dismiss the loading toast and show success message
            toast.dismiss("withdraw-yield");

            refetchDeposits();

            // Only display one success message with the amount if available
            if (withdrawingYieldIndex !== null && deposits?.[withdrawingYieldIndex]) {
                const yieldAmount = formatEth(deposits[withdrawingYieldIndex].yield);
                toast.success(`Yield of ${yieldAmount} ETH successfully withdrawn!`);
            } else {
                toast.success("Yield successfully withdrawn!");
            }

            setWithdrawingYieldIndex(null);
        }
    }, [isWithdrawYieldSuccess, refetchDeposits, withdrawingYieldIndex, deposits]);

    useEffect(() => {
        if (isWithdrawPrincipalSuccess) {
            // Dismiss the loading toast and show success message
            toast.dismiss("withdraw-principal");

            refetchDeposits();
            refetchTotalStaked();

            // Only display one success message with the amount if available
            if (withdrawingPrincipalIndex !== null && deposits?.[withdrawingPrincipalIndex]) {
                const principalAmount = formatEth(deposits[withdrawingPrincipalIndex].amount);
                toast.success(`Principal of ${principalAmount} ETH successfully withdrawn!`);
            } else {
                toast.success("Principal successfully withdrawn!");
            }

            setWithdrawingPrincipalIndex(null);
        }
    }, [isWithdrawPrincipalSuccess, refetchDeposits, refetchTotalStaked, withdrawingPrincipalIndex, deposits]);

    // Handle yield withdrawal errors
    useEffect(() => {
        if (withdrawYieldError) {
            console.log("Yield withdrawal error:", withdrawYieldError);

            // Dismiss the loading toast
            toast.dismiss("withdraw-yield");

            // Format user-friendly error message
            let errorMessage = "Failed to withdraw yield. Please try again.";

            if (withdrawYieldError.message) {
                if (withdrawYieldError.message.includes("NoYieldToWithdraw")) {
                    errorMessage = "No yield to withdraw";
                } else if (withdrawYieldError.message.includes("ContractFunctionExecutionError")) {
                    errorMessage = "Error executing contract function. Please try again later.";
                } else if (withdrawYieldError.message.includes("UserRejectedRequestError")) {
                    errorMessage = "Transaction rejected by user";
                } else if (withdrawYieldError.message.includes("InsufficientATokenBalance")) {
                    errorMessage = "Insufficient balance in the pool. Try again later.";
                } else if (withdrawYieldError.message.includes("gas")) {
                    errorMessage = "Gas estimation failed. The transaction might fail.";
                }
            }

            toast.error(errorMessage);
            console.error("Withdraw yield error details:", withdrawYieldError);

            setWithdrawingYieldIndex(null);
        }
    }, [withdrawYieldError]);

    // Handle principal withdrawal errors
    useEffect(() => {
        if (withdrawPrincipalError) {
            console.log("Principal withdrawal error:", withdrawPrincipalError);

            // Dismiss the loading toast
            toast.dismiss("withdraw-principal");

            // Format user-friendly error message
            let errorMessage = "Failed to withdraw principal. Please try again.";

            if (withdrawPrincipalError.message) {
                if (withdrawPrincipalError.message.includes("NoPrincipalToWithdraw")) {
                    errorMessage = "No principal to withdraw";
                } else if (withdrawPrincipalError.message.includes("ContractFunctionExecutionError")) {
                    errorMessage = "Error executing contract function. Please try again later.";
                } else if (withdrawPrincipalError.message.includes("UserRejectedRequestError")) {
                    errorMessage = "Transaction rejected by user";
                } else if (withdrawPrincipalError.message.includes("InsufficientATokenBalance")) {
                    errorMessage = "Insufficient balance in the pool. Try again later.";
                } else if (withdrawPrincipalError.message.includes("gas")) {
                    errorMessage = "Gas estimation failed. The transaction might fail.";
                }
            }

            toast.error(errorMessage);
            console.error("Withdraw principal error details:", withdrawPrincipalError);

            setWithdrawingPrincipalIndex(null);
        }
    }, [withdrawPrincipalError]);

    const handleAmountChange = (e) => {
        setAmount(e.target.value);
    };

    const handleSliderChange = (e) => {
        setYieldAllocation(Number(e.target.value));
    };

    const handleStake = () => {
        if (!amount || !yieldAllocation) {
            toast.error("Please enter an amount and set yield allocation");
            return;
        }

        if (!poolExists) {
            toast.error("This pool does not exist");
            return;
        }

        // Add a loading toast to improve user feedback
        toast.loading("Preparing to contribute ETH...", { id: "stake" });

        // Use a timeout to ensure the transaction is prepared
        setTimeout(() => {
            if (deposit) {
                // Deposit is successful - we'll show our own toast from the useEffect handler
                // and avoid duplicate toasts
                deposit();
                toast.dismiss("stake");
            } else {
                toast.error("Failed to prepare transaction. Please try again.", { id: "stake" });
            }
        }, 1000); // Increased timeout to give usePrepareContractWrite enough time
    };

    // Real-time yield calculation is now used instead of manual distributeYield calls

    const handleWithdrawYield = (index) => {
        // Calculate the real-time yield for this deposit using the same logic as in the render function
        const deposit = deposits?.[index];
        if (!deposit) {
            toast.error("Deposit not found.");
            return;
        }

        // Calculate this deposit's share of the total yield based on its proportion
        const depositYield = availableContributorYield && deposits.length > 0 ?
            BigInt(availableContributorYield.toString()) *
            BigInt(deposit.amount.toString()) *
            BigInt(ALLOCATION_PERCENTAGE_BASE - Number(deposit.allocation)) /
            (deposits.reduce((sum, d) =>
                sum + (BigInt(d.amount.toString()) * BigInt(ALLOCATION_PERCENTAGE_BASE - Number(d.allocation))),
                BigInt(0)
            ) || BigInt(1))
            : BigInt(deposit.yield.toString());

        if (!depositYield || depositYield <= 0) {
            toast.error("This deposit doesn't have any yield to withdraw.");
            return;
        }

        // Set the index being processed
        setWithdrawingYieldIndex(index);

        // Create a persistent toast that will be updated
        toast.loading("Preparing to withdraw yield...", { id: "withdraw-yield", duration: 15000 });

        console.log(`Attempting direct yield withdrawal with index ${index} and pool address ${poolAddress}`);

        try {
            // Call the contract directly with writeContract
            writeContract({
                address: poolAddress,
                abi: PoolABI,
                functionName: 'withdrawYield',
                args: [index],
            }).then(result => {
                console.log("Yield withdrawal transaction submitted:", result);
                toast.success("Yield withdrawal initiated successfully!", { id: "withdraw-yield" });

                // Refetch data after successful submission
                setTimeout(() => {
                    refetchDeposits();
                }, 2000);
            }).catch(err => {
                console.error("Error in direct yield withdrawal:", err);

                // Handle user rejections with a clean message
                if (err.message && (
                    err.message.includes("User rejected") ||
                    err.message.includes("user rejected") ||
                    err.message.includes("UserRejectedRequestError")
                )) {
                    toast.dismiss("withdraw-yield");
                    toast.error("Transaction cancelled", { id: "withdraw-yield-cancel" });
                } else {
                    // Show a generic error for other issues
                    toast.error("Yield withdrawal failed. Please try again later.", { id: "withdraw-yield" });
                }

                setWithdrawingYieldIndex(null);
            });
        } catch (err) {
            console.error("Error setting up yield withdrawal:", err);

            // Handle setup errors with a user-friendly message
            toast.error("Failed to set up yield withdrawal. Please try again.", { id: "withdraw-yield" });
            setWithdrawingYieldIndex(null);
        }
    };

    const handleWithdrawPrincipal = (index) => {
        if (!deposits?.[index] || deposits[index].amount <= 0) {
            toast.error("This deposit doesn't have any principal to withdraw.");
            return;
        }

        // Set the index being processed
        setWithdrawingPrincipalIndex(index);

        // Create a persistent toast that will be updated
        toast.loading("Preparing to withdraw principal...", { id: "withdraw-principal", duration: 15000 });

        console.log(`Attempting direct withdrawal with index ${index} and pool address ${poolAddress}`);

        try {
            // Call the contract directly with writeContract
            writeContract({
                address: poolAddress,
                abi: PoolABI,
                functionName: 'withdrawPrincipal',
                args: [index],
            }).then(result => {
                console.log("Withdrawal transaction submitted:", result);
                toast.success("Principal withdrawal initiated successfully!", { id: "withdraw-principal" });

                // Refetch data after successful submission
                setTimeout(() => {
                    refetchDeposits();
                    refetchTotalStaked();
                }, 2000);
            }).catch(err => {
                console.error("Error in direct contract write:", err);

                // Handle user rejections with a clean message
                if (err.message && (
                    err.message.includes("User rejected") ||
                    err.message.includes("user rejected") ||
                    err.message.includes("UserRejectedRequestError")
                )) {
                    toast.dismiss("withdraw-principal");
                    toast.error("Transaction cancelled", { id: "withdraw-principal-cancel" });
                } else {
                    // Show a generic error for other issues
                    toast.error("Withdrawal failed. Please try again later.", { id: "withdraw-principal" });
                }

                setWithdrawingPrincipalIndex(null);
            });
        } catch (err) {
            console.error("Error setting up withdrawal:", err);

            // Handle setup errors with a user-friendly message
            toast.error("Failed to set up withdrawal. Please try again.", { id: "withdraw-principal" });
            setWithdrawingPrincipalIndex(null);
        }
    };

    if (!poolExists && poolAddress !== undefined) {
        return (
            <div className="container mx-auto px-4 py-8 text-center">
                <h1 className="text-2xl font-bold text-white mb-4">Pool Not Found</h1>
                <p className="text-gray-300 mb-6">The pool you're looking for doesn't exist.</p>
                <button
                    onClick={() => navigate('/pools')}
                    className="bg-gradient-to-r from-gradient-blue to-gradient-pink text-white font-bold py-2 px-4 rounded-md transition-transform hover:scale-105"
                >
                    View All Pools
                </button>
            </div>
        );
    }

    return (
        <>
            <div className="container mx-auto px-4 py-8 min-h-screen flex flex-col bg-dark-bg">
                {/* Back Button */}
                <div className="mb-6">
                    <Link
                        to="/pools"
                        className="flex items-center text-gray-400 hover:text-gray-200 text-sm transition-colors duration-300"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
                        </svg>
                        Back to Pools
                    </Link>
                </div>

                {/* Hero Section with Pool Info */}
                <div className="bg-gradient-to-r from-blue-900/30 to-purple-900/30 rounded-xl p-8 mb-8 border border-gradient-blue/20 shadow-lg">
                    <div className="flex flex-col md:flex-row justify-between items-center mb-6">
                        <div>
                            <h1 className="text-4xl font-bold text-white font-afacad mb-2">
                                {loadingPoolName ? (
                                    <div className="h-10 w-48 bg-gray-700/50 animate-pulse rounded"></div>
                                ) : (
                                    poolName ? poolName : `Pool #${poolId}`
                                )}
                            </h1>
                            {poolOwner && (
                                <p className="text-gray-400 font-afacad flex items-center">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" viewBox="0 0 20 20" fill="currentColor">
                                        <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                                    </svg>
                                    Managed by: {poolOwner.slice(0, 6)}...{poolOwner.slice(-4)}
                                </p>
                            )}
                        </div>
                        {isOwner && (
                            <div className="mt-4 md:mt-0">
                                <span className="bg-gradient-to-r from-blue-600/50 to-purple-600/50 text-white px-4 py-2 rounded-full text-sm font-afacad">
                                    You are the pool owner
                                </span>
                            </div>
                        )}
                    </div>

                    {/* Key Metrics Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
                        <div className="bg-dark-bg/60 p-6 rounded-lg border border-blue-500/20 flex flex-col items-center justify-center transition-transform hover:scale-105 duration-300">
                            <div className="text-blue-400 mb-2">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" viewBox="0 0 20 20" fill="currentColor">
                                    <path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z" />
                                    <path fillRule="evenodd" d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm0 10a1 1 0 011 1v1h1a1 1 0 110 2H6v1a1 1 0 11-2 0v-1H3a1 1 0 110-2h1v-1a1 1 0 011-1zm0-10a1 1 0 100 2h1a1 1 0 100-2H4z" clipRule="evenodd" />
                                </svg>
                            </div>
                            <p className="text-gray-300 font-afacad text-lg">Total Contributions</p>
                            <p className="text-3xl font-bold text-gradient-blue font-afacad mt-2">
                                {isLoadingTotalStaked ? (
                                    <div className="h-8 w-24 bg-gray-700/50 animate-pulse rounded"></div>
                                ) : (
                                    <span className="flex items-center">
                                        {formatEth(totalStaked || '0')}
                                        <EthereumLogo className="h-6 w-6 ml-1" />
                                    </span>
                                )}
                            </p>
                        </div>

                        <div className="bg-dark-bg/60 p-6 rounded-lg border border-green-500/20 flex flex-col items-center justify-center transition-transform hover:scale-105 duration-300">
                            <div className="text-green-400 mb-2">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M12 7a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0V8.414l-4.293 4.293a1 1 0 01-1.414 0L8 10.414l-4.293 4.293a1 1 0 01-1.414-1.414l5-5a1 1 0 011.414 0L11 10.586 14.586 7H12z" clipRule="evenodd" />
                                </svg>
                            </div>
                            <p className="text-gray-300 font-afacad text-lg">Total Pool Yield</p>
                            <p className="text-3xl font-bold text-gradient-green font-afacad mt-2">
                                {isLoadingBountyYield || isLoadingContributorYield ? (
                                    <div className="h-8 w-24 bg-gray-700/50 animate-pulse rounded"></div>
                                ) : (
                                    <span className="flex items-center">
                                        {formatEth(totalPoolYield)}
                                        <EthereumLogo className="h-6 w-6 ml-1" />
                                    </span>
                                )}
                            </p>
                        </div>

                        <div className="bg-dark-bg/60 p-6 rounded-lg border border-pink-500/20 flex flex-col items-center justify-center transition-transform hover:scale-105 duration-300">
                            <div className="text-pink-400 mb-2">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M5 2a1 1 0 011 1v1h1a1 1 0 010 2H6v1a1 1 0 01-2 0V6H3a1 1 0 010-2h1V3a1 1 0 011-1zm0 10a1 1 0 10-2 0v.092a4.535 4.535 0 00-1.676.662C6.602 6.234 6 7.009 6 8c0 .99.602 1.765 1.324 2.246.48.32 1.054.545 1.676.662v1.941c-.391-.127-.68-.317-.843-.504a1 1 0 10-1.51 1.31c.562.649 1.413 1.076 2.353 1.253V15a1 1 0 102 0v-.092a4.535 4.535 0 001.676-.662C13.398 13.766 14 12.991 14 12c0-.99-.602-1.765-1.324-2.246A4.535 4.535 0 0011 9.092V7.151c.391.127.68.317.843.504a1 1 0 101.511-1.31c-.563-.649-1.413-1.076-2.354-1.253V5z" clipRule="evenodd" />
                                </svg>
                            </div>
                            <p className="text-gray-300 font-afacad text-lg">Bounty Yield</p>
                            <p className="text-3xl font-bold text-gradient-pink font-afacad mt-2">
                                {isLoadingBountyYield ? (
                                    <div className="h-8 w-24 bg-gray-700/50 animate-pulse rounded"></div>
                                ) : (
                                    <span className="flex items-center">
                                        {formatEth(bountyYield || '0')}
                                        <EthereumLogo className="h-6 w-6 ml-1" />
                                    </span>
                                )}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex justify-center mb-8">
                    <div className="bg-dark-bg/80 rounded-full p-1 flex border border-gray-700/50 shadow-lg">
                        <button
                            className={`py-2 px-6 rounded-full transition-all duration-300 ${activeTab === 'contribute'
                                ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg'
                                : 'text-gray-400 hover:text-white hover:bg-gray-800/50'}`}
                            onClick={() => handleTabChange('contribute')}
                        >
                            <div className="flex items-center">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" viewBox="0 0 20 20" fill="currentColor">
                                    <path d="M8.433 7.418c.155-.103.346-.196.567-.267v1.698a2.305 2.305 0 01-.567-.267C8.07 8.34 8 8.114 8 8c0-.114.07-.34.433-.582zM11 12.849v-1.698c.22.071.412.164.567.267.364.243.433.468.433.582 0 .114-.07.34-.433.582a2.305 2.305 0 01-.567.267z" />
                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a1 1 0 10-2 0v.092a4.535 4.535 0 00-1.676.662C6.602 6.234 6 7.009 6 8c0 .99.602 1.765 1.324 2.246.48.32 1.054.545 1.676.662v1.941c-.391-.127-.68-.317-.843-.504a1 1 0 10-1.51 1.31c.562.649 1.413 1.076 2.353 1.253V15a1 1 0 102 0v-.092a4.535 4.535 0 001.676-.662C13.398 13.766 14 12.991 14 12c0-.99-.602-1.765-1.324-2.246A4.535 4.535 0 0011 9.092V7.151c.391.127.68.317.843.504a1 1 0 101.511-1.31c-.563-.649-1.413-1.076-2.354-1.253V5z" clipRule="evenodd" />
                                </svg>
                                Contribute
                            </div>
                        </button>
                        <button
                            className={`py-2 px-6 rounded-full transition-all duration-300 ${activeTab === 'bounties'
                                ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg'
                                : 'text-gray-400 hover:text-white hover:bg-gray-800/50'}`}
                            onClick={() => handleTabChange('bounties')}
                        >
                            <div className="flex items-center">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M5 2a1 1 0 011 1v1h1a1 1 0 010 2H6v1a1 1 0 01-2 0V6H3a1 1 0 010-2h1V3a1 1 0 011-1zm0 10a1 1 0 011 1v1h1a1 1 0 110 2H6v1a1 1 0 11-2 0v-1H3a1 1 0 110-2h1v-1a1 1 0 011-1zM12 2a1 1 0 01.967.744L14.146 7.2 17.5 9.134a1 1 0 010 1.732l-3.354 1.935-1.18 4.455a1 1 0 01-1.933 0L9.854 12.8 6.5 10.866a1 1 0 010-1.732l3.354-1.935 1.18-4.455A1 1 0 0112 2z" clipRule="evenodd" />
                                </svg>
                                Bounties
                            </div>
                        </button>
                        <button
                            className={`py-2 px-6 rounded-full transition-all duration-300 ${activeTab === 'leaderboard'
                                ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg'
                                : 'text-gray-400 hover:text-white hover:bg-gray-800/50'}`}
                            onClick={() => handleTabChange('leaderboard')}
                        >
                            <div className="flex items-center">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" viewBox="0 0 20 20" fill="currentColor">
                                    <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
                                </svg>
                                Leaderboard
                            </div>
                        </button>
                    </div>
                </div>

                {/* Contribute Tab Content */}
                <div className="tab-content">
                    {activeTab === 'contribute' && (
                        <div className="max-w-6xl mx-auto">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                {/* Contribute Panel */}
                                <div className="bg-gradient-to-b from-dark-bg/80 to-gray-900/40 rounded-xl p-8 border border-blue-500/20 shadow-xl">
                                    <div className="mb-6">
                                        <h2 className="text-2xl font-bold text-white font-afacad">Contribute ETH</h2>
                                    </div>

                                    <div className="space-y-6">
                                        <div>
                                            <label htmlFor="amount" className="block text-gray-300 mb-2 font-afacad text-lg">Amount (ETH)</label>
                                            <div className="relative">
                                                <input
                                                    type="text"
                                                    id="amount"
                                                    value={amount}
                                                    onChange={handleAmountChange}
                                                    className="w-full bg-gray-800/80 text-white p-4 rounded-lg border border-gray-700/50 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none font-afacad text-lg transition-all duration-300"
                                                    placeholder="0.1"
                                                />
                                                <div className="absolute inset-y-0 right-0 flex items-center pr-4 pointer-events-none">
                                                    <span className="text-gray-400 font-afacad bg-gray-800/80 py-1 px-2 rounded flex items-center">
                                                        <EthereumLogo className="h-4 w-4" />
                                                    </span>
                                                </div>
                                            </div>
                                            <p className="text-gray-400 text-sm mt-1 font-afacad">
                                                Enter the amount of ETH you want to contribute to this pool
                                            </p>
                                        </div>

                                        <div className="bg-gray-800/30 p-6 rounded-lg border border-gray-700/50">
                                            <div className="flex justify-between items-center mb-4">
                                                <label className="text-gray-300 font-afacad text-lg">Yield Allocation</label>
                                                <span className="bg-gradient-to-r from-blue-600/70 to-purple-600/70 text-white px-3 py-1 rounded-full text-sm font-medium">
                                                    {formatAllocationPercent(BigInt(yieldAllocation) * 10n ** 16n)}% to Bounties
                                                </span>
                                            </div>

                                            <div className="mb-6 relative">
                                                {/* Track background */}
                                                <div className="w-full h-2 bg-gray-700/70 rounded-full"></div>

                                                {/* Colored progress track */}
                                                <div
                                                    className="absolute top-0 h-2 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full"
                                                    style={{ width: `${(yieldAllocation - 25) / 75 * 100}%` }}
                                                ></div>

                                                {/* Slider thumb */}
                                                <div
                                                    className="absolute top-0 w-5 h-5 bg-white rounded-full shadow-md transform -translate-y-1.5 cursor-pointer"
                                                    style={{ left: `calc(${(yieldAllocation - 25) / 75 * 100}% - 10px)` }}
                                                ></div>

                                                {/* Actual range input - invisible but handles interactions */}
                                                <input
                                                    type="range"
                                                    min="25"
                                                    max="100"
                                                    value={yieldAllocation}
                                                    onChange={handleSliderChange}
                                                    className="absolute top-0 w-full h-5 opacity-0 cursor-pointer z-10"
                                                />
                                            </div>

                                            {/* Percentage indicators */}
                                            <div className="flex justify-between text-xs text-gray-400 mb-4">
                                                <span>25%</span>
                                                <span>50%</span>
                                                <span>75%</span>
                                                <span>100%</span>
                                            </div>

                                            <div className="flex items-start space-x-2 bg-blue-900/20 p-3 rounded-lg border border-blue-500/20">
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-400 mt-0.5 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                                                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                                                </svg>
                                                <p className="text-sm text-gray-300 font-afacad">
                                                    <span className="text-blue-400 font-medium">{formatAllocationPercent(BigInt(yieldAllocation) * 10n ** 16n)}</span> of your yield will fund bounties, and you'll receive <span className="text-green-400 font-medium">{formatAllocationPercent(BigInt(100 - yieldAllocation) * 10n ** 16n)}</span> personally.
                                                </p>
                                            </div>
                                        </div>

                                        <div className="mt-8">
                                            <button
                                                onClick={handleStake}
                                                disabled={!amount || isDepositing || !isConnected}
                                                className={`w-full py-4 px-6 rounded-lg font-medium font-afacad text-lg transition-all duration-300 ${!amount || isDepositing || !isConnected
                                                    ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                                                    : 'bg-gradient-to-r from-blue-600 to-purple-600 text-white hover:from-blue-700 hover:to-purple-700 hover:shadow-lg transform hover:-translate-y-1'
                                                    }`}
                                            >
                                                {isDepositing ? (
                                                    <div className="flex items-center justify-center">
                                                        <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                        </svg>
                                                        Processing...
                                                    </div>
                                                ) : (
                                                    <span className="flex items-center justify-center">
                                                        Contribute
                                                        <EthereumLogo className="h-5 w-5 ml-2" />
                                                    </span>
                                                )}
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {/* Deposits Panel */}
                                <div className="bg-gradient-to-b from-dark-bg/80 to-gray-900/40 rounded-xl p-8 border border-purple-500/20 shadow-xl h-full flex flex-col">
                                    <div className="mb-6">
                                        <h2 className="text-2xl font-bold text-white font-afacad">Your Deposits</h2>
                                    </div>

                                    {!isConnected ? (
                                        <div className="text-center py-8 my-auto">
                                            <p className="text-gray-300 font-afacad">Connect wallet to view your deposits</p>
                                        </div>
                                    ) : isLoadingDeposits ? (
                                        <div className="text-center py-8 my-auto">
                                            <div className="inline-block w-12 h-12 border-4 border-purple-400 border-t-purple-200 rounded-full animate-spin"></div>
                                            <p className="mt-4 text-gray-300 font-afacad">Loading your deposits...</p>
                                        </div>
                                    ) : deposits?.length === 0 ? (
                                        <div className="text-center py-8 my-auto">
                                            <p className="text-gray-300 font-afacad">You don't have any deposits yet</p>
                                        </div>
                                    ) : (
                                        <div className="overflow-y-auto max-h-[400px] pr-2 custom-scrollbar">
                                            {deposits?.map((deposit, index) => {
                                                // Calculate this deposit's share of the total yield based on its proportion
                                                const depositYield = isLoadingContributorYield ? null :
                                                    availableContributorYield && deposits.length > 0 ?
                                                        BigInt(availableContributorYield.toString()) *
                                                        BigInt(deposit.amount.toString()) *
                                                        BigInt(ALLOCATION_PERCENTAGE_BASE - Number(deposit.allocation)) /
                                                        (deposits.reduce((sum, d) =>
                                                            sum + (BigInt(d.amount.toString()) * BigInt(ALLOCATION_PERCENTAGE_BASE - Number(d.allocation))),
                                                            BigInt(0)
                                                        ) || BigInt(1))
                                                        : BigInt(deposit.yield.toString());

                                                return (
                                                    <div key={index} className="mb-4 p-4 bg-dark-bg/60 rounded-lg border border-purple-500/20 hover:border-purple-500/40 transition-all duration-300 shadow-md">
                                                        <div className="flex justify-between items-center mb-3">
                                                            <div className="flex items-center">
                                                                <div className="bg-purple-500/20 p-2 rounded-full mr-3">
                                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-purple-400" viewBox="0 0 20 20" fill="currentColor">
                                                                        <path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z" />
                                                                        <path fillRule="evenodd" d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm0 10a1 1 0 011 1v1h1a1 1 0 110 2H6v1a1 1 0 11-2 0v-1H3a1 1 0 110-2h1v-1a1 1 0 011-1zM12 2a1 1 0 01.967.744L14.146 7.2 17.5 9.134a1 1 0 010 1.732l-3.354 1.935-1.18 4.455a1 1 0 01-1.933 0L9.854 12.8 6.5 10.866a1 1 0 010-1.732l3.354-1.935 1.18-4.455A1 1 0 0112 2z" clipRule="evenodd" />
                                                                    </svg>
                                                                </div>
                                                                <p className="font-medium text-white font-afacad text-lg">
                                                                    <span className="flex items-center">
                                                                        {formatEth(deposit.amount)}
                                                                        <EthereumLogo className="h-4 w-4 ml-1" />
                                                                    </span>
                                                                </p>
                                                            </div>
                                                            <div className="bg-gradient-to-r from-blue-500/20 to-purple-500/20 py-1 px-3 rounded-full">
                                                                <p className="text-sm text-white font-afacad">
                                                                    {formatAllocationPercent(deposit.allocation)}% to bounties
                                                                </p>
                                                            </div>
                                                        </div>

                                                        <div className="grid grid-cols-2 gap-4 mb-4">
                                                            <div className="bg-dark-bg/40 p-3 rounded-lg border border-blue-500/10">
                                                                <p className="text-xs text-gray-400 font-afacad mb-1">Yield Earned</p>
                                                                <div className="flex items-center">
                                                                    <div className="bg-green-500/20 p-1 rounded-full mr-2">
                                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                                                                            <path fillRule="evenodd" d="M12 7a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0V8.414l-4.293 4.293a1 1 0 01-1.414 0L8 10.414l-4.293 4.293a1 1 0 01-1.414-1.414l5-5a1 1 0 011.414 0L11 10.586 14.586 7H12z" clipRule="evenodd" />
                                                                        </svg>
                                                                    </div>
                                                                    <p className="text-gradient-green font-medium font-afacad">
                                                                        {isLoadingContributorYield ? 'Loading...' : (
                                                                            <span className="flex items-center">
                                                                                {formatEth(depositYield)}
                                                                                <EthereumLogo className="h-4 w-4 ml-1" />
                                                                            </span>
                                                                        )}
                                                                    </p>
                                                                </div>
                                                            </div>

                                                            <div className="bg-dark-bg/40 p-3 rounded-lg border border-blue-500/10">
                                                                <p className="text-xs text-gray-400 font-afacad mb-1">Deposit Date</p>
                                                                <div className="flex items-center">
                                                                    <div className="bg-blue-500/20 p-1 rounded-full mr-2">
                                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                                                                            <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1h16V6a2 2 0 00-2-2H4a2 2 0 00-2 2v12a2 2 0 002 2h14a2 2 0 002-2V7a1 1 0 00-1-1zm0 3a1 1 0 000 2h14a1 1 0 100-2H6z" clipRule="evenodd" />
                                                                        </svg>
                                                                    </div>
                                                                    <p className="text-gray-300 font-afacad">
                                                                        {formatDate(deposit.timestamp)}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                        </div>

                                                        <div className="flex gap-3 mt-4">
                                                            <button
                                                                onClick={() => handleWithdrawYield(index)}
                                                                disabled={(!depositYield || depositYield <= 0) || isWithdrawingYield}
                                                                className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium font-afacad transition-all duration-300 flex items-center justify-center ${(!depositYield || depositYield <= 0) || isWithdrawingYield
                                                                    ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                                                                    : 'bg-gradient-to-r from-blue-600/80 to-purple-600/80 text-white hover:from-blue-700 hover:to-purple-700 hover:shadow-md'
                                                                    }`}
                                                            >
                                                                {isWithdrawingYield && withdrawingYieldIndex === index ? (
                                                                    <>
                                                                        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                                        </svg>
                                                                        Processing...
                                                                    </>
                                                                ) : (
                                                                    <>
                                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" viewBox="0 0 20 20" fill="currentColor">
                                                                            <path fillRule="evenodd" d="M12 7a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0V8.414l-4.293 4.293a1 1 0 01-1.414 0L8 10.414l-4.293 4.293a1 1 0 01-1.414-1.414l5-5a1 1 0 011.414 0L11 10.586 14.586 7H12z" clipRule="evenodd" />
                                                                        </svg>
                                                                        Withdraw Yield
                                                                    </>
                                                                )}
                                                            </button>

                                                            <button
                                                                onClick={() => handleWithdrawPrincipal(index)}
                                                                disabled={!deposit.amount || isWithdrawingPrincipal}
                                                                className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium font-afacad transition-all duration-300 flex items-center justify-center ${!deposit.amount || isWithdrawingPrincipal
                                                                    ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                                                                    : 'bg-gradient-to-r from-pink-600/80 to-purple-600/80 text-white hover:from-pink-700 hover:to-purple-700 hover:shadow-md'
                                                                    }`}
                                                            >
                                                                {isWithdrawingPrincipal && withdrawingPrincipalIndex === index ? (
                                                                    <>
                                                                        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                                        </svg>
                                                                        Processing...
                                                                    </>
                                                                ) : (
                                                                    <>
                                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" viewBox="0 0 20 20" fill="currentColor">
                                                                            <path fillRule="evenodd" d="M4 4a2 2 0 00-2 2v4a2 2 0 002 2V6h10a2 2 0 00-2-2H4zm2 6a2 2 0 012-2h8a2 2 0 012 2v4a2 2 0 01-2 2H8a2 2 0 01-2-2v-4zm6 4a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                                                                        </svg>
                                                                        Withdraw Principal
                                                                    </>
                                                                )}
                                                            </button>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Bounties Tab Content */}
                    {activeTab === 'bounties' && (
                        <div className="max-w-6xl mx-auto">
                            <div className="mb-6 flex justify-between items-center">
                                <div>
                                    {/* "Pool Bounties" heading removed */}
                                </div>

                                {isOwner && (
                                    <Link
                                        to={`/create-bounty?poolId=${poolId}`}
                                        className="bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-700 hover:to-purple-700 text-white py-2 px-6 rounded-full font-medium transition-all duration-300 flex items-center shadow-lg hover:shadow-xl transform hover:-translate-y-1"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                                            <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                                        </svg>
                                        Create New Bounty
                                    </Link>
                                )}
                            </div>

                            {/* Bounties content */}
                            {!isConnected ? (
                                <div className="text-center py-12 flex flex-col items-center justify-center h-64 bg-gradient-to-b from-dark-bg/80 to-gray-900/40 rounded-xl border border-gray-700/50 shadow-lg">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-gray-600 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                    </svg>
                                    <p className="text-gray-300 font-afacad text-lg mb-2">Connect your wallet to view bounties</p>
                                    <p className="text-gray-400 font-afacad text-sm max-w-md">Connect your wallet to see available bounties and participate in this pool's ecosystem</p>
                                </div>
                            ) : loadingBounties ? (
                                <div className="text-center py-12 flex flex-col items-center justify-center h-64 bg-gradient-to-b from-dark-bg/80 to-gray-900/40 rounded-xl border border-gray-700/50 shadow-lg">
                                    <div className="inline-block w-16 h-16 border-4 border-pink-500/50 border-t-pink-300 rounded-full animate-spin mb-4"></div>
                                    <p className="text-gray-300 font-afacad text-lg">Loading bounties...</p>
                                </div>
                            ) : bountiesError ? (
                                <div className="text-center py-12 flex flex-col items-center justify-center h-64 bg-gradient-to-b from-dark-bg/80 to-gray-900/40 rounded-xl border border-red-500/30 shadow-lg">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-red-500/70 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    <p className="text-red-400 font-afacad text-lg mb-2">Error Loading Bounties</p>
                                    <p className="text-red-300/70 font-afacad text-sm max-w-md">{bountiesError}</p>
                                </div>
                            ) : bounties?.length > 0 ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                    {bounties.map((bounty) => (
                                        <BountyCard
                                            key={bounty.id}
                                            bounty={bounty}
                                            poolOwner={poolOwner}
                                        />
                                    ))}
                                </div>
                            ) : (
                                <div className="py-12 flex flex-col items-center justify-center h-64 bg-gradient-to-b from-dark-bg/80 to-gray-900/40 rounded-xl border border-pink-500/20 shadow-lg text-center">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-pink-500/50 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                                    </svg>
                                    <p className="text-white text-lg font-afacad mb-2">No bounties available yet</p>
                                    {isOwner ? (
                                        <>
                                            <p className="text-gray-300 mb-4 font-afacad">Create bounties!</p>
                                            <Link
                                                to={`/create-bounty?poolId=${poolId}`}
                                                className="bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-700 hover:to-purple-700 text-white py-2 px-6 rounded-full font-medium transition-all duration-300 flex items-center shadow-md hover:shadow-lg inline-flex"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                                                    <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                                                </svg>
                                                Create First Bounty
                                            </Link>
                                        </>
                                    ) : (
                                        <p className="text-gray-300 font-afacad max-w-md mx-auto">
                                            The pool owner hasn't created any bounties yet. Check back soon or contribute to the pool to help it grow!
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Leaderboard Tab Content */}
                    {activeTab === 'leaderboard' && (
                        <div className="mt-8 max-w-6xl mx-auto">
                            <div className="flex items-center justify-center mb-8">
                                {/* "Pool Leaderboard" heading removed */}
                            </div>
                            <div className="bg-gradient-to-b from-dark-bg/80 to-gray-900/40 rounded-xl p-6 border border-blue-500/20 shadow-xl">
                                <Leaderboard poolId={poolId} />
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </>
    );
};

export default Pool;