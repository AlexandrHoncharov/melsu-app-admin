// src/api/apiClient.ts
import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import {router} from 'expo-router';

// Special debug function for API operations
const debugLog = (message) => {
  console.log(`[API CLIENT] ${message}`);
};

// Base URL of your API server
export const API_URL = 'https://app.melsu.ru/api';

// Create axios instance with basic settings
const apiClient = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  },
  timeout: 15000, // 15 second timeout
});

// Debug token function
const debugToken = async () => {
  try {
    const token = await SecureStore.getItemAsync('userToken');
    if (token) {
      // Log first 10 and last 5 characters of token for debugging
      debugLog(`Current token: ${token.substring(0, 10)}...${token.substring(token.length - 5)}`);

      // Check JWT structure - should have three parts separated by dots
      const parts = token.split('.');
      if (parts.length !== 3) {
        debugLog(`Warning: Token has incorrect JWT structure! Parts: ${parts.length}`);
      } else {
        debugLog('Token has correct JWT structure (header.payload.signature)');
      }
    } else {
      debugLog('Warning: No token found in SecureStore');
    }
  } catch (e) {
    debugLog(`Error debugging token: ${e.message}`);
  }
};

// List of endpoints that shouldn't trigger token deletion on 401
const SAFE_ENDPOINTS = [
  '/auth/firebase-token',
  '/device/register',
  '/device/test-notification',
  '/device/unregister'
];

// Check if request is to a "safe" endpoint
const isSafeEndpoint = (url) => {
  return SAFE_ENDPOINTS.some(endpoint => url.includes(endpoint));
};

// Request interceptor to add authorization token
apiClient.interceptors.request.use(
  async (config) => {
    // Get token from secure storage
    const token = await SecureStore.getItemAsync('userToken');

    if (token && config.headers) {
      // Set token in authorization header
      config.headers['Authorization'] = `Bearer ${token}`;

      // Log for debugging
      debugLog(`Adding token to request: ${config.method?.toUpperCase() || 'GET'} ${config.url}`);

      // Debug token on first request
      if (config.url && !config._tokenDebugged) {
        config._tokenDebugged = true;
        await debugToken();
      }
    } else if (!token) {
      debugLog(`No token available for request: ${config.method?.toUpperCase() || 'GET'} ${config.url}`);
    }

    return config;
  },
  (error) => {
    debugLog(`Request interceptor error: ${error.message}`);
    return Promise.reject(error);
  }
);

// Flag to track token warning
let tokenWarningShown = false;

// Add this flag to prevent multiple redirects
let authRedirectInProgress = false;

// Response interceptor to handle errors
apiClient.interceptors.response.use(
  (response) => {
    // Reset warning flag on successful request
    tokenWarningShown = false;
    return response;
  },
  async (error) => {
    const originalRequest = error.config;
    const url = originalRequest?.url || '';

    debugLog(`Error ${error.response?.status || 'unknown'} for request ${originalRequest?.method?.toUpperCase() || 'GET'} ${url}`);

    // Check if request is to a "safe" endpoint
    const isSafe = isSafeEndpoint(url);

    // Handle 401 Unauthorized errors
    if (error.response?.status === 401 && !originalRequest._retry && !isSafe) {
      originalRequest._retry = true;

      // Show warning once for better UX
      if (!tokenWarningShown) {
        debugLog('Received 401 Unauthorized - token issue, checking...');
        tokenWarningShown = true;

        // Debug token
        await debugToken();
      }

      // Try alternative auth format if not already tried
      if (!originalRequest._triedAlternativeAuth) {
        debugLog('Trying alternative auth header format...');
        originalRequest._triedAlternativeAuth = true;

        // Get current token
        const token = await SecureStore.getItemAsync('userToken');

        if (token) {
          // Try alternative format (just token without "Bearer")
          originalRequest.headers['Authorization'] = token;

          try {
            debugLog('Retrying request with alternative header format...');
            const response = await axios(originalRequest);
            debugLog('Request successful with alternative format!');

            return response;
          } catch (retryError) {
            debugLog(`Alternative format also failed: ${retryError.message}`);
          }
        }
      }

      // Only proceed with token deletion and redirect if not already in progress
      if (!authRedirectInProgress) {
        authRedirectInProgress = true;

        // On 401, delete token (unless it's a safe endpoint)
        debugLog('Deleting authorization token due to 401 Unauthorized');
        await SecureStore.deleteItemAsync('userToken');

        // Silent redirect to login without showing an alert
        setTimeout(() => {
          debugLog('Redirecting to login screen after auth error');
          router.replace('/login');

          // Reset the flag after a delay to prevent redirect loops
          setTimeout(() => {
            authRedirectInProgress = false;
          }, 2000);
        }, 100);
      }
    }
    // For "safe" endpoints with 401 error, don't delete the token
    else if (isSafe && error.response?.status === 401) {
      debugLog(`Auth error for safe endpoint (${url}), token preserved`);
    }

    // Format readable error message
    let errorMessage = 'Request error occurred';

    if (error.response?.data?.message) {
      errorMessage = error.response.data.message;
    } else if (error.message) {
      errorMessage = error.message;
    }

    // Network connection errors
    if (error.message === 'Network Error') {
      errorMessage = 'Network error. Check your internet connection';
    }

    // Server timeout
    if (error.code === 'ECONNABORTED') {
      errorMessage = 'Server not responding. Try again later';
    }

    // Create error with readable message
    const customError = new Error(errorMessage);
    return Promise.reject(customError);
  }
);

export default apiClient;