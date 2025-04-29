import React, { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { Link, useNavigate } from 'react-router-dom';
import {
    useCreatePool,
    useIsPoolExists
} from '../hooks/useContractInteractions.js';
import { formatEther } from 'viem';
import { useGitHubAuth } from '../utils/GitHubAuthContext.jsx';
import GitHubLoginButton from '../components/GitHubLoginButton.jsx';
import { uploadFileToPinata, getIpfsUrl, validateImageFile, isPinataConfigured } from '../utils/pinataService.js';

const CreatePool = () => {
    const navigate = useNavigate();
    const { address, isConnected } = useAccount();
    const {
        user,
        authError,
        checkRepoOwnershipByName,
        parseRepoUrl
    } = useGitHubAuth();

    // Form state
    const [poolId, setPoolId] = useState('');
    const [repoUrl, setRepoUrl] = useState('');
    const [repoOwner, setRepoOwner] = useState('');
    const [repoName, setRepoName] = useState('');
    const [error, setError] = useState(null);
    const [isVerifyingOwnership, setIsVerifyingOwnership] = useState(false);
    const [isOwnershipVerified, setIsOwnershipVerified] = useState(false);
    const [repoUrlValid, setRepoUrlValid] = useState(false);
    const [skipPoolExistsCheck, setSkipPoolExistsCheck] = useState(false);

    // Image upload state
    const [selectedImage, setSelectedImage] = useState(null);
    const [imagePreview, setImagePreview] = useState(null);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadError, setUploadError] = useState('');
    const [ipfsUrl, setIpfsUrl] = useState('');
    const [isPinataReady, setIsPinataReady] = useState(false);

    // Contract reads - only done when needed
    const { data: poolExists, refetch: refetchPoolExists } = useIsPoolExists(
        poolId && !skipPoolExistsCheck ? BigInt(poolId) : undefined
    );

    // Check if Pinata is configured
    useEffect(() => {
        setIsPinataReady(isPinataConfigured());
        if (!isPinataConfigured()) {
            setUploadError('Pinata API credentials not configured. Please add them to your .env file.');
        }
    }, []);

    // Parse repository URL when it changes
    useEffect(() => {
        if (repoUrl) {
            const repoInfo = parseRepoUrl(repoUrl);
            if (repoInfo) {
                setRepoOwner(repoInfo.owner);
                setRepoName(repoInfo.name);
                setRepoUrlValid(true);
            } else {
                setRepoOwner('');
                setRepoName('');
                setRepoUrlValid(false);
            }
        } else {
            setRepoOwner('');
            setRepoName('');
            setRepoUrlValid(false);
        }
    }, [repoUrl, parseRepoUrl]);

    // Format ETH amount to display nicely
    const formatETH = (wei) => {
        if (!wei) return '0.0000';
        try {
            const ethValue = formatEther(wei);
            return parseFloat(ethValue).toFixed(3);
        } catch (err) {
            console.error('Error formatting ETH value:', err);
            return '0.0000';
        }
    };

    // Format the repository name as "owner/name"
    const formattedRepoName = repoOwner && repoName ? `${repoOwner}/${repoName}` : (repoName || '');

    // Contract writes
    const {
        write: createPool,
        isLoading: isCreating,
        isSuccess: isCreateSuccess,
        error: createError,
        errorDetails,
        fee: poolFee
    } = useCreatePool(
        poolId ? BigInt(poolId) : BigInt(0),
        formattedRepoName,
        ipfsUrl || ''
    );

    // Reset verification when repo info changes
    useEffect(() => {
        setIsOwnershipVerified(false);
    }, [repoUrl, repoOwner, repoName]);

    // Log create error when it changes
    useEffect(() => {
        if (createError) {
            console.error('Create pool error:', createError);

            // Display more detailed error to the user
            if (errorDetails) {
                setError(`Error: ${createError.message}\n${errorDetails}`);
            } else if (createError.message?.includes('PoolFactory__PoolAlreadyExists')) {
                setError(`Error: A pool with ID ${poolId} already exists. Please choose a different ID.`);
            } else if (createError.message?.includes('PoolFactory__InsufficientFee')) {
                setError(`Error: Insufficient fee. Please make sure you're sending at least ${formatETH(poolFee)} ETH.`);
            } else {
                setError(`Error: ${createError.message}`);
            }
        }
    }, [createError, errorDetails, poolId, poolFee]);

    // Handle image file selection
    const handleImageChange = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // Reset previous upload state
        setIpfsUrl('');
        setUploadError('');

        // Validate the image file
        const { valid, error } = validateImageFile(file);
        if (!valid) {
            setUploadError(error);
            return;
        }

        setSelectedImage(file);

        // Create preview
        const reader = new FileReader();
        reader.onloadend = () => {
            setImagePreview(reader.result);
        };
        reader.readAsDataURL(file);
    };

    // Verify repository ownership using owner/name
    const verifyRepoOwnership = async () => {
        if (!repoUrlValid || !repoOwner || !repoName) {
            setError("Please enter a valid GitHub repository URL");
            return;
        }

        if (!user) {
            setError("Please connect with GitHub first");
            return;
        }

        setIsVerifyingOwnership(true);
        setError(null);

        try {
            const isOwner = await checkRepoOwnershipByName(repoOwner, repoName);

            if (isOwner) {
                setIsOwnershipVerified(true);
                setError(null);
            } else {
                setIsOwnershipVerified(false);
                setError(`You are not the owner of ${repoOwner}/${repoName}`);
            }
        } catch (err) {
            console.error('Error verifying repo ownership:', err);
            setError(`Error verifying ownership: ${err.message || 'Unknown error'}`);
            setIsOwnershipVerified(false);
        } finally {
            setIsVerifyingOwnership(false);
        }
    };

    // Handle pool creation
    const handleCreatePool = async () => {
        setError(null);

        if (!poolId) {
            setError("Please enter a Pool ID");
            return;
        }

        if (!isOwnershipVerified) {
            setError("Please verify repository ownership first");
            return;
        }

        // Check if image is selected but not uploaded to IPFS
        if (selectedImage && !ipfsUrl) {
            setError("Please upload your image to IPFS before creating the pool");
            return;
        }

        // Ensure poolId is a valid number
        let poolIdBigInt;
        try {
            poolIdBigInt = BigInt(poolId);
        } catch (err) {
            setError("Pool ID must be a valid number");
            return;
        }

        // Confirm pool ID doesn't already exist if we haven't checked yet
        if (!skipPoolExistsCheck && poolId) {
            try {
                const result = await refetchPoolExists({
                    args: [poolIdBigInt]
                }).catch(err => {
                    // Continue anyway since the contract will validate this
                    return { data: null };
                });

                if (result.data && result.data !== '0x0000000000000000000000000000000000000000') {
                    setError(`A pool with ID ${poolId} already exists. Please choose a different ID.`);
                    return;
                }
            } catch (err) {
                // Continue anyway since the contract will validate this
            }
        }

        // Skip the pool exists check for creation - the contract will handle this validation
        setSkipPoolExistsCheck(true);

        // Create the pool with the current parameters
        try {
            // This log is needed for debugging if something goes wrong
            console.log('Creating pool with ID:', poolIdBigInt.toString(), 'name:', formattedRepoName, 'and image URL:', ipfsUrl);
            createPool?.();
        } catch (err) {
            console.error('Error creating pool:', err);
            setError(`Error: ${err.message || 'Unknown error'}`);
        }
    };

    // Refresh pool status after creation
    useEffect(() => {
        if (isCreateSuccess) {
            setTimeout(() => {
                try {
                    // Only check if we have a valid poolId
                    if (poolId && !isNaN(Number(poolId))) {
                        const poolIdBigInt = BigInt(poolId);
                        console.log("Refreshing pool status after creation for pool ID:", poolIdBigInt.toString());
                        refetchPoolExists({
                            args: [poolIdBigInt]
                        }).catch(err => {
                            // Just log the error but don't disrupt the UI
                            console.log("Error refreshing pool status, but continuing:", err.message);
                        });
                    }
                } catch (err) {
                    console.error('Error refreshing pool status:', err);
                }
            }, 2000);
        }
    }, [isCreateSuccess, refetchPoolExists, poolId]);

    // Check if pool exists when ID changes and is valid
    useEffect(() => {
        if (poolId && poolId.trim() !== '' && !isNaN(Number(poolId))) {
            try {
                // Reset the flag when pool ID changes
                setSkipPoolExistsCheck(false);

                // Only run the check if we have a valid pool ID
                const poolIdBigInt = BigInt(poolId);
                console.log("Checking if pool exists for ID:", poolIdBigInt.toString());

                // Refetch to check if pool exists
                refetchPoolExists({
                    args: [poolIdBigInt]
                }).catch(err => {
                    // Just log the error but don't disrupt the UI
                    console.log("Error checking if pool exists, but continuing:", err.message);
                });
            } catch (err) {
                console.error('Error checking if pool exists in useEffect:', err);
            }
        }
    }, [poolId, refetchPoolExists]);

    // Determine if creation should be disabled
    const isCreateDisabled =
        isCreating ||
        !poolId ||
        !repoName ||
        !isOwnershipVerified ||
        isUploading ||
        (selectedImage && !ipfsUrl) || // Disable if image is selected but not uploaded
        (!skipPoolExistsCheck && poolExists && poolExists !== '0x0000000000000000000000000000000000000000');

    return (
        <div className="container mx-auto px-4 py-8 min-h-screen flex flex-col bg-dark-bg font-afacad">
            {/* Back Button - Consistent Subtle Style */}
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

            {/* Centered "Create Pool" title */}
            <div className="text-center mb-8">
                <h1 className="text-4xl font-bold text-white gradient-text">
                    Create New Pool
                </h1>
            </div>

            <div className="max-w-2xl mx-auto w-full">
                {!isConnected ? (
                    <p className="text-center text-gray-300 bg-dark-bg/80 p-6 rounded-lg border border-gray-700/50">Please connect your wallet to create a pool.</p>
                ) : (
                    <div className="bg-gradient-to-br from-gray-900/50 via-dark-bg to-gray-900/50 p-6 sm:p-8 rounded-xl border border-gray-700/50 shadow-xl space-y-6">
                        <p className="text-gray-300 mb-4 text-center text-base">
                            Configure your new pool by linking a GitHub repository you own.
                        </p>

                        {/* GitHub Authentication Section - Enhanced Styling */}
                        <div className="p-4 bg-black/40 rounded-lg border border-gray-700/30 shadow-md">
                            <h3 className="text-lg font-semibold text-white mb-2 flex items-center">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-purple-400" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M10 0C4.477 0 0 4.477 0 10c0 4.418 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.009-.868-.014-1.703-2.782.605-3.369-1.341-3.369-1.341-.454-1.154-1.11-1.46-1.11-1.46-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.089 2.91.833.091-.647.349-1.086.635-1.337-2.22-.252-4.555-1.111-4.555-4.943 0-1.091.39-1.984 1.029-2.682-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.564 9.564 0 0110 4.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.202 2.394.1 2.647.64.698 1.028 1.591 1.028 2.682 0 3.842-2.338 4.687-4.566 4.935.359.309.678.92.678 1.856 0 1.337-.012 2.415-.012 2.741 0 .267.18.577.688.48A10.001 10.001 0 0020 10c0-5.523-4.477-10-10-10z" clipRule="evenodd" />
                                </svg>
                                GitHub Verification
                            </h3>
                            <p className="text-sm text-gray-400 mb-3">
                                Connect and verify ownership of the repository for your pool.
                            </p>

                            <GitHubLoginButton
                                className="w-full mb-2 text-sm"
                                buttonText={user ? `Connected as ${user.login}` : "Connect GitHub Account"}
                            />

                            {authError && (
                                <div className="mt-2 text-red-400 text-xs bg-red-900/30 p-2 rounded">
                                    <span className="font-semibold">Auth Error:</span> {authError}
                                </div>
                            )}
                        </div>

                        {/* Repo URL & Verification Section */}
                        <div className="p-4 bg-black/40 rounded-lg border border-gray-700/30 shadow-md">
                            <div className="mb-4">
                                <label htmlFor="repoUrl" className="block text-gray-300 mb-1 font-semibold text-sm">
                                    GitHub Repository URL
                                </label>
                                <div className="relative">
                                    <input
                                        id="repoUrl"
                                        type="text"
                                        value={repoUrl}
                                        onChange={(e) => setRepoUrl(e.target.value)}
                                        placeholder="https://github.com/username/repository"
                                        className="bg-dark-bg w-full p-2.5 rounded-lg border border-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none text-sm transition duration-200"
                                    />
                                    {repoUrlValid && (
                                         <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-green-400 absolute right-3 top-1/2 transform -translate-y-1/2" viewBox="0 0 20 20" fill="currentColor">
                                             <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                        </svg>
                                    )}
                                </div>
                                <p className="text-xs text-gray-400 mt-1">
                                    Enter the full URL of the GitHub repository.
                                </p>
                            </div>

                            {user && repoUrlValid && !isOwnershipVerified && (
                                <button
                                    onClick={verifyRepoOwnership}
                                    disabled={isVerifyingOwnership || !repoUrlValid || !user}
                                    className="text-sm bg-gradient-to-r from-blue-600 to-purple-600 text-white px-4 py-2 rounded-md hover:opacity-90 transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto"
                                >
                                    {isVerifyingOwnership ? (
                                        <span className="flex items-center justify-center">
                                            <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></span>
                                            Verifying...
                                        </span>
                                    ) : (
                                        'Verify Ownership'
                                    )}
                                </button>
                            )}

                            {isOwnershipVerified && (
                                <div className="mt-2 text-green-300 text-sm flex items-center bg-green-900/30 p-2 rounded border border-green-500/30">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    <span>Ownership verified! Pool name: <span className="font-bold">{formattedRepoName}</span></span>
                                </div>
                            )}
                        </div>

                        {/* Pool ID Section */}
                        <div className="p-4 bg-black/40 rounded-lg border border-gray-700/30 shadow-md">
                             <label htmlFor="poolId" className="block text-gray-300 mb-1 font-semibold text-sm">
                                Pool ID (Numerical identifier)
                            </label>
                            <div className="relative">
                                <input
                                    id="poolId"
                                    type="number"
                                    value={poolId}
                                    onChange={(e) => setPoolId(e.target.value)}
                                    placeholder="Unique numerical ID (e.g., 12345)"
                                    className="bg-dark-bg w-full p-2.5 rounded-lg border border-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none text-sm transition duration-200"
                                    min="0"
                                />
                            </div>
                             <p className="text-xs text-gray-400 mt-1">
                                Enter a unique number to identify this pool.
                            </p>
                            {!skipPoolExistsCheck && poolId && poolExists && poolExists !== '0x0000000000000000000000000000000000000000' && (
                                <div className="mt-2 text-yellow-300 text-sm flex items-center bg-yellow-900/30 p-2 rounded border border-yellow-500/30">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                    </svg>
                                    This Pool ID is already taken. Please choose a different one.
                                </div>
                            )}
                        </div>

                        {/* Pool Image Section - Enhanced Styling */}
                        <div className="p-4 bg-black/40 rounded-lg border border-gray-700/30 shadow-md space-y-4">
                             <h3 className="text-lg font-semibold text-white flex items-center">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                                  <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
                                </svg>
                                Pool Image (Optional)
                             </h3>

                            {/* Step 1: Select Image */}
                            <div>
                                <div className="flex items-center mb-2">
                                    <div className="w-6 h-6 rounded-full bg-gradient-to-r from-purple-600 to-blue-600 flex items-center justify-center mr-2 shadow-md">
                                        <span className="text-white text-xs font-bold">1</span>
                                    </div>
                                    <span className="text-gray-200 text-sm font-medium">Select Image File</span>
                                </div>

                                <label className="block cursor-pointer bg-gray-700/50 px-4 py-2 rounded-md border border-gray-600 hover:bg-gray-600/50 transition text-sm text-center">
                                    <span className="text-gray-300 flex items-center justify-center">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                        </svg>
                                        {selectedImage ? 'Change Image' : 'Choose Image'}
                                    </span>
                                    <input
                                        type="file"
                                        id="poolImage"
                                        accept="image/png, image/jpeg, image/gif, image/webp"
                                        onChange={handleImageChange}
                                        className="sr-only"
                                    />
                                </label>

                                {/* Image Preview */}
                                {imagePreview && (
                                    <div className="mt-3 relative">
                                        <p className="text-xs text-gray-400 mb-1">Preview:</p>
                                        <div className="h-36 w-full rounded-lg overflow-hidden border-2 border-gray-600 shadow-lg">
                                            <img
                                                src={imagePreview}
                                                alt="Preview"                                                className="w-full h-full object-cover"
                                            />
                                        </div>
                                    </div>
                                )}
                             </div>

                            {/* Step 2: Upload to IPFS */}
                            {selectedImage && (
                                <div>
                                    <div className="flex items-center mb-2">
                                        <div className="w-6 h-6 rounded-full bg-gradient-to-r from-blue-600 to-purple-600 flex items-center justify-center mr-2 shadow-md">
                                            <span className="text-white text-xs font-bold">2</span>
                                        </div>
                                        <span className="text-gray-200 text-sm font-medium">Upload to IPFS</span>
                                    </div>

                                    {!ipfsUrl ? (
                                        <button
                                            type="button"
                                            onClick={async () => {
                                                // ... (upload logic remains the same)
                                                try {
                                                    setIsUploading(true);
                                                    setUploadError('');
                                                    const metadata = {
                                                        name: `BountyPool-${poolId}-${formattedRepoName}-${Date.now()}`,
                                                        keyvalues: {
                                                            poolId: poolId,
                                                            repoName: formattedRepoName,
                                                            repoOwner: repoOwner
                                                        }
                                                    };
                                                    const ipfsHash = await uploadFileToPinata(selectedImage, metadata);
                                                    if (!ipfsHash) throw new Error('Failed to get IPFS hash from Pinata');
                                                    const fullIpfsUrl = getIpfsUrl(ipfsHash, false);
                                                    setIpfsUrl(fullIpfsUrl);
                                                } catch (err) {
                                                    console.error('Error uploading to Pinata:', err);
                                                    setUploadError(err.message || 'Failed to upload image');
                                                } finally {
                                                    setIsUploading(false);
                                                }
                                            }}
                                            disabled={isUploading || !isPinataReady}
                                            className="w-full px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-md hover:opacity-90 transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed text-sm flex items-center justify-center shadow-md"
                                        >
                                            {isUploading ? (
                                                <>
                                                    <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></span>
                                                    Uploading...
                                                </>
                                            ) : (
                                                'Upload to IPFS'
                                            )}
                                        </button>
                                    ) : (
                                        <div className="flex items-center bg-green-900/30 border border-green-500/30 rounded-md px-3 py-2">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-green-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            </svg>
                                            <span className="text-green-300 text-sm font-medium">Image Uploaded Successfully</span>
                                        </div>
                                    )}

                                    {ipfsUrl && (
                                        <div className="mt-2 p-2 bg-gray-800/60 rounded-md border border-gray-700">
                                            <p className="text-gray-400 text-xs break-all">
                                                <span className="text-gray-200 font-semibold">IPFS URL:</span> {ipfsUrl}
                                            </p>
                                        </div>
                                    )}
                                </div>
                            )}

                            {!isPinataReady && (
                                <div className="mt-2 p-2 bg-amber-900/30 border border-amber-500/50 rounded-md text-amber-300 text-xs flex items-center">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                    </svg>
                                    Pinata API not configured. Image upload disabled.
                                </div>
                            )}

                            {uploadError && (
                                <div className="mt-2 p-2 bg-red-900/30 border border-red-500/50 rounded-md text-red-300 text-xs flex items-center">
                                     <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    <span className="font-semibold mr-1">Upload Error:</span> {uploadError}
                                </div>
                            )}

                        </div>

                        {/* Error Display Area */}
                        {error && (
                            <div className="p-3 mb-4 bg-red-900/40 rounded-lg border border-red-500/40 flex items-start">
                                 <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-red-300 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                <p className="text-red-300 text-sm whitespace-pre-wrap">{error}</p>
                            </div>
                        )}

                        {/* Fee Display - Moved Closer to Button */}
                        <div className="p-3 mb-4 bg-black/40 rounded-lg text-gray-300 text-sm border border-gray-700/30 flex items-center justify-center">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a1 1 0 10-2 0v.092a4.535 4.535 0 00-1.676.662C6.602 6.234 6 7.009 6 8c0 .99.602 1.765 1.324 2.246.48.32 1.054.545 1.676.662v1.941c-.391-.127-.68-.317-.843-.504a1 1 0 10-1.51 1.31c.562.649 1.413 1.076 2.353 1.253V15a1 1 0 102 0v-.092a4.535 4.535 0 001.676-.662C13.398 13.766 14 12.991 14 12c0-.99-.602-1.765-1.324-2.246A4.535 4.535 0 0011 9.092V7.151c.391.127.68.317.843.504a1 1 0 101.511-1.31c-.563-.649-1.413-1.076-2.354-1.253V5z" clipRule="evenodd" />
                            </svg>
                            Creation Fee: <span className="text-white font-semibold ml-1">{formatETH(poolFee)} ETH</span>
                        </div>

                        {/* Create Pool Button */}
                        <button
                            onClick={handleCreatePool}
                            disabled={isCreateDisabled}
                            className={`w-full gradient-button py-3 px-6 text-base font-bold rounded-lg shadow-lg transition duration-200 flex items-center justify-center ${isCreateDisabled ? 'opacity-50 cursor-not-allowed' : 'hover:scale-105'}`}
                        >
                            {isCreating ? (
                                <>
                                    <span className="inline-block w-5 h-5 border-t-2 border-r-2 border-white border-solid rounded-full animate-spin mr-2"></span>
                                    Creating Pool...
                                </>
                            ) : (
                                'Create Pool'
                            )}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default CreatePool;