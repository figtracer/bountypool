import { useContractRead, useContractWrite, usePrepareContractWrite, useAccount, useBalance, useWaitForTransaction } from 'wagmi';
import { readContract, writeContract, getAccount } from 'wagmi/actions';
import { CONTRACTS } from '../utils/contracts';
import { toWei } from '../utils/helpers';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { decodeErrorResult, parseEther } from 'viem';
import { createPublicClient, http } from 'viem';
import { sepolia } from 'viem/chains';
import { toast } from 'react-hot-toast';

// Import the ABIs
import { PoolABI, BountyManagerABI, PoolFactoryABI } from '../utils/ContractABIs';

// Define the ABI object for use in the hooks
const ABI = {
    Pool: PoolABI,
    BountyManager: BountyManagerABI,
    PoolFactory: PoolFactoryABI
};

// PoolFactory hooks
export function useCreatePool(poolId, poolName, imageUrl) {
    const [preparationError, setPreparationError] = useState(null);
    const [errorDetails, setErrorDetails] = useState(null);

    // Use hardcoded fee instead of fetching from contract
    const fee = parseEther("0.02");

    // Make sure the inputs are valid
    const validPoolId = useMemo(() => {
        if (poolId === undefined || poolId === null) return BigInt(0);
        if (typeof poolId === 'bigint') return poolId;
        return BigInt(poolId.toString());
    }, [poolId]);

    const validPoolName = useMemo(() => poolName || '', [poolName]);

    // Ensure imageUrl is handled properly
    const validImageUrl = useMemo(() => {
        console.log('useCreatePool received imageUrl:', imageUrl);
        // Ensure we have a string value
        return imageUrl || '';
    }, [imageUrl]);

    const { config, error: prepareError } = usePrepareContractWrite({
        ...CONTRACTS.poolFactory,
        functionName: 'createPool',
        args: [validPoolId, validPoolName, validImageUrl],
        enabled: Boolean(validPoolId && validPoolName),
        value: fee,
        onSuccess: (data) => {
            console.log('Contract write prepared successfully with arguments:', {
                poolId: validPoolId.toString(),
                poolName: validPoolName,
                imageUrl: validImageUrl
            });
        },
        onError: (err) => {
            // Try to decode the error for more info
            if (err?.cause?.data) {
                try {
                    const decodedError = decodeErrorResult({
                        abi: ABI.PoolFactory,
                        data: err.cause.data
                    });
                    setErrorDetails(`Decoded error: ${decodedError.errorName}`);
                } catch (decodeErr) {
                    setErrorDetails(`Failed to decode error: ${err.cause.data}`);
                }
            }

            setPreparationError(err);
        }
    });

    const contractWrite = useContractWrite({
        ...config,
        onSuccess: (data) => {
            console.log('Pool creation transaction submitted:', data.hash);
        },
        onError: (err) => {
            // Try to decode the error for more info
            if (err?.data) {
                try {
                    const decodedError = decodeErrorResult({
                        abi: ABI.PoolFactory,
                        data: err.data
                    });
                    setErrorDetails(`Decoded error: ${decodedError.errorName}`);
                } catch (decodeErr) {
                    setErrorDetails(`Raw error data: ${err.data}`);
                }
            }
        }
    });

    return {
        ...contractWrite,
        preparationError,
        errorDetails,
        fee
    };
}

export function useGetPoolCreationFee() {
    // Use state to store the locally fetched fee
    const [localFee, setLocalFee] = useState(null);
    const [isError, setIsError] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [fetchAttempts, setFetchAttempts] = useState(0);

    // Attempt to directly read the fee from the contract
    const fetchFeeDirectly = async () => {
        try {
            setIsLoading(true);
            const fee = await readContract({
                ...CONTRACTS.poolFactory,
                functionName: 'getPoolCreationFee',
                args: [],
            });

            if (fee !== undefined) {
                setLocalFee(fee);
                setIsLoading(false);
                return fee;
            } else {
                setIsError(true);
                setIsLoading(false);
                return null;
            }
        } catch (err) {
            setIsError(true);
            setIsLoading(false);
            return null;
        } finally {
            setFetchAttempts(prev => prev + 1);
        }
    };

    // Fetch fee on component mount
    useEffect(() => {
        fetchFeeDirectly();

        // Set up polling to periodically check the fee
        const interval = setInterval(() => {
            fetchFeeDirectly();
        }, 15000); // Poll every 15 seconds

        return () => clearInterval(interval);
    }, []);

    // Use wagmi's useContractRead for reactive updates
    const contractRead = useContractRead({
        ...CONTRACTS.poolFactory,
        functionName: 'getPoolCreationFee',
        args: [],
        onSuccess: (data) => {
            if (data !== undefined) {
                setLocalFee(data);
                setIsLoading(false);
            }
        },
        onError: (error) => {
            if (fetchAttempts < 3) {
                setIsError(true);
            }
        }
    });

    // Calculate the final fee value to return
    const getFinalFeeValue = () => {
        // If we have a local fee from direct fetch, use it
        if (localFee !== null && localFee !== undefined) {
            return localFee;
        }

        // Otherwise use the contract read data
        if (contractRead.data !== undefined && contractRead.data !== null) {
            return contractRead.data;
        }

        // Only use hardcoded value after multiple failed attempts
        if (isError && fetchAttempts >= 3) {
            return parseEther("0.02");
        }

        // Return null if still loading or waiting for more attempts
        return null;
    };

    const finalFee = getFinalFeeValue();

    return {
        data: finalFee,
        isLoading: isLoading && contractRead.isLoading,
        isError,
        refetch: () => {
            fetchFeeDirectly();
            contractRead.refetch?.();
        },
        rawValue: localFee || contractRead.data
    };
}

export function useIsPoolExists(poolId) {
    // Safely convert poolId to BigInt
    const safePoolId = useMemo(() => {
        if (poolId === undefined || poolId === null) return undefined;
        if (typeof poolId === 'bigint') return poolId;
        try {
            return BigInt(poolId.toString());
        } catch (err) {
            console.error("Invalid poolId in useIsPoolExists:", err);
            return undefined;
        }
    }, [poolId]);

    const queryKey = useMemo(() => ['poolExists', safePoolId?.toString()], [safePoolId]);

    const result = useContractRead({
        ...CONTRACTS.poolFactory,
        functionName: 'getPoolById',
        args: safePoolId ? [safePoolId] : undefined,
        enabled: Boolean(safePoolId),
        queryKey,
    });

    // Create a custom refetch function that includes the poolId parameter
    const refetchWithArgs = useCallback((options = {}) => {
        // If options.args is provided, use that, otherwise use the current safePoolId
        const args = options.args || (safePoolId ? [safePoolId] : undefined);

        // Only proceed if we have valid args
        if (!args || args.length === 0 || args[0] === undefined) {
            console.error("Cannot refetch without a valid poolId");
            return Promise.reject(new Error("Cannot refetch without a valid poolId"));
        }

        // Call the original refetch with the updated options
        return result.refetch({
            ...options,
            args,
        });
    }, [safePoolId, result.refetch]);

    return {
        ...result,
        refetch: refetchWithArgs,
    };
}

