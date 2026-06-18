/**
 * socket.js — EMQX MQTT realtime client
 *
 * Replaces the previous Pusher / Socket.IO emulator.
 * Connects to an EMQX MQTT broker over secure WebSockets (wss://).
 *
 * PUBLIC API (unchanged from previous Pusher emulator):
 *   getSocket()          → returns the shared MQTTSocketEmulator instance
 *   connectSocket(id, type) → connect & register entity
 *   disconnectSocket()   → tear down connection
 *   watchAccident(id)    → subscribe to a specific accident's topics
 *   unwatchAccident(id)  → unsubscribe from an accident's topics
 *
 * The instance exposes:
 *   .on(eventName, fn)   → listen for a logical event
 *   .off(eventName, fn)  → remove a listener
 *   .emit(eventName, …)  → send a client-originated action (location updates, etc.)
 *   .disconnect()        → close MQTT connection
 *
 * MQTT broker config via Vite env vars:
 *   VITE_EMQX_HOST        e.g. "abc.emqx.cloud"
 *   VITE_EMQX_WSS_PORT    e.g. "8084"
 *   VITE_EMQX_USERNAME    e.g. "aapadbandhav-frontend"
 *   VITE_EMQX_PASSWORD    e.g. "secret"
 *   VITE_EMQX_TOPIC_PREFIX e.g. "aapad"
 */

import mqtt from 'mqtt';

// ─── Configuration ────────────────────────────────────────────────────────────

const EMQX_HOST    = import.meta.env.VITE_EMQX_HOST    || 'localhost';
const EMQX_PORT    = import.meta.env.VITE_EMQX_WSS_PORT || '8084';
const EMQX_USER    = import.meta.env.VITE_EMQX_USERNAME || 'aapadbandhav-frontend';
const EMQX_PASS    = import.meta.env.VITE_EMQX_PASSWORD || '';
const PREFIX       = import.meta.env.VITE_EMQX_TOPIC_PREFIX || 'aapad';
const API_URL      = import.meta.env.VITE_API_URL || '/api';

// Use wss:// in production / when host is not localhost, ws:// for local testing
const BROKER_URL   = (EMQX_HOST === 'localhost' || EMQX_HOST === '127.0.0.1')
  ? `ws://${EMQX_HOST}:${EMQX_PORT}/mqtt`
  : `wss://${EMQX_HOST}:${EMQX_PORT}/mqtt`;

// ─── Logging helpers ──────────────────────────────────────────────────────────

const isDebug = () =>
  import.meta.env.MODE !== 'production' &&
  (import.meta.env.DEV || localStorage.getItem('debug') === 'socket');

const debugLog  = (msg, ...a) => isDebug() && console.log(`[MQTT] ${msg}`, ...a);
const debugWarn = (msg, ...a) => isDebug() && console.warn(`[MQTT] ${msg}`, ...a);

// ─── Topic helpers ────────────────────────────────────────────────────────────

/**
 * Convert a Pusher-style channel + event name into an MQTT topic string.
 * Mirrors the logic in backend/services/realtime/index.ts exactly.
 *
 * Examples:
 *   ("entity-abc", "alert:new")      → "aapad/entity-abc/alert/new"
 *   ("accidents", "accident:new")    → "aapad/accidents/accident/new"
 *   ("accident-xyz", "status_change") → "aapad/accident-xyz/status_change"
 */
function buildTopic(channel, event) {
  const safeChannel = channel.replace(/[^a-zA-Z0-9\-_]/g, '-');
  const safeEvent   = event.replace(/:/g, '/').replace(/[^a-zA-Z0-9\-_\/]/g, '-');
  return `${PREFIX}/${safeChannel}/${safeEvent}`;
}

/**
 * Build an MQTT wildcard subscription for an entire channel.
 * e.g. channel "entity-abc" → "aapad/entity-abc/#"
 */
function channelWildcard(channel) {
  const safe = channel.replace(/[^a-zA-Z0-9\-_]/g, '-');
  return `${PREFIX}/${safe}/#`;
}

// ─── Event → Topic/Channel mapping ───────────────────────────────────────────

/**
 * Maps a Socket.IO-style logical event name (used by React components) to the
 * MQTT channel + event pair that the backend publishes to.
 *
 * Returns: { channel: string, event: string, filter?: (data) => boolean }
 * Returns: null for lifecycle events that don't map to MQTT topics.
 */
