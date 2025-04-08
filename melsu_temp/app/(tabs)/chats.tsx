import React from 'react';
import { SafeAreaView, StyleSheet } from 'react-native';
import ChatsList from '../../components/ChatsList';

export default function ChatsScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <ChatsList />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
});