export function useIsPoolOwner(poolAddress) {
    const { address } = useAccount();

    return useContractRead({
        ...CONTRACTS.poolFactory,
        functionName: 'getPoolOwner',
        args: [poolAddress],
        enabled: Boolean(poolAddress && address),
        select: (data) => data === address,
    });
}

export function useGetPoolById(poolId) {
    return useContractRead({
        ...CONTRACTS.poolFactory,
        functionName: 'getPoolById',
        args: [poolId],
        enabled: Boolean(poolId),
    });
}

export function useGetPoolCount() {
    const result = useContractRead({
        ...CONTRACTS.poolFactory,
        functionName: 'getPoolCount',
    });

    console.log("Pool count query:", {
        address: CONTRACTS.poolFactory.address,
        result: result.data,
        error: result.error,
        isLoading: result.isLoading,
        isSuccess: result.isSuccess
    });

    return result;
}

// Pool hooks
export function useDeposit(poolAddress, amount, yieldAllocation) {
    const [error, setError] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    
    // Only enable the prepare hook if there's a valid amount (user is actively trying to deposit)
    const isValidAmount = Boolean(amount && parseFloat(amount) > 0);
    
    const { config, error: prepareError } = usePrepareContractWrite({
        address: poolAddress,
        abi: ABI.Pool,
        functionName: 'deposit',
        args: [yieldAllocation],
        value: amount ? toWei(amount) : '0',
        enabled: Boolean(poolAddress && isValidAmount && yieldAllocation),
        onError: (err) => {
            // Only log errors if the user is actively trying to deposit
            if (isValidAmount) {
                console.error("Deposit prepare error:", err);
                if (err.message?.includes("Function 'deposit' not found")) {
                    setError("The deposit function is not available on this contract. The ABI might be outdated.");
                } else {
                    setError("Error preparing deposit transaction.");
                }
            }
        }
    });

    useEffect(() => {
        // Only set errors if the user is actively trying to deposit
        if (prepareError && isValidAmount) {
            console.error("Prepare deposit error:", prepareError);
            setError(prepareError.message || "Error preparing deposit transaction");
        }
    }, [prepareError, isValidAmount]);

    const { write, isLoading: isWriteLoading, isSuccess, error: writeError } = useContractWrite({
        ...config,
        onMutate: () => {
            setIsLoading(true);
        },
        onSettled: () => {
            setIsLoading(false);
        },
        onError: (err) => {
            console.error("Deposit execution error:", err);
            setError(err.message || "Error executing deposit transaction. Please try again later.");
        },
        onSuccess: () => {
            setError(null);
            // Success toast is handled by the component
        }
    });

    useEffect(() => {
        if (writeError) {
            console.error("Write error:", writeError);
            setError(writeError.message || "Error depositing ETH");
        }
    }, [writeError]);

    return {
        write,
        isLoading: isLoading || isWriteLoading,
        isSuccess,
        error
    };
}

export function useGetContributorDeposits(poolAddress, address) {
    return useContractRead({
        address: poolAddress,
        abi: ABI.Pool,
        functionName: 'getContributorDeposits',
        args: [address],
        enabled: Boolean(poolAddress && address),
    });
}

export function useGetCurrentContributions(poolAddress) {
    return useContractRead({
        address: poolAddress,
        abi: ABI.Pool,
        functionName: 'getCurrentContributions',
        enabled: Boolean(poolAddress),
    });
}

export function useGetCurrentBountyYield(poolAddress) {
    return useContractRead({
        address: poolAddress,
        abi: ABI.Pool,
        functionName: 'getCurrentBountyYield',
        enabled: Boolean(poolAddress),
    });
}

export function useGetAvailableBountyYield(poolAddress) {
    return useContractRead({
        address: poolAddress,
        abi: ABI.Pool,
        functionName: 'getAvailableBountyYield',
        enabled: Boolean(poolAddress),
    });
}

/**
 * @recommended This hook provides real-time yield calculations without requiring distributeYield() calls.
 * It's the preferred method for getting contributor yield information.
 */
export function useGetAvailableContributorYield(poolAddress, address) {
    return useContractRead({
        address: poolAddress,
        abi: ABI.Pool,
        functionName: 'getAvailableContributorYield',
        args: [address],
        enabled: Boolean(poolAddress && address),
    });
}

/**
 * @deprecated This hook uses the tracked yield value which may not reflect the most up-to-date yield.
 * Use useGetAvailableContributorYield instead for real-time yield calculations.
 */
export function useGetCurrentContributorYield(poolAddress) {
    return useContractRead({
        address: poolAddress,
        abi: ABI.Pool,
        functionName: 'getCurrentContributorYield',
        enabled: Boolean(poolAddress),
    });
}

export function useWithdrawYield(poolAddress, depositIndex) {
    const [error, setError] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isPreparing, setIsPreparing] = useState(false);

    // Enhanced configuration for prepare contract write
    const { config, isError: isPrepareError, isPending: preparePending, error: prepareError } = usePrepareContractWrite({
        address: poolAddress,
        abi: ABI.Pool,
        functionName: 'withdrawYield',
        args: depositIndex !== undefined ? [depositIndex] : undefined,
        enabled: Boolean(poolAddress && depositIndex !== undefined),
        onError: (err) => {
            console.error("Withdraw yield prepare error:", err);
            setError(err.message || "Failed to prepare withdraw yield transaction");
        },
        onSettled: () => {
            setIsPreparing(false);
        }
    });

    useEffect(() => {
        if (depositIndex !== undefined && !isPreparing) {
            setIsPreparing(true);
            console.log(`Preparing to withdraw yield for deposit index: ${depositIndex}`);
        }
    }, [depositIndex, isPreparing]);

    useEffect(() => {
        if (prepareError) {
            console.error("Prepare withdraw yield error:", prepareError);

            // Format error message to be more user-friendly
            let errorMessage = prepareError.message || "Error preparing transaction";
            if (errorMessage.includes("NoYieldToWithdraw")) {
                errorMessage = "No yield to withdraw";
            } else if (errorMessage.includes("InsufficientATokenBalance")) {
                errorMessage = "Insufficient balance in the pool";
            }

            setError(errorMessage);
        }
    }, [prepareError]);

    const { write, isLoading: isWriteLoading, isSuccess, error: writeError } = useContractWrite({
        ...config,
        onMutate: () => {
            setIsLoading(true);
        },
        onSettled: () => {
            setIsLoading(false);
        },
        onError: (err) => {
            console.error("Withdraw yield execution error:", err);
            setError(err.message || "Error withdrawing yield");
        },
        onSuccess: (data) => {
            setError(null);
            console.log("Yield withdrawal transaction hash:", data.hash);
            toast.success("Yield withdrawal initiated successfully!");
        }
    });

    useEffect(() => {
        if (writeError) {
            console.error("Write error:", writeError);
            setError(writeError.message || "Error withdrawing yield");
        }
    }, [writeError]);

    // Create a more reliable write function
    const withdrawYield = useCallback(() => {
        if (!write) {
            console.error("Write function not available");
            setError("Unable to initiate withdrawal. Please try again later.");
            return;
        }

        try {
            console.log("Executing withdrawYield...");
            write();
        } catch (err) {
            console.error("Error executing withdraw yield:", err);
            setError(err.message || "Failed to execute withdraw yield");
        }
    }, [write]);

    return {
        write: withdrawYield,
        isLoading: isLoading || isWriteLoading || preparePending,
        isPreparing,
        isSuccess,
        error,
        isReady: !!write
    };
}

