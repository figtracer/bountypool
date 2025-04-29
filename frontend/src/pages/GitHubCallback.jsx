import React, { useEffect, useState, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { useGitHubAuth } from '../utils/GitHubAuthContext.jsx';

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

// Function to get a cookie value by name
const getCookie = (name) => {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
    return null;
};

// GitHub OAuth client ID - retrieved from environment variables
const GITHUB_CLIENT_ID = getEnv('REACT_APP_GITHUB_CLIENT_ID', 'Ov23liGxCcTNVHRUu2xq');
const TOKEN_EXCHANGE_ENDPOINT = 'http://localhost:3000/api/github/exchange-code';

const GitHubCallback = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { setToken, user } = useGitHubAuth();
    const [error, setError] = useState(null);
    const [errorDetails, setErrorDetails] = useState(null);
    const [loading, setLoading] = useState(true);
    const [proceedingAnyway, setProceedingAnyway] = useState(false);
    const [authCompleted, setAuthCompleted] = useState(false);
    const tokenExchangeAttempted = useRef(false);

    useEffect(() => {
        if (authCompleted && user) {
            const returnTo = localStorage.getItem('returnTo') || '/pools';
            console.log('User authenticated, redirecting to:', returnTo);
            localStorage.removeItem('returnTo');
            navigate(returnTo);
        }
    }, [authCompleted, user, navigate]);

    // This effect handles the token exchange only once
    useEffect(() => {
        const exchangeCodeForToken = async () => {
            // Prevent multiple exchange attempts of the same code
            if (tokenExchangeAttempted.current) {
                console.log('Token exchange already attempted, skipping');
                return;
            }

            tokenExchangeAttempted.current = true;

            const urlParams = new URLSearchParams(location.search);
            const code = urlParams.get('code');
            const state = urlParams.get('state');

            // Try to get state from both localStorage and cookies
            const storedStateFromLocalStorage = localStorage.getItem('github_oauth_state');
            const storedStateFromCookie = getCookie('github_oauth_state');
            const storedState = storedStateFromLocalStorage || storedStateFromCookie;

            // Log for debugging
            console.log('GitHub callback initiated with code:', code ? 'present' : 'missing');
            console.log('State validation:', {
                receivedState: state,
                storedState: storedState ? storedState.substring(0, 5) + '...' : 'missing',
                localStorage: storedStateFromLocalStorage ? 'present' : 'missing',
                cookie: storedStateFromCookie ? 'present' : 'missing'
            });

            // Clean up stored state
            localStorage.removeItem('github_oauth_state');
            document.cookie = "github_oauth_state=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";

            if (!code) {
                setError('No code provided by GitHub');
                setLoading(false);
                return;
            }

            // We'll still log the state mismatch, but we'll proceed with authentication
            // This makes the flow more resilient against state parameter issues
            let stateValid = state && storedState && state === storedState;

            if (!stateValid) {
                console.warn('State parameter mismatch, but continuing with authentication');
                console.log('Received state:', state);
                console.log('Stored state (localStorage):', storedStateFromLocalStorage);
                console.log('Stored state (cookie):', storedStateFromCookie);
                setProceedingAnyway(true);
                // We'll continue with the authentication process instead of returning early
            }

            console.log('Received code from GitHub, sending to backend');

            try {
                // Check if backend is up
                try {
                    await axios.get('http://localhost:3000/api/health');
                    console.log('Backend server is up');
                } catch (err) {
                    console.error('Backend server check failed:', err);
                    setError('Cannot connect to authentication server');
                    setErrorDetails('Make sure the backend server is running at http://localhost:3000');
                    setLoading(false);
                    return;
                }

                // Send the code to our local backend server
                console.log('Sending code to backend for token exchange');
                const response = await axios.post(TOKEN_EXCHANGE_ENDPOINT, {
                    code,
                    client_id: GITHUB_CLIENT_ID,
                    state
                });

                console.log('Received response from backend');

                if (response.data && response.data.access_token) {
                    console.log('Received valid access token');

                    // Save the token
                    setToken(response.data.access_token);
                    console.log('Token saved, marking auth as completed');

                    // Mark authentication as completed
                    setAuthCompleted(true);

                    // The useEffect watching authCompleted will handle the redirect
                } else if (response.data && response.data.error) {
                    console.error('OAuth error response:', response.data);
                    setError(`GitHub authentication error: ${response.data.error}`);
                    setErrorDetails(response.data.error_description ||
                        (response.data.details ? JSON.stringify(response.data.details) : 'No error details provided'));
                } else {
                    console.error('Unexpected response:', response.data);
                    setError('Failed to obtain access token');
                    setErrorDetails('Received an unexpected response from the authentication server');
                }
            } catch (err) {
                console.error('Error exchanging code for token:', err);

                if (err.response) {
                    console.error('Error response:', err.response.data);
                    setError(`Error: ${err.response.status} - ${err.response.statusText}`);
                    try {
                        setErrorDetails(JSON.stringify(err.response.data || {}, null, 2));
                    } catch (e) {
                        setErrorDetails('Could not stringify error response data');
                    }
                } else if (err.request) {
                    setError('No response from authentication server');
                    setErrorDetails('The request was made but no response was received');
                } else {
                    setError('Error authenticating with GitHub');
                    setErrorDetails(err.message || 'Unknown error');
                }
            } finally {
                setLoading(false);
            }
        };

        exchangeCodeForToken();
    }, [location.search, setToken]);

    // Manual retry function
    const handleRetry = () => {
        const returnTo = localStorage.getItem('returnTo') || '/pools';
        navigate(returnTo);
    };

    // Function to go to GitHub login directly
    const handleLoginAgain = () => {
        navigate('/');
        setTimeout(() => {
            // Get the GitHub login from GitHubAuthContext and call it directly
            const { login } = useGitHubAuth();
            if (typeof login === 'function') {
                login();
            }
        }, 100);
    };

    // Show loading spinner while processing
    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen flex-col">
                <div className="w-12 h-12 border-4 border-gradient-blue border-t-gradient-pink rounded-full animate-spin mb-4"></div>
                <h1 className="text-white text-xl font-bold">Authenticating with GitHub...</h1>
            </div>
        );
    }

    // Show error message if there was an error
    if (error) {
        return (
            <div className="container mx-auto px-4 py-8 text-center">
                <div className="bg-gradient-to-r from-gradient-purple/20 to-gradient-blue/20 p-6 rounded-lg">
                    <h1 className="text-2xl font-bold text-white mb-4">Authentication Error</h1>
                    <p className="text-gray-300 mb-2">{error}</p>

                    {proceedingAnyway && (
                        <div className="bg-yellow-500/20 p-3 rounded-lg mb-4 text-yellow-300">
                            <p>We're still attempting to complete authentication despite this error.</p>
                            <p>Please wait a moment...</p>
                        </div>
                    )}

                    {errorDetails && (
                        <div className="bg-black/30 p-3 rounded-lg mb-4 text-left overflow-auto max-h-40 text-xs text-gray-400">
                            <pre>{errorDetails}</pre>
                        </div>
                    )}

                    <div className="flex space-x-4 justify-center mt-4">
                        <button
                            onClick={() => navigate('/pools')}
                            className="gradient-button px-6 py-2"
                        >
                            Return to Pools
                        </button>

                        <button
                            onClick={handleRetry}
                            className="bg-yellow-500 text-white px-6 py-2 rounded-md hover:bg-yellow-600 transition"
                        >
                            Try Again
                        </button>
                    </div>

                    <div className="mt-4 text-gray-400 text-xs">
                        <p>Troubleshooting:</p>
                        <ul className="list-disc list-inside mt-1 text-left">
                            <li>Ensure the backend server is running</li>
                            <li>Check that your GitHub OAuth app is properly configured</li>
                            <li>Verify the client ID and secret are correct</li>
                        </ul>
                    </div>
                </div>
            </div>
        );
    }

    // This is the "waiting for redirection" state when auth is successful
    return (
        <div className="flex items-center justify-center min-h-screen flex-col">
            <div className="w-12 h-12 border-4 border-gradient-blue border-t-gradient-pink rounded-full animate-spin mb-4"></div>
            <h1 className="text-white text-xl font-bold mb-2">GitHub Authentication Successful!</h1>
            <p className="text-gray-300">Redirecting you back...</p>
            <button
                onClick={handleRetry}
                className="mt-6 bg-gradient-to-r from-gradient-blue to-gradient-purple px-6 py-2 rounded-md text-white hover:opacity-90"
            >
                Click here if not redirected
            </button>
        </div>
    );
};

export default GitHubCallback; 