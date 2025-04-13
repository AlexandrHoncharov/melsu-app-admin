// src/services/scheduleService.ts
import apiClient from '../api/apiClient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { format, addDays, startOfWeek, endOfWeek } from 'date-fns';
import { ru } from 'date-fns/locale';
import NetInfo from '@react-native-community/netinfo';

// Storage keys for caching
const STORAGE_KEYS = {
  SCHEDULE_DATA: 'schedule_data',
  SCHEDULE_LAST_UPDATE: 'schedule_last_update',
  WEEK_SCHEDULE: 'week_schedule',
  COURSE_INFO: 'course_info_'
};

// Cache expiration time in minutes
const CACHE_EXPIRATION_TIME = 60; // 1 hour

// Schedule item type definition
export interface ScheduleItem {
  id: number | string;
  date: string;
  timeStart?: string;
  time_start?: string;
  timeEnd?: string;
  time_end?: string;
  weekday: number;
  subject: string;
  lessonType?: string;
  lesson_type?: string;
  teacherName?: string;
  teacher_name?: string;
  teacher?: string;
  groupName?: string;
  group_name?: string;
  group?: string;
  auditory: string;
  subgroup?: number;
  groups?: string[]; // For combined groups in teacher view
  isCurrentLesson?: boolean;
}

// Course info interface
export interface CourseInfo {
  course: number;
  group: string;
  success: boolean;
}

// Schedule service for handling all schedule-related API calls
class ScheduleService {
  /**
   * Check if there's an active network connection
   */
  async isNetworkAvailable(): Promise<boolean> {
    try {
      const netInfo = await NetInfo.fetch();
      // More reliable detection - check for either connected state or internet reachable
      return !!(netInfo.isConnected || netInfo.isInternetReachable);
    } catch (error) {
      console.error('Error checking network:', error);
      // Default to true to avoid incorrect offline mode
      return true;
    }
  }

  /**
   * Verify authentication token exists
   * @returns boolean indicating if token exists
   */
  async isAuthenticated(): Promise<boolean> {
    try {
      // IMPORTANT: Use SecureStore, not AsyncStorage, for token retrieval
      // This must match how the auth system stores the token
      const token = await SecureStore.getItemAsync('userToken');
      return !!token;
    } catch (error) {
      console.error('Error checking authentication:', error);
      return false;
    }
  }

  /**
   * Get course information for a student's group
   * @param group The group name to get course info for
   * @param forceRefresh Whether to force refresh from the server
   * @returns Course info object or null if not found
   */
  async getCourseInfo(group: string, forceRefresh = false): Promise<CourseInfo | null> {
    if (!group) {
      console.error('Group name is required to get course info');
      return null;
    }

    try {
      // Check cache first if not forcing refresh
      if (!forceRefresh) {
        const cachedInfo = await this.getCourseInfoFromCache(group);
        if (cachedInfo) {
          console.debug(`Using cached course info for group ${group}`);
          return cachedInfo;
        }
      }

      // Check network and authentication
      const isConnected = await this.isNetworkAvailable();
      if (!isConnected) {
        console.warn('No network connection to fetch course info');
        // Try cache as fallback
        return await this.getCourseInfoFromCache(group);
      }

      const isAuth = await this.isAuthenticated();
      if (!isAuth) {
        console.error('Authentication required to fetch course info');
        return null;
      }

      // Fetch from API
      try {
        console.debug(`Fetching course info for group ${group} from API`);
        const response = await apiClient.get('/schedule/course', {
          params: { group }
        });

        const courseInfo = response.data;

        // Save to cache
        await this.saveCourseInfoToCache(group, courseInfo);

        return courseInfo;
      } catch (apiError: any) {
        console.error(`Error fetching course info for group ${group}:`, apiError);
        return null;
      }
    } catch (error) {
      console.error(`Error in getCourseInfo for group ${group}:`, error);
      return null;
    }
  }

  /**
   * Get course info from cache
   */
  private async getCourseInfoFromCache(group: string): Promise<CourseInfo | null> {
    try {
      const cacheKey = `${STORAGE_KEYS.COURSE_INFO}${group}`;
      const cachedInfoJson = await AsyncStorage.getItem(cacheKey);
      if (!cachedInfoJson) {
        return null;
      }

      // Check cache expiration
      const lastUpdateJson = await AsyncStorage.getItem(`${cacheKey}_updated`);
      if (lastUpdateJson) {
        const lastUpdate = new Date(JSON.parse(lastUpdateJson));
        const now = new Date();
        const minutesDiff = (now.getTime() - lastUpdate.getTime()) / (1000 * 60);

        if (minutesDiff > CACHE_EXPIRATION_TIME) {
          // Cache expired
          return null;
        }
      }

      return JSON.parse(cachedInfoJson);
    } catch (error) {
      console.error('Error getting course info from cache:', error);
      return null;
    }
  }

