// hooks/useUnreadMessages.tsx
import {createContext, useContext, useState, useEffect, ReactNode} from 'react';
import chatService from '../src/services/chatService';
import {useAuth} from '../hooks/useAuth';

// Create a context to hold unread message count
interface UnreadMessagesContextProps {
    unreadCount: number;
    refreshUnreadCount: () => Promise<void>;
}

const UnreadMessagesContext = createContext<UnreadMessagesContextProps | undefined>(undefined);

// Provider component
export const UnreadMessagesProvider = ({children}: { children: ReactNode }) => {
    const [unreadCount, setUnreadCount] = useState(0);
    const {user, isAuthenticated} = useAuth();

    // Function to calculate unread messages count
    const refreshUnreadCount = async () => {
        if (!isAuthenticated || !user) {
            setUnreadCount(0);
            return;
        }

        try {
            // Initialize chat service if needed
            if (!chatService.initialized) {
                await chatService.initialize();
            }

            // Get total unread count
            const totalUnread = await chatService.getTotalUnreadCount();
            setUnreadCount(totalUnread);
        } catch (error) {
            console.error('Error refreshing unread message count:', error);
        }
    };

    // Initial load
    useEffect(() => {
        if (isAuthenticated) {
            refreshUnreadCount();
        } else {
            setUnreadCount(0);
        }
    }, [isAuthenticated, user?.id]);

    // Set up a listener for new messages
    useEffect(() => {
        if (!isAuthenticated || !user) return;

        const setupListener = async () => {
            try {
                await chatService.setupUnreadMessagesListener((count) => {
                    setUnreadCount(count);
                });
            } catch (error) {
                console.error('Error setting up unread messages listener:', error);
            }
        };

        setupListener();

        // Clean up listener on unmount
        return () => {
            chatService.removeUnreadMessagesListener();
        };
    }, [isAuthenticated, user?.id]);

    return (
        <UnreadMessagesContext.Provider value={{unreadCount, refreshUnreadCount}}>
            {children}
        </UnreadMessagesContext.Provider>
    );
};

// Hook to use the unread messages context
export const useUnreadMessages = () => {
    const context = useContext(UnreadMessagesContext);
    if (context === undefined) {
        throw new Error('useUnreadMessages must be used within an UnreadMessagesProvider');
    }
    return context;
};