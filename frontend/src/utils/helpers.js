import { ethers } from 'ethers';

/**
 * Format ETH value with a specified number of decimal places (default 5) without floating point errors.
 * @param {string|number|BigInt} value - The value in wei
 * @param {number} [decimals=4] - Number of decimal places to display
 * @returns {string} Formatted ETH value
 */
export function formatEth(value, decimals = 4) {
    const defaultReturnValue = '0.'.padEnd(2 + decimals, '0'); // e.g., '0.00000'
    if (!value) return defaultReturnValue;

    try {
        // Ensure we're working with a BigInt
        const bigIntValue = typeof value === 'bigint' ? value : BigInt(value.toString());
        const ethString = ethers.formatEther(bigIntValue); // Get precise string e.g., "1.23456789..." or "123"

        // Find the decimal point
        const decimalPointIndex = ethString.indexOf('.');

        if (decimalPointIndex === -1) {
            // It's a whole number, add .00000...
            return ethString + '.'.padEnd(1 + decimals, '0');
        } else {
            // It has a decimal part
            const requiredLength = decimalPointIndex + 1 + decimals;
            // Truncate the string to the required length
            let truncatedString = ethString.substring(0, requiredLength);
            // Pad with zeros if the original string was shorter than required decimals
            truncatedString = truncatedString.padEnd(requiredLength, '0');
            return truncatedString;
        }
    } catch (error) {
        console.error('Error formatting ETH value:', error, 'Input value:', value);
        return defaultReturnValue;
    }
}

/**
 * Convert ETH to Wei
 * @param {string|number|BigInt} eth - The ETH amount
 * @returns {string} The Wei amount as a string
 */
export function toWei(eth) {
    if (!eth) return '0';

    // Handle BigInt values by converting to string first
    const ethStr = typeof eth === 'bigint' ? eth.toString() : eth.toString();

    if (isNaN(Number(ethStr))) return '0';
    return ethers.parseEther(ethStr).toString();
}

/**
 * Format timestamp to readable date
 * @param {number|BigInt} timestamp - Unix timestamp
 * @returns {string} Formatted date
 */
export function formatDate(timestamp) {
    // Convert BigInt to Number if necessary
    const numericTimestamp = typeof timestamp === 'bigint' ? Number(timestamp) : Number(timestamp);
    return new Date(numericTimestamp * 1000).toLocaleDateString();
}

/**
 * Format address for display
 * @param {string} address - Ethereum address
 * @returns {string} Shortened address
 */
export function formatAddress(address) {
    if (!address) return '';
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
}

/**
 * Get bounty status as a readable string
 * @param {number} status - Bounty status enum value
 * @returns {string} Readable status
 */
export function getBountyStatusText(status) {
    const statusMap = {
        0: 'Open',
        1: 'Closed',
        2: 'Finished'
    };
    return statusMap[status] || 'Unknown';
}

/**
 * Get bounty status class for styling
 * @param {number} status - Bounty status enum value
 * @returns {string} CSS class for status
 */
export function getBountyStatusClass(status) {
    const statusMap = {
        0: 'text-gradient-blue',
        1: 'text-yellow-500',
        2: 'text-green-500'
    };
    return statusMap[status] || '';
}

/**
 * Calculate days remaining until withdrawal is available
 * @param {number|BigInt} lastWithdrawalTimestamp - Last withdrawal timestamp
 * @param {number} withdrawalPeriod - Withdrawal period in seconds (default: 90 days)
 * @returns {object} Object with days remaining and availability status
 */
export function calculateWithdrawalAvailability(lastWithdrawalTimestamp, withdrawalPeriod = 30 * 24 * 60 * 60) {
    // If there's no last withdrawal timestamp, user can withdraw now
    if (!lastWithdrawalTimestamp) return { daysRemaining: 0, isAvailable: true, text: 'Available Now' };

    const currentTime = Math.floor(Date.now() / 1000);
    const timestampNumber = typeof lastWithdrawalTimestamp === 'bigint' ?
        Number(lastWithdrawalTimestamp) : Number(lastWithdrawalTimestamp);

    // Next availability is lastWithdrawal + 90 days
    const nextAvailability = timestampNumber + withdrawalPeriod;

    // If current time is greater than or equal to next availability, user can withdraw
    if (currentTime >= nextAvailability) {
        return { daysRemaining: 0, isAvailable: true, text: 'Available Now' };
    }

    // Calculate days remaining until next withdrawal
    const secondsRemaining = nextAvailability - currentTime;
    const daysRemaining = Math.ceil(secondsRemaining / (24 * 60 * 60));

    return {
        daysRemaining,
        isAvailable: false,
        text: `Available in ${daysRemaining} day${daysRemaining !== 1 ? 's' : ''}`
    };
}

/**
 * Calculate days remaining until principal withdrawal is available
 * @param {number|BigInt} depositTimestamp - Deposit timestamp
 * @param {number} lockPeriod - Lock period in seconds (default: 30 days)
 * @returns {object} Object with days remaining and availability status
 */