export function useWithdrawPrincipal(poolAddress, depositIndex) {
    const [error, setError] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isPreparing, setIsPreparing] = useState(false);

    // Enhanced configuration for prepare contract write with higher gas limit
    const { config, isError: isPrepareError, isPending: preparePending, error: prepareError } = usePrepareContractWrite({
        address: poolAddress,
        abi: ABI.Pool,
        functionName: 'withdrawPrincipal',
        args: depositIndex !== undefined ? [depositIndex] : undefined,
        enabled: Boolean(poolAddress && depositIndex !== undefined),
        onError: (err) => {
            console.error("Withdraw principal prepare error:", err);
            setError(err.message || "Failed to prepare withdraw principal transaction");
        },
        onSettled: () => {
            setIsPreparing(false);
        }
    });

    useEffect(() => {
        if (depositIndex !== undefined && !isPreparing) {
            setIsPreparing(true);
            console.log(`Preparing to withdraw principal for deposit index: ${depositIndex}`);
        }
    }, [depositIndex, isPreparing]);

    useEffect(() => {
        if (prepareError) {
            console.error("Prepare withdraw principal error:", prepareError);

            // Format error message to be more user-friendly
            let errorMessage = prepareError.message || "Error preparing transaction";
            if (errorMessage.includes("NoPrincipalToWithdraw")) {
                errorMessage = "No principal to withdraw";
            } else if (errorMessage.includes("InsufficientATokenBalance")) {
                errorMessage = "Insufficient balance in the pool";
            }

            setError(errorMessage);
        }
    }, [prepareError]);

    const { write: originalWrite, isLoading: isWriteLoading, isSuccess, error: writeError, data } = useContractWrite({
        ...config,
        onMutate: () => {
            setIsLoading(true);
        },
        onSettled: () => {
            setIsLoading(false);
        },
        onError: (err) => {
            console.error("Withdraw principal execution error:", err);
            setError(err.message || "Error withdrawing principal");
        },
        onSuccess: (data) => {
            setError(null);
            console.log("Principal withdrawal transaction hash:", data.hash);
            toast.success("Principal withdrawal initiated successfully!");
        }
    });

    useEffect(() => {
        if (writeError) {
            console.error("Write error:", writeError);
            setError(writeError.message || "Error withdrawing principal");
        }
    }, [writeError]);

    // Create a more reliable write function that tries multiple methods
    const withdrawPrincipal = useCallback(() => {
        console.log("withdrawPrincipal called with:", { poolAddress, depositIndex });

        if (!poolAddress || depositIndex === undefined) {
            console.error("Missing required parameters:", { poolAddress, depositIndex });
            setError("Cannot withdraw principal: missing pool address or deposit index");
            return false;
        }

        // Method 1: Use the prepared contract write function if available
        if (originalWrite) {
            try {
                console.log("Executing withdrawPrincipal via prepared function...");
                originalWrite();
                return true;
            } catch (err) {
                console.error("Error executing prepared withdraw principal:", err);
                // Fall through to direct method if prepared fails
            }
        }

        // Method 2: Try direct contract write
        try {
            console.log("Attempting direct contract write for withdrawPrincipal", {
                address: poolAddress,
                depositIndex
            });

            // We have to use a timeout to break out of the current execution context
            // This helps trigger the wallet UI more reliably
            setTimeout(async () => {
                try {
                    const result = await writeContract({
                        address: poolAddress,
                        abi: ABI.Pool,
                        functionName: 'withdrawPrincipal',
                        args: [depositIndex],
                    });

                    console.log("Direct contract write result:", result);
                    toast.success("Principal withdrawal initiated successfully!");
                } catch (err) {
                    console.error("Direct contract write error:", err);
                    setError(err.message || "Error directly withdrawing principal");

                    // Last resort - try once more with a delay
                    setTimeout(async () => {
                        try {
                            console.log("Final attempt at direct contract write");
                            await writeContract({
                                address: poolAddress,
                                abi: ABI.Pool,
                                functionName: 'withdrawPrincipal',
                                args: [depositIndex],
                            });
                        } catch (finalErr) {
                            console.error("Final attempt failed:", finalErr);
                        }
                    }, 500);
                }
            }, 100);

            return true;
        } catch (err) {
            console.error("Error setting up direct contract write:", err);
            setError(err.message || "Error attempting to withdraw principal");
            return false;
        }
    }, [originalWrite, poolAddress, depositIndex]);

    return {
        write: withdrawPrincipal,
        isLoading: isLoading || isWriteLoading || preparePending,
        isPreparing,
        isSuccess,
        error,
        isReady: !!poolAddress && depositIndex !== undefined
    };
}

// RepositoryManager hooks
export function useRegisterRepository(repositoryId) {
    const { address } = useAccount();

    const { config } = usePrepareContractWrite({
        ...CONTRACTS.repositoryManager,
        functionName: 'registerRepository',
        args: [repositoryId, address],
        enabled: Boolean(repositoryId && address),
    });

    return useContractWrite(config);
}

export function useIsRepositoryRegistered(repositoryId) {
    return useContractRead({
        ...CONTRACTS.repositoryManager,
        functionName: 'isRepositoryRegistered',
        args: [repositoryId],
        enabled: Boolean(repositoryId),
    });
}

export function useIsRepoOwner(repositoryId) {
    const { address } = useAccount();

    return useContractRead({
        ...CONTRACTS.repositoryManager,
        functionName: 'isRepoOwner',
        args: [address, repositoryId],
        enabled: Boolean(repositoryId && address),
    });
}

// ContributionPool hooks
export function useStakerInfo(address) {
    return useContractRead({
        ...CONTRACTS.contributionPool,
        functionName: 'stakers',
        args: [address],
        enabled: Boolean(address),
    });
}

export function useStakerDeposits(address) {
    return useContractRead({
        ...CONTRACTS.contributionPool,
        functionName: 'getStakerDeposits',
        args: [address],
        enabled: Boolean(address),
    });
}

export function useTotalStaked() {
    return useContractRead({
        ...CONTRACTS.contributionPool,
        functionName: 'totalStaked',
    });
}

export function useTotalBountyYield() {
    return useContractRead({
        ...CONTRACTS.contributionPool,
        functionName: 'totalBountyYield',
    });
}

