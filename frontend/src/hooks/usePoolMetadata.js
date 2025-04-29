import { useState, useEffect } from 'react';
import { useContractRead } from 'wagmi';
import { CONTRACTS } from '../utils/contracts';
import { PoolABI } from '../utils/ContractABIs';

export const usePoolMetadata = (poolAddress) => {
    const [metadata, setMetadata] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    // Read the pool name from the contract
    const { data: poolName, isLoading: isLoadingName } = useContractRead({
        address: poolAddress,
        abi: PoolABI,
        functionName: 'getName',
        enabled: Boolean(poolAddress),
    });

    // Read the pool image URL from the contract
    const { data: imageUrl, isLoading: isLoadingImage } = useContractRead({
        address: poolAddress,
        abi: PoolABI,
        functionName: 'getImageUrl',
        enabled: Boolean(poolAddress),
    });

    // Process the data into a metadata object
    useEffect(() => {
        if (isLoadingName || isLoadingImage) {
            setIsLoading(true);
            return;
        }

        try {
            // Construct a metadata object from the available data
            const processedMetadata = {
                name: poolName || 'Unnamed Pool',
                image: imageUrl || '',
                // We don't have direct access to repository URL through contract functions
                // Will need to be set another way or passed as a prop
                repository: '',
            };

            setMetadata(processedMetadata);
            setError(null);
        } catch (err) {
            console.error('Error processing pool metadata:', err);
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    }, [poolName, imageUrl, isLoadingName, isLoadingImage]);

    return {
        metadata,
        isLoading,
        error,
    };
}; 