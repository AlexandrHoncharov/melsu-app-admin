// File: melsu_temp/app/(tabs)/chats.tsx
import React, { useRef } from 'react';
import { SafeAreaView, StyleSheet } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import ChatsList from '../../components/ChatsList';
import chatService from '../../src/services/chatService';

export default function ChatsScreen() {
  // Create a ref to the ChatsList component
  const chatsListRef = useRef();

  // Use useFocusEffect to handle tab focus
  useFocusEffect(
    useCallback(() => {
      console.log('Chats tab focused, clearing cache and refreshing chat list...');

      // Always cleanup listeners when tab gets focus
      chatService.cleanup();

      // Check if we have internet connectivity
      const checkConnectivity = async () => {
        try {
          // Simple fetch to check internet connectivity
          const response = await fetch('https://www.google.com', {
            method: 'HEAD',
            timeout: 2000
          });

          if (response.ok && chatsListRef.current?.handleRefresh) {
            // If we have internet and the ref is available, trigger refresh
            chatsListRef.current.handleRefresh();
          }
        } catch (error) {
          console.log('No internet connection or error checking connectivity');

          // Even if no internet, still force refresh to ensure proper state
          if (chatsListRef.current?.handleRefresh) {
            chatsListRef.current.handleRefresh();
          }
        }
      };

      checkConnectivity();

      return () => {
        // Nothing to clean up when tab loses focus
      };
    }, [])
  );

  return (
    <SafeAreaView style={styles.container}>
      <ChatsList ref={chatsListRef} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
});