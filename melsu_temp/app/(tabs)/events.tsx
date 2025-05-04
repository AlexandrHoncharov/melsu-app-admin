// File: app/(tabs)/events.tsx
import React, {useEffect} from 'react';
import {
    View,
    Text,
    StyleSheet,
    SafeAreaView,
    ScrollView,
    Animated,
    Easing,
    Dimensions
} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {useAuth} from '../../hooks/useAuth';

const {width} = Dimensions.get('window');

export default function EventsScreen() {
    const {user} = useAuth();

    // Анимированные значения
    const ballPosition = React.useRef(new Animated.Value(0)).current;
    const iconOpacity = React.useRef(new Animated.Value(0)).current;
    const textOpacity = React.useRef(new Animated.Value(0)).current;
    const bounceValue = React.useRef(new Animated.Value(0)).current;

    // Запускаем анимации при загрузке компонента
    useEffect(() => {
        // Анимация для иконки мяча - только появление
        Animated.timing(iconOpacity, {
            toValue: 1,
            duration: 600,
            useNativeDriver: true,
        }).start();

        // Бесшовная циклическая анимация для bounceValue (вращение и масштабирование)
        Animated.loop(
            Animated.sequence([
                Animated.timing(bounceValue, {
                    toValue: 1,
                    duration: 1200,
                    easing: Easing.ease,
                    useNativeDriver: true,
                }),
                Animated.timing(bounceValue, {
                    toValue: 0,
                    duration: 1200,
                    easing: Easing.ease,
                    useNativeDriver: true,
                })
            ])
        ).start();

        // Бесшовная циклическая анимация для движения мяча
        Animated.loop(
            Animated.sequence([
                Animated.timing(ballPosition, {
                    toValue: 30,
                    duration: 1500,
                    easing: Easing.ease, // Более плавный переход
                    useNativeDriver: true,
                }),
                Animated.timing(ballPosition, {
                    toValue: -30,
                    duration: 1500,
                    easing: Easing.ease, // Более плавный переход
                    useNativeDriver: true,
                })
            ])
        ).start();

        // Анимация для текста - только появление
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
                                    {translateY: ballPosition},
                                    {rotate: spinValue},
                                    {scale: scaleValue}
                                ]
                            }
                        ]}>
                            <Ionicons name="tennisball" size={80} color="#770002"/>
                        </Animated.View>

                        <Animated.View style={[
                            styles.smallBall,
                            {
                                opacity: iconOpacity,
                                transform: [
                                    {translateY: Animated.multiply(ballPosition, -0.7)}
                                ]
                            }
                        ]}>
                            <Ionicons name="football" size={40} color="#FFB300"/>
                        </Animated.View>

                        <Animated.View style={[
                            styles.smallBall2,
                            {
                                opacity: iconOpacity,
                                transform: [
                                    {translateY: Animated.multiply(ballPosition, 0.5)}
                                ]
                            }
                        ]}>
                            <Ionicons name="basketball" size={50} color="#FF6D00"/>
                        </Animated.View>
                    </View>

                    <Animated.View style={[styles.textContainer, {opacity: textOpacity}]}>
                        <Text style={styles.title}>Мероприятия</Text>
                        <Text style={styles.message}>
                            Разработчики во всю трудятся над созданием этого раздела!
                            Совсем скоро здесь появится информация о самых интересных
                            спортивных и культурных мероприятиях университета.
                            Следите за обновлениями и будьте в курсе всех событий!
                        </Text>
                    </Animated.View>
                </View>

                <Animated.View style={{opacity: textOpacity, width: '100%'}}>
                    {user?.role === 'student' && (
                        <View style={styles.infoBox}>
                            <Ionicons name="information-circle-outline" size={24} color="#0277BD"/>
                            <Text style={styles.infoText}>
                                Чтобы не пропустить важные события, убедитесь, что ваш студенческий билет верифицирован,
                                и включены уведомления в настройках.
                            </Text>
                        </View>
                    )}
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
        shadowOffset: {width: 0, height: 1},
        shadowOpacity: 0.05,
        shadowRadius: 2,
    },
    infoText: {
        color: '#0277BD',
        fontSize: 14,
        marginLeft: 12,
        flex: 1,
    }
});