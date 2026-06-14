import { io } from 'socket.io-client';

let socket = null;
let registration = null;
const watchedAccidents = new Set();
const offlineQueue = [];
let pingInterval = null;

// Environment-aware structured logging
const debugLog = (message, ...args) => {
  const isDev = import.meta.env.DEV;
  const isDebug = localStorage.getItem('debug') === 'socket';
  if (isDev || isDebug) {
    console.log(`[Socket.IO] ${message}`, ...args);
  }
};

const debugWarn = (message, ...args) => {
  const isDev = import.meta.env.DEV;
  const isDebug = localStorage.getItem('debug') === 'socket';
  if (isDev || isDebug) {
    console.warn(`[Socket.IO] ${message}`, ...args);
  }
};

const startHeartbeat = () => {
  if (pingInterval) clearInterval(pingInterval);
  pingInterval = setInterval(() => {
    if (socket && socket.connected) {
      const startTime = Date.now();
      let receivedPong = false;
      
      const onPong = () => {
        receivedPong = true;
        const latency = Date.now() - startTime;
        debugLog(`Ping health check. Latency: ${latency}ms`);
        if (window.__setSocketLatency) {
          window.__setSocketLatency(latency);
        }
      };
      
      // Send ping event to server (and listen for pong)
      socket.emit('ping', { clientTime: startTime });
      socket.once('pong', onPong);
      
      // Cleanup pong listener if timeout to prevent memory leak
      setTimeout(() => {
        if (!receivedPong && socket) {
          socket.off('pong', onPong);
          debugWarn('Ping heartbeat timeout - no pong received within 5s');
        }
      }, 5000);
    }
  }, 20000); // 20 seconds ping interval
};

const stopHeartbeat = () => {
  if (pingInterval) {
    clearInterval(pingInterval);
    pingInterval = null;
  }
};

export const getSocket = () => {
  if (!socket) {
    const socketUrl = import.meta.env.VITE_SOCKET_URL
      || (import.meta.env.VITE_API_URL ? import.meta.env.VITE_API_URL.replace('/api', '') : null)
      || '/';
      
    debugLog('Initializing socket connection to:', socketUrl);
    
    const socketTransports = import.meta.env.VITE_SOCKET_TRANSPORTS
      ? import.meta.env.VITE_SOCKET_TRANSPORTS.split(',')
      : ['polling', 'websocket'];

    // Retrieve token for initial load/handshake if already present
    const token = localStorage.getItem('token');

    socket = io(socketUrl, {
      path: '/socket.io',
      transports: socketTransports,
      autoConnect: false,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: Infinity,
      timeout: 10000,
      auth: { token }
    });

    // Save original emit before patching
    const originalEmit = socket.emit;
    socket.emit = function (event, ...args) {
      if (socket.connected) {
        return originalEmit.apply(this, [event, ...args]);
      } else {
        debugLog(`Socket offline. Queueing event: ${event}`);
        offlineQueue.push({ event, args });
        return socket;
      }
    };

    socket.on('connect', () => {
      debugLog('Connected. socketId:', socket.id);
      if (window.__setSocketStatus) {
        window.__setSocketStatus('connected');
      }
      
      // Register entity session if registered
      if (registration?.entityId && registration?.entityType) {
        debugLog('Registering entity session:', registration);
        originalEmit.call(socket, 'entity:register', registration);
      }
      
      // Re-watch active accidents on connection/reconnection
      watchedAccidents.forEach((accidentId) => {
        debugLog(`Re-watching accident on connect/reconnect: ${accidentId}`);
        originalEmit.call(socket, 'accident:watch', { accidentId });
      });
      
      // Replay offline queue
      while (offlineQueue.length > 0) {
        const { event, args } = offlineQueue.shift();
        debugLog(`Replaying queued event: ${event}`);
        socket.emit(event, ...args);
      }
      
      startHeartbeat();
    });

    socket.on('disconnect', (reason) => {
      debugLog('Disconnected. Reason:', reason);
      if (window.__setSocketStatus) {
        window.__setSocketStatus('offline');
      }
      stopHeartbeat();
    });

    socket.on('connect_error', (error) => {
      debugWarn('Connection error:', error.message);
      if (window.__setSocketStatus) {
        window.__setSocketStatus('offline');
      }
    });

    socket.on('reconnect_attempt', (attempt) => {
      debugLog('Reconnecting. Attempt:', attempt);
      if (window.__setSocketStatus) {
        window.__setSocketStatus('reconnecting');
      }
    });
  }
  return socket;
};

export const connectSocket = (entityId, entityType) => {
  registration = { entityId, entityType };
  const s = getSocket();
  
  // Dynamically attach/refresh the token before connecting
  const token = localStorage.getItem('token');
  s.auth = { token };

  if (!s.connected) {
    debugLog('Triggering connection...');
    s.connect();
  } else {
    debugLog('Already connected, re-emitting registration...');
    s.emit('entity:register', registration);
  }
  return s;
};

export const disconnectSocket = () => {
  if (socket) {
    debugLog('Tearing down socket connection and wiping event listeners...');
    socket.disconnect();
    socket.removeAllListeners();
    socket = null;
    registration = null;
    watchedAccidents.clear();
    stopHeartbeat();
    if (window.__setSocketStatus) {
      window.__setSocketStatus('offline');
    }
  }
};

export const watchAccident = (accidentId) => {
  if (!accidentId) return;
  watchedAccidents.add(accidentId);
  const s = getSocket();
  if (s.connected) {
    debugLog(`Watching accident: ${accidentId}`);
    s.emit('accident:watch', { accidentId });
  }
};

export const unwatchAccident = (accidentId) => {
  if (!accidentId) return;
  watchedAccidents.delete(accidentId);
  const s = getSocket();
  if (s.connected) {
    debugLog(`Unwatching accident: ${accidentId}`);
    // If the backend has no explicit unwatch/leave handler, it will clean up on disconnect.
    // However, we emit accident:unwatch for completeness and future-proofing.
    s.emit('accident:unwatch', { accidentId });
  }
};

export default getSocket;