  /**
   * Save course info to cache
   */
  private async saveCourseInfoToCache(group: string, info: CourseInfo): Promise<void> {
    try {
      const cacheKey = `${STORAGE_KEYS.COURSE_INFO}${group}`;
      await AsyncStorage.setItem(cacheKey, JSON.stringify(info));
      await AsyncStorage.setItem(`${cacheKey}_updated`, JSON.stringify(new Date()));
    } catch (error) {
      console.error('Error saving course info to cache:', error);
    }
  }

  /**
   * Get schedule for a specific date
   * @param date Date in YYYY-MM-DD format
   * @param forceRefresh Force refresh from server instead of using cache
   */
  async getScheduleForDate(date: string, forceRefresh = false): Promise<ScheduleItem[]> {
    try {
      // First try to get from cache if not forcing refresh
      if (!forceRefresh) {
        const cachedData = await this.getScheduleFromCache(date);
        if (cachedData) {
          console.debug(`Using cached schedule for ${date}`);
          return cachedData;
        }
      }

      // Check network availability
      const isConnected = await this.isNetworkAvailable();
      if (!isConnected) {
        // Try getting from cache as fallback even if refresh was requested
        const fallbackData = await this.getScheduleFromCache(date);
        if (fallbackData) {
          console.debug(`Using cached schedule for ${date} due to no network`);
          return fallbackData;
        }
        throw new Error('No network connection and no cached data available');
      }

      // Check authentication
      const isAuth = await this.isAuthenticated();
      if (!isAuth) {
        console.error('Authentication token not found');
        throw new Error('Authentication required. Please log in again.');
      }

      // Fetch from API
      console.debug(`Fetching schedule for ${date} from API`);
      try {
        const response = await apiClient.get('/schedule', {
          params: { date }
        });

        const scheduleData = response.data;

        // Save to cache
        await this.saveScheduleToCache(date, scheduleData);

        return scheduleData;
      } catch (apiError: any) {
        // Handle 401 errors specifically
        if (apiError.response && apiError.response.status === 401) {
          console.error('Authentication failed (401) when fetching schedule');
          throw new Error('Your session has expired. Please log in again.');
        }
        throw apiError;
      }
    } catch (error) {
      console.error(`Error getting schedule for ${date}:`, error);
      throw error;
    }
  }

  /**
   * Get schedule for an entire week
   * @param currentDate Reference date to determine the week
   * @param forceRefresh Force refresh from server instead of using cache
   */
  async getWeekSchedule(currentDate: Date, forceRefresh = false): Promise<Record<string, ScheduleItem[]>> {
    try {
      // Check cache validity if not forcing refresh
      if (!forceRefresh) {
        const isCacheValid = await this.isCacheValid();
        if (isCacheValid) {
          const cachedWeekSchedule = await this.getWeekScheduleFromCache();
          if (cachedWeekSchedule) {
            console.debug('Using cached week schedule');
            return cachedWeekSchedule;
          }
        }
      }

      // Check network availability
      const isConnected = await this.isNetworkAvailable();
      if (!isConnected) {
        // Try getting from cache as fallback even if refresh was requested
        const fallbackData = await this.getWeekScheduleFromCache();
        if (fallbackData) {
          console.debug('Using cached week schedule due to no network');
          return fallbackData;
        }
        throw new Error('No network connection and no cached data available');
      }

      // Check authentication
      const isAuth = await this.isAuthenticated();
      if (!isAuth) {
        console.error('Authentication token not found');
        throw new Error('Authentication required. Please log in again.');
      }

      // Create array of dates to load (current week)
      const dates: string[] = [];
      let day = new Date(startOfWeek(currentDate, { locale: ru }));
      const weekEndDay = new Date(endOfWeek(currentDate, { locale: ru }));

      while (day <= weekEndDay) {
        dates.push(format(day, 'yyyy-MM-dd'));
        day = addDays(day, 1);
      }

      // Load schedule for each date
      const newWeekSchedule: Record<string, ScheduleItem[]> = {};
      let hasData = false;
      let authError = false;

      for (const date of dates) {
        try {
          // Skip remaining requests if we've already encountered an auth error
          if (authError) continue;

          const response = await apiClient.get('/schedule', {
            params: { date }
          });

          newWeekSchedule[date] = response.data;
          hasData = true;
          console.debug(`Loaded schedule for ${date}, items:`, response.data.length);
        } catch (err: any) {
          // Handle 401 errors specifically
          if (err.response && err.response.status === 401) {
            console.error('Authentication failed (401) when fetching schedule');
            authError = true;
            // Set empty array for this date but continue loop
            newWeekSchedule[date] = [];
          } else {
            console.debug(`Failed to load schedule for ${date}:`, err.message);
            newWeekSchedule[date] = [];
          }
        }
      }

      // If we encountered an auth error, throw it after collecting data
      if (authError) {
        throw new Error('Your session has expired. Please log in again.');
      }

      if (!hasData) {
        throw new Error('No data for the selected period');
      }

      // Save week schedule to cache
      await this.saveWeekScheduleToCache(newWeekSchedule);

      return newWeekSchedule;
    } catch (error) {
      console.error('Error getting week schedule:', error);
      throw error;
    }
  }

