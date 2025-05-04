// File: melsu_temp/app/(tabs)/profile/support.tsx
import React from 'react';
import {SafeAreaView, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {router} from 'expo-router';

export default function SupportScreen() {
    const {width} = useWindowDimensions();
    const imageSize = width * 0.5;

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity
                    style={styles.backButton}
                    onPress={() => router.back()}
                >
                    <Ionicons name="chevron-back" size={24} color="#000"/>
                </TouchableOpacity>
                <Text style={styles.title}>Справка</Text>
                <View style={{width: 40}}/>
            </View>

            <View style={styles.content}>
                <View style={[styles.iconContainer, {width: imageSize, height: imageSize}]}>
                    <Ionicons name="construct-outline" size={imageSize * 0.5} color="#bb0000"/>
                </View>
                <Text style={styles.developmentText}>В разработке</Text>
                <Text style={styles.descriptionText}>
                    Данный раздел в настоящее время находится в разработке и будет доступен в следующих обновлениях
                    приложения.
                </Text>
                <TouchableOpacity
                    style={styles.backToProfileButton}
                    onPress={() => router.back()}
                >
                    <Text style={styles.backButtonText}>Вернуться в профиль</Text>
                </TouchableOpacity>
            </View>
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
    content: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    iconContainer: {
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#f2f2f2',
        borderRadius: 20,
        marginBottom: 24,
        borderWidth: 1,
        borderColor: '#e0e0e0',
        overflow: 'hidden',
    },
    developmentText: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#333',
        marginBottom: 16,
    },
    descriptionText: {
        fontSize: 16,
        color: '#666',
        textAlign: 'center',
        lineHeight: 24,
        marginBottom: 32,
        maxWidth: '80%',
    },
    backToProfileButton: {
        backgroundColor: '#bb0000',
        paddingHorizontal: 24,
        paddingVertical: 12,
        borderRadius: 8,
    },
    backButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },
});