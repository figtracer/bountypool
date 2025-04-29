import React, { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { useSearchParams, Link } from 'react-router-dom';
import {
    useGetPoolById,
    useIsPoolOwner,
    useCreateBounty,
    useGetCurrentBountyYield,
    useBountyId
} from '../hooks/useContractInteractions';
import { useGitHubAuth } from '../utils/GitHubAuthContext.jsx';
import GitHubLoginButton from '../components/GitHubLoginButton';
import { toast } from 'react-hot-toast';

const CreateBounty = () => {
    const { address, isConnected } = useAccount();
    const [searchParams] = useSearchParams();
    const urlPoolId = searchParams.get('poolId');
    const { user, validateIssueUrl, validateGitHubUrl, bountyTags } = useGitHubAuth();
    console.log('bountyTags:', bountyTags); // Debug log

    // Form state
    const [poolId, setPoolId] = useState(urlPoolId || '');
    const [taskDetails, setTaskDetails] = useState('');
    const [issueUrl, setIssueUrl] = useState('');
    const [rewardAmount, setRewardAmount] = useState('');
    const [joinFeePercentage, setJoinFeePercentage] = useState('10');
    const [deadline, setDeadline] = useState('2592000'); // 30 days in seconds
    const [issueValidationResult, setIssueValidationResult] = useState(null);
    const [isValidatingIssue, setIsValidatingIssue] = useState(false);
    const [selectedTags, setSelectedTags] = useState([]);

    // Set pool ID from URL params when component mounts
    useEffect(() => {
        if (urlPoolId) {
            setPoolId(urlPoolId);
        }
    }, [urlPoolId]);

    // Contract reads
    const { data: poolAddress } = useGetPoolById(
        poolId ? BigInt(poolId) : undefined
    );

    const poolExists = poolAddress && poolAddress !== '0x0000000000000000000000000000000000000000';

    const { data: isOwner } = useIsPoolOwner(poolAddress);

    // Get current bounty yield from the pool
    const { data: currentBountyYield } = useGetCurrentBountyYield(
        poolAddress
    );

    // Get current bounty ID from the contract
    const { data: currentBountyId } = useBountyId();

    // Contract writes - don't pass arguments directly, use the prepare pattern
    const {
        write: createBounty,
        isLoading: isCreating,
        isSuccess: isCreateSuccess,
        error: createError,
        data: createData,
        prepareContractWrite,
    } = useCreateBounty();

    // Validate GitHub issue URL
    const validateIssue = async () => {
        if (!issueUrl) {
            setIssueValidationResult({ valid: false, message: 'Please enter an issue URL' });
            return;
        }

        if (!user) {
            setIssueValidationResult({ valid: false, message: 'Please connect with GitHub first' });
            return;
        }

        setIsValidatingIssue(true);
        try {
            // Use validateGitHubUrl with 'bounty' context to ensure only issue URLs are accepted
            const result = await validateGitHubUrl(issueUrl, 'bounty');
            console.log('Validation result:', result);

            if (!result) {
                setIssueValidationResult({ valid: false, message: 'Validation failed - no result returned' });
                return;
            }

            setIssueValidationResult(result);

            // If the issue is valid, populate task details from the issue title
            if (result.valid && result.issue && !taskDetails) {
                setTaskDetails(result.issue.title);
            }
        } catch (err) {
            console.error('Error validating issue URL:', err);
            setIssueValidationResult({
                valid: false,
                message: `Error: ${err.message || 'Unknown error during validation'}`
            });
        } finally {
            setIsValidatingIssue(false);
        }
    };

    // Handle bounty creation
    const handleCreateBounty = () => {
        // Validate that we have all required inputs
        if (!poolId || !rewardAmount || parseFloat(rewardAmount) <= 0) {
            toast.error("Please provide a valid reward amount and pool ID");
            return;
        }

        if (!taskDetails && !issueUrl) {
            toast.error("Please provide either task details or a GitHub issue URL");
            return;
        }

        if (!poolExists || !isOwner) {
            toast.error("You must be the owner of an existing pool");
            return;
        }

        // Check if we need to validate the GitHub issue
        if (issueUrl && !issueValidationResult?.valid) {
            // If we have an issue URL but it hasn't been validated
            if (!issueValidationResult) {
                toast.error("Please validate the GitHub issue URL first");
            }
            return;
        }

        if (poolId && (taskDetails || issueUrl) && rewardAmount && poolExists && isOwner) {
            // Create a details string that includes the task and URL
            let details = '';
            if (taskDetails) {
                details = taskDetails.trim();
            } else {
                details = "Task";
            }

            // If URL exists, include it in the details
            if (issueUrl) {
                details = `${issueUrl.trim()}\n\n${details}`;
            }

            // If tags are selected, include them in the details in a format that can be extracted
            if (selectedTags.length > 0) {
                const tagsData = {
                    tags: selectedTags
                };
                details = `${details}\n\n<!-- BOUNTY_TAGS: ${JSON.stringify(tagsData)} -->`;
                console.log('Added tags to details:', selectedTags);
            }

            // Check if the pool has enough yield
            const currentYield = currentBountyYield ? BigInt(currentBountyYield.toString()) : BigInt(0);

            // DEBUG - Log more detailed information about the values being used
            console.log("DEBUG VALUES:");
            console.log("- Pool ID:", poolId, typeof poolId);
            console.log("- Pool Address:", poolAddress);
            console.log("- Current Bounty ID:", currentBountyId ? currentBountyId.toString() : "undefined");
            console.log("- Current Yield:", currentYield.toString(), typeof currentYield);

            // Convert user input from ETH to wei directly (no division by 100)
            const rewardWei = BigInt(Math.floor(parseFloat(rewardAmount) * 10 ** 18));

            console.log("- Reward Wei:", rewardWei.toString(), typeof rewardWei);
            console.log("- Join Fee Percentage:", joinFeePercentage, typeof joinFeePercentage);
            console.log("- Deadline:", deadline, typeof deadline);
            console.log("- Details String Length:", details ? details.length : 0);
            console.log("- Details String:", details);

            // Check for any potential overflow conditions
            try {
                console.log("Checking for potential overflow conditions:");
                // Check that all bigints are within safe ranges
                const maxUint256 = BigInt(2) ** BigInt(256) - BigInt(1);
                console.log("- Max uint256:", maxUint256.toString());
                console.log("- Pool ID < Max:", BigInt(poolId) < maxUint256);
                console.log("- Reward < Max:", rewardWei < maxUint256);
                console.log("- Fee % < Max:", BigInt(joinFeePercentage) < maxUint256);
                console.log("- Deadline < Max:", BigInt(deadline) < maxUint256);

                // Calculate potential collateral amount that might cause overflow
                const potentialCollateral = (rewardWei * BigInt(joinFeePercentage)) / BigInt(100);
                console.log("- Potential Collateral:", potentialCollateral.toString());
            } catch (e) {
                console.error("Error in overflow check:", e);
            }

            if (currentYield < rewardWei) {
                toast.error(`Not enough yield in the pool (${currentYield.toString()} wei available). The bounty requires ${rewardWei.toString()} wei.`);
                console.warn(`Insufficient yield: available=${currentYield.toString()}, required=${rewardWei.toString()}`);

                // We'll still try to create the bounty, as the yield might have changed since we last checked
                console.log("Attempting to create bounty despite potential insufficient yield...");
            }

            // Store tags separately in localStorage instead of adding to the details string
            if (selectedTags.length > 0) {
                try {
                    // Store tags associated with this bounty for frontend rendering
                    const bountyTags = JSON.parse(localStorage.getItem('bountyTags') || '{}');
                    // We don't know the bounty ID yet, so use poolId + timestamp as temp key
                    const tempKey = `${poolId}_${Date.now()}`;
                    bountyTags[tempKey] = selectedTags;
                    localStorage.setItem('bountyTags', JSON.stringify(bountyTags));
                    console.log(`Tags stored in localStorage: ${selectedTags.join(',')}`);
                } catch (err) {
                    console.error("Failed to store tags in localStorage:", err);
                }
            }

            // Log for debugging the details string
            console.log('Creating bounty with args:', {
                poolId: BigInt(poolId),
                details,
                reward: rewardWei,
                joinFeePercentage: BigInt(joinFeePercentage),
                deadline: BigInt(deadline)
            });

            console.log('Attempting to create bounty with details:', details);
            console.log("Reward amount (wei):", rewardWei.toString());
            console.log("Current bounty ID from contract:", currentBountyId ? currentBountyId.toString() : "undefined");

            try {
                // Check if the yield is sufficient before making the call
                console.log('Attempting to create bounty with details:', details);

                // Show loading toast
                toast.loading('Creating bounty...', { id: 'createBounty' });

                // Call the contract with the current values
                createBounty?.({
                    args: [
                        BigInt(poolId),
                        details,
                        // Use the reduced reward amount
                        rewardWei,
                        BigInt(joinFeePercentage),
                        BigInt(deadline)
                    ],
                    onError: (error) => {
                        console.error("Contract error details:", error);
                        toast.dismiss('createBounty');

                        // Try to extract more specific error information
                        const errorMessage = error.message || "Unknown error";

                        // Check for common error patterns
                        if (errorMessage.includes("NotEnoughYield") ||
                            errorMessage.includes("NotEnoughBountyYield") ||
                            errorMessage.includes("FailedToFundBounty")) {
                            toast.error("Not enough yield in the pool to fund this bounty. Try a smaller amount or add more deposits.");
                        }
                        else if (errorMessage.includes("underflow or overflow")) {
                            toast.error("Numeric overflow error. This could be due to insufficient yield or an issue with one of the numeric values.");

                            // Check specific values
                            if (BigInt(joinFeePercentage) === BigInt(0)) {
                                toast.error("Join fee percentage cannot be zero - this may be causing the overflow.");
                            }

                            if (BigInt(deadline) === BigInt(0)) {
                                toast.error("Deadline cannot be zero - this may be causing the overflow.");
                            }
                        }
                        else {
                            toast.error(`Error creating bounty: ${errorMessage}`);
                        }
                    },
                    onSuccess: (tx) => {
                        // Immediately dismiss the loading toast and show a success message
                        toast.dismiss('createBounty');
                        toast.success('Bounty created successfully!');
                        
                        // Dispatch an event to refresh the bounties list
                        window.dispatchEvent(new CustomEvent('refreshBounties'));
                        
                        console.log('Bounty creation transaction submitted:', tx.hash);
                        
                        // Wait a moment before resetting the form
                        setTimeout(() => {
                            setTaskDetails('');
                            setIssueUrl('');
                            setRewardAmount('');
                            setIssueValidationResult(null);
                            setSelectedTags([]);
                        }, 1000);
                    },
                    onSettled: () => {
                        // Ensure toast is dismissed in all cases
                        toast.dismiss('createBounty');
                    }
                });
            } catch (error) {
                console.error("Error preparing bounty creation:", error);
                toast.error(`Failed to prepare bounty creation: ${error.message}`);
            }
        }
    };

    // No need for this effect anymore since we handle form reset in onSuccess

    // Handle tag selection
    const toggleTag = (tagId) => {
        setSelectedTags(prevTags => {
            if (prevTags.includes(tagId)) {
                return prevTags.filter(id => id !== tagId);
            } else {
                return [...prevTags, tagId];
            }
        });
    };

    return (
        <div className="container mx-auto px-4 py-8 min-h-screen flex flex-col bg-dark-bg font-afacad">
            {/* Back Button & Title - Consistent Styling */}
            <div className="mb-6 flex items-center justify-between">
                <Link
                    to={poolId ? `/pool/${poolId}` : "/pools"}
                    className="flex items-center text-gray-400 hover:text-gray-200 text-sm transition-colors duration-300"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
                    </svg>
                    Back to {poolId ? `Pool #${poolId}` : "Pools"}
                </Link>
            </div>
            <div className="text-center mb-8">
                <h1 className="text-4xl font-bold text-white gradient-text">
                    Create Bounty
                </h1>
            </div>

            <div className="max-w-2xl mx-auto w-full">
                {!isConnected ? (
                    <p className="text-center text-gray-300 bg-dark-bg/80 p-6 rounded-lg border border-gray-700/50">Please connect your wallet to create a bounty.</p>
                ) : (
                    <div className="bg-gradient-to-br from-gray-900/50 via-dark-bg to-gray-900/50 p-6 sm:p-8 rounded-xl border border-gray-700/50 shadow-xl space-y-6">
                        <p className="text-gray-300 mb-4 text-center text-base">
                            Define the task, reward, and deadline for your new bounty.
                        </p>

                        {/* Pool ID Section */}
                        <div className="p-4 bg-black/40 rounded-lg border border-gray-700/30 shadow-md">
                            <label htmlFor="poolIdInput" className="block text-gray-300 mb-1 font-semibold text-sm flex items-center">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-purple-400" viewBox="0 0 20 20" fill="currentColor">
                                    <path d="M7 3a1 1 0 000 2h6a1 1 0 100-2H7zM4 7a1 1 0 011-1h10a1 1 0 110 2H5a1 1 0 01-1-1zM2 11a2 2 0 012-2h12a2 2 0 012 2v4a2 2 0 01-2 2H4a2 2 0 01-2-2v-4z" clipRule="evenodd" />
                                </svg>
                                Pool ID
                            </label>
                            <div className="relative">
                                <input
                                    id="poolIdInput"
                                    type="number"
                                    value={poolId}
                                    onChange={(e) => setPoolId(e.target.value)}
                                    placeholder="Enter Pool ID (e.g., 12345)"
                                    className="bg-dark-bg w-full p-2.5 rounded-lg border border-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none text-sm transition duration-200"
                                    min="0"
                                />
                            </div>
                            <p className="text-xs text-gray-400 mt-1">
                                Enter the ID of the pool you own where this bounty will be created.
                            </p>

                            {poolId && (
                                <div className="mt-2 text-xs">
                                    {poolExists ? (
                                        <p className={`flex items-center ${isOwner ? 'text-green-300' : 'text-yellow-300'}`}>
                                            {isOwner ? (
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                                </svg>
                                            ) : (
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                                                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM10 13a1 1 0 11-2 0 1 1 0 012 0zm-1-3a1 1 0 00-1 1v1a1 1 0 102 0v-1a1 1 0 00-1-1z" clipRule="evenodd" />
                                                </svg>
                                            )}
                                            {isOwner ? 'You are the owner of this pool.' : 'Warning: You do not own this pool.'}
                                        </p>
                                    ) : (
                                        <p className="flex items-center text-red-300">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                            </svg>
                                            Error: This pool ID does not exist.
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Rest of the form enabled only if pool exists and user is owner */}
                        <div className={`space-y-6 ${poolExists && isOwner ? 'opacity-100 transition-opacity duration-500' : 'opacity-50 pointer-events-none'}`}>

                            {/* GitHub Authentication & Issue Section */}
                            <div className="p-4 bg-black/40 rounded-lg border border-gray-700/30 shadow-md space-y-4">
                                <h3 className="text-lg font-semibold text-white flex items-center">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                                        <path fillRule="evenodd" d="M17.707 9.293a1 1 0 010 1.414l-7 7a1 1 0 01-1.414 0l-7-7A.997.997 0 012 10V5a3 3 0 013-3h5l.646.646a.5.5 0 00.708 0L12 2h5a3 3 0 013 3v5a.997.997 0 01-.293.707zM5 6a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                                    </svg>
                                    GitHub Link (Optional)
                                </h3>
                                <p className="text-sm text-gray-400 mb-2">
                                    Connect GitHub to link and validate a specific issue for this bounty.
                                </p>
                                <GitHubLoginButton
                                    className="w-full sm:w-auto text-sm"
                                    buttonText={user ? `Connected as ${user.login}` : "Connect GitHub Account"}
                                />
                                {/* GitHub Issue URL Input & Validation */}
                                {user && (
                                    <div>
                                        <label htmlFor="issueUrlInput" className="block text-gray-300 mb-1 font-semibold text-sm">
                                            GitHub Issue URL
                                        </label>
                                        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
                                            <input
                                                id="issueUrlInput"
                                                type="text"
                                                value={issueUrl}
                                                onChange={(e) => {
                                                    setIssueUrl(e.target.value);
                                                    if (issueValidationResult) setIssueValidationResult(null);
                                                }}
                                                placeholder="https://github.com/owner/repo/issues/123"
                                                className={`bg-dark-bg flex-grow w-full p-2.5 rounded-lg border border-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none text-sm transition duration-200 ${issueValidationResult && !issueValidationResult.valid ? 'border-red-500 ring-red-500/50' : ''} ${issueValidationResult?.valid ? 'border-green-500 ring-green-500/50' : ''}`}
                                            />
                                            <button
                                                onClick={validateIssue}
                                                disabled={isValidatingIssue || !issueUrl || !user}
                                                className="text-sm bg-gradient-to-r from-blue-600 to-purple-600 text-white px-4 py-2 rounded-md hover:opacity-90 transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto flex-shrink-0"
                                            >
                                                {isValidatingIssue ? (
                                                    <span className="flex items-center justify-center">
                                                        <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></span>
                                                        Validating...
                                                    </span>
                                                ) : (
                                                    'Validate Issue'
                                                )}
                                            </button>
                                        </div>
                                        <p className="text-xs text-gray-400 mt-1">
                                            Link a GitHub issue (must be in the format `github.com/owner/repo/issues/number`). Validating will pre-fill the task details.
                                        </p>

                                        {issueValidationResult && (
                                            <div className={`mt-2 text-xs p-2 rounded border ${issueValidationResult.valid ? 'bg-green-900/30 border-green-500/30 text-green-300' : 'bg-red-900/30 border-red-500/30 text-red-300'}`}>
                                                {issueValidationResult.valid ? (
                                                    <span className="flex items-center">
                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                                                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                                        </svg>
                                                        Issue validated: "{issueValidationResult.issue?.title}"
                                                    </span>
                                                ) : (
                                                    <span className="flex items-center">
                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                                                            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                                                        </svg>
                                                        Validation failed: {issueValidationResult.message}
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Task Details Section */}
                            <div className="p-4 bg-black/40 rounded-lg border border-gray-700/30 shadow-md">
                                <label htmlFor="taskDetailsInput" className="block text-gray-300 mb-1 font-semibold text-sm flex items-center">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-purple-400" viewBox="0 0 20 20" fill="currentColor">
                                        <path fillRule="evenodd" d="M4 4a2 2 0 012-2h8a2 2 0 012 2v12a1 1 0 110 2h-3a1 1 0 01-1-1v-2a1 1 0 00-1-1H9a1 1 0 00-1 1v2a1 1 0 01-1 1H4a1 1 0 110-2V4zm3 1h2v1H7V5zm0 3h2v1H7V8zm0 3h2v1H7v-1z" clipRule="evenodd" />
                                    </svg>
                                    Task Details
                                </label>
                                <textarea
                                    id="taskDetailsInput"
                                    value={taskDetails}
                                    onChange={(e) => setTaskDetails(e.target.value)}
                                    placeholder="Describe the task or leave blank if using a validated GitHub issue URL"
                                    rows="3"
                                    className="bg-dark-bg w-full p-2.5 rounded-lg border border-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none text-sm transition duration-200"
                                    maxLength="500" // Keep details reasonable
                                />
                                <p className="text-xs text-gray-400 mt-1">
                                    Provide a brief description of the task. If you validated a GitHub issue, this can be left blank or will be pre-filled.
                                </p>
                            </div>

                            {/* Bounty Tags Section */}
                            {Array.isArray(bountyTags) && bountyTags.length > 0 && (
                                <div className="p-4 bg-black/40 rounded-lg border border-gray-700/30 shadow-md">
                                    <h3 className="text-lg font-semibold text-white mb-2 flex items-center">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                                            <path fillRule="evenodd" d="M17.707 9.293a1 1 0 010 1.414l-7 7a1 1 0 01-1.414 0l-7-7A.997.997 0 012 10V5a3 3 0 013-3h5l.646.646a.5.5 0 00.708 0L12 2h5a3 3 0 013 3v5a.997.997 0 01-.293.707zM5 6a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                                        </svg>
                                        Assign Tags (Optional)
                                    </h3>
                                    <p className="text-sm text-gray-400 mb-3">
                                        Select relevant tags for this bounty based on the GitHub issue labels.
                                    </p>
                                    <div className="flex flex-wrap gap-2">
                                        {bountyTags.map(tag => (
                                            <button
                                                key={tag.id}
                                                type="button"
                                                onClick={() => toggleTag(tag.id)}
                                                className={`px-3 py-1 rounded-full text-xs font-medium border transition duration-200 flex items-center gap-1 ${selectedTags.includes(tag.id) ? 'text-white shadow-md' : 'bg-gray-700/50 border-gray-600 text-gray-300 hover:bg-gray-600/50 hover:border-gray-500'}`}
                                                style={selectedTags.includes(tag.id) ? { backgroundColor: `#${tag.color}`, borderColor: `#${tag.color}` } : { borderColor: `#${tag.color}80` }}
                                                title={tag.label}
                                            >
                                                <div className="flex items-center gap-1">
                                                    {selectedTags.includes(tag.id) && (
                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                                                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                                        </svg>
                                                    )}
                                                    <span>{tag.label}</span>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Financial Details Section */}
                            <div className="p-4 bg-black/40 rounded-lg border border-gray-700/30 shadow-md space-y-4">
                                <h3 className="text-lg font-semibold text-white flex items-center">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-purple-400" viewBox="0 0 20 20" fill="currentColor">
                                        <path d="M8.433 7.418c.155-.103.346-.196.567-.267v1.698a2.5 2.5 0 00-.567-.267C8.07 8.34 8 8.114 8 8c0-.114.07-.34.433-.582zM11 12.849v-1.698c.22.071.412.164.567.267.364.243.433.468.433.582 0 .114-.07.34-.433.582a2.5 2.5 0 01-.567.267z" />
                                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a1 1 0 10-2 0v.092a4.535 4.535 0 00-1.676.662C6.602 6.234 6 7.009 6 8c0 .99.602 1.766 1.324 2.246.48.32 1.054.545 1.676.662v1.941c-.391-.127-.68-.317-.843-.504a1 1 0 10-1.51 1.31C7.113 14.047 8.009 14.5 9 14.5v.092a4.535 4.535 0 001.676.662C11.398 15.766 12 16.991 12 18a1 1 0 102 0v-.092a4.535 4.535 0 001.676-.662C16.398 16.766 17 15.991 17 15c0-.99-.602-1.766-1.324-2.246A4.535 4.535 0 0014 12.092v-1.941c.391.127.68.317.843.504a1 1 0 101.511-1.31C15.887 8.953 14.991 8.5 14 8.5v-.092a4.535 4.535 0 00-1.676-.662C11.398 7.234 11 6.009 11 5a1 1 0 10-2 0v.092a4.535 4.535 0 00-1.676.662C6.602 6.234 6 7.009 6 8c0 .99.602 1.766 1.324 2.246.48.32 1.054.545 1.676.662V13a1 1 0 102 0v-.092a4.535 4.535 0 001.676-.662C13.398 11.766 14 10.991 14 10c0-.99-.602-1.766-1.324-2.246A4.535 4.535 0 0011 7.092V7a1 1 0 10-2 0v.092a4.535 4.535 0 00-1.676.662C6.602 7.234 6 7.009 6 8c0-.99.602-1.766 1.324-2.246A4.535 4.535 0 009 5.092V5z" clipRule="evenodd" />
                                    </svg>
                                    Reward & Deadline
                                </h3>

                                {/* Reward Amount */}
                                <div>
                                    <label htmlFor="rewardInput" className="block text-gray-300 mb-1 font-semibold text-sm">
                                        Bounty Reward (ETH)
                                    </label>
                                    <input
                                        id="rewardInput"
                                        type="number"
                                        value={rewardAmount}
                                        onChange={(e) => setRewardAmount(e.target.value)}
                                        placeholder="e.g., 0.1"
                                        min="0"
                                        step="0.001"
                                        className="bg-dark-bg w-full p-2.5 rounded-lg border border-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none text-sm transition duration-200"
                                    />
                                    <p className="text-xs text-gray-400 mt-1">
                                        Amount of ETH to reward the solver. This will be deducted from the pool's available yield.
                                    </p>
                                    {currentBountyYield !== undefined && (
                                        <p className="text-xs text-blue-300 mt-1">
                                            Available yield in pool: {parseFloat(currentBountyYield.toString()) / 10 ** 18} ETH
                                        </p>
                                    )}
                                </div>

                                {/* Join Fee Percentage */}
                                <div>
                                    <label htmlFor="feeInput" className="block text-gray-300 mb-1 font-semibold text-sm">
                                        Join Fee (% of Reward)
                                    </label>
                                    <input
                                        id="feeInput"
                                        type="number"
                                        value={joinFeePercentage}
                                        onChange={(e) => setJoinFeePercentage(e.target.value)}
                                        placeholder="e.g., 10"
                                        min="1" max="100"
                                        className="bg-dark-bg w-full p-2.5 rounded-lg border border-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none text-sm transition duration-200"
                                    />
                                    <p className="text-xs text-gray-400 mt-1">
                                        Percentage the solver pays to join (1-100%).
                                    </p>
                                </div>

                                {/* Deadline */}
                                <div>
                                    <label htmlFor="deadlineInput" className="block text-gray-300 mb-1 font-semibold text-sm">
                                        Deadline
                                    </label>
                                    <select
                                        id="deadlineInput"
                                        value={deadline}
                                        onChange={(e) => setDeadline(e.target.value)}
                                        className="bg-dark-bg w-full p-2.5 rounded-lg border border-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none text-sm transition duration-200 appearance-none"
                                    >
                                        <option value="86400">1 Day (86,400s)</option>
                                        <option value="604800">1 Week (604,800s)</option>
                                        <option value="1209600">2 Weeks (1,209,600s)</option>
                                        <option value="2592000">30 Days (2,592,000s)</option>
                                        <option value="5184000">60 Days (5,184,000s)</option>
                                        <option value="7776000">90 Days (7,776,000s)</option>
                                    </select>
                                    <p className="text-xs text-gray-400 mt-1">
                                        Time limit for completing the bounty.
                                    </p>
                                </div>
                            </div>

                            {/* Create Bounty Button */}
                            <button
                                onClick={handleCreateBounty}
                                disabled={isCreating || !poolExists || !isOwner || !rewardAmount || parseFloat(rewardAmount) <= 0 || (!taskDetails && !issueUrl) || (issueUrl && !issueValidationResult?.valid)}
                                className="gradient-button w-full py-3 text-base font-semibold transition duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {isCreating ? (
                                    <>
                                        <span className="inline-block w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                                        Creating Bounty...
                                    </>
                                ) : (
                                    'Create Bounty'
                                )}
                            </button>

                            {/* Success/Error Messages */}
                            {createError && (
                                <div className="mt-4 p-3 bg-red-900/30 border border-red-500/30 rounded-lg text-red-300 text-sm">
                                    <p className="font-semibold mb-1">Error Creating Bounty:</p>
                                    <p className="text-xs">{createError.message || 'An unknown error occurred.'}</p>
                                    {/* Add more specific error details if needed */}
                                </div>
                            )}

                            {isCreateSuccess && (
                                <div className="mt-4 p-3 bg-green-900/30 border border-green-500/30 rounded-lg text-green-300 text-sm">
                                    <p className="font-semibold mb-1">✅ Bounty Created Successfully!</p>
                                    <Link to={`/pool/${poolId}?tab=bounties`} className="text-blue-400 hover:text-blue-300 underline text-xs">
                                        View Bounties in Pool #{poolId}
                                    </Link>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default CreateBounty;