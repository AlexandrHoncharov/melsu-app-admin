// src/components/LoadingIndicator.tsx
import React, {useEffect, useRef} from 'react';
import {ActivityIndicator, Animated, Easing, StyleSheet, Text, TextStyle, View, ViewStyle} from 'react-native';
import {Ionicons} from '@expo/vector-icons';

// Types for props
interface LoadingIndicatorProps {
    message?: string;
    size?: 'small' | 'large';
    fullscreen?: boolean;
    type?: 'spinner' | 'dots' | 'logo' | 'pulse';
    style?: ViewStyle;
    textStyle?: TextStyle;
    color?: string;
}

/**
 * A customizable loading indicator component with various animation types
 */
const LoadingIndicator: React.FC<LoadingIndicatorProps> = ({
                                                               message = 'Загрузка...',
                                                               size = 'large',
                                                               fullscreen = false,
                                                               type = 'spinner',
                                                               style,
                                                               textStyle,
                                                               color = '#770002', // Brand color as default
                                                           }) => {
    // Animation values
    const spinValue = useRef(new Animated.Value(0)).current;
    const scaleValue = useRef(new Animated.Value(0.8)).current;
    const opacityValues = [
        useRef(new Animated.Value(0.3)).current,
        useRef(new Animated.Value(0.3)).current,
        useRef(new Animated.Value(0.3)).current,
        useRef(new Animated.Value(0.3)).current,
    ];

    // Create rotation animation
    useEffect(() => {
        if (type === 'logo') {
            Animated.loop(
                Animated.timing(spinValue, {
                    toValue: 1,
                    duration: 2000,
                    easing: Easing.linear,
                    useNativeDriver: true,
                })
            ).start();

            // Create pulse animation
            Animated.loop(
                Animated.sequence([
                    Animated.timing(scaleValue, {
                        toValue: 1.1,
                        duration: 800,
                        easing: Easing.out(Easing.ease),
                        useNativeDriver: true,
                    }),
                    Animated.timing(scaleValue, {
                        toValue: 0.8,
                        duration: 800,
                        easing: Easing.in(Easing.ease),
                        useNativeDriver: true,
                    }),
                ])
            ).start();
        }

        // Create dots animation
        if (type === 'dots' || type === 'pulse') {
            const animations = opacityValues.map((value, index) =>
                Animated.sequence([
                    Animated.delay(index * 150),
                    Animated.timing(value, {
                        toValue: 1,
                        duration: 400,
                        useNativeDriver: true,
                    }),
                    Animated.timing(value, {
                        toValue: 0.3,
                        duration: 400,
                        useNativeDriver: true,
                    }),
                ])
            );

            Animated.loop(
                Animated.parallel(animations)
            ).start();
        }
    }, [type]);

    // Interpolate the spin value to rotate
    const spin = spinValue.interpolate({
        inputRange: [0, 1],
        outputRange: ['0deg', '360deg'],
    });

    // Determine loading indicator based on type
    const renderLoadingIndicator = () => {
        switch (type) {
            case 'dots':
                return (
                    <View style={styles.dotsContainer}>
                        {opacityValues.map((opacity, index) => (
                            <Animated.View
                                key={index}
                                style={[
                                    styles.dot,
                                    {
                                        backgroundColor: color,
                                        opacity,
                                        width: size === 'large' ? 10 : 6,
                                        height: size === 'large' ? 10 : 6,
                                    }
                                ]}
                            />
                        ))}
                    </View>
                );
            case 'pulse':
                return (
                    <View style={styles.pulseContainer}>
                        <Animated.View
                            style={[
                                styles.pulse,
                                {
                                    backgroundColor: color,
                                    transform: [{scale: scaleValue}],
                                    width: size === 'large' ? 50 : 30,
                                    height: size === 'large' ? 50 : 30,
                                }
                            ]}
                        />
                        {message && (
                            <Text style={[styles.pulseText, textStyle, {color}]}>
                                {message}
                            </Text>
                        )}
                    </View>
                );
            case 'logo':
                return (
                    <View style={styles.logoContainer}>
                        <Animated.View style={{
                            transform: [{rotate: spin}, {scale: scaleValue}]
                        }}>
                            <Ionicons
                                name="school"
                                size={size === 'large' ? 48 : 32}
                                color={color}
                            />
                        </Animated.View>
                    </View>
                );
            case 'spinner':
            default:
                return <ActivityIndicator size={size} color={color}/>;
        }
    };

    return (
        <View style={[
            styles.container,
            fullscreen && styles.fullscreen,
            style
        ]}>
            {renderLoadingIndicator()}
            {message && type !== 'pulse' && (
                <Text style={[styles.text, textStyle, {color: '#555'}]}>
                    {message}
                </Text>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        padding: 20,
        alignItems: 'center',
        justifyContent: 'center',
    },
    fullscreen: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(255, 255, 255, 0.9)',
        zIndex: 999,
    },
    text: {
        marginTop: 16,
        fontSize: 16,
        fontWeight: '500',
        textAlign: 'center',
    },
    dotsContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        height: 20,
    },
    dot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        marginHorizontal: 3,
    },
    logoContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 10,
    },
    spinnerOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
    },
    pulseContainer: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    pulse: {
        width: 50,
        height: 50,
        borderRadius: 25,
        backgroundColor: '#770002',
        marginBottom: 16,
    },
    pulseText: {
        fontSize: 14,
        fontWeight: '500',
    }
});

export default LoadingIndicator;