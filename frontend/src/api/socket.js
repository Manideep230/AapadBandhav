import Pusher from 'pusher-js';
import { io } from 'socket.io-client';

let socketInstance = null;
let registration = null;
const watchedAccidents = new Set();

// Environment-aware structured logging
const debugLog = (message, ...args) => {
  const isProd = import.meta.env.MODE === 'production';
  const isDebug = !isProd && (import.meta.env.DEV || localStorage.getItem('debug') === 'socket');
  if (isDebug) {
    console.log(`[Pusher-Emulator] ${message}`, ...args);
  }
};

const debugWarn = (message, ...args) => {
  const isProd = import.meta.env.MODE === 'production';
  const isDebug = !isProd && (import.meta.env.DEV || localStorage.getItem('debug') === 'socket');
  if (isDebug) {
    console.warn(`[Pusher-Emulator] ${message}`, ...args);
  }
};

// Maps Socket.IO event names to Pusher channel/event targets
function mapEventToPusher(eventName, reg) {
  if (['connect', 'disconnect', 'connect_error', 'reconnect_attempt'].includes(eventName)) {
    return null; 
  }

  let match;

  // 1. accident:${accidentId}:chat -> channel: accident-${id}, event: chat
  match = eventName.match(/^accident:([^:]+):chat$/);
  if (match) {
    return { channel: `accident-${match[1]}`, event: 'chat' };
  }

  // 2. accident:${accidentId}:tracking -> channel: accident-${id}, event: tracking
  match = eventName.match(/^accident:([^:]+):tracking$/);
  if (match) {
    return { channel: `accident-${match[1]}`, event: 'tracking' };
  }

  // 3. accident:${accidentId}:responded -> channel: accident-${id}, event: alert:acknowledge
  match = eventName.match(/^accident:([^:]+):responded$/);
  if (match) {
    return { channel: `accident-${match[1]}`, event: 'alert:acknowledge' };
  }

  // 4. accident:${accidentId}:status_change -> channel: accident-${id}, event: status_change
  match = eventName.match(/^accident:([^:]+):status_change$/);
  if (match) {
    return { channel: `accident-${match[1]}`, event: 'status_change' };
  }

  // 5. Status change filters
  if (eventName === 'accident:resolved') {
    return { channel: 'accidents', event: 'status_change', filter: (data) => data.status === 'resolved' };
  }
  if (eventName === 'accident:cancelled') {
    return { channel: 'accidents', event: 'status_change', filter: (data) => data.status === 'cancelled' || data.status === 'closed' };
  }
  if (eventName === 'accident:false_alarm') {
    return { channel: 'accidents', event: 'status_change', filter: (data) => data.status === 'false_alarm' };
  }

  // 6. route:${routeId}:recalculated -> channel: route-${id}, event: recalculated
  match = eventName.match(/^route:([^:]+):recalculated$/);
  if (match) {
    return { channel: `route-${match[1]}`, event: 'recalculated' };
  }

  // 7. route:${routeId}:completed -> channel: route-${id}, event: completed
  match = eventName.match(/^route:([^:]+):completed$/);
  if (match) {
    return { channel: `route-${match[1]}`, event: 'completed' };
  }

  // 8. route:${routeId}:update -> channel: route-${id}, event: location:update
  match = eventName.match(/^route:([^:]+):update$/);
  if (match) {
    return { channel: `route-${match[1]}`, event: 'location:update' };
  }

  // 9. device:${deviceId}:movement -> channel: device-${id}, event: movement
  match = eventName.match(/^device:([^:]+):movement$/);
  if (match) {
    return { channel: `device-${match[1]}`, event: 'movement' };
  }

  // 10. entity:${entityId}:alert -> channel: entity-${id}, event: alert:new
  match = eventName.match(/^entity:([^:]+):alert$/);
  if (match) {
    return { channel: `entity-${match[1]}`, event: 'alert:new' };
  }

  // 11. entity:location -> channel: locations, event: update
  if (eventName === 'entity:location') {
    return { channel: 'locations', event: 'update' };
  }

  // 12. accident:new -> channel: accidents, event: accident:new
  if (eventName === 'accident:new') {
    return { channel: 'accidents', event: 'accident:new' };
  }

  // 13. accident:dispatched -> channel: accidents, event: dispatched
  if (eventName === 'accident:dispatched') {
    return { channel: 'accidents', event: 'dispatched' };
  }

  // 14. alert:new -> entity-specific channel
  if (eventName === 'alert:new') {
    const entId = reg?.entityId;
    if (entId) {
      return { channel: `entity-${entId}`, event: 'alert:new' };
    }
    return null;
  }

  // 15. alert:removed -> entity-specific channel
  if (eventName === 'alert:removed') {
    const entId = reg?.entityId;
    if (entId) {
      return { channel: `entity-${entId}`, event: 'alert:removed' };
    }
    return null;
  }

  // 16. accident:phase2 -> channel: accidents, event: phase2
  if (eventName === 'accident:phase2') {
    return { channel: 'accidents', event: 'phase2' };
  }

  // 17. accident:responded -> channel: accidents, event: alert:acknowledge
  if (eventName === 'accident:responded') {
    return { channel: 'accidents', event: 'alert:acknowledge' };
  }

  // 18. device:movement -> channel: user-${userId}, event: device-movement
  if (eventName === 'device:movement') {
    const entId = reg?.entityId;
    if (entId) {
      return { channel: `user-${entId}`, event: 'device-movement' };
    }
    return null;
  }

  // 19. accident:status_change -> channel: accidents, event: status_change
  if (eventName === 'accident:status_change') {
    return { channel: 'accidents', event: 'status_change' };
  }

  if (eventName.includes(':')) {
    const parts = eventName.split(':');
    return { channel: parts[0], event: parts[1] };
  }

  return null;
}

