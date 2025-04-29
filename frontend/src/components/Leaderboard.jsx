import React from 'react';
import { usePoolContributors } from '../hooks/useContractInteractions';
import { formatEth, formatAddress } from '../utils/helpers';

const Leaderboard = ({ poolId }) => {
    const { data: contributors, isLoading, error } = usePoolContributors(poolId);

    // Filter out contributors with 0 ETH
    const activeContributors = contributors ? contributors.filter(contributor =>
        contributor.totalContributed && BigInt(contributor.totalContributed) > BigInt(0)
    ) : [];

    return (
        <div className="bg-gradient-to-r from-gradient-purple to-gradient-blue p-[1px] rounded-lg">
            <div className="bg-dark-bg p-4 rounded-lg">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-bold">Top Contributors Leaderboard</h2>
                    <div className="flex items-center text-sm text-gray-400">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 mr-1">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 0 1 3 3h-15a3 3 0 0 1 3-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 0 1-.982-3.172M9.497 14.25a7.454 7.454 0 0 0 .981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 0 0 7.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M7.73 9.728a6.726 6.726 0 0 0 2.748 1.35m8.272-6.842V4.5c0 2.108-.966 3.99-2.48 5.228m2.48-5.492a46.32 46.32 0 0 1 2.916.52 6.003 6.003 0 0 1-5.395 4.972m0 0a6.726 6.726 0 0 1-2.749 1.35m0 0a6.772 6.772 0 0 1-3.044 0" />
                        </svg>
                        Ranked by total ETH contributed
                    </div>
                </div>

                {isLoading ? (
                    <div className="flex justify-center items-center py-10">
                        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-gradient-blue"></div>
                    </div>
                ) : error ? (
                    <div className="text-center py-5 text-red-400">
                        Error loading leaderboard data. Please try again later.
                    </div>
                ) : activeContributors.length === 0 ? (
                    <div className="text-center py-5 text-gray-400">
                        No contributors found. Be the first to stake and earn rewards!
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-gradient-purple/30">
                                    <th className="px-4 py-2 text-left">Rank</th>
                                    <th className="px-4 py-2 text-left">Address</th>
                                    <th className="px-4 py-2 text-right">Total Contributed</th>
                                </tr>
                            </thead>
                            <tbody>
                                {activeContributors.slice(0, 10).map((contributor, index) => (
                                    <tr
                                        key={contributor.address}
                                        className={index % 2 === 0 ? "bg-gradient-purple/10" : "bg-gradient-blue/10"}
                                    >
                                        <td className="px-4 py-3">
                                            <div className="flex items-center">
                                                {index === 0 && (
                                                    <span className="text-yellow-300 mr-2">🏆</span>
                                                )}
                                                {index === 1 && (
                                                    <span className="text-gray-300 mr-2">🥈</span>
                                                )}
                                                {index === 2 && (
                                                    <span className="text-amber-600 mr-2">🥉</span>
                                                )}
                                                {index > 2 && (
                                                    <span className="mr-2">{index + 1}</span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 font-mono">{formatAddress(contributor.address)}</td>
                                        <td className="px-4 py-3 text-right font-semibold gradient-text">
                                            {formatEth(contributor.totalContributed)} ETH
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};

Leaderboard.defaultProps = {
    poolId: '' // Default to empty string if no poolId is provided
};

export default Leaderboard; 