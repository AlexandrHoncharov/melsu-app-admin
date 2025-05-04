import {useColorScheme} from 'react-native';
import Colors, {AppColors} from '../constants/Colors';

export function useThemeColor(
    props: { light?: string; dark?: string },
    colorName: keyof typeof Colors.light
) {
    const theme = useColorScheme() ?? 'light';
    const colorFromProps = props[theme];

    if (colorFromProps) {
        return colorFromProps;
    } else {
        return Colors[theme][colorName];
    }
}

// Для прямого доступа к цветам приложения без учета темы
export const appColors = AppColors;