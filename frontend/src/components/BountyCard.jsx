import React, { useState, useEffect, useMemo } from 'react';
import { useAccount } from 'wagmi';
import {
    useClaimBounty,
    useSubmitSolution,
    useApproveSolution,
    useRejectSolution
} from '../hooks/useContractInteractions';
import {
    formatEth,
    getBountyStatusText,
    getBountyStatusClass,
    toWei
} from '../utils/helpers';
import { useGitHubAuth } from '../utils/GitHubAuthContext';
import GitHubLoginButton from './GitHubLoginButton';
import BountyTags from './BountyTags';
import toast from 'react-hot-toast';

// Helper to clean solution URLs
const cleanSolutionUrl = (url) => {
    if (!url) return '';

    // First, check for and fix the duplicate URL pattern
    let cleaned = url;

    // Fix cases where an issue URL is followed by the PR URL
    const duplicateUrlPattern = /(https?:\/\/github\.com\/[\w-]+\/[\w-]+\/issues\/\d+)(https?:\/\/)/i;
    if (duplicateUrlPattern.test(cleaned)) {
        cleaned = cleaned.replace(duplicateUrlPattern, '$2');
    }

    // Replace any instances of double slashes (except in protocol)
    cleaned = cleaned.replace(/([^:]\/)\/+/g, "$1");

    return cleaned;
};

// Helper to apply gradient text color
// Choose one of these gradients:
// const gradientText = "bg-clip-text text-transparent bg-gradient-to-r from-blue-500 to-cyan-500"; // Blue to Cyan
// const gradientText = "bg-clip-text text-transparent bg-gradient-to-r from-emerald-500 to-teal-500"; // Emerald to Teal
// const gradientText = "bg-clip-text text-transparent bg-gradient-to-r from-orange-500 to-amber-500"; // Orange to Amber
// const gradientText = "bg-clip-text text-transparent bg-gradient-to-r from-red-500 to-pink-500"; // Red to Pink
const gradientText = "bg-clip-text text-transparent bg-gradient-to-r from-sky-500 to-indigo-600"; // Sky to Indigo