// BountyManager hooks
export function useCreateBounty() {
    const [error, setError] = useState(null);
    const [isPrepared, setIsPrepared] = useState(false);
    const [bountyArgs, setBountyArgs] = useState(null);

    const contractWrite = useContractWrite({
        ...CONTRACTS.bountyManager,
        functionName: 'createBounty',
        onError: (err) => {
            console.error("Create bounty error:", err);
            setError(err.message || "Unknown error");
        }
    });

    // Function to prepare the transaction
    const prepareCreateBounty = useCallback(async (args) => {
        if (!args || args.length !== 5) {
            console.error("Invalid args for createBounty:", args);
            setError("Invalid arguments for createBounty");
            return;
        }

        try {
            setBountyArgs(args);
            setIsPrepared(true);
            console.log("Bounty creation prepared with args:", args);
        } catch (err) {
            console.error("Error preparing bounty creation:", err);
            setError(err.message || "Failed to prepare transaction");
            setIsPrepared(false);
        }
    }, []);

    // Execute the prepared transaction
    const executeCreateBounty = useCallback(() => {
        if (!isPrepared || !bountyArgs) {
            console.error("Bounty creation not prepared");
            return;
        }

        try {
            console.log("Executing prepared bounty creation...");
            contractWrite.write({ args: bountyArgs });
        } catch (err) {
            console.error("Error executing bounty creation:", err);
            setError(err.message || "Failed to execute transaction");
        }
    }, [isPrepared, bountyArgs, contractWrite]);

    return {
        ...contractWrite,
        prepareCreateBounty,
        executeCreateBounty,
        error,
        isPrepared
    };
}


export function useApproveSolution(bountyId) {
    const [error, setError] = useState(null);
    const [isPrepared, setIsPrepared] = useState(false);
    const [shouldPrepare, setShouldPrepare] = useState(false);
    const [isApproving, setIsApproving] = useState(false);
    const [isDistributing, setIsDistributing] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);
    const [poolId, setPoolId] = useState(null);

    // Get the pool ID for the bounty
    useEffect(() => {
        if (bountyId) {
            const fetchPoolId = async () => {
                try {
                    const poolId = await readContract({
                        ...CONTRACTS.bountyManager,
                        functionName: 'getBountyPoolId',
                        args: [bountyId],
                    });
                    setPoolId(poolId);
                } catch (err) {
                    console.error("Error fetching bounty pool ID:", err);
                }
            };
            fetchPoolId();
        }
    }, [bountyId]);

    // Only enable the preparation when specifically requested
    const { config, error: prepareError } = usePrepareContractWrite({
        ...CONTRACTS.bountyManager,
        functionName: 'approveSolution',
        args: [bountyId],
        enabled: Boolean(bountyId && shouldPrepare),
        onError: (err) => {
            console.error("Approve solution prepare error:", err);
            setError(err.message || "Error preparing approveSolution transaction");
            setIsPrepared(false);
            setIsApproving(false);
        },
        onSuccess: () => {
            setIsPrepared(true);
        }
    });

    useEffect(() => {
        if (prepareError) {
            setError(prepareError.message || "Error preparing approveSolution transaction");
            setIsApproving(false);
        }
    }, [prepareError]);

    const write = useContractWrite({
        ...config,
        onError: (err) => {
            console.error("Approve solution error:", err);
            setError(err.message || "Error executing approveSolution transaction");
            setIsApproving(false);
        },
        onSuccess: (data) => {
            console.log("Approve solution transaction submitted:", data.hash);
            setError(null);

            // Set success state immediately since transaction was submitted
            setIsSuccess(true);

            // Dispatch event to trigger UI updates
            const event = new CustomEvent('refreshBounties', {
                detail: { bountyId }
            });
            window.dispatchEvent(event);

            // Complete the approving process
            setIsApproving(false);
        }
    });

    // Function to directly approve solution
    const approveDirectly = () => {
        if (isApproving) {
            console.log("Approval already in progress");
            return;
        }

        // Reset error state
        setError(null);

        // Set flags
        setIsApproving(true);
        setShouldPrepare(true);

        // Show toast notification
        toast.loading("Preparing to approve solution...", { id: "approveSolution" });

        // Then check if we can write after a small delay to allow preparation
        setTimeout(() => {
            if (write?.write) {
                write.write();
                toast.loading("Transaction pending...", { id: "approveSolution" });
            } else {
                console.error("Cannot approve solution: preparation failed");
                setError("Failed to prepare transaction. There might be an issue with the contract.");
                setIsApproving(false);
                toast.error("Failed to prepare transaction", { id: "approveSolution" });
            }
        }, 500);
    };

    // Handle success/error toasts
    useEffect(() => {
        if (isSuccess) {
            toast.dismiss("approveSolution");
            toast.success("Solution approved successfully!");

            // Refresh the page after a delay
            setTimeout(() => {
                window.location.reload();
            }, 3000);
        }
    }, [isSuccess]);

    useEffect(() => {
        if (error && !isApproving) {
            toast.dismiss("approveSolution");

            // Format error message to be more user-friendly
            let errorMessage = error;
            if (typeof error === 'string') {
                if (error.includes('BountyManager__FailedToReleaseRewards')) {
                    errorMessage = "Failed to release rewards. The contract may not have enough ETH.";
                } else if (error.includes('BountyManager__InsufficientEscrowBalance')) {
                    errorMessage = "Cannot pay out reward: the pool needs to trigger yield distribution first or may not have enough yield. Try clicking 'Refresh Yield Distribution' and then approve again.";
                } else if (error.includes('BountyManager__NotPoolOwner')) {
                    errorMessage = "Only the pool owner can approve solutions.";
                } else if (error.includes('BountyManager__NotSolver')) {
                    errorMessage = "Only the bounty solver can perform this action.";
                } else if (error.includes('BountyPool__NotEnoughBountyYield')) {
                    errorMessage = "The pool doesn't have enough bounty yield to pay out the reward. Try clicking 'Refresh Yield Distribution' first.";
                }
            }

            toast.error(`Failed to approve solution: ${errorMessage}`);
        }
    }, [error, isApproving]);

    return {
        ...write,
        approve: approveDirectly,
        approveDirectly,
        write: approveDirectly, // To maintain compatibility with existing code
        error,
        isPrepared,
        isApproving,
        isDistributing,
        isSuccess
    };
}

