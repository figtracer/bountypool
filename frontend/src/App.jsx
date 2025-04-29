import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { WagmiConfig } from 'wagmi';
import { wagmiConfig } from './utils/wagmiConfig';
import { Toaster } from 'react-hot-toast';
import { GitHubAuthProvider } from './utils/GitHubAuthContext.jsx';
import Layout from './components/Layout';
import Home from './pages/Home';
import Pool from './pages/Pool';
import CreateBounty from './pages/CreateBounty';
import CreatePool from './pages/CreatePool';
import Pools from './pages/Pools';
import GitHubCallback from './pages/GitHubCallback';

function App() {
    return (
        <WagmiConfig config={wagmiConfig}>
            <GitHubAuthProvider>
                <Router>
                    <Layout>
                        <Routes>
                            <Route path="/" element={<Home />} />
                            <Route path="/pool" element={<Pool />} />
                            <Route path="/pool/:poolId" element={<Pool />} />
                            <Route path="/create-bounty" element={<CreateBounty />} />
                            <Route path="/create-pool" element={<CreatePool />} />
                            <Route path="/pools" element={<Pools />} />
                            <Route path="/pool-bounties/:repositoryId" element={<Navigate replace to="/pool/:repositoryId" />} />
                            <Route path="/github-callback" element={<GitHubCallback />} />
                        </Routes>
                    </Layout>
                </Router>
                <Toaster
                    position="top-right"
                    toastOptions={{
                        style: {
                            background: '#1A1A1A',
                            color: '#fff',
                            border: '1px solid #4B0082',
                        },
                        success: {
                            iconTheme: {
                                primary: '#00B7EB',
                                secondary: '#1A1A1A',
                            },
                        },
                        error: {
                            iconTheme: {
                                primary: '#FF69B4',
                                secondary: '#1A1A1A',
                            },
                        },
                    }}
                />
            </GitHubAuthProvider>
        </WagmiConfig>
    );
}

export default App; 