function mapEventToMQTT(eventName, registration) {
  if (['connect', 'disconnect', 'connect_error', 'reconnect_attempt'].includes(eventName)) {
    return null;
  }

  let match;

  // accident:{id}:chat  →  channel: accident-{id},  event: chat
  match = eventName.match(/^accident:([^:]+):chat$/);
  if (match) return { channel: `accident-${match[1]}`, event: 'chat' };

  // accident:{id}:tracking  →  channel: accident-{id},  event: tracking
  match = eventName.match(/^accident:([^:]+):tracking$/);
  if (match) return { channel: `accident-${match[1]}`, event: 'tracking' };

  // accident:{id}:responded  →  channel: accident-{id},  event: alert:acknowledge
  match = eventName.match(/^accident:([^:]+):responded$/);
  if (match) return { channel: `accident-${match[1]}`, event: 'alert:acknowledge' };

  // accident:{id}:status_change  →  channel: accident-{id},  event: status_change
  match = eventName.match(/^accident:([^:]+):status_change$/);
  if (match) return { channel: `accident-${match[1]}`, event: 'status_change' };

  // accident:resolved  →  accidents channel, filter on resolved
  if (eventName === 'accident:resolved') {
    return { channel: 'accidents', event: 'status_change', filter: d => d.status === 'resolved' };
  }
  if (eventName === 'accident:cancelled') {
    return { channel: 'accidents', event: 'status_change', filter: d => ['cancelled', 'closed'].includes(d.status) };
  }
  if (eventName === 'accident:false_alarm') {
    return { channel: 'accidents', event: 'status_change', filter: d => d.status === 'false_alarm' };
  }

  // route:{id}:recalculated / completed / update
  match = eventName.match(/^route:([^:]+):recalculated$/);
  if (match) return { channel: `route-${match[1]}`, event: 'recalculated' };

  match = eventName.match(/^route:([^:]+):completed$/);
  if (match) return { channel: `route-${match[1]}`, event: 'completed' };

  match = eventName.match(/^route:([^:]+):update$/);
  if (match) return { channel: `route-${match[1]}`, event: 'location:update' };

  // device:{id}:movement
  match = eventName.match(/^device:([^:]+):movement$/);
  if (match) return { channel: `device-${match[1]}`, event: 'movement' };

  // entity:{id}:alert
  match = eventName.match(/^entity:([^:]+):alert$/);
  if (match) return { channel: `entity-${match[1]}`, event: 'alert:new' };

  // entity:location
  if (eventName === 'entity:location') return { channel: 'locations', event: 'update' };

  // accident:new / dispatched / phase2 / responded / status_change
  if (eventName === 'accident:new')          return { channel: 'accidents', event: 'accident:new' };
  if (eventName === 'accident:dispatched')   return { channel: 'accidents', event: 'dispatched' };
  if (eventName === 'accident:phase2')       return { channel: 'accidents', event: 'phase2' };
  if (eventName === 'accident:responded')    return { channel: 'accidents', event: 'alert:acknowledge' };
  if (eventName === 'accident:status_change') return { channel: 'accidents', event: 'status_change' };

  // alert:new / alert:removed  →  entity-specific channel
  if (eventName === 'alert:new' || eventName === 'alert:removed') {
    const entId = registration?.entityId;
    if (entId) return { channel: `entity-${entId}`, event: eventName };
    return null;
  }

  // device:movement  →  user-{entityId} channel
  if (eventName === 'device:movement') {
    const entId = registration?.entityId;
    if (entId) return { channel: `user-${entId}`, event: 'device-movement' };
    return null;
  }

  // Generic colon-separated fallback
  if (eventName.includes(':')) {
    const parts = eventName.split(':');
    return { channel: parts[0], event: parts.slice(1).join(':') };
  }

  return null;
}

// ─── Main class ───────────────────────────────────────────────────────────────

let socketInstance = null;
let registration   = null;
const watchedAccidents = new Set();

class MQTTSocketEmulator {
  constructor() {
    this.client        = null;        // mqtt.Client
    this.connected     = false;
    this.id            = 'mqtt-' + Math.random().toString(36).substring(2, 9);
    this.auth          = { token: null };
    this.listeners     = new Map();   // eventName → Set<fn>
    this.mqttHandlers  = new Map();   // eventName → Map<fn, { topic, boundFn, filter }>
    this.subscribedTopics = new Set(); // currently subscribed MQTT topics
  }

