require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(cors({
    origin: 'http://localhost:5173', // Vite's default dev server port
    methods: ['GET', 'POST'],
    credentials: true
}));

// GitHub OAuth exchange endpoint
app.post('/api/github/exchange-code', async (req, res) => {
    try {
        const { code, state } = req.body;

        if (!code) {
            return res.status(400).json({ error: 'Code is required' });
        }

        console.log('Received GitHub code:', code.substring(0, 10) + '...');
        console.log('Using GitHub Client ID:', process.env.GITHUB_CLIENT_ID);

        if (!process.env.GITHUB_CLIENT_SECRET || process.env.GITHUB_CLIENT_SECRET === 'your_github_client_secret') {
            console.error('ERROR: GitHub client secret is not properly configured');
            return res.status(500).json({ error: 'GitHub client secret is not configured' });
        }

        // Exchange code for token with GitHub
        const requestData = {
            client_id: process.env.GITHUB_CLIENT_ID,
            client_secret: process.env.GITHUB_CLIENT_SECRET,
            code
        };

        // Add state if provided
        if (state) {
            requestData.state = state;
        }

        console.log('Sending token exchange request to GitHub');

        const response = await axios.post(
            'https://github.com/login/oauth/access_token',
            requestData,
            {
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                }
            }
        );

        console.log('GitHub response status:', response.status);

        if (response.data && response.data.access_token) {
            console.log('Received access token from GitHub');
            // Return the token response to the client
            return res.json(response.data);
        } else if (response.data && response.data.error) {
            console.error('GitHub OAuth error:', response.data);
            return res.status(400).json({
                error: 'GitHub OAuth error',
                details: response.data
            });
        } else {
            console.error('Unexpected GitHub response:', response.data);
            return res.status(500).json({
                error: 'Invalid response from GitHub',
                details: response.data
            });
        }
    } catch (error) {
        console.error('Error exchanging GitHub code for token:', error.message);
        if (error.response) {
            console.error('GitHub error response:', error.response.data);
            console.error('GitHub error status:', error.response.status);
        }
        return res.status(500).json({
            error: 'Failed to exchange code for token',
            details: error.response?.data || error.message
        });
    }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'GitHub OAuth server is running' });
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`GitHub OAuth endpoint: http://localhost:${PORT}/api/github/exchange-code`);
}); 