import React from 'react';
import { StyleSheet, View, Text, SafeAreaView, TouchableOpacity, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { appColors } from '../../hooks/useThemeColor';

// Простой список сервисов для демонстрации
const services = [
  {
    id: '1',
    title: 'Библиотека',
    icon: 'book-outline',
    color: '#4CAF50'
  },
  {
    id: '2',
    title: 'Расписание',
    icon: 'calendar-outline',
    color: '#2196F3'
  },
  {
    id: '3',
    title: 'Навигация по кампусу',
    icon: 'navigate-outline',
    color: '#FF9800'
  },
  {
    id: '4',
    title: 'Столовая',
    icon: 'restaurant-outline',
    color: '#F44336'
  }
];

export default function ExploreScreen() {
  const renderServiceItem = ({ item }) => (
    <TouchableOpacity style={styles.serviceCard}>
      <View style={[styles.iconContainer, { backgroundColor: `${item.color}20` }]}>
        <Ionicons name={item.icon} size={24} color={item.color} />
      </View>
      <Text style={styles.serviceTitle}>{item.title}</Text>
      <Ionicons name="chevron-forward" size={20} color={appColors.gray} />
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Услуги</Text>
        <Text style={styles.subtitle}>Доступные сервисы университета</Text>
      </View>

      <FlatList
        data={services}
        renderItem={renderServiceItem}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.servicesList}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: appColors.background,
  },
  header: {
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: appColors.primary,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: appColors.gray,
  },
  servicesList: {
    padding: 16,
  },
  serviceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: appColors.white,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  iconContainer: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  serviceTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: appColors.text,
  },
});