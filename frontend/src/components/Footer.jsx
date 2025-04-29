import React from 'react';

const Footer = () => {
    return (
        <footer className="bg-dark-bg text-white py-4 border-t border-gray-800">
            <div className="container mx-auto px-6">
                <div className="flex flex-col md:flex-row justify-between items-center">
                    <div className="mb-2 md:mb-0">
                        <h3 className="text-lg font-bold text-white">BountyPool</h3>
                        <p className="text-gray-400 text-sm">Crowdsource Open-Source Rewards</p>
                    </div>

                    <div className="text-center text-gray-400 text-sm hidden md:block">
                        <p>© {new Date().getFullYear()} BountyPool. All rights reserved.</p>
                    </div>

                    <div className="flex space-x-8">
                        <a
                            href="https://github.com"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-white hover:text-gradient-blue transition-colors"
                        >
                            GitHub
                        </a>
                        <a
                            href="#"
                            className="text-sm text-white hover:text-gradient-blue transition-colors"
                        >
                            Docs
                        </a>
                        <a
                            href="#"
                            className="text-sm text-white hover:text-gradient-blue transition-colors"
                        >
                            Contact
                        </a>
                    </div>
                </div>

                {/* Show copyright in mobile view */}
                <div className="text-center text-gray-400 text-xs mt-4 md:hidden">
                    <p>© {new Date().getFullYear()} BountyPool. All rights reserved.</p>
                </div>
            </div>
        </footer>
    );
};

export default Footer; 