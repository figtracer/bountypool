import axios from 'axios';

// Get environment variables safely
const getEnv = (key, fallback = '') => {
    if (typeof window !== 'undefined' && window.env && window.env[key]) {
        return window.env[key];
    }
    if (typeof process !== 'undefined' && process.env && process.env[key]) {
        return process.env[key];
    }
    return fallback;
};

// Pinata API configuration
const PINATA_API_KEY = getEnv('REACT_APP_PINATA_API_KEY');
const PINATA_SECRET_API_KEY = getEnv('REACT_APP_PINATA_SECRET_API_KEY');
const PINATA_JWT = getEnv('REACT_APP_PINATA_JWT');

/**
 * Uploads a file to IPFS via Pinata
 * @param {File} file - The file to upload
 * @param {Object} metadata - Optional metadata for the file (name, keyvalues)
 * @returns {Promise<string>} - Returns the IPFS hash/CID
 */
export async function uploadFileToPinata(file, metadata = {}) {
    if (!file) {
        throw new Error('No file provided');
    }

    try {
        // Create form data
        const formData = new FormData();
        formData.append('file', file);

        // Add metadata if provided
        if (metadata) {
            const metadataObj = {
                name: metadata.name || `bountypool-${Date.now()}`,
                keyvalues: metadata.keyvalues || {}
            };
            formData.append('pinataMetadata', JSON.stringify(metadataObj));
        }

        // Set pinata options
        const pinataOptions = JSON.stringify({
            cidVersion: 0,
        });
        formData.append('pinataOptions', pinataOptions);

        // Make API request
        let response;

        if (PINATA_JWT) {
            // If using JWT (preferred method)
            response = await axios.post('https://api.pinata.cloud/pinning/pinFileToIPFS', formData, {
                headers: {
                    'Authorization': `Bearer ${PINATA_JWT}`,
                    'Content-Type': 'multipart/form-data'
                }
            });
        } else if (PINATA_API_KEY && PINATA_SECRET_API_KEY) {
            // Fallback to API key & secret
            response = await axios.post('https://api.pinata.cloud/pinning/pinFileToIPFS', formData, {
                headers: {
                    'pinata_api_key': PINATA_API_KEY,
                    'pinata_secret_api_key': PINATA_SECRET_API_KEY,
                    'Content-Type': 'multipart/form-data'
                }
            });
        } else {
            throw new Error('Pinata API credentials not found. Please check your environment variables.');
        }

        // Return the IPFS hash
        return response.data.IpfsHash;
    } catch (error) {
        console.error('Error uploading to Pinata:', error);
        throw new Error(error.response?.data?.error || error.message || 'Failed to upload to IPFS');
    }
}

/**
 * Converts an IPFS hash to a full URL with protocol
 * @param {string} hash - The IPFS hash/CID
 * @param {boolean} useGateway - Whether to use the Pinata gateway (true) or ipfs:// protocol (false)
 * @returns {string} - The complete IPFS URL
 */
export function getIpfsUrl(hash, useGateway = false) {
    if (!hash) return '';

    // If it's already a URL, return it
    if (hash.startsWith('http') || hash.startsWith('ipfs://')) {
        if (useGateway && hash.startsWith('ipfs://')) {
            return `https://gateway.pinata.cloud/ipfs/${hash.replace('ipfs://', '')}`;
        }
        return hash;
    }

    // Otherwise, format it properly
    return useGateway
        ? `https://gateway.pinata.cloud/ipfs/${hash}`
        : `ipfs://${hash}`;
}

/**
 * Checks if Pinata credentials are configured
 * @returns {boolean} - Whether credentials are available
 */
export function isPinataConfigured() {
    return Boolean(PINATA_JWT || (PINATA_API_KEY && PINATA_SECRET_API_KEY));
}

/**
 * Convert an ipfs:// URL to a gateway URL
 * @param {string} ipfsUrl - The IPFS URL with ipfs:// protocol
 * @returns {string} - The gateway URL
 */
export function ipfsToHttpUrl(ipfsUrl) {
    if (!ipfsUrl) return '';

    if (ipfsUrl.startsWith('ipfs://')) {
        return `https://gateway.pinata.cloud/ipfs/${ipfsUrl.replace('ipfs://', '')}`;
    }

    return ipfsUrl; // Return as is if not ipfs://
}

/**
 * Validates an image file
 * @param {File} file - The file to validate
 * @param {number} maxSize - Max size in bytes (default 5MB)
 * @returns {Object} - { valid: boolean, error: string | null }
 */
export function validateImageFile(file, maxSize = 5 * 1024 * 1024) {
    if (!file) {
        return { valid: false, error: 'No file provided' };
    }

    // Validate file type
    const validImageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!validImageTypes.includes(file.type)) {
        return {
            valid: false,
            error: 'Please select a valid image file (JPEG, PNG, GIF, WEBP)'
        };
    }

    // Validate file size
    if (file.size > maxSize) {
        return {
            valid: false,
            error: `Image size must be less than ${maxSize / (1024 * 1024)}MB`
        };
    }

    return { valid: true, error: null };
} 