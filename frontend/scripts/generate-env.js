import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

// Get the directory name of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Generate the env.js content
const envContent = `// This file is auto-generated - do not modify directly
window.env = {
  REACT_APP_PINATA_JWT: "${process.env.REACT_APP_PINATA_JWT || ''}",
  REACT_APP_PINATA_API_KEY: "${process.env.REACT_APP_PINATA_API_KEY || ''}",
  REACT_APP_PINATA_SECRET_API_KEY: "${process.env.REACT_APP_PINATA_SECRET_API_KEY || ''}",
  REACT_APP_RPC_URL: "${process.env.REACT_APP_RPC_URL || 'http://localhost:8545'}"
};`;

// Path to output file
const outputPath = path.resolve(__dirname, '..', 'public', 'env.js');

// Write the file
fs.writeFileSync(outputPath, envContent, 'utf8');

console.log('Generated env.js with environment variables'); 