class PusherSocketEmulator {
  constructor() {
    this.pusher = null;
    this.socketIO = null;
    this.usingSocketIO = false;
    this.connected = false;
    this.id = 'pusher-socket-' + Math.random().toString(36).substring(2, 9);
    this.auth = { token: null };
    this.listeners = new Map();
    this.subscriptions = new Map();
    this.pusherListeners = new Map();
    this.reconnectTimeout = null;
  }

  on(eventName, fn) {
    if (!this.listeners.has(eventName)) {
      this.listeners.set(eventName, new Set());
    }
    this.listeners.get(eventName).add(fn);

    this._bindEvent(eventName, fn);
    return this;
  }

  off(eventName, fn) {
    if (!this.listeners.has(eventName)) return this;
    const fns = this.listeners.get(eventName);
    if (fn) {
      fns.delete(fn);
      this._unbindEvent(eventName, fn);
    } else {
      for (const listenerFn of fns) {
        this._unbindEvent(eventName, listenerFn);
      }
      fns.clear();
    }
    return this;
  }

  emit(eventName, ...args) {
    debugLog(`Emitting event: ${eventName}`, args);
    if (eventName === 'entity:register') {
      registration = args[0];
      this._rebindAllEvents();
    } else if (eventName === 'accident:watch') {
      const { accidentId } = args[0] || {};
      watchAccident(accidentId);
    } else if (eventName === 'accident:unwatch') {
      const { accidentId } = args[0] || {};
      unwatchAccident(accidentId);
    } else if (eventName === 'location:update') {
      const payload = args[0];
      const token = this.auth?.token || localStorage.getItem('token');
      const apiEndpoint = import.meta.env.VITE_API_URL || '/api';
      fetch(`${apiEndpoint}/locations/update`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      })
      .then(res => res.json())
      .then(data => debugLog('Location update HTTP redirect success:', data))
      .catch(err => debugWarn('Location update HTTP redirect failed:', err));
    }
    return this;
  }

  disconnect() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.socketIO) {
      debugLog('Disconnecting Socket.IO client...');
      this.socketIO.disconnect();
      this.socketIO = null;
    }
    if (this.pusher) {
      debugLog('Disconnecting Pusher client...');
      this.pusher.disconnect();
      this.pusher = null;
    }
    this.connected = false;
    this.usingSocketIO = false;
    this.subscriptions.clear();
    this.pusherListeners.clear();
    this._triggerLifecycle('disconnect', 'client disconnect');
  }

  removeAllListeners() {
    for (const [eventName, fns] of this.listeners.entries()) {
      for (const fn of fns) {
        this._unbindEvent(eventName, fn);
      }
    }
    this.listeners.clear();
    return this;
  }

  connect() {
    if (this.socketIO && this.socketIO.connected) {
      return;
    }

    const socketUrl = import.meta.env.VITE_SOCKET_URL || window.location.protocol + '//' + window.location.hostname + ':5000';
    debugLog(`Attempting Socket.IO connection to: ${socketUrl}`);

    this.socketIO = io(socketUrl, {
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnectionAttempts: 3,
      timeout: 5000
    });

    this.socketIO.on('connect', () => {
      this.connected = true;
      this.usingSocketIO = true;
      debugLog('Socket.IO connection successful!');
      if (window.__setSocketStatus) {
        window.__setSocketStatus('connected');
      }
      this._triggerLifecycle('connect');
      this._rebindAllEvents();
    });

    this.socketIO.on('disconnect', (reason) => {
      debugWarn(`Socket.IO disconnected: ${reason}. Falling back to Pusher...`);
      this.usingSocketIO = false;
      this.connectPusher();
    });

    this.socketIO.on('connect_error', (err) => {
      debugWarn('Socket.IO connection error, falling back to Pusher:', err);
      this.usingSocketIO = false;
      this.connectPusher();
    });
  }

  connectPusher() {
    if (this.pusher) {
      if (this.pusher.connection.state === 'disconnected' || this.pusher.connection.state === 'failed' || this.pusher.connection.state === 'unavailable') {
        debugLog('Pusher instance exists but is offline. Re-connecting...');
        this.pusher.connect();
      }
      return;
    }

    const key = import.meta.env.VITE_PUSHER_KEY || 'dummy_key';
    const cluster = import.meta.env.VITE_PUSHER_CLUSTER || 'mt1';
    
    debugLog(`Connecting to Pusher with key: ${key}, cluster: ${cluster}`);

    this.pusher = new Pusher(key, {
      cluster: cluster,
      forceTLS: true,
    });

    this.pusher.connection.bind('state_change', (states) => {
      debugLog(`Pusher state changed from ${states.previous} to ${states.current}`);
      if (states.current === 'failed' || states.current === 'unavailable') {
        debugWarn(`Pusher went into terminal state: ${states.current}.`);
        if (!this.usingSocketIO) {
          if (window.__setSocketStatus) {
            window.__setSocketStatus('offline');
          }
          this.connected = false;
        }
      }
    });

    this.pusher.connection.bind('connected', () => {
      if (!this.usingSocketIO) {
        this.connected = true;
        debugLog('Pusher Connection Connected');
        this._triggerLifecycle('connect');
        if (window.__setSocketStatus) {
          window.__setSocketStatus('connected');
        }
        this._rebindAllEvents();
      }
    });

    this.pusher.connection.bind('disconnected', () => {
      if (!this.usingSocketIO) {
        this.connected = false;
        debugLog('Pusher Connection Disconnected');
        this._triggerLifecycle('disconnect');
        if (window.__setSocketStatus) {
          window.__setSocketStatus('offline');
        }
      }
    });
  }

  _triggerLifecycle(eventName, ...args) {
    if (this.listeners.has(eventName)) {
      for (const fn of this.listeners.get(eventName)) {
        try {
          fn(...args);
        } catch (e) {
          console.error(`Error in lifecycle listener for ${eventName}:`, e);
        }
      }
    }
  }

  _bindEvent(eventName, fn) {
    const mapping = mapEventToPusher(eventName, registration);
    if (!mapping) return;

    const { channel: channelName, event: pusherEventName, filter } = mapping;

    if (this.usingSocketIO && this.socketIO) {
      this.socketIO.emit('subscribe', channelName);
      
      const boundFn = (data) => {
        if (filter && !filter(data)) return;
        debugLog(`Received Socket.IO event [${channelName} -> ${pusherEventName}] for [${eventName}]`, data);
        fn(data);
      };
      
      this.socketIO.on(pusherEventName, boundFn);
      this.socketIO.on(`${channelName}:${pusherEventName}`, boundFn);

      if (!this.pusherListeners.has(eventName)) {
        this.pusherListeners.set(eventName, new Map());
      }
      this.pusherListeners.get(eventName).set(fn, { channelName, pusherEventName, boundFn, isSocketIO: true });
      return;
    }

    if (this.pusher) {
      let channel = this.subscriptions.get(channelName);
      if (!channel) {
        channel = this.pusher.subscribe(channelName);
        this.subscriptions.set(channelName, channel);
        debugLog(`Subscribed to Pusher channel: ${channelName}`);
      }

      const boundFn = (data) => {
        if (filter && !filter(data)) return;
        debugLog(`Received Pusher event [${channelName} -> ${pusherEventName}] for [${eventName}]`, data);
        fn(data);
      };

      channel.bind(pusherEventName, boundFn);

      if (!this.pusherListeners.has(eventName)) {
        this.pusherListeners.set(eventName, new Map());
      }
      this.pusherListeners.get(eventName).set(fn, { channelName, pusherEventName, boundFn, isSocketIO: false });
    }
  }

  _unbindEvent(eventName, fn) {
    if (!this.pusherListeners.has(eventName)) return;
    const eventBindings = this.pusherListeners.get(eventName);
    const binding = eventBindings.get(fn);
    if (binding) {
      const { channelName, pusherEventName, boundFn, isSocketIO } = binding;
      if (isSocketIO && this.socketIO) {
        this.socketIO.off(pusherEventName, boundFn);
        this.socketIO.off(`${channelName}:${pusherEventName}`, boundFn);
      } else if (this.pusher) {
        const channel = this.subscriptions.get(channelName);
        if (channel) {
          channel.unbind(pusherEventName, boundFn);
          debugLog(`Unbound event [${pusherEventName}] from channel [${channelName}]`);
        }
      }
      eventBindings.delete(fn);
    }
  }

  _rebindAllEvents() {
    debugLog('Rebinding all registered socket event listeners...');
    for (const [eventName, fns] of this.listeners.entries()) {
      for (const fn of fns) {
        this._unbindEvent(eventName, fn);
        this._bindEvent(eventName, fn);
      }
    }
  }
}

