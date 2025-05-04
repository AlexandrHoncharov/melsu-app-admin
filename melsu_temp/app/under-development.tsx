// File: app/under-development.tsx
import React from 'react';
import {Image, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {router, Stack, useLocalSearchParams} from 'expo-router';
import {Ionicons} from '@expo/vector-icons';

export default function UnderDevelopmentScreen() {
    // Получаем параметры из URL для персонализации страницы
    const {title = 'Раздел в разработке', message} = useLocalSearchParams();

    // Преобразуем title и message в строки (они могут быть массивами)
    const pageTitle = Array.isArray(title) ? title[0] : String(title);
    const pageMessage = Array.isArray(message)
        ? message[0]
        : message
            ? String(message)
            : 'Этот раздел находится в разработке и будет доступен в ближайшее время';

    return (
        <SafeAreaView style={styles.container}>
            <Stack.Screen
                options={{
                    title: pageTitle,
                    headerTintColor: '#770002',
                }}
            />

            <ScrollView contentContainerStyle={styles.content}>
                <Image
                    source={require('../assets/images/under-development.png')}
                    style={styles.image}
                    resizeMode="contain"
                />

                <View style={styles.textContainer}>
                    <Text style={styles.title}>{pageTitle}</Text>
                    <Text style={styles.message}>{pageMessage}</Text>
                </View>

                <TouchableOpacity
                    style={styles.button}
                    onPress={() => router.back()}
                >
                    <Ionicons name="arrow-back" size={18} color="#fff"/>
                    <Text style={styles.buttonText}>Вернуться назад</Text>
                </TouchableOpacity>
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
        justifyContent: 'center',
        minHeight: '100%',
    },
    image: {
        width: 250,
        height: 200,
        marginBottom: 30,
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
    button: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#770002',
        paddingVertical: 12,
        paddingHorizontal: 20,
        borderRadius: 8,
    },
    buttonText: {
        color: '#fff',
        fontWeight: '600',
        fontSize: 16,
        marginLeft: 8,
    },
});