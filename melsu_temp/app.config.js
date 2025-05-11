// app.config.js
module.exports = {
    "expo": {
        "name": "my.melsu",
        "slug": "melsu",
        "version": "1.2.1",
        "orientation": "portrait",
        "description": "my.melsu — официальное мобильное приложение для студентов и преподавателей университета.\n" +
            "            Приложение разработано для удобного доступа к расписанию занятий, общения между студентами и преподавателями,\n" +
            "            а также другой важной информации университета.",
        "icon": "./assets/images/icon.png",
        "scheme": "melsu",
        "userInterfaceStyle": "automatic",
        "extra": {
            "eas": {
                "projectId": "d9591f01-e110-4918-8b09-c422bd23baaf"
            }
        },

        "splash": {
            "image": "./assets/images/splash.png",
            "resizeMode": "contain",
            "backgroundColor": "#ffffff"
        },
        "assetBundlePatterns": [
            "**/*"
        ],
        "ios": {
            "supportsTablet": true,
            "bundleIdentifier": "com.melsu.app",
            "googleServicesFile": "./GoogleService-Info.plist",
            "infoPlist": {
                "UIBackgroundModes": ["remote-notification"],
                "ITSAppUsesNonExemptEncryption": false,
                "NSCameraUsageDescription": "Приложению требуется доступ к камере для съемки фото и загрузки студенческого билета",
                "NSPhotoLibraryUsageDescription": "Приложению требуется доступ к галерее для выбора фото студенческого билета"
            },
            "buildNumber": "1"
        },
        "android": {
            "adaptiveIcon": {
                "foregroundImage": "./assets/images/adaptive-icon.png",
                "backgroundColor": "#ffffff"
            },
            "package": "com.melsu.app",
            "versionCode": 2,
            "googleServicesFile": "./google-services.json",
            "permissions": [
                "CAMERA",
                "READ_EXTERNAL_STORAGE",
                "WRITE_EXTERNAL_STORAGE",
                "VIBRATE"
            ]
        },
        "plugins": [
            "expo-router",
            [
                "expo-notifications",
                {
                    "icon": "./assets/images/notification-icon.png",
                    "color": "#770002",
                    "sounds": ["./assets/sounds/notification.wav"]
                }
            ],
            [
                "expo-build-properties",
                {
                    "ios": {
                        "useFrameworks": "static"
                    }
                }
            ]
        ],
        "notification": {
            "icon": "./assets/images/notification-icon.png",
            "color": "#770002",
            "iosDisplayInForeground": true
        },
        "experiments": {
            "typedRoutes": true
        }
    }
};