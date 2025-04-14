// app.config.js
module.exports = {
  "expo": {
    "name": "MelSU Go",
    "slug": "melsu",
    "version": "1.1.40",
    "orientation": "portrait",
    "description": "MelSU Go — официальное мобильное приложение для студентов и преподавателей Мелитопольского государственного университета.\n" +
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
      "bundleIdentifier": "com.melsu.app"
    },
    "android": {
      "googleServicesFile": "./google-services.json",
      "adaptiveIcon": {
        "foregroundImage": "./assets/images/adaptive-icon.png",
        "backgroundColor": "#ffffff"
      },
      "package": "com.melsu.app",
      "permissions": [
        "CAMERA",
        "READ_EXTERNAL_STORAGE",
        "WRITE_EXTERNAL_STORAGE",
        "VIBRATE",
        "RECEIVE_BOOT_COMPLETED"]
    },
    "plugins": [
      "expo-router",
        "expo-notifications"
    ],

    "experiments": {
      "typedRoutes": true
    }
  }
};