export function useClaimBounty(bountyId, joinFeeAmount) {
    const [error, setError] = useState(null);
    const [isPrepared, setIsPrepared] = useState(false);
    const [isClaimInProgress, setIsClaimInProgress] = useState(false);
    const [claimSuccess, setClaimSuccess] = useState(false);
    const [shouldAttemptClaim, setShouldAttemptClaim] = useState(false);

    // Convert bountyId to a number if it's a string
    const bountyIdNumber = useMemo(() => {
        if (typeof bountyId === 'string') {
            return parseInt(bountyId, 10);
        }
        return bountyId;
    }, [bountyId]);

    // Convert joinFeeAmount to a BigInt for the value parameter
    const valueToSend = useMemo(() => {
        if (!joinFeeAmount) return BigInt(0);
        try {
            return BigInt(joinFeeAmount);
        } catch (e) {
            console.error("Error converting joinFeeAmount to BigInt:", e);
            return BigInt(0);
        }
    }, [joinFeeAmount]);

    // First, check if the bounty is open
    const { data: bountyStatus, isLoading: isLoadingStatus, refetch: refetchBountyStatus } = useContractRead({
        ...CONTRACTS.bountyManager,
        functionName: 'getBountyStatus',
        args: [bountyIdNumber],
        enabled: bountyIdNumber !== undefined && bountyIdNumber !== null,
        onError: (err) => {
            console.error("Error fetching bounty status:", err);
            setError("Failed to check bounty status");
        }
    });

    // Determine if the bounty is open (status === 0)
    const isOpen = useMemo(() => {
        return bountyStatus === 0 || bountyStatus === BigInt(0);
    }, [bountyStatus]);

    // Prepare the claim transaction
    const { config, error: prepareError } = usePrepareContractWrite({
        ...CONTRACTS.bountyManager,
        functionName: 'claimBounty',
        args: [bountyIdNumber],
        value: valueToSend,
        enabled: bountyIdNumber !== undefined && 
                valueToSend !== undefined && 
                shouldAttemptClaim && 
                isOpen,
        onError: (err) => {
            console.error("Claim bounty prepare error:", err);
            setError(err.message || "Error preparing claim transaction");
            setIsPrepared(false);
            setShouldAttemptClaim(false);
            setIsClaimInProgress(false);
        },
        onSuccess: () => {
            setIsPrepared(true);
        }
    });

    const [txHash, setTxHash] = useState(null);

    // Set up the write function
    const claimWrite = useContractWrite({
        ...config,
        onError: (err) => {
            console.error("Claim bounty error:", err);
            setError(err.message || "Error executing claim transaction");
            setClaimSuccess(false);
            setIsClaimInProgress(false);
            setShouldAttemptClaim(false);
            
            // Dismiss loading toast and show error
            toast.dismiss("claimBounty");
            toast.error(`Failed to claim bounty: ${err.message || "Unknown error"}`);
        },
        onSuccess: (data) => {
            console.log("Claim transaction sent:", data.hash);
            setError(null);
            setTxHash(data.hash); // Store the transaction hash
            
            // Dispatch event to trigger UI updates
            const event = new CustomEvent('refreshBounties', {
                detail: { bountyId: bountyIdNumber }
            });
            window.dispatchEvent(event);
            
            setClaimSuccess(true);
            setIsClaimInProgress(true); // Keep claim in progress until confirmed
            
            toast.loading("Waiting for transaction confirmation...", { id: "claimBounty" });
        }
    });

    // Add transaction confirmation hook
    const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransaction({
        hash: txHash,
        onSuccess: () => {
            // Dispatch refresh event after confirmation
            window.dispatchEvent(new CustomEvent('refreshBounties', { 
                detail: { bountyId: bountyIdNumber } 
            }));
            toast.dismiss("claimBounty");
            toast.success("Bounty claimed successfully!");
            
            // Refresh the page after a short delay
            setTimeout(() => {
                window.location.reload();
            }, 2000);
            
            setIsClaimInProgress(false);
        },
        onError: (err) => {
            console.error("Error waiting for claim confirmation:", err);
            toast.dismiss("claimBounty");
            toast.error("Failed to confirm claim transaction");
            setIsClaimInProgress(false);
        }
    });

    // Improved claim function
    const claim = async () => {
        if (!bountyId) {
            setError("Invalid bounty ID");
            return;
        }

        if (!valueToSend) {
            setError("Invalid join fee amount");
            return;
        }

        // Reset states
        setError(null);
        setClaimSuccess(false);

        // Check bounty status with retries
        let retries = 3;
        let currentStatus;
        
        while (retries > 0) {
            await refetchBountyStatus();
            currentStatus = bountyStatus;
            
            if (currentStatus === 0 || currentStatus === BigInt(0)) { // Open status
                break;
            }
            
            // If status is explicitly set to something other than OPEN
            if (currentStatus !== undefined && currentStatus !== 0 && currentStatus !== BigInt(0)) {
                const statusMessage = currentStatus === 1 || currentStatus === BigInt(1)
                    ? "This bounty has already been claimed"
                    : "This bounty is no longer open";
                setError(statusMessage);
                return;
            }
            
            retries--;
            if (retries > 0) {
                await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second between retries
            }
        }
        
        if (retries === 0 && currentStatus !== 0 && currentStatus !== BigInt(0)) {
            setError("Unable to verify bounty status after multiple attempts. Please try again.");
            return;
        }

        console.log("Claiming bounty with parameters:", {
            bountyId,
            collateralAmount: valueToSend.toString(),
            valueToSend: valueToSend.toString(),
            isOpen
        });

        // Start claim process
        toast.loading("Preparing to claim bounty...", { id: "claimBounty" });
        setIsClaimInProgress(true);
        setShouldAttemptClaim(true);

        try {
            // Wait a moment for the prepare to complete
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            if (!claimWrite || typeof claimWrite.write !== 'function') {
                console.error("Cannot claim bounty: write function not available", { claimWrite });
                setError("Transaction cannot be prepared. Please try again.");
                setShouldAttemptClaim(false);
                setIsClaimInProgress(false);
                toast.dismiss("claimBounty");
                toast.error("Failed to prepare transaction. Please try again.");
                return;
            }

            claimWrite.write();
        } catch (err) {
            console.error("Error executing claim:", err);
            setError("Failed to execute claim transaction. Please try again.");
            setShouldAttemptClaim(false);
            setIsClaimInProgress(false);
            toast.dismiss("claimBounty");
            toast.error(`Claim failed: ${err.message || "Unknown error"}`);
        }
    };

    return {
        ...claimWrite,
        claim,
        write: claim,
        error,
        isPrepared,
        isOpen: isOpen && !isClaimInProgress,
        isLoading: isLoadingStatus || (claimWrite && claimWrite.isLoading) || isConfirming,
        claimSuccess: claimSuccess || isConfirmed,
        refetchStatus: refetchBountyStatus,
        bountyStatus,
        isClaimInProgress
    };
}

export function useSubmitSolution(bountyId, solutionUrl) {
    const [error, setError] = useState(null);
    const [isPrepared, setIsPrepared] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);

    const { config, error: prepareError } = usePrepareContractWrite({
        ...CONTRACTS.bountyManager,
        functionName: 'submitSolution',
        args: [bountyId, solutionUrl],
        enabled: Boolean(bountyId && solutionUrl),
        onError: (err) => {
            console.error("Submit solution prepare error:", err);
            setError(err.message || "Error preparing submitSolution transaction");
            setIsPrepared(false);
        },
        onSuccess: () => {
            setIsPrepared(true);
        }
    });

    useEffect(() => {
        if (prepareError) {
            setError(prepareError.message || "Error preparing submitSolution transaction");
        }
    }, [prepareError]);

    const write = useContractWrite({
        ...config,
        onError: (err) => {
            console.error("Submit solution error:", err);
            setError(err.message || "Error executing submitSolution transaction");

            // Dismiss loading toast and show error
            toast.dismiss("submitSolution");
            toast.error(`Failed to submit solution: ${err.message || "Unknown error"}`);
        },
        onSuccess: (data) => {
            console.log("Solution submission transaction sent:", data.hash);
            setError(null);

            // Set success state immediately for UI feedback
            setIsSuccess(true);

            // Dispatch event to trigger UI updates
            const event = new CustomEvent('refreshBounties', {
                detail: { bountyId }
            });
            window.dispatchEvent(event);

            // Dismiss loading toast and show success
            toast.dismiss("submitSolution");
            toast.success("Solution submitted successfully!");

            // No need to wait for transaction confirmation since wait() is not available
            // Just log the transaction hash for reference
            console.log("Solution submitted with transaction hash:", data.hash);
        }
    });

    return {
        ...write,
        error,
        isPrepared,
        isSuccess
    };
}

