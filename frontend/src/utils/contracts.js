import { BountyManagerABI, PoolFactoryABI } from './ContractABIs';

// Contract addresses from your deployment
// Updated with the latest deployment addresses
export const CONTRACT_ADDRESSES = {
    poolFactory: '0xDc9725c34a9ecC1D50BDA5428FAE710Bb6687A13',
    bountyManager: '0x08879bFF245a228a49b840Cf833c0DC1f2fCb4D4'
};

export const CONTRACTS = {
    poolFactory: {
        address: CONTRACT_ADDRESSES.poolFactory,
        abi: PoolFactoryABI
    },
    bountyManager: {
        address: CONTRACT_ADDRESSES.bountyManager,
        abi: BountyManagerABI
    }
};

// RPC URL - Update this based on your deployment network
export const RPC_URL = 'http://localhost:8545'; 
