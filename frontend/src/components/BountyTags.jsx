import React, { useEffect } from 'react';
import { useGitHubAuth } from '../utils/GitHubAuthContext';

const BountyTags = ({ tagIds }) => {
    const { bountyTags } = useGitHubAuth();

    useEffect(() => {
        console.log('BountyTags - Props:', { tagIds, bountyTags });
    }, [tagIds, bountyTags]);

    if (!tagIds || tagIds.length === 0) {
        return null;
    }

    // Helper function to get class names based on tag color
    const getTagClasses = (color) => {
        switch (color) {
            case 'green':
                return 'bg-green-500/40 text-green-300';
            case 'red':
                return 'bg-red-500/40 text-red-300';
            case 'blue':
                return 'bg-blue-500/40 text-blue-300';
            case 'purple':
                return 'bg-purple-500/40 text-purple-300';
            case 'orange':
                return 'bg-orange-500/40 text-orange-300';
            case 'indigo':
                return 'bg-indigo-500/40 text-indigo-300';
            case 'pink':
                return 'bg-pink-500/40 text-pink-300';
            case 'yellow':
                return 'bg-yellow-500/40 text-yellow-300';
            case 'teal':
                return 'bg-teal-500/40 text-teal-300';
            case 'cyan':
                return 'bg-cyan-500/40 text-cyan-300';
            default:
                return 'bg-gray-500/40 text-gray-300';
        }
    };

    // Helper to get a color based on string (for tags without a defined color)
    const getStringBasedColor = (str) => {
        const colors = ['blue', 'green', 'purple', 'orange', 'indigo', 'pink', 'teal', 'cyan', 'red', 'yellow'];
        const hash = str.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
        return colors[hash % colors.length];
    };

    return (
        <div className="flex flex-wrap gap-1.5 my-2">
            {tagIds.map((tagItem, index) => {
                // Handle if the tag is a string directly (no ID/color mapping)
                if (typeof tagItem === 'string') {
                    // Check if the string is a known tag ID
                    const tag = bountyTags?.find(t => t.id === tagItem);
                    
                    if (tag) {
                        return (
                            <span
                                key={tag.id}
                                className={`inline-block text-xs px-2 py-0.5 rounded-full ${getTagClasses(tag.color)}`}
                            >
                                {tag.label}
                            </span>
                        );
                    } else {
                        // If not a known ID, treat the string as the tag name itself
                        const color = getStringBasedColor(tagItem);
                        return (
                            <span
                                key={`tag-${index}`}
                                className={`inline-block text-xs px-2 py-0.5 rounded-full ${getTagClasses(color)}`}
                            >
                                {tagItem}
                            </span>
                        );
                    }
                }
                
                // Handle if tagItem is an object with id/name properties
                if (typeof tagItem === 'object' && tagItem !== null) {
                    const color = tagItem.color || getStringBasedColor(tagItem.name || tagItem.id || '');
                    return (
                        <span
                            key={tagItem.id || `tag-${index}`}
                            className={`inline-block text-xs px-2 py-0.5 rounded-full ${getTagClasses(color)}`}
                        >
                            {tagItem.name || tagItem.label || tagItem.id || 'Tag'}
                        </span>
                    );
                }

                return null;
            })}
        </div>
    );
};

export default BountyTags; 