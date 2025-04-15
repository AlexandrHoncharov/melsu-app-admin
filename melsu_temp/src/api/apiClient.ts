import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

// Base URL for your API server
export const API_URL = 'https://app.melsu.ru/api';

// Create axios instance with base settings
const apiClient = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  },
  timeout: 15000, // 15 seconds timeout
});

// Function for debugging token
const debugToken = async () => {
  try {
    const token = await SecureStore.getItemAsync('userToken');
    if (token) {
      // Log first 10 and last 5 characters of token for debugging
      console.log(`Current token: ${token.substring(0, 10)}...${token.substring(token.length - 5)}`);

      // Check token structure - should be JWT with three parts separated by dots
      const parts = token.split('.');
      if (parts.length !== 3) {
        console.warn(`Token has incorrect JWT structure! Parts: ${parts.length}`);
      } else {
        console.log('Token has correct JWT structure (header.payload.signature)');

        // For additional debugging, decode header and payload
        try {
          const header = JSON.parse(atob(parts[0]));
          console.log('JWT Header:', header);
        } catch (e) {
          console.warn('Failed to decode JWT header:', e.message);
        }
      }
    } else {
      console.warn('Token missing in SecureStore');
    }
  } catch (e) {
    console.error('Error debugging token:', e.message);
  }
};

// List of requests that shouldn't trigger token deletion on 401 error
const SAFE_ENDPOINTS = [
  '/auth/firebase-token',
  '/device/register'
];

// Check if request is "safe" (shouldn't trigger token deletion)
const isSafeEndpoint = (url) => {
  return SAFE_ENDPOINTS.some(endpoint => url.includes(endpoint));
};

// Interceptor to add authorization token to requests
apiClient.interceptors.request.use(
  async (config) => {
    const token = await SecureStore.getItemAsync('userToken');
    if (token && config.headers) {
      // IMPORTANT CHANGE: Format header
      config.headers['Authorization'] = `Bearer ${token}`;

      console.log(`Adding token to request: ${config.method?.toUpperCase() || 'GET'} ${config.url}`);

      // Debug token once for each request
      if (config.url && !config._tokenDebugged) {
        config._tokenDebugged = true;
        await debugToken();
      }
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Flag to track if token warning was shown
let tokenWarningShown = false;

// Interceptor to handle responses and errors
apiClient.interceptors.response.use(
  (response) => {
    // Reset warning flag on successful request
    tokenWarningShown = false;
    return response;
  },
  async (error) => {
    const originalRequest = error.config;
    const url = originalRequest?.url || '';

    console.log(`Error ${error.response?.status || 'unknown'} in request ${originalRequest?.method?.toUpperCase() || 'GET'} ${url}`);

    // Check if request is "safe" for token
    const isSafe = isSafeEndpoint(url);

    // If 401 (Unauthorized) error and request hasn't been retried yet,
    // and it's NOT a "safe" request
    if (error.response?.status === 401 && !originalRequest._retry && !isSafe) {
      originalRequest._retry = true;

      // Show warning only once for better UX
      if (!tokenWarningShown) {
        console.log('⚠️ Received 401 Unauthorized - token issue, checking...');
        tokenWarningShown = true;

        // Debug token to understand the problem
        await debugToken();
      }

      // Check if we've already tried alternative auth format
      if (!originalRequest._triedAlternativeAuth) {
        console.log('Trying alternative authorization header format...');
        originalRequest._triedAlternativeAuth = true;

        // Get current token
        const token = await SecureStore.getItemAsync('userToken');

        if (token) {
          // Try alternative format (token only without "Bearer")
          originalRequest.headers['Authorization'] = token;

          try {
            console.log('Retrying request with alternative header format...');
            const response = await axios(originalRequest);
            console.log('✅ Request successful with alternative format!');

            // If successful, update format for all future requests
            apiClient.interceptors.request.use(
              async (config) => {
                const token = await SecureStore.getItemAsync('userToken');
                if (token && config.headers) {
                  config.headers['Authorization'] = token; // Without "Bearer"
                }
                return config;
              },
              (error) => Promise.reject(error),
              { runWhen: (config) => !config._hadAuth }
            );

            return response;
          } catch (retryError) {
            console.log('❌ Alternative format also failed:', retryError.message);
          }
        }
      }

      console.log('Received 401 Unauthorized, deleting authorization token');
      await SecureStore.deleteItemAsync('userToken');

      // Redirection to login screen will be handled by AuthContext
    }
    // For "safe" requests with 401 error, don't delete main token
    else if (isSafe && error.response?.status === 401) {
      console.log(`Authorization error for safe request (${url}), token preserved`);
    }

    // Format readable error message
    let errorMessage = 'An error occurred during the request';

    if (error.response?.data?.message) {
      errorMessage = error.response.data.message;
    } else if (error.message) {
      errorMessage = error.message;
    }

    // If no connection to server
    if (error.message === 'Network Error') {
      errorMessage = 'Network error. Check your internet connection';
    }

    // If server not responding
    if (error.code === 'ECONNABORTED') {
      errorMessage = 'Server not responding. Try again later';
    }

    // Create error object with readable message
    const customError = new Error(errorMessage);
    return Promise.reject(customError);
  }
);

export default apiClient;