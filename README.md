# BountyPool

BountyPool is a decentralized platform for incentivizing open-source development through bounty pools. This dApp allows repository owners to create token pools, where contributors can deposit funds to support the development of features and bug fixes. When issues are resolved, the contributor who solved the issue receives a bounty reward.

## Features

- **GitHub Integration**: Authenticate with GitHub to verify repository ownership
- **Create Bounty Pools**: Repository owners can create pools tied to their GitHub repositories
- **Deposit Funds**: Contributors can deposit tokens to support development
- **Real-time Yield Calculation**: See up-to-date yield information without requiring transactions
- **Issue Management**: Create, assign, and resolve GitHub issues with bounties attached
- **Smart Contract Infrastructure**: Secure and transparent bounty distribution

## Project Structure

- `/contracts`: Solidity smart contracts (Foundry/Forge)
- `/backend`: Express server for GitHub OAuth
- `/frontend`: React frontend application (Vite)

## Prerequisites

- [Node.js](https://nodejs.org/) (v16+)
- [Foundry](https://getfoundry.sh/) for smart contract development

## Setup Instructions

### 1. Clone the Repository

```bash
git clone <your-repo-url>
cd BountyPool
```

### 3. Install Dependencies

```bash
# Install backend dependencies
cd backend
npm install
cd ..

# Install frontend dependencies
cd frontend
npm install
cd ..
```

### 4. Start Local Blockchain

In a terminal window:

```bash
cd contracts
forge anvil
```

### 5. Deploy Contracts

In a second terminal:

```bash
cd contracts
forge script script/Deploy.s.sol --rpc-url http://localhost:8545 --broadcast -vvv
```

### 6. Start Backend Server

In a third terminal:

```bash
cd backend
npm run dev
```

### 7. Start Frontend

In a fourth terminal:

```bash
cd frontend
npm run dev
```

Once all services are running, you can access the application at http://localhost:5173

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- Built with [Foundry](https://getfoundry.sh/)
- Frontend powered by [React](https://reactjs.org/) and [Vite](https://vitejs.dev/)
- GitHub integration via [Octokit](https://github.com/octokit/octokit.js)
