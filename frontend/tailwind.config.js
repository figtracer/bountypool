/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                'gradient-purple': '#4B0082',
                'gradient-blue': '#00B7EB',
                'gradient-pink': '#FF69B4',
                'dark-bg': '#1A1A1A',
            },
            fontFamily: {
                'sans': ['Afacad', 'sans-serif'],
                'mono': ['Afacad', 'monospace'],
            },
            animation: {
                'gradient-shift': 'gradient-shift 5s ease infinite',
                'pulse-slow': 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
            },
            keyframes: {
                'gradient-shift': {
                    '0%, 100%': {
                        'background-position': '0% 50%'
                    },
                    '50%': {
                        'background-position': '100% 50%'
                    },
                }
            },
            scale: {
                '105': '1.05',
            },
            backgroundImage: {
                'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
            },
            blur: {
                'xs': '2px',
                'sm': '4px',
                DEFAULT: '8px',
                'md': '12px',
                'lg': '16px',
                'xl': '24px',
                '2xl': '40px',
                '3xl': '64px',
            },
        },
    },
    plugins: [],
} 