export function useGetPoolBounties(poolId) {
    const [bounties, setBounties] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchPoolBounties = async () => {
            if (!poolId) return;

            setIsLoading(true);
            try {
                console.log("useGetPoolBounties: Fetching bounties for pool ID:", poolId);

                // Get list of bounty IDs for this pool
                const bountyIds = await readContract({
                    ...CONTRACTS.bountyManager,
                    functionName: 'getPoolBounties',
                    args: [poolId],
                });

                console.log("useGetPoolBounties: Pool bounties result:", bountyIds);

                if (!bountyIds || bountyIds.length === 0) {
                    console.log("useGetPoolBounties: No bounties found for this pool");
                    setBounties([]);
                    setIsLoading(false);
                    return;
                }

                // For each bounty ID, fetch its details
                const bountyDetailsPromises = bountyIds.map(async (id) => {
                    try {
                        console.log(`useGetPoolBounties: Fetching details for bounty ID: ${id}`);

                        const details = await readContract({
                            ...CONTRACTS.bountyManager,
                            functionName: 'getBountyDetails',
                            args: [id],
                        });

                        console.log(`useGetPoolBounties: Bounty ${id} details:`, details);
                        console.log(`useGetPoolBounties: Bounty ${id} details structure:`, {
                            details: details[0],
                            reward: details[1],
                            joinFeePercentage: details[2],
                            deadline: details[3],
                            solver: details[4],
                            status: details[5],
                            submission: details[6]
                        });

                        // Safely access array elements with fallbacks
                        return {
                            id,
                            details: details[0] || '',
                            reward: details[1] || BigInt(0),
                            joinFeePercentage: details[2] || BigInt(0),
                            deadline: details[3] || BigInt(0),
                            solver: details[4] || '0x0000000000000000000000000000000000000000',
                            status: details[5] || 0,
                            submission: details[6] || ''
                        };
                    } catch (err) {
                        console.error(`useGetPoolBounties: Error fetching details for bounty ${id}:`, err);
                        // Return a placeholder bounty with error info
                        return {
                            id,
                            details: `Error loading bounty: ${err.message}`,
                            reward: BigInt(0),
                            joinFeePercentage: BigInt(0),
                            deadline: BigInt(0),
                            solver: '0x0000000000000000000000000000000000000000',
                            status: 0,
                            submission: ''
                        };
                    }
                });

                const bountyDetails = await Promise.all(bountyDetailsPromises);
                console.log("useGetPoolBounties: All bounty details:", bountyDetails);

                setBounties(bountyDetails);
                setIsLoading(false);
            } catch (err) {
                console.error("useGetPoolBounties: Error fetching pool bounties:", err);
                setError("Failed to fetch bounties. Please try again later.");
                setIsLoading(false);
            }
        };

        fetchPoolBounties();
    }, [poolId]);

    return { bounties, isLoading, error };
}

export function useSelectWinner(bountyId, winner) {
    const { config } = usePrepareContractWrite({
        ...CONTRACTS.bountyManager,
        functionName: 'selectWinner',
        args: [bountyId, winner],
        enabled: Boolean(bountyId && winner),
    });

    return useContractWrite(config);
}

export function useBountyDetails(bountyId) {
    const { data, isLoading, error, refetch } = useContractRead({
        ...CONTRACTS.bountyManager,
        functionName: 'getBountyDetails',
        args: [bountyId],
        enabled: Boolean(bountyId),
        onSuccess: (data) => {
            console.log("Successfully fetched bounty details:", data);
            console.log("Bounty details structure:", {
                details: data[0],
                reward: data[1],
                joinFeePercentage: data[2],
                deadline: data[3],
                solver: data[4],
                status: data[5],
                submission: data[6]
            });
        },
        onError: (err) => {
            console.error("Error fetching bounty details:", err);
        }
    });

    // Format the data for easier consumption with safe array access
    const formattedData = data ? {
        details: data[0] || '',
        reward: data[1] || BigInt(0),
        joinFeePercentage: data[2] || BigInt(0),
        deadline: data[3] || BigInt(0),
        solver: data[4] || '0x0000000000000000000000000000000000000000',
        status: data[5] || 0,
        submission: data[6] || '' // Now directly from getBountyDetails
    } : null;

    return {
        data: formattedData,
        isLoading,
        error,
        refetch
    };
}

export function useBountyId() {
    return useContractRead({
        ...CONTRACTS.bountyManager,
        functionName: 'bountyId',
        watch: true,
    });
}

/**
 * Hook to get the number of bounties for a pool
 * @param {string} poolId - The ID of the pool to get bounty count for
 */
export function usePoolBountyCount(poolId) {
    const [count, setCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchPoolBountyCount = async () => {
            if (!poolId) return;

            setLoading(true);
            try {
                const bountyCount = await readContract({
                    ...CONTRACTS.bountyManager,
                    functionName: 'getPoolBountyCount',
                    args: [poolId],
                });

                setCount(Number(bountyCount));
                setLoading(false);
            } catch (err) {
                console.error('Error fetching pool bounty count:', err);
                setError('Failed to fetch bounty count');
                setLoading(false);
            }
        };

        fetchPoolBountyCount();
    }, [poolId]);

    return { count, loading, error };
}

export function usePoolBounties(poolId) {
    const [bounties, setBounties] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchPoolBounties = async () => {
        if (!poolId) {
            setLoading(false);
            return;
        }

        try {
            setLoading(true);
            console.log("Fetching bounties for pool ID:", poolId);

            const poolBountiesResult = await readContract({
                ...CONTRACTS.bountyManager,
                functionName: 'getPoolBounties',
                args: [BigInt(poolId)],
            });

            console.log("Pool bounties result:", poolBountiesResult);

            if (!poolBountiesResult || poolBountiesResult.length === 0) {
                console.log("No bounties found for this pool");
                setBounties([]);
                setLoading(false);
                return;
            }

            const bountyPromises = poolBountiesResult.map(async (bountyId) => {
                try {
                    console.log(`Fetching details for bounty ${bountyId}`);

                    const details = await readContract({
                        ...CONTRACTS.bountyManager,
                        functionName: 'getBountyDetails',
                        args: [bountyId],
                    });

                    console.log(`Bounty ${bountyId} details:`, details);
                    console.log(`Bounty ${bountyId} details structure:`, {
                        details: details[0],
                        reward: details[1],
                        joinFeePercentage: details[2],
                        deadline: details[3],
                        solver: details[4],
                        status: details[5],
                        submission: details[6]
                    });

                    // Safely access array elements with fallbacks
                    return {
                        id: bountyId.toString(),
                        details: details[0] || '',
                        reward: details[1] || BigInt(0),
                        joinFeePercentage: details[2] || BigInt(0),
                        deadline: details[3] || BigInt(0),
                        solver: details[4] || '0x0000000000000000000000000000000000000000',
                        status: details[5] || 0,
                        submission: details[6] || '',
                        poolId
                    };
                } catch (err) {
                    console.error(`Error fetching details for bounty ${bountyId}:`, err);
                    // Return a placeholder bounty with error info in case of failure
                    return {
                        id: bountyId.toString(),
                        details: `Error loading bounty details: ${err.message}`,
                        reward: "0",
                        joinFeePercentage: "0",
                        deadline: "0",
                        solver: '0x0000000000000000000000000000000000000000',
                        status: 0,
                        submission: '',
                        poolId
                    };
                }
            });

            const bountyDetails = await Promise.all(bountyPromises);
            console.log("All bounty details:", bountyDetails);
            setBounties(bountyDetails);
            setLoading(false);
        } catch (err) {
            console.error('Error fetching pool bounties:', err);
            setError('Failed to fetch bounties. Please try again later.');
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchPoolBounties();
    }, [poolId]);

    return { bounties, loading, error, refetch: fetchPoolBounties };
}

