import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAccount, useConnect, useDisconnect } from 'wagmi';
import { formatAddress } from '../utils/helpers';
import { useEthBalance } from '../hooks/useContractInteractions';
import logo from '../assets/BOUNTYPOOL.png';

const Navbar = () => {
    const { address, isConnected } = useAccount();
    const { connect, connectors } = useConnect();
    const { disconnect } = useDisconnect();
    const location = useLocation();
    const { formatted: formattedBalance, symbol, isLoading: isBalanceLoading } = useEthBalance(address);

    // Format the ETH balance to 4 decimal places
    const formatBalance = (balance) => {
        if (!balance) return '0.000';
        try {
            // Parse the string to a number, format to 4 decimal places, then convert back to string
            return parseFloat(balance).toFixed(3);
        } catch (error) {
            console.error('Error formatting balance:', error);
            return balance; // Return original if parsing fails
        }
    };

    const isActive = (path) => {
        return location.pathname === path ? 'font-bold underline' : '';
    };

    return (
        <nav className="fixed top-0 left-0 w-full bg-dark-bg shadow-lg z-50">
            <div className="container mx-auto px-8 py-5 flex items-center justify-between">
                {/* Logo - left aligned */}
                <div className="flex-1 min-w-0">
                    <Link to="/" className="flex items-center">
                        <img src={logo} alt="BountyPool Logo" className="h-10" />
                    </Link>
                </div>

                {/* Navigation Links - centered with even spacing */}
                <div className="hidden md:flex flex-1 justify-center">
                    <div className="flex items-center space-x-8">
                        <Link to="/" className={`text-base text-white hover:font-bold transition-all ${isActive('/')}`}>
                            Home
                        </Link>
                        <Link to="/pools" className={`text-base text-white hover:font-bold transition-all ${isActive('/pools')}`}>
                            Pools
                        </Link>
                    </div>
                </div>

                {/* Wallet - right aligned */}
                <div className="flex-1 flex justify-end min-w-0">
                    {isConnected ? (
                        <div className="flex items-center space-x-3 flex-wrap justify-end">
                            {/* ETH Balance Pill */}
                            <div className="bg-gradient-to-r from-gradient-blue/30 to-gradient-purple/30 px-2 py-1 rounded-md flex items-center">
                                <span className="text-gradient-pink text-base whitespace-nowrap overflow-hidden text-ellipsis">
                                    {isBalanceLoading ? 'Loading...' : `${formatBalance(formattedBalance)} ${symbol}`}
                                </span>
                            </div>

                            {/* Address Pill - clickable for disconnect */}
                            <span
                                onClick={() => disconnect()}
                                className="bg-gradient-to-r from-gradient-blue to-gradient-pink p-[1px] rounded-md cursor-pointer hover:opacity-90"
                                title="Click to disconnect wallet"
                            >
                                <div className="bg-dark-bg px-3 py-1.5 rounded-md text-base flex items-center">
                                    {formatAddress(address)}
                                </div>
                            </span>
                        </div>
                    ) : (
                        <button
                            onClick={() => connect({ connector: connectors[0] })}
                            className="gradient-button text-base px-4 py-2"
                        >
                            Connect Wallet
                        </button>
                    )}
                </div>
            </div>

            {/* Mobile Navigation - evenly spaced */}
            <div className="md:hidden container mx-auto px-8 pb-3 flex justify-between">
                <Link to="/" className={`text-sm text-white ${isActive('/')}`}>
                    Home
                </Link>
                <Link to="/pools" className={`text-sm text-white ${isActive('/pools')}`}>
                    Pools
                </Link>
                {isConnected && (
                    <span className="text-sm text-gradient-pink">
                        {isBalanceLoading ? 'Loading...' : `${formatBalance(formattedBalance)} ${symbol}`}
                    </span>
                )}
            </div>
        </nav>
    );
};

export default Navbar; 