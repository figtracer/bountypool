import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react()],
    // Define environment variables that should be available to the client
    define: {
        // Make sure environment variables prefixed with REACT_APP_ are available
        'process.env': Object.fromEntries(
            Object.entries(process.env).filter(([key]) => key.startsWith('REACT_APP_'))
        )
    }
}) 