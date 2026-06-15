import axios from 'axios';

const API = axios.create({ baseURL: import.meta.env.VITE_API_URL || '/api' });

const RETRY_DELAYS = [1000, 3000, 5000, 10000, 30000];

API.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

API.interceptors.response.use(
  (res) => {
    // Notify connection success
    if (window.__setBackendAvailable) {
      window.__setBackendAvailable(true);
    }
    return res;
  },
  async (err) => {
    const config = err.config;
    
    // Check if error is network/timeout or 5xx
    const isNetworkError = !err.response || (err.response.status >= 500 && err.response.status <= 599);
    
    if (isNetworkError && config && !config._isRetryRedirect) {
      config.retryCount = config.retryCount || 0;
      
      if (config.retryCount < RETRY_DELAYS.length) {
        const delay = RETRY_DELAYS[config.retryCount];
        config.retryCount += 1;
        
        // Notify connection recovering - keep app active (available: true) but in recovery state
        if (window.__setBackendAvailable) {
          window.__setBackendAvailable(true, true); // (available, isRecovering)
        }
        
        // Wait for the backoff delay
        await new Promise((resolve) => setTimeout(resolve, delay));
        
        // Retry the request
        return API(config);
      } else {
        // Halted retrying - trigger health check to verify if server is actually dead
        if (window.__triggerHealthCheck) {
          window.__triggerHealthCheck();
        }
      }
    }
    
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(err);
  }
);

export default API;