  // ── Public event API ──────────────────────────────────────────────────────

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
      for (const f of fns) this._unbindEvent(eventName, f);
      fns.clear();
    }
    return this;
  }

  /**
   * Client-originated actions:
   *   entity:register  → register this entity, rebind entity-specific topics
   *   accident:watch   → subscribe to an accident channel
   *   accident:unwatch → unsubscribe from an accident channel
   *   location:update  → HTTP POST to the REST API (no MQTT publish from browser)
   */
  emit(eventName, ...args) {
    debugLog(`emit: ${eventName}`, args);

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
      // Location updates go via REST, not MQTT publish from the browser
      const payload = args[0];
      const token   = this.auth?.token || localStorage.getItem('token');
      fetch(`${API_URL}/locations/update`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      })
        .then(r => r.json())
        .then(d => debugLog('Location update OK:', d))
        .catch(e => debugWarn('Location update failed:', e));
    }
    return this;
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  connect() {
    if (this.client && this.connected) {
      debugLog('Already connected, skipping reconnect.');
      return;
    }

    const brokerConfigured = EMQX_HOST !== 'localhost' &&
      EMQX_HOST !== 'your-cluster.emqx.cloud';

    if (!brokerConfigured) {
      console.warn(
        '[MQTT] EMQX broker not configured. ' +
        'Set VITE_EMQX_HOST in frontend/.env. ' +
        'Realtime events will be silent until broker is set up.'
      );
      // Still trigger connect so UI does not hang waiting
      this.connected = true;
      this._triggerLifecycle('connect');
      if (window.__setSocketStatus) window.__setSocketStatus('connected');
      return;
    }

    debugLog(`Connecting to MQTT broker: ${BROKER_URL}`);

    const clientId = `aapad-web-${Math.random().toString(16).slice(2, 8)}`;

    this.client = mqtt.connect(BROKER_URL, {
      clientId,
      username: EMQX_USER,
      password: EMQX_PASS,
      clean: true,
      reconnectPeriod: 3000,  // auto-reconnect every 3 s
      connectTimeout: 8000,
      keepalive: 30,
    });

    this.client.on('connect', () => {
      this.connected = true;
      debugLog('MQTT connected!');
      if (window.__setSocketStatus) window.__setSocketStatus('connected');
      this._triggerLifecycle('connect');
      this._rebindAllEvents(); // re-subscribe after reconnection
    });

    this.client.on('reconnect', () => {
      debugLog('MQTT reconnecting…');
      if (window.__setSocketStatus) window.__setSocketStatus('connecting');
    });

    this.client.on('offline', () => {
      this.connected = false;
      debugWarn('MQTT client went offline.');
      if (window.__setSocketStatus) window.__setSocketStatus('offline');
      this._triggerLifecycle('disconnect');
    });

    this.client.on('error', err => {
      debugWarn('MQTT error:', err.message);
      if (window.__setSocketStatus) window.__setSocketStatus('offline');
    });

    // All incoming messages are routed here
    this.client.on('message', (topic, payloadBuf) => {
      this._handleMessage(topic, payloadBuf);
    });
  }

  disconnect() {
    if (this.client) {
      debugLog('Disconnecting MQTT client…');
      this.client.end(true);
      this.client = null;
    }
    this.connected = false;
    this.subscribedTopics.clear();
    this._triggerLifecycle('disconnect', 'client disconnect');
  }

  removeAllListeners() {
    for (const [eventName, fns] of this.listeners.entries()) {
      for (const fn of fns) this._unbindEvent(eventName, fn);
    }
    this.listeners.clear();
    return this;
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  /**
   * Central message handler — dispatches incoming MQTT payloads to
   * all registered JavaScript callbacks.
   */
  _handleMessage(topic, payloadBuf) {
    let envelope;
    try {
      envelope = JSON.parse(payloadBuf.toString());
    } catch {
      debugWarn(`Unparseable message on topic "${topic}"`);
      return;
    }

    const { channel, event, data } = envelope;
    debugLog(`Received [${topic}] channel="${channel}" event="${event}"`, data);

    // Notify every registered handler that matches this channel+event combination
    for (const [eventName, fns] of this.listeners.entries()) {
      if (!this.mqttHandlers.has(eventName)) continue;

      for (const [fn, binding] of this.mqttHandlers.get(eventName).entries()) {
        const { topic: boundTopic, filter } = binding;

        // Match by exact MQTT topic or by wildcard subscription prefix
        const topicMatches =
          topic === boundTopic ||
          topic.startsWith(boundTopic.replace('/#', '/')) ||
          boundTopic.endsWith('/#');

        if (!topicMatches) continue;
        if (filter && !filter(data)) continue;

        try {
          fn(data);
        } catch (e) {
          console.error(`[MQTT] Error in handler for "${eventName}":`, e);
        }
      }
    }
  }

  _bindEvent(eventName, fn) {
    const mapping = mapEventToMQTT(eventName, registration);
    if (!mapping) return;

    const { channel, event, filter } = mapping;
    const topic = buildTopic(channel, event);

    // Subscribe to the MQTT topic if not already subscribed
    if (!this.subscribedTopics.has(topic) && this.client && this.connected) {
      this.client.subscribe(topic, { qos: 1 }, (err) => {
        if (err) {
          debugWarn(`Failed to subscribe to "${topic}":`, err.message);
        } else {
          debugLog(`Subscribed to topic: ${topic}`);
          this.subscribedTopics.add(topic);
        }
      });
    } else if (!this.subscribedTopics.has(topic)) {
      // Queue subscription for when we connect
      this.subscribedTopics.add(topic);
    }

    if (!this.mqttHandlers.has(eventName)) {
      this.mqttHandlers.set(eventName, new Map());
    }
    this.mqttHandlers.get(eventName).set(fn, { topic, channel, event, filter });
  }

  _unbindEvent(eventName, fn) {
    if (!this.mqttHandlers.has(eventName)) return;
    this.mqttHandlers.get(eventName).delete(fn);
  }

  _rebindAllEvents() {
    debugLog('Rebinding all event listeners after connect…');

    // Clear and re-subscribe to all previously queued topics
    if (this.client && this.connected) {
      for (const topic of this.subscribedTopics) {
        this.client.subscribe(topic, { qos: 1 }, (err) => {
          if (!err) debugLog(`Re-subscribed to topic: ${topic}`);
        });
      }
    }

    // Re-process all registered events to pick up any entity-specific topics
    for (const [eventName, fns] of this.listeners.entries()) {
      for (const fn of fns) {
        this._unbindEvent(eventName, fn);
        this._bindEvent(eventName, fn);
      }
    }
  }

  _triggerLifecycle(eventName, ...args) {
    if (this.listeners.has(eventName)) {
      for (const fn of this.listeners.get(eventName)) {
        try { fn(...args); } catch (e) {
          console.error(`[MQTT] Lifecycle error for "${eventName}":`, e);
        }
      }
    }
  }
}

