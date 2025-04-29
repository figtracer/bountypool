import React from 'react';

const StatCard = ({ title, value, icon }) => {
    return (
        <div className="bg-gradient-to-r from-gradient-purple/20 to-gradient-blue/20 p-6 rounded-lg border border-gradient-purple/30 hover:shadow-lg transform transition-all hover:scale-105">
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold text-white">{title}</h3>
                {icon && <span className="text-2xl">{icon}</span>}
            </div>
            <p className="text-3xl font-bold text-white">{value}</p>
        </div>
    );
};

export default StatCard; 