export const getSocket = () => {
  if (!socketInstance) {
    socketInstance = new PusherSocketEmulator();
  }
  return socketInstance;
};

export const connectSocket = (entityId, entityType) => {
  registration = { entityId, entityType };
  const s = getSocket();
  
  const token = localStorage.getItem('token');
  s.auth = { token };

  s.connect();
  return s;
};

export const disconnectSocket = () => {
  if (socketInstance) {
    debugLog('Tearing down socket connection and wiping event listeners...');
    socketInstance.disconnect();
    socketInstance.removeAllListeners();
    socketInstance = null;
    registration = null;
    watchedAccidents.clear();
  }
};

export const watchAccident = (accidentId) => {
  if (!accidentId) return;
  watchedAccidents.add(accidentId);
  const s = getSocket();
  if (s && s.pusher) {
    const channelName = `accident-${accidentId}`;
    if (!s.subscriptions.has(channelName)) {
      const channel = s.pusher.subscribe(channelName);
      s.subscriptions.set(channelName, channel);
      debugLog(`Dynamically watched accident channel: ${channelName}`);
    }
  }
};

export const unwatchAccident = (accidentId) => {
  if (!accidentId) return;
  watchedAccidents.delete(accidentId);
  const s = getSocket();
  if (s && s.pusher) {
    const channelName = `accident-${accidentId}`;
    if (s.subscriptions.has(channelName)) {
      s.pusher.unsubscribe(channelName);
      s.subscriptions.delete(channelName);
      debugLog(`Dynamically unwatched accident channel: ${channelName}`);
    }
  }
};

export default getSocket;
