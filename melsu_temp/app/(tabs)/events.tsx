// File: app/(tabs)/events.tsx
import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  Animated,
  Easing,
  Dimensions
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../hooks/useAuth';

const { width } = Dimensions.get('window');

export default function EventsScreen() {
  const { user } = useAuth();

  // Анимированные значения
  const ballPosition = React.useRef(new Animated.Value(0)).current;
  const iconOpacity = React.useRef(new Animated.Value(0)).current;
  const textOpacity = React.useRef(new Animated.Value(0)).current;
  const bounceValue = React.useRef(new Animated.Value(0)).current;

  // Запускаем анимации при загрузке компонента
  useEffect(() => {
    // Анимация для иконки мяча
    Animated.sequence([
      Animated.timing(iconOpacity, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.timing(bounceValue, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      })
    ]).start();

    // Анимация для движения мяча
    Animated.loop(
      Animated.sequence([
        Animated.timing(ballPosition, {
          toValue: 30,
          duration: 1500,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(ballPosition, {
          toValue: -30,
          duration: 1500,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        })
      ])
    ).start();

    // Анимация для текста
    Animated.timing(textOpacity, {
      toValue: 1,
      duration: 1000,
      delay: 500,
      useNativeDriver: true,
    }).start();
  }, []);

  // Вычисляем значения для трансформаций
  const spinValue = bounceValue.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg']
  });

  const scaleValue = bounceValue.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [1, 1.2, 1]
  });

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.iconSection}>
          {/* Графический элемент с анимированными фигурами */}
          <View style={styles.graphicContainer}>
            <Animated.View style={[
              styles.ball1,
              {
                opacity: iconOpacity,
                transform: [
                  { translateY: ballPosition },
                  { rotate: spinValue },
                  { scale: scaleValue }
                ]
              }
            ]}>
              <Ionicons name="tennisball" size={80} color="#770002" />
            </Animated.View>

            <Animated.View style={[
              styles.smallBall,
              {
                opacity: iconOpacity,
                transform: [
                  { translateY: Animated.multiply(ballPosition, -0.7) }
                ]
              }
            ]}>
              <Ionicons name="football" size={40} color="#FFB300" />
            </Animated.View>

            <Animated.View style={[
              styles.smallBall2,
              {
                opacity: iconOpacity,
                transform: [
                  { translateY: Animated.multiply(ballPosition, 0.5) }
                ]
              }
            ]}>
              <Ionicons name="basketball" size={50} color="#FF6D00" />
            </Animated.View>
          </View>

          <Animated.View style={[styles.textContainer, { opacity: textOpacity }]}>
            <Text style={styles.title}>Мероприятия</Text>
            <Text style={styles.message}>
              Раздел мероприятий находится в разработке.
              Здесь будет доступна информация о предстоящих и прошедших
              мероприятиях университета, возможность регистрации
              и получения уведомлений.
            </Text>
          </Animated.View>
        </View>

        <Animated.View style={[styles.statsContainer, { opacity: textOpacity }]}>
          <View style={styles.statItem}>
            <View style={[styles.statCircle, { backgroundColor: '#E1F5FE' }]}>
              <Ionicons name="calendar" size={24} color="#0277BD" />
            </View>
            <Text style={styles.statTitle}>Скоро</Text>
            <Text style={styles.statValue}>0</Text>
          </View>

          <View style={styles.statItem}>
            <View style={[styles.statCircle, { backgroundColor: '#FFFDE7' }]}>
              <Ionicons name="star" size={24} color="#FFB300" />
            </View>
            <Text style={styles.statTitle}>Рекомендуемые</Text>
            <Text style={styles.statValue}>0</Text>
          </View>

          <View style={styles.statItem}>
            <View style={[styles.statCircle, { backgroundColor: '#E8F5E9' }]}>
              <Ionicons name="checkmark-circle" size={24} color="#43A047" />
            </View>
            <Text style={styles.statTitle}>Прошедшие</Text>
            <Text style={styles.statValue}>0</Text>
          </View>
        </Animated.View>

        <Animated.View style={{ opacity: textOpacity, width: '100%' }}>
          {user?.role === 'student' && (
            <View style={styles.infoBox}>
              <Ionicons name="information-circle-outline" size={24} color="#0277BD" />
              <Text style={styles.infoText}>
                Чтобы не пропустить важные события, убедитесь, что ваш студенческий билет верифицирован,
                и включены уведомления в настройках.
              </Text>
            </View>
          )}

          <TouchableOpacity style={styles.notifyButton}>
            <Ionicons name="notifications-outline" size={20} color="#FFF" style={styles.buttonIcon} />
            <Text style={styles.buttonText}>Уведомить о запуске</Text>
          </TouchableOpacity>
        </Animated.View>
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
  iconSection: {
    alignItems: 'center',
    width: '100%',
    marginBottom: 30,
  },
  graphicContainer: {
    height: 200,
    width: '100%',
    position: 'relative',
    marginTop: 30,
    marginBottom: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ball1: {
    position: 'absolute',
    zIndex: 3,
  },
  smallBall: {
    position: 'absolute',
    left: width / 4,
    zIndex: 2,
  },
  smallBall2: {
    position: 'absolute',
    right: width / 4,
    zIndex: 1,
  },
  textContainer: {
    alignItems: 'center',
    marginBottom: 30,
  },
  title: {
    fontSize: 28,
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
    maxWidth: '90%',
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 40,
  },
  statItem: {
    alignItems: 'center',
    width: width / 3.5,
  },
  statCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  statTitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 5,
  },
  statValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  infoBox: {
    backgroundColor: '#E1F5FE',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginVertical: 20,
    width: '100%',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  infoText: {
    color: '#0277BD',
    fontSize: 14,
    marginLeft: 12,
    flex: 1,
  },
  notifyButton: {
    backgroundColor: '#770002',
    borderRadius: 24,
    paddingVertical: 14,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
    shadowColor: '#770002',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
  },
  buttonIcon: {
    marginRight: 8,
  },
  buttonText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 16,
  }
});