const BountyCard = ({ bounty, poolOwner }) => {
    const { address } = useAccount();
    const { user, validateGitHubUrl, bountyTags } = useGitHubAuth();
    const [solution, setSolution] = useState('');
    const [claimErrorMessage, setClaimErrorMessage] = useState('');
    const [urlValidationResult, setUrlValidationResult] = useState(null);
    const [isValidatingUrl, setIsValidatingUrl] = useState(false);
    const [showRejectConfirm, setShowRejectConfirm] = useState(false); // Add state for reject confirmation
    const [rejectWithRefund, setRejectWithRefund] = useState(false); // Add state for refund toggle

    const {
        id,
        details,
        reward,
        joinFeePercentage,
        deadline,
        solver,
        status: statusRaw,
        submission,
        poolId
    } = bounty;

    const [issueLink, description, tags] = useMemo(() => {
        if (!details) return [null, '', []];

        // Extract GitHub URL from the details
        const urlRegex = /(https?:\/\/github\.com\/[^\s]+)/g;
        const urlMatch = details.match(urlRegex);
        let url = null;

        if (urlMatch && urlMatch.length > 0) {
            // Get the first GitHub URL and clean up any double slashes
            url = urlMatch[0].replace(/([^:]\/)\/+/g, "$1");
        }

        // Extract tags if present in a special comment
        let extractedTags = [];
        let cleanedDetails = details;

        // Try to find tags in the JSON format
        const tagsJsonRegex = /<!--\s*BOUNTY_TAGS:\s*(\{.*?\})\s*-->/s;
        const tagsJsonMatch = details.match(tagsJsonRegex);

        if (tagsJsonMatch && tagsJsonMatch[1]) {
            try {
                const tagsData = JSON.parse(tagsJsonMatch[1]);
                if (tagsData && tagsData.tags && Array.isArray(tagsData.tags)) {
                    extractedTags = tagsData.tags;
                    console.log('Found tags in JSON format:', extractedTags);
                }
                cleanedDetails = cleanedDetails.replace(tagsJsonMatch[0], '').trim();
            } catch (e) {
                console.error('Error parsing bounty tags JSON:', e);
            }
        }

        // Alternatively, look for a simpler tag format if JSON parsing failed
        // Example: <!-- TAGS: tag1,tag2,tag3 -->
        if (extractedTags.length === 0) {
            const simpleTagsRegex = /<!--\s*TAGS:\s*(.*?)\s*-->/;
            const simpleTagsMatch = details.match(simpleTagsRegex);

            if (simpleTagsMatch && simpleTagsMatch[1]) {
                extractedTags = simpleTagsMatch[1].split(',').map(tag => tag.trim()).filter(Boolean);
                console.log('Found tags in simple format:', extractedTags);
                cleanedDetails = cleanedDetails.replace(simpleTagsMatch[0], '').trim();
            }
        }

        // Remove the URL from the description
        let finalDescription = cleanedDetails;
        if (url) {
            finalDescription = cleanedDetails.replace(url, '').trim();
        }

        return [url, finalDescription, extractedTags];
    }, [details]);

    const status = Number(statusRaw);
    const joinFeeAmount = reward && joinFeePercentage
        ? (BigInt(reward) * BigInt(joinFeePercentage)) / BigInt(100)
        : BigInt(0);
    const bountyIdNumber = id !== undefined ? Number(String(id).replace(/[^0-9]/g, '')) || 0 : 0;

    const isSolver = solver?.toLowerCase() === address?.toLowerCase();
    const isPoolOwner = poolOwner?.toLowerCase() === address?.toLowerCase();
    const hasNoSolver = !solver || solver === '0x0000000000000000000000000000000000000000';
    const deadlinePassed = deadline && (BigInt(deadline) < BigInt(Math.floor(Date.now() / 1000)));

    const {
        claim: claimBounty,
        isLoading: isClaimingBounty,
        error: claimError,
        isPrepared: isClaimPrepared,
        isOpen: isBountyOpen,
        claimSuccess
    } = useClaimBounty(bountyIdNumber, joinFeeAmount.toString());

    const {
        write: submitSolution,
        isLoading: isSubmittingSolution,
        isSuccess: isSubmitSuccess,
        error: submitError
    } = useSubmitSolution(id, solution);

    const {
        approve: approveSolution,
        isLoading: isApprovingSolution,
        isApproving
    } = useApproveSolution(id);

    const {
        reject,
        isLoading: isRejectingSolution,
        error: rejectError,
        isSuccess: rejectSuccess,
        transactionHash
    } = useRejectSolution(id);

    useEffect(() => {
        console.log(`BountyCard #${id} - Debug Info:`, {
            id,
            status,
            statusNumber: Number(status),
            statusText: getBountyStatusText(status),
            solver,
            hasNoSolver,
            isSolver,
            isPoolOwner,
            poolOwner,
            address,
            reward: reward?.toString(),
            joinFeePercentage: joinFeePercentage?.toString(),
            joinFeeAmount: joinFeeAmount.toString(),
            calculatedJoinFee: reward && joinFeePercentage ?
                `${reward} * ${joinFeePercentage} / 100 = ${joinFeeAmount}` : 'N/A',
            showClaimButton: status === 0 && hasNoSolver,
            isBountyOpen,
            claimSuccess,
            extractedTags: tags,
            details: details,
            hasSubmission: submission && submission.length > 0,
            submissionUrl: submission
        });
    }, [status, solver, poolOwner, address, id, joinFeeAmount, hasNoSolver, reward, joinFeePercentage, isBountyOpen, claimSuccess, tags, details, submission]);

    useEffect(() => {
        if (claimError) {
            const errorMessage = claimError.toString();
            console.error("Claim error in BountyCard:", errorMessage);

            if (isClaimingBounty) {
                if (errorMessage.includes("insufficient funds")) {
                    setClaimErrorMessage("Insufficient funds to claim this bounty. Make sure you have enough ETH to cover the join fee.");
                } else if (errorMessage.includes("user rejected")) {
                    setClaimErrorMessage("Transaction was rejected. Please try again.");
                } else if (errorMessage.includes("BountyManager__BountyNotOpen")) {
                    setClaimErrorMessage("This bounty is no longer open for claiming. It may have been claimed by someone else.");
                } else {
                    setClaimErrorMessage(`Error: ${errorMessage}`);
                }
            }
        } else if (claimSuccess) {
            setClaimErrorMessage('');
        }
    }, [claimError, isClaimingBounty, claimSuccess]);

    useEffect(() => {
        if (claimSuccess) {
            toast.dismiss("claimBounty");
            toast.success("Bounty claimed successfully! You can now submit a solution.");

            setTimeout(() => {
                window.location.reload();
            }, 3000);
        }
    }, [claimSuccess]);

    useEffect(() => {
        if (claimError && !isClaimingBounty) {
            toast.dismiss("claimBounty");
        }
    }, [claimError, isClaimingBounty]);

    useEffect(() => {
        if (submitError) {
            toast.dismiss("submitSolution");
            toast.error(`Failed to submit solution: ${submitError.message || "Unknown error"}`);
        }
    }, [submitError]);

    useEffect(() => {
        if (isSubmitSuccess) {
            toast.dismiss("submitSolution");
            toast.success("Solution submitted successfully!");
        }
    }, [isSubmitSuccess]);

    useEffect(() => {
        if (claimSuccess) {
            toast.dismiss("claimBounty");
            toast.success("Bounty claimed successfully! You can now submit a solution.");
        }
    }, [claimSuccess]);

    const handleSolutionChange = async (e) => {
        const url = e.target.value;
        setSolution(url);
        setUrlValidationResult(null); // Reset validation on change

        // Only validate if it looks like a GitHub URL
        if (url && url.includes('github.com/')) {
            setIsValidatingUrl(true);
            try {
                // Check if user is logged in with GitHub
                if (!user || !user.login) {
                    setUrlValidationResult({
                        isValid: false,
                        message: 'Please log in with GitHub to validate link. Click the GitHub Login button below.'
                    });
                    throw new Error('GitHub login required for validation');
                }

                // Attempt to validate the URL as a solution (must be a PR)
                const validation = await validateGitHubUrl(url, 'solution');

                // If validation succeeded, set the result
                if (validation) {
                    setUrlValidationResult({
                        isValid: validation.valid,
                        message: validation.message
                    });
                } else {
                    throw new Error('Validation failed - no result returned');
                }
            } catch (error) {
                console.error('Error validating GitHub URL:', error);

                // Provide more specific error message based on the error
                let message;
                if (error.message === 'GitHub login required for validation') {
                    message = 'Please log in with GitHub to validate this link';
                } else if (error.message.includes('rate limit')) {
                    message = 'GitHub API rate limit exceeded. Please try again later.';
                } else if (error.message.includes('token')) {
                    message = 'GitHub authentication issue. Please try logging in again.';
                } else {
                    message = 'Error validating URL. Is it a public PR/Issue?';
                }

                setUrlValidationResult({ isValid: false, message });
            } finally {
                setIsValidatingUrl(false);
            }
        } else if (url) {
            // If it's not empty but doesn't include github.com, mark as invalid immediately
            setUrlValidationResult({ isValid: false, message: 'Please provide a valid GitHub URL (Issue or PR).' });
        } else {
            // Clear validation if input is empty
            setUrlValidationResult(null);
        }
    };

    const handleClaimBounty = async () => {
        console.log(`Attempting to claim bounty #${bountyIdNumber} with fee ${joinFeeAmount.toString()}`);
        setClaimErrorMessage('');

        if (!user) {
            setClaimErrorMessage('Please log in with GitHub to claim a bounty.');
            return;
        }

        try {
            toast.loading('Claiming bounty...', { id: 'claimBounty' });
            await claimBounty?.();
            // Success/error handled by useEffect
        } catch (error) {
            toast.dismiss('claimBounty');
            console.error('Claim transaction failed:', error);
            const message = error?.cause?.shortMessage || error.message || 'Transaction failed.';

            // More user-friendly error messages
            if (message.includes('SolverAlreadyParticipated')) {
                setClaimErrorMessage('This bounty has already been claimed by someone else.');
            } else if (message.includes('BountyNotOpen')) {
                setClaimErrorMessage('This bounty is no longer open for claiming.');
            } else if (message.includes('IncorrectCollateralAmount')) {
                setClaimErrorMessage(`Please provide exactly ${formatEth(joinFeeAmount)} ETH as collateral.`);
            } else {
                setClaimErrorMessage(`Failed to claim bounty: ${message}`);
            }

            toast.error(`Claim failed: ${message}`);
        }
    };

    const handleRejectSolution = async (refund) => {
        console.log(`Attempting to reject bounty #${id} with refund: ${refund}`);
        toast.loading('Rejecting solution...', { id: 'rejectSolution' });
        try {
            await reject({ args: [id, refund] }); // Pass refund parameter to the hook's reject function
            toast.success('Solution rejected successfully!', { id: 'rejectSolution' });
            setShowRejectConfirm(false); // Hide confirmation UI after success
            setRejectWithRefund(false); // Reset toggle
            setTimeout(() => window.location.reload(), 2000); // Reload after success
        } catch (error) {
            console.error('Error rejecting solution:', error);
            toast.error(`Failed to reject solution: ${error.message || 'Unknown error'}`, { id: 'rejectSolution' });
        }
    };

    const handleSubmitSolution = async () => {
        if (!solution) {
            toast.error('Please enter a solution link.');
            return;
        }
        if (!urlValidationResult?.isValid) {
            toast.error(urlValidationResult?.message || 'Please enter a valid solution link.');
            return;
        }

        try {
            // Clean the solution URL before submitting
            const cleanedSolution = cleanSolutionUrl(solution);
            if (cleanedSolution !== solution) {
                setSolution(cleanedSolution);
                console.log('Cleaned solution URL before submission:', {
                    original: solution,
                    cleaned: cleanedSolution
                });
            }

            toast.loading('Submitting solution...', { id: 'submitSolution' });
            await submitSolution?.();
            // Success/error handled by useEffect
        } catch (error) {
            toast.dismiss('submitSolution');
            console.error('Submit solution transaction failed:', error);
            const message = error?.cause?.shortMessage || error.message || 'Transaction failed.';
            toast.error(`Failed to submit solution: ${message}`);
        }
    };

    const handleApproveSolution = async () => {
        try {
            toast.loading('Approving solution...', { id: 'approveSolution' });
            await approveSolution?.();
            toast.dismiss('approveSolution');
            toast.success('Solution approved successfully!');
            // Refresh after a delay
            setTimeout(() => window.location.reload(), 1500);
        } catch (error) {
            toast.dismiss('approveSolution');
            console.error('Approve solution transaction failed:', error);
            const message = error?.cause?.shortMessage || error.message || 'Transaction failed.';
            toast.error(`Failed to approve solution: ${message}`);
        }
    };

    const renderDescription = () => {
        if (issueLink) {
            return (
                <a
                    href={issueLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 text-sm text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 break-words block hover:underline"
                >
                    {description || "View Bounty Details"}
                </a>
            );
        } else {
            return (
                <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 break-words">
                    {description || "No description provided."}
                </p>
            );
        }
    };

    const renderClaimSection = () => {
        // Only check if the bounty has no solver
        if (!hasNoSolver) return null;

        return (
            <div className="mt-4">
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                    Claim this bounty to start working on it.
                    {joinFeeAmount > 0 && (
                        <span className="block">Requires a join fee of {formatEth(joinFeeAmount)} ETH.</span>
                    )}
                </p>
                {!user ? (
                    <GitHubLoginButton />
                ) : (
                    <button
                        onClick={handleClaimBounty}
                        disabled={isClaimingBounty}
                        className={`w-full px-4 py-2 rounded-md text-white font-semibold transition-colors duration-200 ${isClaimingBounty
                            ? 'bg-gray-500 cursor-not-allowed opacity-70'
                            : 'bg-gradient-to-r from-gradient-blue to-gradient-purple hover:opacity-90'
                            }`}
                    >
                        {isClaimingBounty ? 'Claiming...' : 'Claim Bounty'}
                    </button>
                )}
                {claimErrorMessage && (
                    <p className="text-red-500 text-sm mt-2">{claimErrorMessage}</p>
                )}
            </div>
        );
    };

    const renderSolutionSubmissionSection = () => {
        // Don't show submission form if:
        // 1. Status is not 'In Progress' (1)
        // 2. User is not the solver
        // 3. Deadline has passed
        // 4. A solution has already been submitted (submission exists)
        if (status !== 1 || !isSolver || deadlinePassed || (submission && submission.length > 0)) return null;

        return (
            <div className="mt-4 space-y-3">
                <label htmlFor={`solution-${id}`} className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Submit Your Solution Link (e.g., GitHub PR):
                </label>
                <input
                    type="url"
                    id={`solution-${id}`}
                    value={solution}
                    onChange={handleSolutionChange}
                    placeholder="https://github.com/owner/repo/pull/123"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white dark:placeholder-gray-400"
                    required
                />
                {isValidatingUrl && <p className="text-xs text-gray-500 dark:text-gray-400">Validating URL...</p>}
                {urlValidationResult && (
                    <p className={`text-xs ${urlValidationResult.isValid ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                        {urlValidationResult.message}
                    </p>
                )}
                <button
                    onClick={handleSubmitSolution}
                    disabled={isSubmittingSolution || !solution || !urlValidationResult?.isValid}
                    className={`w-full px-4 py-2 rounded-md text-white font-semibold transition-colors duration-200 ${isSubmittingSolution || !solution || !urlValidationResult?.isValid
                        ? 'bg-gray-500 cursor-not-allowed opacity-70'
                        : 'bg-gradient-to-r from-green-500 to-emerald-500 hover:opacity-90' // Use green gradient for submit
                        }`}
                >
                    {isSubmittingSolution ? 'Submitting...' : 'Submit Solution'}
                </button>
            </div>
        );
    };

    const renderApprovalSection = () => {
        // If there's no submission, show a waiting message for pool owners if the bounty is CLOSED (status 1)
        if (!submission || submission.length === 0) {
            // Show message only if the bounty is CLOSED (status 1) and has a solver AND user is pool owner
            if (Number(status) === 1 && solver && solver !== '0x0000000000000000000000000000000000000000' && isPoolOwner) {
                return (
                    <div className="mt-4">
                        <div className="p-3 border border-yellow-300 dark:border-yellow-700 rounded-md bg-yellow-50 dark:bg-yellow-900/20">
                            <p className="text-sm font-medium text-yellow-600 dark:text-yellow-400 flex items-center">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1.5" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                                </svg>
                                Waiting for Solution
                            </p>
                            <p className="text-sm text-yellow-600/80 dark:text-yellow-400/80 mt-1">
                                You are waiting for the solver to submit their solution.
                            </p>
                            <p className="text-sm text-yellow-600/80 dark:text-yellow-400/80 mt-1">
                                Once submitted, you'll see Approve/Reject buttons here.
                            </p>
                            {deadlinePassed ? (
                                <p className="text-sm text-red-500 mt-1 font-medium">
                                    Note: The deadline has passed.
                                </p>
                            ) : (
                                <p className="text-sm text-yellow-600/80 dark:text-yellow-400/80 mt-1">
                                    Deadline: {new Date(Number(deadline) * 1000).toLocaleString()}
                                </p>
                            )}
                        </div>
                    </div>
                );
            }
            console.log(`No submission for bounty #${id}, not showing approval section`);
            return null;
        }

        const cleanedSubmission = cleanSolutionUrl(submission);
        const statusText = getBountyStatusText(status);

        // Log debug information with all relevant variables
        console.log(`Rendering approval section for bounty #${id}:`, {
            status,
            statusNumber: Number(status),
            statusText,
            isPoolOwner,
            isSolver,
            address,
            poolOwner,
            submission: cleanedSubmission,
            solver
        });

        // For completed/finished bounties, show completion message and never show buttons
        if (status === 3 || Number(status) === 3 || statusText === 'Approved' || statusText === 'Finished') {
            console.log(`Bounty #${id} is completed/finished, showing completion message`);
            return (
                <div>
                    <div className="mt-4">
                        <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Solution Submitted:</p>
                        <a
                            href={cleanedSubmission}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 break-all text-sm"
                            onClick={(e) => e.stopPropagation()}
                        >
                            {cleanedSubmission}
                        </a>
                    </div>
                    <div className="mt-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-md p-3">
                        <p className="text-sm font-medium text-green-600 dark:text-green-400 flex items-center">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1.5" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                            </svg>
                            Bounty Completed
                        </p>
                        <p className="text-sm text-green-600/80 dark:text-green-400/80 mt-1">
                            This solution was approved and the bounty has been completed successfully.
                        </p>
                    </div>
                </div>
            );
        }

        // Status 4: Rejected - Show rejection message
        if (status === 4) {
            return (
                <div>
                    <div className="mt-4">
                        <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Solution Submitted:</p>
                        <a
                            href={cleanedSubmission}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 break-all text-sm"
                            onClick={(e) => e.stopPropagation()}
                        >
                            {cleanedSubmission}
                        </a>
                    </div>
                    <div className="mt-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-md p-3">
                        <p className="text-sm font-medium text-red-600 dark:text-red-400 flex items-center">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1.5" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                            </svg>
                            Solution Rejected
                        </p>
                        <p className="text-sm text-red-600/80 dark:text-red-400/80 mt-1">
                            This solution was rejected and the bounty is still available.
                        </p>
                    </div>
                </div>
            );
        }

        // Add debug information to help troubleshoot the missing buttons
        console.log(`Debug bounty #${id} approval buttons:`, {
            isPoolOwner,
            status,
            statusNumber: Number(status),
            submission,
            submissionLength: submission ? submission.length : 0,
            solver,
            poolOwnerAddress: poolOwner,
            currentUserAddress: address
        });

        // For pool owners, show the approval buttons if the bounty has a submission and is not already approved/rejected
        // Status 1 = Claimed, Status 2 = Submitted, we should show buttons in both cases if there's a submission
        if (isPoolOwner && (Number(status) === 1 || Number(status) === 2) && submission && submission.length > 0) {
            console.log(`Pool owner view for bounty #${id} with status 2, showing approval buttons`);
            return (
                <div>
                    <div className="mt-4">
                        <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Solution Submitted:</p>
                        <a
                            href={cleanedSubmission}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 break-all text-sm"
                            onClick={(e) => e.stopPropagation()}
                        >
                            {cleanedSubmission}
                        </a>
                    </div>

                    {/* Approval/Rejection controls for Pool Owner */}
                    <div className="mt-4 space-y-3">
                        {!showRejectConfirm ? (
                            // Initial Buttons: Approve / Reject
                            <div className="flex flex-col sm:flex-row gap-2">
                                <button
                                    onClick={handleApproveSolution}
                                    disabled={isApprovingSolution || isRejectingSolution || isApproving}
                                    className="flex-1 px-4 py-2 rounded-md text-white font-semibold bg-gradient-to-r from-green-500 to-emerald-500 hover:opacity-90 disabled:opacity-70 disabled:cursor-not-allowed transition-opacity duration-200"
                                >
                                    {isApprovingSolution || isApproving ? 'Approving...' : 'Approve'}
                                </button>
                                <button
                                    onClick={handleRejectClick}
                                    disabled={isApprovingSolution || isRejectingSolution || isApproving}
                                    className="flex-1 px-4 py-2 rounded-md text-white font-semibold bg-gradient-to-r from-red-500 to-rose-500 hover:opacity-90 disabled:opacity-70 disabled:cursor-not-allowed transition-opacity duration-200"
                                >
                                    Reject
                                </button>
                            </div>
                        ) : (
                            // Confirmation UI for Rejection
                            <div className="p-3 border border-red-300 dark:border-red-700 rounded-md bg-red-50 dark:bg-red-900/20">
                                <p className="text-sm font-medium text-red-800 dark:text-red-200 mb-2">Confirm Rejection</p>
                                <div className="flex items-center mb-3">
                                    {/* Simple Toggle Switch */}
                                    <label htmlFor={`refundToggle-${id}`} className="mr-2 text-sm text-gray-700 dark:text-gray-300">Refund Collateral:</label>
                                    <button
                                        id={`refundToggle-${id}`}
                                        onClick={() => setRejectWithRefund(!rejectWithRefund)}
                                        className={`relative inline-flex items-center h-6 rounded-full w-11 transition-colors duration-200 ease-in-out ${rejectWithRefund ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-gray-600'}`}
                                    >
                                        <span className={`inline-block w-4 h-4 transform bg-white rounded-full transition-transform duration-200 ease-in-out ${rejectWithRefund ? 'translate-x-6' : 'translate-x-1'}`} />
                                    </button>
                                    <span className="ml-2 text-sm text-gray-600 dark:text-gray-400">{rejectWithRefund ? 'Yes' : 'No'}</span>
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={handleConfirmReject}
                                        disabled={isRejectingSolution}
                                        className="flex-1 px-3 py-1 rounded text-sm text-white font-semibold bg-red-600 hover:bg-red-700 disabled:opacity-70 disabled:cursor-not-allowed"
                                    >
                                        {isRejectingSolution ? 'Rejecting...' : `Confirm Reject ${rejectWithRefund ? '(with refund)' : '(no refund)'}`}
                                    </button>
                                    <button
                                        onClick={handleCancelReject}
                                        disabled={isRejectingSolution}
                                        className="flex-1 px-3 py-1 rounded text-sm text-gray-700 dark:text-gray-300 font-medium bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-70"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            );
        }

        // Status 2: Pending approval - Show info for the solver
        if (status === 2 && isSolver) {
            return (
                <div>
                    <div className="mt-4">
                        <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Solution Submitted:</p>
                        <a
                            href={cleanedSubmission}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 break-all text-sm"
                            onClick={(e) => e.stopPropagation()}
                        >
                            {cleanedSubmission}
                        </a>
                    </div>
                    <p className="text-sm text-yellow-600 dark:text-yellow-400 mt-3">Waiting for pool owner approval.</p>
                </div>
            );
        }

        // For any other status, just show the solution URL
        return (
            <div className="mt-4">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Solution Submitted:</p>
                <a
                    href={cleanedSubmission}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 break-all text-sm"
                    onClick={(e) => e.stopPropagation()}
                >
                    {cleanedSubmission}
                </a>
            </div>
        );
    };

    const handleRejectClick = () => {
        setShowRejectConfirm(true); // Show confirmation UI
    };

    const handleConfirmReject = () => {
        handleRejectSolution(rejectWithRefund); // Call original reject handler with refund state
        // Don't hide confirmation UI immediately, wait for transaction result
    };

    const handleCancelReject = () => {
        setShowRejectConfirm(false); // Hide confirmation UI
        setRejectWithRefund(false); // Reset refund toggle
    };

    return (
        <div
            className="bg-gradient-to-b from-dark-bg/80 to-gray-900/40 rounded-xl p-5 border border-blue-500/20 shadow-xl flex flex-col justify-between transition-all duration-300 hover:shadow-blue-500/10 hover:border-blue-500/40 cursor-pointer"
            onClick={() => {
                if (issueLink) {
                    window.open(issueLink, '_blank', 'noopener,noreferrer');
                }
            }}
        >
            <div>
                {/* Header: Status Left, Reward Right */}
                <div className="flex justify-between items-center mb-2"> {/* Use justify-between */}
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded ${getBountyStatusClass(status)}`}>
                        {getBountyStatusText(status)}
                    </span>
                    <span className="text-lg font-bold text-green-600 dark:text-green-400">
                        {formatEth(reward)} ETH
                    </span>
                </div>

                {/* Title / Link below header */}
                <div className="mb-3"> {/* Add margin bottom */}
                    <p className="text-lg font-semibold break-words text-white hover:text-gray-200">
                        {description || (issueLink ? 'View Issue' : 'No description')}
                    </p>
                </div>

                {/* Separator */}
                <hr className="border-gray-200 dark:border-gray-700/50 my-3" />

                {/* Tags (Check if tags exist) */}
                {tags && tags.length > 0 && (
                    <div className="mb-4" onClick={(e) => e.stopPropagation()}>
                        <BountyTags tagIds={tags} />
                    </div>
                )}

                {/* Meta Info: Deadline, Solver, Pool ID, Fee */}
                <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1 mb-4">
                    {deadline && deadline > 0 && (
                        <p>Deadline: {new Date(Number(deadline) * 1000).toLocaleString()} {deadlinePassed && status < 3 && <span className="text-red-500 dark:text-red-400">(Passed)</span>}</p>
                    )}
                    {solver && !hasNoSolver && (
                        <p>Solver: <span className="font-medium text-gray-700 dark:text-gray-300 truncate" title={solver}>{solver.substring(0, 6)}...{solver.substring(solver.length - 4)}</span> {isSolver && "(You)"}</p> // Truncate solver address
                    )}
                    <p>Pool ID: {poolId?.toString()}</p>
                    {joinFeeAmount > 0 && status === 0 && (
                        <p>Join Fee: <span className={`font-medium ${gradientText}`}>{formatEth(joinFeeAmount)} ETH</span> ({joinFeePercentage?.toString()}%)</p> // Apply gradient to fee
                    )}
                </div>
                <div
                    onClick={(e) => {
                        // Stop propagation for inner components to prevent the click from triggering the parent's onClick
                        e.stopPropagation();
                    }}
                >
                    {renderClaimSection()}
                    {renderSolutionSubmissionSection()}
                    {renderApprovalSection()}
                </div>
            </div>
        </div>
    );
};

export default BountyCard;