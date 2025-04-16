// src/utils/environmentUtils.ts
import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * Check if we're running in Expo Go vs. a development build
 * @returns {boolean} true if running in Expo Go, false if in a development build
 */
export const isExpoGo = (): boolean => {
  try {
    return Constants.appOwnership === 'expo';
  } catch (e) {
    // Fallback detection method
    return !(global as any).__expo_manifest__;
  }
};

/**
 * Check if native modules are available (requires a development build)
 * @returns {boolean} true if native modules are available
 */
export const areNativeModulesAvailable = (): boolean => {
  return !isExpoGo();
};

/**
 * Check if a specific native module is available
 * @param moduleName Name of the module to check
 * @returns {boolean} true if module is available
 */
export const isNativeModuleAvailable = (moduleName: string): boolean => {
  if (isExpoGo()) {
    return false;
  }

  try {
    // This is just a check, we're not actually using the module
    // NativeModules is available through react-native
    const { NativeModules } = require('react-native');
    return !!NativeModules[moduleName];
  } catch (e) {
    return false;
  }
};

/**
 * Get information about the current environment
 * @returns Environment information object
 */
export const getEnvironmentInfo = () => {
  return {
    isExpoGo: isExpoGo(),
    platform: Platform.OS,
    platformVersion: Platform.Version,
    isDevBuild: !isExpoGo(),
    appVersion: Constants.expoConfig?.version || 'unknown',
    buildVersion: Constants.expoConfig?.ios?.buildNumber || Constants.expoConfig?.android?.versionCode || 'unknown',
    deviceName: Constants.deviceName
  };
};

export default {
  isExpoGo,
  areNativeModulesAvailable,
  isNativeModuleAvailable,
  getEnvironmentInfo
};