export function useBountySubmission(bountyId, solver) {
    console.warn("useBountySubmission is deprecated - use useBountyDetails instead");

    // This hook is kept for backward compatibility, but useBountyDetails should be used instead
    // since it already includes the submission directly
    const { data: bountyDetails } = useBountyDetails(bountyId);

    return {
        data: bountyDetails?.submission || "",
        isLoading: false,
        error: null
    };
}

export function useGetAllPools() {
    const [pools, setPools] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const { address } = useAccount();

    const { data: poolCount, isLoading: isLoadingPoolCount } = useGetPoolCount();

    useEffect(() => {
        const fetchAllPools = async () => {
            if (isLoadingPoolCount || poolCount === undefined) return;

            setIsLoading(true);
            console.log("Fetching all pools. Pool count:", poolCount);
            console.log("PoolFactory contract address:", CONTRACTS.poolFactory.address);
            console.log("BountyManager contract address:", CONTRACTS.bountyManager.address);

            try {
                // Create an array with all valid pool IDs (0 to poolCount-1)
                const poolIds = Array.from({ length: Number(poolCount) + 1 }, (_, i) => i);
                console.log("Pool IDs to check:", poolIds);

                // Check each pool ID
                const activePoolsPromises = poolIds.map(id =>
                    readContract({
                        ...CONTRACTS.poolFactory,
                        functionName: 'getPoolById',
                        args: [BigInt(id)],
                    }).then(address => ({ id, address }))
                        .catch(err => {
                            console.warn(`Error checking pool ID ${id}:`, err);
                            return { id, address: null };
                        })
                );

                const allPoolResults = await Promise.all(activePoolsPromises);
                console.log("All pool results:", allPoolResults);

                const activePools = allPoolResults.filter(
                    result => result.address && result.address !== '0x0000000000000000000000000000000000000000'
                );
                console.log("Active pools found:", activePools);

                // Now fetch details for each active pool
                const poolDetailsPromises = activePools.map(async ({ id, address: poolAddress }) => {
                    try {
                        const ownerPromise = readContract({
                            ...CONTRACTS.poolFactory,
                            functionName: 'getPoolOwner',
                            args: [poolAddress],
                        });

                        const poolNamePromise = readContract({
                            address: poolAddress,
                            abi: ABI.Pool,
                            functionName: 'getName',
                        }).catch(() => `Pool ${id}`);

                        const [owner, name] = await Promise.all([ownerPromise, poolNamePromise]);

                        return {
                            id,
                            address: poolAddress,
                            owner,
                            name: name || `Pool ${id}`
                        };
                    } catch (err) {
                        console.error(`Error fetching details for pool ${id}:`, err);
                        return {
                            id,
                            address: poolAddress,
                            owner: null,
                            name: `Pool ${id}`
                        };
                    }
                });

                const resolvedPools = await Promise.all(poolDetailsPromises);
                console.log("Resolved pools with details:", resolvedPools);
                setPools(resolvedPools);
            } catch (err) {
                console.error('Failed to fetch pools:', err);
                setError('Failed to fetch pools');
            } finally {
                setIsLoading(false);
            }
        };

        fetchAllPools();
    }, [poolCount, isLoadingPoolCount, address]);

    return { pools, isLoading, error };
}

/**
 * Hook to get all contributors for a specific pool
 * @param {string} poolId - The ID of the pool to fetch contributors for
 */
export function usePoolContributors(poolId) {
    const [contributors, setContributors] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);

    // Get pool address from pool ID
    const { data: poolAddress } = useGetPoolById(
        poolId ? BigInt(poolId) : undefined
    );

    useEffect(() => {
        const fetchPoolContributors = async () => {
            if (!poolAddress || poolAddress === '0x0000000000000000000000000000000000000000') {
                setContributors([]);
                return;
            }

            setIsLoading(true);
            try {
                console.log("Fetching contributors for pool at address:", poolAddress);

                // Fetch contributors from the Pool contract
                const contributorAddresses = await readContract({
                    address: poolAddress,
                    abi: ABI.Pool,
                    functionName: 'getContributors',
                });

                console.log("Contributors addresses:", contributorAddresses);

                if (!contributorAddresses || contributorAddresses.length === 0) {
                    console.log("No contributors found for this pool");
                    setContributors([]);
                    setIsLoading(false);
                    return;
                }

                // Fetch each contributor's deposits to calculate total contribution
                const contributorPromises = contributorAddresses.map(async (address) => {
                    try {
                        console.log(`Fetching deposits for contributor: ${address}`);

                        const deposits = await readContract({
                            address: poolAddress,
                            abi: ABI.Pool,
                            functionName: 'getContributorDeposits',
                            args: [address],
                        });

                        console.log(`Deposits for ${address}:`, deposits);

                        // Handle different return types (array of structs or separate arrays)
                        let totalContributed = BigInt(0);

                        if (Array.isArray(deposits)) {
                            // It's an array of structs
                            totalContributed = deposits.reduce((sum, deposit) => {
                                // Check if deposit is an object (struct) or a direct value
                                if (typeof deposit === 'object' && 'amount' in deposit) {
                                    // Convert to string first to handle any potential BigInt conversion issues
                                    const amount = typeof deposit.amount === 'bigint'
                                        ? deposit.amount
                                        : BigInt(deposit.amount.toString());
                                    return sum + amount;
                                } else {
                                    return sum + BigInt(0);
                                }
                            }, BigInt(0));
                        } else if (deposits && 'amounts' in deposits) {
                            // It's return with separate arrays
                            totalContributed = deposits.amounts.reduce((sum, amount) => sum + BigInt(amount), BigInt(0));
                        }

                        console.log(`Total contributed by ${address}: ${totalContributed.toString()}`);

                        return {
                            address,
                            totalContributed
                        };
                    } catch (err) {
                        console.error(`Error fetching deposits for ${address}:`, err);
                        return {
                            address,
                            totalContributed: BigInt(0)
                        };
                    }
                });

                const resolvedContributors = await Promise.all(contributorPromises);
                console.log("All contributors with contributions:", resolvedContributors);

                // Sort contributors by total contribution (highest first)
                const sortedContributors = resolvedContributors
                    .filter(contributor => contributor.totalContributed > BigInt(0))
                    .sort((a, b) => (a.totalContributed < b.totalContributed) ? 1 : -1);

                console.log("Sorted contributors:", sortedContributors);
                setContributors(sortedContributors);
            } catch (err) {
                console.error('Error fetching pool contributors:', err);
                setError('Failed to fetch contributors');
            } finally {
                setIsLoading(false);
            }
        };

        fetchPoolContributors();
    }, [poolAddress]);

    return { data: contributors, isLoading, error };
}

