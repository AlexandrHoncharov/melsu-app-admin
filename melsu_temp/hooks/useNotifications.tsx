// File: hooks/useNotifications.tsx
import React, { createContext, useContext, ReactNode } from 'react';

// Simplified interface that removes all notification functionality
interface NotificationContextProps {
  showNotification: () => void;
  hideNotification: () => void;
}

const NotificationContext = createContext<NotificationContextProps | undefined>(undefined);

export const NotificationProvider = ({ children }: { children: ReactNode }) => {
  // Empty implementation functions
  const showNotification = () => {
    console.log('Notifications have been disabled in this version');
  };

  const hideNotification = () => {
    // No-op function
  };

  return (
    <NotificationContext.Provider value={{ showNotification, hideNotification }}>
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};