  /**
   * Get groups list from API
   */
  async getGroups(): Promise<{ name: string }[]> {
    try {
      // Check authentication first
      const isAuth = await this.isAuthenticated();
      if (!isAuth) {
        console.error('Authentication token not found');
        throw new Error('Authentication required. Please log in again.');
      }

      try {
        const response = await apiClient.get('/schedule/groups');
        return response.data;
      } catch (apiError: any) {
        // Handle 401 errors specifically
        if (apiError.response && apiError.response.status === 401) {
          console.error('Authentication failed (401) when fetching groups');
          throw new Error('Your session has expired. Please log in again.');
        }
        throw apiError;
      }
    } catch (error) {
      console.error('Error getting groups:', error);
      throw error;
    }
  }

  /**
   * Check if cache is still valid
   */
  private async isCacheValid(): Promise<boolean> {
    try {
      const lastUpdateJson = await AsyncStorage.getItem(STORAGE_KEYS.SCHEDULE_LAST_UPDATE);
      if (!lastUpdateJson) return false;

      const lastUpdate = new Date(lastUpdateJson);
      const now = new Date();
      const minutesDiff = (now.getTime() - lastUpdate.getTime()) / (1000 * 60);

      return minutesDiff < CACHE_EXPIRATION_TIME;
    } catch (error) {
      console.error('Error checking cache validity:', error);
      return false;
    }
  }

  /**
   * Get schedule from cache for a specific date
   */
  private async getScheduleFromCache(date: string): Promise<ScheduleItem[] | null> {
    try {
      const scheduleDataJson = await AsyncStorage.getItem(STORAGE_KEYS.SCHEDULE_DATA);
      if (!scheduleDataJson) return null;

      const scheduleData = JSON.parse(scheduleDataJson);
      return scheduleData[date] || null;
    } catch (error) {
      console.error('Error getting schedule from cache:', error);
      return null;
    }
  }

  /**
   * Save schedule to cache for a specific date
   */
  private async saveScheduleToCache(date: string, scheduleData: ScheduleItem[]): Promise<void> {
    try {
      // Get existing data or initialize new object
      const existingDataJson = await AsyncStorage.getItem(STORAGE_KEYS.SCHEDULE_DATA);
      const scheduleStorage = existingDataJson ? JSON.parse(existingDataJson) : {};

      // Update data for specified date
      scheduleStorage[date] = scheduleData;

      // Save updated data
      await AsyncStorage.setItem(STORAGE_KEYS.SCHEDULE_DATA, JSON.stringify(scheduleStorage));

      // Update last update time
      await AsyncStorage.setItem(STORAGE_KEYS.SCHEDULE_LAST_UPDATE, new Date().toISOString());
    } catch (error) {
      console.error('Error saving schedule to cache:', error);
      throw error;
    }
  }

  /**
   * Get week schedule from cache
   */
  private async getWeekScheduleFromCache(): Promise<Record<string, ScheduleItem[]> | null> {
    try {
      const weekScheduleJson = await AsyncStorage.getItem(STORAGE_KEYS.WEEK_SCHEDULE);
      return weekScheduleJson ? JSON.parse(weekScheduleJson) : null;
    } catch (error) {
      console.error('Error getting week schedule from cache:', error);
      return null;
    }
  }

  /**
   * Save week schedule to cache
   */
  private async saveWeekScheduleToCache(weekData: Record<string, ScheduleItem[]>): Promise<void> {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.WEEK_SCHEDULE, JSON.stringify(weekData));
      await AsyncStorage.setItem(STORAGE_KEYS.SCHEDULE_LAST_UPDATE, new Date().toISOString());
    } catch (error) {
      console.error('Error saving week schedule to cache:', error);
      throw error;
    }
  }

  /**
   * Clear schedule cache
   */
  async clearCache(): Promise<void> {
    try {
      await AsyncStorage.removeItem(STORAGE_KEYS.SCHEDULE_DATA);
      await AsyncStorage.removeItem(STORAGE_KEYS.WEEK_SCHEDULE);
      await AsyncStorage.removeItem(STORAGE_KEYS.SCHEDULE_LAST_UPDATE);
      console.debug('Schedule cache cleared');
    } catch (error) {
      console.error('Error clearing schedule cache:', error);
      throw error;
    }
  }
}

// Export a singleton instance
const scheduleService = new ScheduleService();
export default scheduleService;