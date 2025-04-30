// File: melsu_temp/app/(tabs)/profile/about.tsx
import React from 'react';
import {
  Linking,
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View
} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {router} from 'expo-router';

// Добавляем расчет высоты StatusBar для Android
const STATUSBAR_HEIGHT = StatusBar.currentHeight || 0;

export default function AboutScreen() {
  const { width } = useWindowDimensions();
  const logoSize = width * 0.4;

  // Получаем текущий год для копирайта
  const currentYear = new Date().getFullYear();

  // Function to open links
  const openLink = (url: string) => {
    Linking.openURL(url).catch(err => {
      console.error('Error opening link:', err);
    });
  };

  return (
    <SafeAreaView style={[
      styles.container,
      // Добавляем отступ для Android
      Platform.OS === 'android' && { paddingTop: STATUSBAR_HEIGHT }
    ]}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Ionicons name="chevron-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.title}>О приложении</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Logo and App Info */}
        <View style={styles.logoContainer}>
          <View style={[styles.logoPlaceholder, { width: logoSize, height: logoSize }]}>
            <Text style={styles.logoText}>MelSU</Text>
            <Text style={styles.logoTextUniversity}>Go</Text>
          </View>
          <Text style={styles.appName}>MelSU Go</Text>
            <Text style={styles.appVersion}>Версия 1.2.1</Text>
        </View>

        {/* App Description */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>О приложении</Text>
          <Text style={styles.sectionText}>
            MelSU Go — официальное мобильное приложение для студентов и преподавателей Мелитопольского государственного университета.
            Приложение разработано для удобного доступа к расписанию занятий, общения между студентами и преподавателями,
            а также другой важной информации университета.
          </Text>
        </View>

        {/* Features */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Функции</Text>
          <View style={styles.featureItem}>
            <Ionicons name="calendar-outline" size={24} color="#bb0000" style={styles.featureIcon} />
            <View style={styles.featureTextContainer}>
              <Text style={styles.featureTitle}>Расписание</Text>
              <Text style={styles.featureText}>Актуальное расписание занятий для студентов и преподавателей</Text>
            </View>
          </View>
          <View style={styles.featureItem}>
            <Ionicons name="chatbubbles-outline" size={24} color="#bb0000" style={styles.featureIcon} />
            <View style={styles.featureTextContainer}>
              <Text style={styles.featureTitle}>Чаты</Text>
              <Text style={styles.featureText}>Удобное общение между студентами и преподавателями</Text>
            </View>
          </View>
          <View style={styles.featureItem}>
            <Ionicons name="shield-checkmark-outline" size={24} color="#bb0000" style={styles.featureIcon} />
            <View style={styles.featureTextContainer}>
              <Text style={styles.featureTitle}>Верификация</Text>
              <Text style={styles.featureText}>Подтверждение статуса студента для доступа ко всем функциям</Text>
            </View>
          </View>
          <View style={styles.featureItem}>
            <Ionicons name="ticket-outline" size={24} color="#bb0000" style={styles.featureIcon} />
            <View style={styles.featureTextContainer}>
              <Text style={styles.featureTitle}>Поддержка</Text>
              <Text style={styles.featureText}>Техническая поддержка пользователей приложения</Text>
            </View>
          </View>
        </View>

        {/* Contact Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Контакты</Text>

          <TouchableOpacity
            style={styles.contactItem}
            onPress={() => openLink('https://melsu.ru')}
          >
            <Ionicons name="globe-outline" size={24} color="#555" style={styles.contactIcon} />
            <Text style={styles.contactText}>melsu.ru</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.contactItem}
            onPress={() => openLink('mailto:rektorat@melsu.ru')}
          >
            <Ionicons name="mail-outline" size={24} color="#555" style={styles.contactIcon} />
            <Text style={styles.contactText}>rektorat@melsu.ru</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.contactItem}
            onPress={() => openLink('tel:+79901469279')}
          >
            <Ionicons name="call-outline" size={24} color="#555" style={styles.contactIcon} />
            <Text style={styles.contactText}>+7(990) 146-92-79</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.contactItem}
            onPress={() => openLink('https://yandex.ru/maps/-/CHb4zC8~')}
          >
            <Ionicons name="location-outline" size={24} color="#555" style={styles.contactIcon} />
            {/* Применяем специальный стиль для адреса, чтобы он корректно переносился */}
            <Text style={styles.addressText}>г. Мелитополь, пр. Богдана Хмельницкого 18</Text>
          </TouchableOpacity>
        </View>

        {/* Copyright */}
        <View style={styles.copyright}>
          <Text style={styles.copyrightText}>© {currentYear} Мелитопольский государственный университет</Text>
          <Text style={styles.copyrightText}>Все права защищены</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9f9f9',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
    backgroundColor: '#FFFFFF',
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#000',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  logoContainer: {
    alignItems: 'center',
    marginVertical: 24,
  },
  logoPlaceholder: {
    backgroundColor: '#bb0000',
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    elevation: 5,
    shadowColor: '#bb0000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  logoText: {
    color: '#fff',
    fontSize: 48,
    fontWeight: 'bold',
  },
  logoTextUniversity: {
    color: '#fff',
    fontSize: 28,
    fontWeight: 'bold',
    marginTop: -10,
  },
  appName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  appVersion: {
    fontSize: 14,
    color: '#666',
  },
  section: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    paddingBottom: 8,
  },
  sectionText: {
    fontSize: 15,
    color: '#333',
    lineHeight: 22,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  featureIcon: {
    marginRight: 12,
    marginTop: 2,
  },
  featureTextContainer: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  featureText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  contactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  contactIcon: {
    marginRight: 12,
    minWidth: 24, // Фиксированная ширина для иконок
  },
  contactText: {
    fontSize: 15,
    color: '#333',
    flex: 1, // Позволяет тексту занять все доступное пространство
  },
  // Специальный стиль для адреса
  addressText: {
    fontSize: 15,
    color: '#333',
    flex: 1,
    flexWrap: 'wrap', // Разрешаем перенос текста
  },
  copyright: {
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 24,
  },
  copyrightText: {
    fontSize: 12,
    color: '#888',
    textAlign: 'center',
    lineHeight: 18,
  },
});