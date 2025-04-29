import { createConfig, configureChains } from 'wagmi';
import { publicProvider } from 'wagmi/providers/public';
import { jsonRpcProvider } from 'wagmi/providers/jsonRpc';
import { localhost } from 'wagmi/chains';
import { RPC_URL } from './contracts';

// Create a custom chain for Arbitrum Sepolia that anvil is forking
const arbitrumSepoliaFork = {
    ...localhost,
    id: 421614, // Arbitrum Sepolia chain ID
    name: 'Arbitrum Sepolia (Fork)',
    network: 'arbitrum-sepolia',
    nativeCurrency: {
        name: 'Ethereum',
        symbol: 'ETH',
        decimals: 18,
    }
};

// Configure the chains with Anvil provider
const { chains, publicClient, webSocketPublicClient } = configureChains(
    [arbitrumSepoliaFork],
    [
        jsonRpcProvider({
            rpc: () => ({
                http: RPC_URL,
            }),
        }),
        publicProvider(),
    ]
);

// Create Wagmi config
export const wagmiConfig = createConfig({
    autoConnect: true,
    publicClient,
    webSocketPublicClient,
});

export { chains }; 