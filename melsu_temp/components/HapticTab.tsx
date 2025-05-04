import React from 'react';
import {View, TouchableOpacity, StyleSheet} from 'react-native';
import * as Haptics from 'expo-haptics';
import {BottomTabBarProps} from '@react-navigation/bottom-tabs';
import {appColors} from '../hooks/useThemeColor';
import ThemedText from './ThemedText';

export default function HapticTab({state, descriptors, navigation}: BottomTabBarProps) {
    return (
        <View style={styles.container}>
            {state.routes.map((route, index) => {
                const {options} = descriptors[route.key];
                const label =
                    options.tabBarLabel !== undefined
                        ? options.tabBarLabel
                        : options.title !== undefined
                            ? options.title
                            : route.name;

                const isFocused = state.index === index;

                const onPress = () => {
                    const event = navigation.emit({
                        type: 'tabPress',
                        target: route.key,
                        canPreventDefault: true,
                    });

                    if (!isFocused && !event.defaultPrevented) {
                        // Тактильная обратная связь при нажатии
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        navigation.navigate(route.name);
                    }
                };

                const onLongPress = () => {
                    navigation.emit({
                        type: 'tabLongPress',
                        target: route.key,
                    });

                    // Тактильная обратная связь при долгом нажатии
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                };

                return (
                    <TouchableOpacity
                        key={route.key}
                        accessibilityRole="button"
                        accessibilityState={isFocused ? {selected: true} : {}}
                        accessibilityLabel={options.tabBarAccessibilityLabel}
                        testID={options.tabBarTestID}
                        onPress={onPress}
                        onLongPress={onLongPress}
                        style={styles.tab}
                    >
                        {options.tabBarIcon &&
                            options.tabBarIcon({
                                focused: isFocused,
                                color: isFocused ? options.tabBarActiveTintColor as string : options.tabBarInactiveTintColor as string,
                                size: 24
                            })
                        }
                        <ThemedText
                            style={[
                                styles.label,
                                {
                                    color: isFocused
                                        ? options.tabBarActiveTintColor as string
                                        : options.tabBarInactiveTintColor as string
                                }
                            ]}
                        >
                            {label as string}
                        </ThemedText>
                    </TouchableOpacity>
                );
            })}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        backgroundColor: appColors.white,
        borderTopWidth: 1,
        borderTopColor: appColors.border,
        height: 60,
        alignItems: 'center',
    },
    tab: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 8,
    },
    label: {
        fontSize: 12,
        marginTop: 2,
    },
});