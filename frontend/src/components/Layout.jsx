import React from 'react';
import Navbar from './Navbar';

const Layout = ({ children }) => {
    return (
        <div className="min-h-screen flex flex-col bg-dark-bg text-white">
            <Navbar />
            <main className="flex-grow pt-28 pb-8">
                {children}
            </main>
        </div>
    );
};

export default Layout; 