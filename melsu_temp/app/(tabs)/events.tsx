// File: app/(tabs)/events.tsx
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  SafeAreaView,
  ScrollView
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../hooks/useAuth';

export default function EventsScreen() {
  const { user } = useAuth();

  // Состояние для обработки ошибки загрузки изображения
  const [imageError, setImageError] = React.useState(false);

  // Обработчик ошибки загрузки изображения
  const handleImageError = () => {
    setImageError(true);
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {!imageError ? (
          <Image
            source={require('../../assets/images/under-development.png')}
            style={styles.image}
            resizeMode="contain"
            onError={handleImageError}
          />
        ) : (
          <View style={[styles.image, styles.iconContainer]}>
            <Ionicons name="tennisball-outline" size={80} color="#770002" />
          </View>
        )}

        <View style={styles.textContainer}>
          <Text style={styles.title}>Мероприятия</Text>
          <Text style={styles.message}>
            Раздел мероприятий находится в разработке.
            Здесь будет доступна информация о предстоящих и прошедших
            мероприятиях университета, возможность регистрации
            и получения уведомлений.
          </Text>
        </View>

        {user?.role === 'student' && (
          <View style={styles.infoBox}>
            <Ionicons name="information-circle-outline" size={24} color="#0277BD" />
            <Text style={styles.infoText}>
              Чтобы не пропустить важные события, убедитесь, что ваш студенческий билет верифицирован,
              и включены уведомления в настройках.
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    padding: 20,
    alignItems: 'center',
    minHeight: '100%',
  },
  image: {
    width: 250,
    height: 200,
    marginBottom: 30,
    marginTop: 40,
  },
  iconContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  textContainer: {
    alignItems: 'center',
    marginBottom: 30,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
    textAlign: 'center',
  },
  message: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 24,
  },
  infoBox: {
    backgroundColor: '#E1F5FE',
    borderRadius: 8,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginVertical: 20,
    width: '100%',
  },
  infoText: {
    color: '#0277BD',
    fontSize: 14,
    marginLeft: 12,
    flex: 1,
  },
});