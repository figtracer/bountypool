import React, { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { Link, useNavigate } from 'react-router-dom';
import { readContract, getPublicClient } from 'wagmi/actions';
import { useGetAllPools, useGetPoolCreationFee } from '../hooks/useContractInteractions';
import { CONTRACTS, RPC_URL } from '../utils/contracts';
import PoolCard from '../components/PoolCard';
import { formatEther } from 'viem';

const Pools = () => {
    const navigate = useNavigate();
    const { address, isConnected } = useAccount();
    const { pools: userPools, isLoading: isLoadingUserPools, error: userPoolsError } = useGetAllPools();
    const { data: poolCreationFee } = useGetPoolCreationFee();
    const [allPools, setAllPools] = useState([]);
    const [filteredPools, setFilteredPools] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [viewMode, setViewMode] = useState('all'); // 'all' or 'mine'

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

    // Fetch all pools
    useEffect(() => {
        const fetchAllPools = async () => {
            if (!isConnected) return;

            setLoading(true);
            setError(null);
            try {
                // Get total pool count
                const poolCount = await readContract({
                    address: CONTRACTS.poolFactory.address,
                    abi: CONTRACTS.poolFactory.abi,
                    functionName: 'getPoolCount',
                });

                console.log("Total pool count:", poolCount);

                // Get all pool IDs
                const poolIds = [];
                for (let i = 1; i <= poolCount; i++) {
                    try {
                        // Check if pool exists by trying to get its address
                        const poolAddr = await readContract({
                            address: CONTRACTS.poolFactory.address,
                            abi: CONTRACTS.poolFactory.abi,
                            functionName: 'getPoolById',
                            args: [BigInt(i)],
                        });

                        if (poolAddr && poolAddr !== '0x0000000000000000000000000000000000000000') {
                            poolIds.push(i.toString());
                            console.log(`Found pool ID ${i} at address ${poolAddr}`);
                        }
                    } catch (error) {
                        console.warn(`Pool ID ${i} might not exist:`, error);
                    }
                }

                console.log("Found pool IDs:", poolIds);
                setAllPools(poolIds);
                setLoading(false);
            } catch (err) {
                console.error('Error fetching pools:', err);
                setError('Failed to load pools');
                setLoading(false);
            }
        };

        fetchAllPools();
    }, [isConnected]);

    // Process pools based on view mode
    useEffect(() => {
        if (viewMode === 'all' && allPools.length > 0) {
            setFilteredPools(allPools);
        } else if (viewMode === 'mine' && userPools) {
            // Debug logging to help troubleshoot
            console.log("User pools:", userPools);
            console.log("User address:", address);

            // Fix: Ensure we're checking owner correctly and only including valid pools
            const userPoolIds = userPools
                .filter(pool => pool && pool.owner && address && pool.owner.toLowerCase() === address.toLowerCase())
                .map(pool => pool.id.toString());

            console.log("Filtered user pool IDs:", userPoolIds);
            setFilteredPools(userPoolIds);
        }
    }, [viewMode, allPools, userPools, address]);

    // Handle navigation to create pool page
    const handleCreatePool = () => {
        navigate('/create-pool');
    };

    return (
        <div className="container mx-auto px-6 py-8 mt-8">
            {/* Removed standalone Create New Pool Button */}

            {isConnected && (
                <div className="flex justify-center mb-10">
                    <div className="bg-gray-800/80 backdrop-blur-sm rounded-full p-1.5 flex shadow-lg border border-gray-700/50 items-center">
                        <button
                            className={`px-6 py-2.5 rounded-full font-medium transition-all duration-300 ${viewMode === 'all' ? 'bg-gradient-to-r from-gradient-purple to-gradient-blue text-white shadow-md' : 'text-gray-300 hover:text-white'}`}
                            onClick={() => setViewMode('all')}
                        >
                            All Pools
                        </button>
                        <button
                            className={`px-6 py-2.5 rounded-full font-medium transition-all duration-300 ${viewMode === 'mine' ? 'bg-gradient-to-r from-gradient-purple to-gradient-blue text-white shadow-md' : 'text-gray-300 hover:text-white'}`}
                            onClick={() => setViewMode('mine')}
                        >
                            My Pools
                        </button>
                        <div className="h-8 mx-2 w-px bg-gray-700/50"></div>
                        <button
                            onClick={handleCreatePool}
                            className="px-6 py-2.5 rounded-full font-medium transition-all duration-300 bg-gradient-to-r from-gradient-pink to-gradient-purple text-white shadow-md hover:opacity-90"
                        >
                            <span className="flex items-center">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                </svg>
                                New Pool {poolCreationFee && `(${formatETH(poolCreationFee)} ETH)`}
                            </span>
                        </button>
                    </div>
                </div>
            )}

            {!isConnected ? (
                <div className="text-center max-w-lg mx-auto bg-gradient-to-r from-gradient-purple/10 to-gradient-blue/10 p-10 rounded-xl backdrop-blur-sm border border-gray-700/30 shadow-xl">
                    <div className="mb-4 text-gradient-blue opacity-75">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                    </div>
                    <p className="text-white text-lg font-medium mb-2">Connect Your Wallet</p>
                    <p className="text-gray-300">Connect your wallet to view and interact with bounty pools.</p>
                </div>
            ) : loading || isLoadingUserPools ? (
                <div className="text-center py-12">
                    <div className="relative inline-block">
                        <div className="absolute inset-0 bg-gradient-to-r from-gradient-purple to-gradient-blue blur-md opacity-50 animate-pulse"></div>
                        <div className="relative inline-block w-16 h-16 border-4 border-gradient-blue border-t-gradient-pink rounded-full animate-spin"></div>
                    </div>
                    <p className="mt-6 text-gray-300 text-lg">Loading pools...</p>
                </div>
            ) : error ? (
                <div className="text-center max-w-lg mx-auto bg-red-900/20 p-8 rounded-xl backdrop-blur-sm border border-red-800/30 shadow-lg">
                    <div className="mb-4 text-red-400">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                    </div>
                    <p className="text-white text-lg font-medium mb-2">Error Loading Pools</p>
                    <p className="text-red-200">We couldn't load the pools. Please try again later.</p>
                </div>
            ) : filteredPools?.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 relative">
                    {/* Background decorative elements - consider removing if distracting or performance-impacting */}
                    <div className="absolute -top-20 -left-20 w-64 h-64 bg-gradient-purple/20 rounded-full filter blur-3xl opacity-50 animate-blob animation-delay-2000"></div>
                    <div className="absolute top-1/3 -right-20 w-72 h-72 bg-gradient-blue/20 rounded-full filter blur-3xl opacity-50 animate-blob animation-delay-4000"></div>
                    {filteredPools.map((poolId) => (
                        <PoolCard key={poolId} repositoryId={poolId} />
                    ))}
                </div>
            ) : (
                <div className="max-w-lg mx-auto bg-gradient-to-r from-gradient-purple/10 to-gradient-blue/10 p-10 rounded-xl backdrop-blur-sm border border-gray-700/30 shadow-xl text-center">
                    <div className="mb-6 text-gradient-blue opacity-75">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    </div>
                    <p className="text-white text-xl font-medium mb-3">
                        {viewMode === 'all' ? 'No pools created yet' : 'You haven\'t created any pools'}
                    </p>
                    <p className="text-gray-300 mb-6">
                        {viewMode === 'all' ? 'Create a pool to start funding bounties!' : 'Create a pool to get started!'}
                    </p>
                    {isConnected && (
                        <button
                            onClick={handleCreatePool}
                            className="px-6 py-2.5 rounded-full font-medium transition-all duration-300 bg-gradient-to-r from-gradient-pink to-gradient-purple text-white shadow-md hover:opacity-90 mt-2"
                        >
                            Create New Pool
                        </button>
                    )}
                </div>
            )}
        </div>
    );
};

export default Pools; 