/**
 * Hook to get the number of bounties for a repository (pool)
 * @param {string} repositoryId - The ID of the repository to get bounty count for
 */
export function useRepositoryBountyCount(repositoryId) {
    const [count, setCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const { data: poolBountyCount, isLoading } = usePoolBountyCount(repositoryId);

    useEffect(() => {
        if (!isLoading && poolBountyCount !== undefined) {
            setCount(Number(poolBountyCount));
            setLoading(false);
        }
    }, [poolBountyCount, isLoading]);

    return { count, loading, error };
}

// Helper for debugging contract ABIs
export async function logContractFunctions(contractAddress) {
    try {
        console.log(`Examining contract at address: ${contractAddress}`);

        // Get list of all external functions
        const getInterfaceResult = await window.ethereum.request({
            method: 'eth_call',
            params: [
                {
                    to: contractAddress,
                    data: '0x01ffc9a701ffc9a70000000000000000000000000000000000000000000000000000000000000000'
                },
                'latest'
            ]
        });

        console.log('Contract supports interfaces:', getInterfaceResult);

        // Debug method for viewing return values
        console.log('Debug helpers:');
        console.log(`
// Call this in browser console to get full contract ABI
async function getContractABI(address) {
  try {
    // Check if the contract is verified on Etherscan
    const response = await fetch(\`https://api-sepolia.arbiscan.io/api?module=contract&action=getabi&address=\${address}&apikey=YourApiKey\`);
    const data = await response.json();
    
    if (data.status === '1') {
      console.log('Contract ABI:', JSON.parse(data.result));
      return JSON.parse(data.result);
    } else {
      console.error('Contract not verified or error:', data.message);
      return null;
    }
  } catch (error) {
    console.error('Error fetching contract ABI:', error);
    return null;
  }
}

// Example usage:
// getContractABI('${contractAddress}');
        `);
    } catch (err) {
        console.error('Error examining contract:', err);
    }
}

/**
 * Hook to get the ETH balance of an address
 * @param {string} address - The address to get the balance for
 */
export function useEthBalance(address) {
    const {
        data: balanceData,
        isLoading,
        isError,
        refetch
    } = useBalance({
        address,
        watch: true,
    });

    // Set up periodic refresh for balance updates
    useEffect(() => {
        const interval = setInterval(() => {
            refetch?.();
        }, 10000); // Refresh every 10 seconds

        return () => clearInterval(interval);
    }, [refetch]);

    return {
        balance: balanceData?.value || null,
        formatted: balanceData?.formatted,
        symbol: balanceData?.symbol,
        isLoading,
        error: isError ? 'Failed to fetch balance' : null
    };
}

// Add a new hook to get the pool image URL
export function useGetPoolImageUrl(poolAddress) {
    const [errorLog, setErrorLog] = useState(null);

    const result = useContractRead({
        address: poolAddress,
        abi: ABI.Pool,
        functionName: 'getImageUrl',
        enabled: Boolean(poolAddress),
        onSuccess: (data) => {
            console.log('Successfully fetched pool image URL:', data);
        },
        onError: (error) => {
            console.error('Error fetching pool image URL:', error);
            setErrorLog(error.message);
        }
    });

    return {
        ...result,
        errorLog
    };
}

/**
 * Hook for rejecting a solution for a bounty
 * @param {number|string} bountyId - The ID of the bounty to reject solution for
 * @returns {Object} - Object containing the reject function and loading/error states
 */
export function useRejectSolution(bountyId) {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [isPrepared, setIsPrepared] = useState(false);
    const { address } = useAccount();

    // Only log when in development environment to reduce console noise
    if (process.env.NODE_ENV === 'development') {
        console.log('useRejectSolution hook called with:', {
            bountyId,
            bountyIdType: typeof bountyId,
            bountyIdToString: bountyId ? String(bountyId) : 'null/undefined'
        });
    }

    // Convert bountyId to BigInt safely
    const bountyIdBigInt = useMemo(() => {
        if (bountyId === undefined || bountyId === null) return undefined;
        if (typeof bountyId === 'bigint') return bountyId;
        try {
            const result = BigInt(bountyId.toString());
            console.log('Successfully converted bountyId to BigInt:', {
                original: bountyId,
                converted: result.toString()
            });
            return result;
        } catch (err) {
            console.error("Invalid bountyId:", bountyId, err);
            return undefined;
        }
    }, [bountyId]);

    // For success and error messages
    const [transactionHash, setTransactionHash] = useState(null);
    const [isSuccess, setIsSuccess] = useState(false);

    // Custom reject function that takes the refundCollateral parameter
    const reject = useCallback(async (refundCollateral = true) => {
        if (bountyIdBigInt === undefined) {
            console.error("Invalid bounty ID in reject function:", {
                bountyId,
                bountyIdBigInt,
                bountyIdType: typeof bountyId
            });
            setError("Invalid bounty ID");
            return;
        }

        if (!address) {
            setError("Wallet not connected");
            return;
        }

        setIsLoading(true);
        setError(null);
        setIsSuccess(false);

        try {
            console.log(`Rejecting solution for bounty #${bountyIdBigInt} with refundCollateral=${refundCollateral}`);

            // Use wagmi's contract write directly
            const txResult = await writeContract({
                address: CONTRACTS.bountyManager.address,
                abi: ABI.BountyManager,
                functionName: 'rejectSolution',
                args: [bountyIdBigInt, refundCollateral],
            });

            console.log('Transaction result:', txResult);

            if (txResult) {
                setTransactionHash(txResult);
                setIsSuccess(true);

                // Dispatch an event to notify the UI
                window.dispatchEvent(new CustomEvent('refreshBounties', {
                    detail: { bountyId: bountyId }
                }));
            }
        } catch (err) {
            console.error("Error rejecting solution:", err);
            setError(err.message || "Error rejecting solution");
        } finally {
            setIsLoading(false);
        }
    }, [bountyIdBigInt, bountyId, address]);

    return {
        reject,
        isLoading,
        error,
        isPrepared,
        isSuccess,
        transactionHash
    };
}

/**
 * @recommended This hook provides the total available yield across all contributors and bounty yield.
 * It uses real-time calculations that don't require distributeYield() calls.
 */
export function useGetCurrentYield(poolAddress) {
    return useContractRead({
        address: poolAddress,
        abi: ABI.Pool,
        functionName: 'getAvailableYield',
        enabled: Boolean(poolAddress),
    });
}