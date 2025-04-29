import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { Octokit } from 'octokit';

const GitHubAuthContext = createContext(null);

// Predefined bounty tags
const BOUNTY_TAGS = [
    { id: 'good-first-issue', label: 'Good First Issue', color: 'green' },
    { id: 'bug', label: 'Bug Fix', color: 'red' },
    { id: 'feature', label: 'Feature', color: 'blue' },
    { id: 'documentation', label: 'Documentation', color: 'purple' },
    { id: 'enhancement', label: 'Enhancement', color: 'orange' },
    { id: 'help-wanted', label: 'Help Wanted', color: 'indigo' },
    { id: 'ui', label: 'UI', color: 'pink' },
    { id: 'security', label: 'Security', color: 'yellow' },
    { id: 'refactor', label: 'Refactor', color: 'teal' },
    { id: 'performance', label: 'Performance', color: 'cyan' },
];

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

// GitHub OAuth client ID - retrieved from environment variables
const GITHUB_CLIENT_ID = getEnv('REACT_APP_GITHUB_CLIENT_ID');
const GITHUB_REDIRECT_URI = window.location.origin + '/github-callback';

export function GitHubAuthProvider({ children }) {
    const [accessToken, setAccessToken] = useState(() => {
        const token = localStorage.getItem('github_token');
        console.log('Initial token from localStorage:', token ? `${token.substring(0, 5)}...` : 'none');
        return token;
    });
    const [user, setUser] = useState(null);
    const [octokit, setOctokit] = useState(null);
    const [loading, setLoading] = useState(true);
    const [authError, setAuthError] = useState(null);
    const [tokenInitialized, setTokenInitialized] = useState(false);

    // Initialize Octokit when token changes
    useEffect(() => {
        let isMounted = true;
        const initOctokit = async () => {
            if (accessToken) {
                try {
                    console.log('Initializing Octokit with token:', `${accessToken.substring(0, 5)}...`);
                    if (isMounted) {
                        setLoading(true);
                        setTokenInitialized(true);

                        const newOctokit = new Octokit({
                            auth: accessToken,
                            // Add request retry and timeout options
                            request: {
                                timeout: 10000 // 10 second timeout
                            }
                        });

                        setOctokit(newOctokit);

                        // Fetch user data immediately
                        await fetchUser(newOctokit);
                    }
                } catch (error) {
                    console.error('Failed to initialize Octokit:', error);
                    if (isMounted) {
                        setAuthError('Failed to initialize GitHub connection');
                        logout();
                        setLoading(false);
                    }
                }
            } else {
                console.log('No access token found, not initializing Octokit');
                if (isMounted) {
                    setOctokit(null);
                    setUser(null);
                    setAuthError(null);
                    setLoading(false);
                }
            }
        };

        initOctokit();

        return () => {
            isMounted = false;
        };
    }, [accessToken]);

    // Fetch user data when octokit is initialized
    const fetchUser = async (octokitInstance) => {
        try {
            setAuthError(null);
            console.log('Fetching authenticated GitHub user...');

            const { data } = await octokitInstance.rest.users.getAuthenticated();
            console.log('GitHub user authenticated successfully:', data.login);
            setUser(data);
        } catch (error) {
            // Handle rate limiting or network errors safely
            console.error('Failed to fetch GitHub user data:', error);

            let errorMessage = 'Authentication failed';
            if (error.status === 401) {
                errorMessage = 'GitHub token is invalid or expired';
                console.log('Clearing invalid GitHub token');
                logout();
            } else if (error.status === 403) {
                errorMessage = 'GitHub rate limit exceeded, please try again later';
            } else if (error.name === 'HttpError') {
                errorMessage = `GitHub API error: ${error.message || 'Unknown error'}`;
            }

            setAuthError(errorMessage);
        } finally {
            setLoading(false);
        }
    };

    // Login function - using useCallback to prevent recreation on each render
    const login = useCallback(() => {
        // Clear any previous errors
        setAuthError(null);

        // Store the current URL to return after auth
        const currentPath = window.location.pathname + window.location.search;
        localStorage.setItem('returnTo', currentPath);
        console.log('Saving return path:', currentPath);

        // Generate a random state parameter to prevent CSRF attacks
        const state = Math.random().toString(36).substring(2, 15) +
            Math.random().toString(36).substring(2, 15);

        // Store state in both localStorage and cookies for redundancy
        localStorage.setItem('github_oauth_state', state);

        // Also set a cookie with the state to improve reliability across redirects
        document.cookie = `github_oauth_state=${state}; path=/; max-age=600; SameSite=Lax`;

        const params = new URLSearchParams({
            client_id: GITHUB_CLIENT_ID,
            redirect_uri: GITHUB_REDIRECT_URI,
            scope: 'repo', // permissions needed for repository access
            state: state
        });

        console.log('Redirecting to GitHub for authentication...');
        window.location.href = `https://github.com/login/oauth/authorize?${params.toString()}`;
    }, []);

    // Logout function - also using useCallback
    const logout = useCallback(() => {
        console.log('Logging out of GitHub');
        localStorage.removeItem('github_token');
        localStorage.removeItem('github_oauth_state');

        // Also clear the cookie
        document.cookie = "github_oauth_state=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";

        setAccessToken(null);
        setUser(null);
        setOctokit(null);
        setAuthError(null);
        setTokenInitialized(false);
    }, []);

    // Handle setting token and saving to localStorage
    const setToken = useCallback((token) => {
        if (!token) {
            console.error('Attempted to set null/empty token');
            return;
        }

        console.log('Setting new GitHub token:', `${token.substring(0, 5)}...`);
        localStorage.setItem('github_token', token);
        setAccessToken(token);
    }, []);

    // Check if the authenticated user owns a specific repo by ID
    const checkRepoOwnership = async (repoId) => {
        if (!octokit) return false;

        try {
            // Get repository by ID
            const { data: repo } = await octokit.rest.repos.getById({
                repository_id: repoId
            });

            // Check if authenticated user is the owner
            return user.login === repo.owner.login;
        } catch (error) {
            console.error('Error checking repo ownership by ID:', error);
            return false;
        }
    };

    // Check if the authenticated user owns a specific repo by owner/name
    const checkRepoOwnershipByName = async (repoOwner, repoName) => {
        if (!octokit) return false;
        if (!user) return false;

        try {
            console.log(`Checking if ${user.login} owns repo ${repoOwner}/${repoName}`);

            // Get repository by owner and name
            const { data: repo } = await octokit.rest.repos.get({
                owner: repoOwner,
                repo: repoName
            });

            // Check if authenticated user is the owner
            const isOwner = user.login === repo.owner.login;
            console.log(`Repository ownership check result: ${isOwner}`);
            return isOwner;
        } catch (error) {
            console.error('Error checking repo ownership by name:', error);
            return false;
        }
    };

    // Extract repository owner and name from GitHub URL
    const parseRepoUrl = (url) => {
        try {
            // Handle URLs with or without protocol
            if (!url.includes('github.com')) {
                return null;
            }

            // Extract owner and repo portions from URL
            const regex = /github\.com\/([^/]+)\/([^/]+)/;
            const match = url.match(regex);

            if (!match) {
                return null;
            }

            // Clean up the repo name (remove trailing slash, .git, etc)
            let repoName = match[2];
            repoName = repoName.replace(/\.git$/, '');
            repoName = repoName.split('/')[0];

            return {
                owner: match[1],
                name: repoName
            };
        } catch (error) {
            console.error('Error parsing repository URL:', error);
            return null;
        }
    };

    // Validate GitHub issue URL
    const validateIssueUrl = async (url) => {
        if (!octokit) return { valid: false, message: 'Not authenticated with GitHub' };

        try {
            // First, check if it's even a URL
            let urlObj;
            try {
                urlObj = new URL(url);
            } catch (urlError) {
                return { valid: false, message: 'Invalid URL format' };
            }

            // Check if it's a GitHub URL
            if (urlObj.hostname !== 'github.com') {
                return { valid: false, message: 'URL must be from github.com' };
            }

            // Strict check for issue URL pattern - must explicitly contain /issues/ path segment
            const regex = /github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)$/;
            const match = url.match(regex);

            if (!match) {
                return { valid: false, message: 'Invalid GitHub issue URL format. Must be github.com/owner/repo/issues/number' };
            }

            const [, owner, repo, issueNumber] = match;

            // Validate that owner and repo are reasonable lengths and don't contain suspicious characters
            if (!owner || owner.length < 1 || owner.length > 100 || /[^\w.-]/.test(owner)) {
                return { valid: false, message: 'Invalid repository owner name' };
            }

            if (!repo || repo.length < 1 || repo.length > 100 || /[^\w.-]/.test(repo)) {
                return { valid: false, message: 'Invalid repository name' };
            }

            if (!issueNumber || !/^\d+$/.test(issueNumber) || parseInt(issueNumber) <= 0) {
                return { valid: false, message: 'Invalid issue number' };
            }

            // Verify the issue exists and is open
            try {
                const { data: issue } = await octokit.rest.issues.get({
                    owner,
                    repo,
                    issue_number: Number(issueNumber)
                });

                // Check if this is a pull request (GitHub API returns pull_request property when the issue is actually a PR)
                if (issue.pull_request) {
                    return {
                        valid: false,
                        message: `#${issueNumber} is a Pull Request, not an issue`,
                        isPullRequest: true
                    };
                }

                if (issue.state !== 'open') {
                    return { valid: false, message: 'Issue is not open' };
                }

                return { valid: true, message: 'Valid GitHub issue', issue };
            } catch (apiError) {
                console.error('GitHub API error:', apiError);

                // If we get a 404, check if it might be a PR that GitHub redirects to
                if (apiError.status === 404 || (apiError.response && apiError.response.status === 404)) {
                    try {
                        // Try to get it as a PR
                        const { data: pr } = await octokit.rest.pulls.get({
                            owner,
                            repo,
                            pull_number: Number(issueNumber)
                        });

                        // If that works, it means the issue was actually a PR - mark as invalid for our purposes
                        return {
                            valid: false,
                            message: `#${issueNumber} is a Pull Request, not an issue`,
                            isPullRequest: true
                        };
                    } catch (prError) {
                        // If this also fails, the issue/PR truly doesn't exist
                        return { valid: false, message: `Issue #${issueNumber} not found in ${owner}/${repo}` };
                    }
                }

                // Handle rate limiting
                if (apiError.status === 403 || (apiError.response && apiError.response.status === 403)) {
                    return { valid: false, message: 'GitHub API rate limit exceeded. Please try again later.' };
                }

                return { valid: false, message: `Error validating GitHub issue: ${apiError.message || 'Unknown error'}` };
            }
        } catch (error) {
            console.error('Issue validation error:', error);
            return {
                valid: false,
                message: 'Error processing GitHub issue URL'
            };
        }
    };

    // Validate GitHub pull request URL
    const validatePrUrl = async (url) => {
        if (!octokit) return { valid: false, message: 'Not authenticated with GitHub' };

        try {
            // First, check if it's even a URL
            let urlObj;
            try {
                urlObj = new URL(url);
            } catch (urlError) {
                return { valid: false, message: 'Invalid URL format' };
            }

            // Check if it's a GitHub URL
            if (urlObj.hostname !== 'github.com') {
                return { valid: false, message: 'URL must be from github.com' };
            }

            // Parse URL to extract owner, repo, and PR number
            const regex = /github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/;
            const match = url.match(regex);

            if (!match) {
                return { valid: false, message: 'Invalid GitHub pull request URL format. Must be github.com/owner/repo/pull/number' };
            }

            const [, owner, repo, prNumber] = match;

            // Validate that owner and repo are reasonable lengths and don't contain suspicious characters
            if (!owner || owner.length < 1 || owner.length > 100 || /[^\w.-]/.test(owner)) {
                return { valid: false, message: 'Invalid repository owner name' };
            }

            if (!repo || repo.length < 1 || repo.length > 100 || /[^\w.-]/.test(repo)) {
                return { valid: false, message: 'Invalid repository name' };
            }

            if (!prNumber || !/^\d+$/.test(prNumber) || parseInt(prNumber) <= 0) {
                return { valid: false, message: 'Invalid pull request number' };
            }

            try {
                // Verify the PR exists
                const { data: pr } = await octokit.rest.pulls.get({
                    owner,
                    repo,
                    pull_number: Number(prNumber)
                });

                // Check PR state (open, closed, merged)
                if (pr.state !== 'open') {
                    return {
                        valid: false,
                        message: `Pull request is ${pr.state}. Only open PRs can be submitted as solutions.`,
                        isPullRequest: true
                    };
                }

                return {
                    valid: true,
                    message: 'Valid GitHub pull request',
                    pr,
                    isPullRequest: true
                };
            } catch (apiError) {
                console.error('GitHub API error for PR:', apiError);

                // Handle rate limiting
                if (apiError.status === 403 || (apiError.response && apiError.response.status === 403)) {
                    return { valid: false, message: 'GitHub API rate limit exceeded. Please try again later.' };
                }

                // Handle not found
                if (apiError.status === 404 || (apiError.response && apiError.response.status === 404)) {
                    return { valid: false, message: `Pull request #${prNumber} not found in ${owner}/${repo}` };
                }

                return { valid: false, message: `Error validating GitHub PR: ${apiError.message || 'Unknown error'}` };
            }
        } catch (error) {
            console.error('PR validation error:', error);
            return {
                valid: false,
                message: 'Error processing GitHub pull request URL'
            };
        }
    };

    // Validate GitHub URL based on context
    const validateGitHubUrl = async (url, context = 'solution') => {
        // Use regex to strictly check URL patterns
        const issueRegex = /github\.com\/([^/]+)\/([^/]+)\/issues\/\d+$/;
        const prRegex = /github\.com\/([^/]+)\/([^/]+)\/pull\/\d+$/;
        
        // For solution submissions, only accept pull requests
        if (context === 'solution') {
            // Check if it's a PR (using strict regex match)
            if (prRegex.test(url)) {
                return validatePrUrl(url);
            }
            // If not a PR, it's invalid for solution context
            return { 
                valid: false, 
                message: 'Solution must be a GitHub pull request URL (e.g., github.com/owner/repo/pull/123)', 
                isPullRequest: false 
            };
        }
        
        // For bounty creation, only accept issues
        if (context === 'bounty') {
            // Check if it's an issue (using strict regex match)
            if (issueRegex.test(url)) {
                const result = await validateIssueUrl(url);
                // Ensure the isPullRequest flag is explicitly set for issues
                return { ...result, isPullRequest: false };
            }
            // If not an issue, it's invalid for bounty context
            return { 
                valid: false, 
                message: 'Bounty must reference a GitHub issue URL (e.g., github.com/owner/repo/issues/123)', 
                isPullRequest: false 
            };
        }
        
        // For any other context or backward compatibility
        if (issueRegex.test(url)) {
            const result = await validateIssueUrl(url);
            return { ...result, isPullRequest: false };
        } else if (prRegex.test(url)) {
            return validatePrUrl(url);
        }
        
        // Otherwise, it's an invalid URL
        return { 
            valid: false, 
            message: 'URL must be a valid GitHub issue or pull request', 
            isPullRequest: false 
        };
    };

    const value = {
        accessToken,
        user,
        octokit,
        loading,
        authError,
        login,
        logout,
        setToken,
        checkRepoOwnership,
        checkRepoOwnershipByName,
        parseRepoUrl,
        validateIssueUrl,
        validatePrUrl,
        validateGitHubUrl,
        bountyTags: BOUNTY_TAGS,
    };

    return <GitHubAuthContext.Provider value={value}>{children}</GitHubAuthContext.Provider>;
}

// Custom hook to use the GitHub auth context
export function useGitHubAuth() {
    const context = useContext(GitHubAuthContext);
    if (!context) {
        throw new Error('useGitHubAuth must be used within a GitHubAuthProvider');
    }
    return context;
} 