export function calculatePrincipalWithdrawalAvailability(depositTimestamp, lockPeriod = 30 * 24 * 60 * 60) {
    if (!depositTimestamp) return { daysRemaining: 0, isAvailable: false, text: 'Invalid deposit' };

    const currentTime = Math.floor(Date.now() / 1000);
    const timestampNumber = typeof depositTimestamp === 'bigint' ?
        Number(depositTimestamp) : Number(depositTimestamp);

    // Withdrawal is available after lockPeriod (30 days)
    const availableAt = timestampNumber + lockPeriod;

    // If current time is greater than or equal to availability, user can withdraw
    if (currentTime >= availableAt) {
        return { daysRemaining: 0, isAvailable: true, text: 'Available Now' };
    }

    // Calculate days remaining until withdrawal is available
    const secondsRemaining = availableAt - currentTime;
    const daysRemaining = Math.ceil(secondsRemaining / (24 * 60 * 60));

    return {
        daysRemaining,
        isAvailable: false,
        text: `Available in ${daysRemaining} day${daysRemaining !== 1 ? 's' : ''}`
    };
}

/**
 * Calculate time left until withdrawal is available in a human-readable format
 * @param {number|BigInt} lastWithdrawalTimestamp - Last withdrawal timestamp
 * @param {number} daysLock - Number of days for the lock period
 * @returns {string|null} - Human-readable time left or null if no lock
 */
export function calculateTimeLeft(lastWithdrawalTimestamp, daysLock = 30) {
    if (!lastWithdrawalTimestamp || lastWithdrawalTimestamp === 0) return null;

    try {
        const lockPeriodSeconds = daysLock * 24 * 60 * 60;
        const currentTime = Math.floor(Date.now() / 1000);
        const timestampNumber = typeof lastWithdrawalTimestamp === 'bigint' ?
            Number(lastWithdrawalTimestamp) : Number(lastWithdrawalTimestamp);

        const nextAvailability = timestampNumber + lockPeriodSeconds;

        // If current time is greater than or equal to next availability, no lock
        if (currentTime >= nextAvailability) {
            return null;
        }

        const secondsRemaining = nextAvailability - currentTime;

        // Sanity check - if somehow we got a negative or excessive value, return null
        if (secondsRemaining < 0 || secondsRemaining > 365 * 24 * 60 * 60) {
            console.warn("Invalid time remaining:", secondsRemaining);
            return null;
        }

        const daysRemaining = Math.floor(secondsRemaining / (24 * 60 * 60));
        const hoursRemaining = Math.floor((secondsRemaining % (24 * 60 * 60)) / 3600);

        if (daysRemaining > 0) {
            return `${daysRemaining} day${daysRemaining !== 1 ? 's' : ''}`;
        } else {
            return `${hoursRemaining} hour${hoursRemaining !== 1 ? 's' : ''}`;
        }
    } catch (error) {
        console.error("Error calculating time left:", error);
        return null;
    }
}

/**
 * Advance time in Anvil network
 * @param {number} seconds - Number of seconds to advance
 * @returns {Promise<void>}
 */
export async function advanceTime(seconds) {
    const provider = new ethers.JsonRpcProvider('http://localhost:8545');

    // Increase time by sending an RPC request
    await provider.send('evm_increaseTime', [seconds]);

    // Mine a new block to apply the time change
    await provider.send('evm_mine', []);
}

export const fromWei = (bigIntValue) => {
    if (!bigIntValue) return '0';
    try {
        return parseFloat(ethers.formatEther(bigIntValue)).toFixed(3);
    } catch (error) {
        console.error('Error in fromWei function:', error);
        return '0';
    }
}

/**
 * Convert a 1e18‑scaled allocation (WAD) to a human‑readable percentage string.
 * e.g. 0.66 * 1e18  ->  "66.00" (decimals = 2)
 * @param {string|number|BigInt} wadAllocation - Allocation in 1e18 scale
 * @param {number} [decimals=2] - Decimal places in the returned string
 * @returns {string} Percentage string, e.g. "66.00"
 */
export function formatAllocationPercent(wadAllocation, decimals = 2) {
    if (!wadAllocation) return '0.'.padEnd(2 + decimals, '0');

    try {
        const bigIntValue = typeof wadAllocation === 'bigint'
            ? wadAllocation
            : BigInt(wadAllocation.toString());

        // Divide by 1e16 → brings 1e18‑scaled fraction into a human percentage
        // e.g. 0.66 * 1e18 / 1e16 = 66
        const scaled = bigIntValue / 10n ** 16n; // bigint centi‑percent precision

        const num = Number(scaled);
        return (num / 1).toFixed(decimals); // ensure Number, then format
    } catch (err) {
        console.error('Error formatting allocation percent:', err, 'input:', wadAllocation);
        return '0.'.padEnd(2 + decimals, '0');
    }
}