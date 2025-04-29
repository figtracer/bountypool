import React from 'react';
import { Link } from 'react-router-dom';
import { FaCoins, FaCodeBranch, FaTrophy } from 'react-icons/fa';

const Home = () => {
    return (
        <div className="text-white font-afacad min-h-screen flex flex-col">
            {/* Hero Section */}
            <div className="text-center py-24 px-6 relative overflow-hidden bg-gradient-to-b from-dark-bg via-gray-900/70 to-dark-bg flex-grow flex flex-col justify-center">
                {/* Animated background blobs */}
                <div className="absolute top-0 -left-4 w-72 h-72 bg-gradient-purple/30 rounded-full filter blur-3xl opacity-50 animate-blob"></div>
                <div className="absolute top-0 -right-4 w-72 h-72 bg-gradient-blue/30 rounded-full filter blur-3xl opacity-50 animate-blob animation-delay-2000"></div>
                <div className="absolute -bottom-8 left-20 w-72 h-72 bg-gradient-pink/30 rounded-full filter blur-3xl opacity-50 animate-blob animation-delay-4000"></div>

                <div className="relative z-10 max-w-4xl mx-auto">
                    <h1 className="text-6xl md:text-7xl font-bold mb-6 leading-tight">
                        <span className="gradient-text">Fuel Open Source</span> <br /> with DeFi Yield
                    </h1>
                    <p className="text-xl text-gray-300 mb-10 max-w-2xl mx-auto">
                        Contribute yield from your ETH deposits via Aave to fund bounties and accelerate innovation.
                    </p>
                    <Link to="/pools">
                        <button className="gradient-button px-8 py-4 text-lg font-semibold shadow-lg hover:shadow-xl transition-all duration-300 relative overflow-hidden group">
                            <span className="relative z-10">Explore Pools</span>
                            <span className="absolute inset-0 w-full h-full bg-white/10 transform -translate-x-full group-hover:translate-x-0 transition-transform duration-300"></span>
                        </button>
                    </Link>
                </div>
            </div>

            {/* How It Works Section */}
            <div className="py-20 px-6 bg-dark-bg relative">
                <h2 className="text-4xl font-bold text-center mb-16 gradient-text">How BountyPool Works</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-10 max-w-6xl mx-auto relative z-10">
                    {/* Step 1 */}
                    <div className="bg-gradient-to-br from-gray-800/50 to-gray-900/50 p-8 rounded-xl border border-gray-700/50 hover:border-gradient-purple/50 transition-all duration-300 hover:shadow-xl hover:-translate-y-2 transform flex flex-col items-center text-center">
                        <div className="mb-6 text-gradient-purple text-5xl">
                             <FaCoins />
                        </div>
                        <h3 className="text-xl font-bold mb-2">Contribute Yield</h3>
                        <p className="text-gray-400">
                            Contribute your ETH and allocate a percentage of your yield to fund open-source bounties.
                        </p>
                    </div>

                    {/* Step 2 */}
                    <div className="bg-gradient-to-br from-gray-800/50 to-gray-900/50 p-8 rounded-xl border border-gray-700/50 hover:border-gradient-blue/50 transition-all duration-300 hover:shadow-xl hover:-translate-y-2 transform flex flex-col items-center text-center">
                        <div className="mb-6 text-gradient-blue text-5xl">
                             <FaCodeBranch />
                        </div>
                        <h3 className="text-xl font-bold mb-2">Create Bounties</h3>
                        <p className="text-gray-400">
                            Repository owners create bounties for specific tasks with rewards from the yield pool.
                        </p>
                    </div>

                    {/* Step 3 */}
                    <div className="bg-gradient-to-br from-gray-800/50 to-gray-900/50 p-8 rounded-xl border border-gray-700/50 hover:border-gradient-pink/50 transition-all duration-300 hover:shadow-xl hover:-translate-y-2 transform flex flex-col items-center text-center">
                        <div className="mb-6 text-gradient-pink text-5xl">
                             <FaTrophy />
                        </div>
                        <h3 className="text-xl font-bold mb-2">Get Rewarded</h3>
                        <p className="text-gray-400">
                            Developers submit solutions and winners receive bounty rewards for their contributions.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Home;