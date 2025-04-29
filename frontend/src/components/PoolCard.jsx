import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAccount } from 'wagmi';
import { usePoolBountyCount, useIsPoolOwner, useGetPoolById, useGetCurrentBountyYield, useGetPoolImageUrl } from '../hooks/useContractInteractions';
import { formatEth } from '../utils/helpers';
import { useContractRead } from 'wagmi';
import { CONTRACTS } from '../utils/contracts';
import { PoolABI } from '../utils/ContractABIs';
import { usePoolMetadata } from '../hooks/usePoolMetadata';

const PoolCard = ({ repositoryId }) => {
    const navigate = useNavigate();
    const { address } = useAccount();
    const { count: bountyCount, loading } = usePoolBountyCount(repositoryId);
    const { data: poolAddress } = useGetPoolById(repositoryId ? BigInt(repositoryId) : undefined);
    const { data: isOwner } = useIsPoolOwner(poolAddress);
    const [imageError, setImageError] = useState(false);
    const [formattedName, setFormattedName] = useState('');
    const { metadata, isLoading: isLoadingMetadata, error: metadataError } = usePoolMetadata(poolAddress);
    const [repoUrl, setRepoUrl] = useState('');
    const { data: bountyYield, isLoading: isLoadingYield } = useGetCurrentBountyYield(poolAddress);

    // Get the pool name
    const { data: poolName, isLoading: isLoadingName } = useContractRead({
        address: poolAddress,
        abi: PoolABI,
        functionName: 'getName',
        enabled: Boolean(poolAddress),
    });

    // Format the pool name in "owner/name" format and extract repository URL
    useEffect(() => {
        if (poolName) {
            // Check if the poolName contains the repo name only or already has owner/name format
            if (poolName.includes('/')) {
                setFormattedName(poolName);

                // Try to extract GitHub repository URL from the name (e.g., "owner/repo")
                const [owner, repo] = poolName.split('/');
                if (owner && repo) {
                    setRepoUrl(`https://github.com/${owner}/${repo}`);
                }
            } else {
                // Fallback to just showing the name
                setFormattedName(poolName);
            }
        } else if (repositoryId) {
            setFormattedName(`Repository #${repositoryId}`);
        }
    }, [poolName, repositoryId]);

    // Get the pool image URL
    const { data: imageUrl, isLoading: isLoadingImage } = useGetPoolImageUrl(poolAddress);

    // Process the image URL to handle IPFS links
    const processedImageUrl = React.useMemo(() => {
        if (!imageUrl || imageUrl === '' || imageError) {
            return null;
        }

        try {
            // Handle IPFS URLs with multiple gateway options
            if (imageUrl.startsWith('ipfs://')) {
                // Try different gateways for reliability
                const ipfsHash = imageUrl.replace('ipfs://', '');

                // Try Pinata gateway first
                return `https://gateway.pinata.cloud/ipfs/${ipfsHash}`;
            }

            // Return the URL as is if it's already HTTP/HTTPS
            return imageUrl;
        } catch (error) {
            console.error('Error processing image URL:', error);
            return null;
        }
    }, [imageUrl, imageError]);

    // Create a backup URL to try if the primary gateway fails
    const backupImageUrl = React.useMemo(() => {
        if (!imageUrl || !imageUrl.startsWith('ipfs://')) return null;

        // Use a different IPFS gateway as backup
        const ipfsHash = imageUrl.replace('ipfs://', '');
        return `https://ipfs.io/ipfs/${ipfsHash}`;
    }, [imageUrl]);

    // Create a third backup URL for extremely resilient loading
    const tertiaryImageUrl = React.useMemo(() => {
        if (!imageUrl || !imageUrl.startsWith('ipfs://')) return null;

        // Use Cloudflare IPFS gateway as a third option
        const ipfsHash = imageUrl.replace('ipfs://', '');
        return `https://cloudflare-ipfs.com/ipfs/${ipfsHash}`;
    }, [imageUrl]);

    const handleImageError = () => {
        setImageError(true);
    };

    const handleCardClick = () => {
        navigate(`/pool/${repositoryId}`);
    };

    const handleRepoClick = (e) => {
        e.stopPropagation();
        if (repoUrl) {
            window.open(repoUrl, '_blank');
        }
    };

    // Only show image if we have a valid URL and it hasn't failed to load
    const showImage = processedImageUrl && !imageError;

    // Use a data URL for the fallback image with the proper font
    const fallbackImage = "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAwIiBoZWlnaHQ9IjE1MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMzAwIiBoZWlnaHQ9IjE1MCIgZmlsbD0iIzM0M2E0MCIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LWZhbWlseT0iJ0ludGVyJywgc2Fucy1zZXJpZiIgZm9udC1zaXplPSIxOHB4IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBhbGlnbm1lbnQtYmFzZWxpbmU9Im1pZGRsZSIgZmlsbD0id2hpdGUiPkJvdW50eVBvb2w8L3RleHQ+PC9zdmc+";

    if (isLoadingMetadata) {
        return (
            <div className="bg-dark-bg rounded-lg p-6 shadow-lg animate-pulse">
                <div className="h-48 bg-gray-700 rounded-lg mb-4"></div>
                <div className="h-4 bg-gray-700 rounded w-3/4 mb-2"></div>
                <div className="h-4 bg-gray-700 rounded w-1/2"></div>
            </div>
        );
    }

    if (metadataError) {
        return (
            <div className="bg-dark-bg rounded-lg p-6 shadow-lg">
                <div className="text-red-500">Failed to load pool metadata</div>
            </div>
        );
    }

    return (
        <div
            className="bg-gradient-to-r from-gradient-purple/20 to-gradient-blue/20 rounded-xl border border-gradient-purple/30 overflow-hidden hover:shadow-xl transition-all duration-300 cursor-pointer w-full h-full relative group hover:scale-[1.02] transform"
            onClick={handleCardClick}
            style={{ maxWidth: '450px' }}
        >
            {/* Background image with darkening overlay */}
            {showImage ? (
                <>
                    <div
                        className="absolute inset-0 w-full h-full"
                        style={{
                            backgroundImage: `url(${processedImageUrl})`,
                            backgroundSize: 'cover',
                            backgroundPosition: 'center',
                            opacity: 0.5
                        }}
                    />
                    {/* Dark gradient overlay for better text readability */}
                    <div className="absolute inset-0 w-full h-full bg-gradient-to-b from-transparent via-black/40 to-black/80 group-hover:opacity-90 transition-opacity duration-300" />
                </>
            ) : (
                <div className="absolute inset-0 w-full h-full bg-gradient-to-br from-gradient-blue/10 to-gradient-purple/10 group-hover:from-gradient-blue/15 group-hover:to-gradient-purple/15 transition-all duration-300" />
            )}

            {/* Content overlay */}
            <div className="relative z-10">
                {/* Top section */}
                <div className="p-5 text-right">
                    <h3 className="text-xl font-bold">
                        {isLoadingName ? (
                            <span className="text-white">Loading...</span>
                        ) : repoUrl ? (
                            <button
                                onClick={handleRepoClick}
                                className="text-white hover:underline text-right font-bold hover:text-gradient-pink transition-colors duration-300"
                            >
                                {formattedName}
                            </button>
                        ) : (
                            <span className="text-white">{formattedName}</span>
                        )}
                    </h3>
                </div>

                {/* Middle section */}
                <div className="px-5 text-right">
                    <div className="mb-3">
                        <span className="text-white/80">Bounties: </span>
                        <span className="text-blue-300 font-semibold bg-blue-900/30 px-2 py-1 rounded-md">
                            {loading ? 'Loading...' : bountyCount}
                        </span>
                    </div>

                    <div className="mb-3">
                        <span className="text-white/80">Current Bounty Yield: </span>
                        <span className="text-pink-400 font-semibold bg-pink-900/30 px-2 py-1 rounded-md inline-block mt-1">
                            {isLoadingYield ? 'Loading...' : `${formatEth(bountyYield || '0')} ETH`}
                        </span>
                    </div>

                    {isOwner && (
                        <div className="mb-6">
                            <span className="bg-gradient-to-r from-purple-500/40 to-pink-500/40 text-xs px-3 py-1 rounded-full text-pink-300 font-medium shadow-sm">
                                You own this pool
                            </span>
                        </div>
                    )}

                    {!isOwner && <div className="mb-6"></div>}
                </div>

                {/* Bottom section with action button */}
                <div className="p-5 mt-auto">
                    <button
                        className="w-full bg-gradient-to-r from-gradient-purple to-gradient-blue text-white py-2.5 rounded-md hover:opacity-90 transition-all duration-300 font-medium shadow-md hover:shadow-lg relative overflow-hidden group-hover:scale-105 transform"
                        onClick={(e) => {
                            e.stopPropagation(); // Stop event propagation to prevent double navigation
                            navigate(`/pool/${repositoryId}`);
                        }}
                    >
                        <span className="relative z-10">View Pool</span>
                        <span className="absolute inset-0 w-full h-full bg-white/10 transform -translate-x-full group-hover:translate-x-0 transition-transform duration-300"></span>
                    </button>
                </div>
            </div>
        </div>
    );
};

export default PoolCard; 