// ─── Exported API (identical to previous Pusher emulator) ────────────────────

export const getSocket = () => {
  if (!socketInstance) {
    socketInstance = new MQTTSocketEmulator();
  }
  return socketInstance;
};

export const connectSocket = (entityId, entityType) => {
  registration = { entityId, entityType };
  const s = getSocket();
  s.auth = { token: localStorage.getItem('token') };
  s.connect();
  return s;
};

export const disconnectSocket = () => {
  if (socketInstance) {
    debugLog('Tearing down MQTT connection and wiping event listeners…');
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
  const channelWild = channelWildcard(`accident-${accidentId}`);

  if (s.client && s.connected && !s.subscribedTopics.has(channelWild)) {
    s.client.subscribe(channelWild, { qos: 1 }, (err) => {
      if (!err) {
        s.subscribedTopics.add(channelWild);
        debugLog(`Dynamically watching accident channel: accident-${accidentId}`);
      }
    });
  } else {
    s.subscribedTopics.add(channelWild);
  }
};

export const unwatchAccident = (accidentId) => {
  if (!accidentId) return;
  watchedAccidents.delete(accidentId);

  const s = getSocket();
  const channelWild = channelWildcard(`accident-${accidentId}`);

  if (s.client && s.subscribedTopics.has(channelWild)) {
    s.client.unsubscribe(channelWild, () => {
      s.subscribedTopics.delete(channelWild);
      debugLog(`Unwatched accident channel: accident-${accidentId}`);
    });
  }
};

export default getSocket;
