/**
 * socket.js — EMQX MQTT realtime client (Frontend)
 *
 * Replaces Pusher / Socket.IO. Connects to EMQX broker over secure
 * WebSockets (wss://). Uses dedicated frontend credentials (separate from
 * backend and IoT credentials).
 *
 * Broker:  s1659115.ala.asia-southeast1.emqxsl.com
 * Port:    8084  (WebSocket over TLS/SSL)
 * Auth:    aapadbandhav-frontend / <password from EMQX Authentication>
 *
 * PUBLIC API (identical to the previous Pusher emulator — zero component changes needed):
 *   getSocket()               → shared MQTTSocketEmulator instance
 *   connectSocket(id, type)   → connect & register entity
 *   disconnectSocket()        → tear down connection
 *   watchAccident(id)         → subscribe to an accident's MQTT topics
 *   unwatchAccident(id)       → unsubscribe from an accident's topics
 *
 * Instance exposes:
 *   .on(eventName, fn)        → register a listener for a logical event
 *   .off(eventName, fn)       → remove a listener
 *   .emit(eventName, …)       → client-originated actions
 *   .disconnect()             → close MQTT connection
 *
 * Env vars (set in frontend/.env and Vercel):
 *   VITE_EMQX_HOST            s1659115.ala.asia-southeast1.emqxsl.com
 *   VITE_EMQX_WSS_PORT        8084
 *   VITE_EMQX_USERNAME        aapadbandhav-frontend
 *   VITE_EMQX_PASSWORD        <set in EMQX Dashboard → Authentication>
 *   VITE_EMQX_TOPIC_PREFIX    aapad
 */

import mqtt from 'mqtt';

// ─── Configuration ────────────────────────────────────────────────────────────

const EMQX_HOST  = import.meta.env.VITE_EMQX_HOST    || 'localhost';
const EMQX_PORT  = import.meta.env.VITE_EMQX_WSS_PORT || '8084';
const EMQX_USER  = import.meta.env.VITE_EMQX_USERNAME || 'aapadbandhav-frontend';
const EMQX_PASS  = import.meta.env.VITE_EMQX_PASSWORD || '';
const PREFIX     = import.meta.env.VITE_EMQX_TOPIC_PREFIX || 'aapad';
const API_URL    = import.meta.env.VITE_API_URL || '/api';

// Always wss:// for EMQX Cloud (TLS), ws:// only for localhost dev
const IS_LOCAL   = EMQX_HOST === 'localhost' || EMQX_HOST === '127.0.0.1';
const BROKER_URL = IS_LOCAL
  ? `ws://${EMQX_HOST}:${EMQX_PORT}/mqtt`
  : `wss://${EMQX_HOST}:${EMQX_PORT}/mqtt`;

// ─── Logging helpers ──────────────────────────────────────────────────────────

const isDebug = () =>
  import.meta.env.MODE !== 'production' &&
  (import.meta.env.DEV || localStorage.getItem('debug') === 'socket');

const debugLog  = (msg, ...a) => isDebug() && console.log(`[MQTT-Frontend] ${msg}`, ...a);
const debugWarn = (msg, ...a) => isDebug() && console.warn(`[MQTT-Frontend] ${msg}`, ...a);

// ─── Topic helpers ────────────────────────────────────────────────────────────

/**
 * Converts a logical channel + event into an MQTT topic string.
 * Mirrors the logic in backend/services/realtime/index.ts exactly.
 *
 * Examples:
 *   ("entity-abc", "alert:new")        → "aapad/entity-abc/alert/new"
 *   ("accidents", "accident:new")      → "aapad/accidents/accident/new"
 *   ("accident-xyz", "status_change")  → "aapad/accident-xyz/status_change"
 */
function buildTopic(channel, event) {
  const safeChannel = channel.replace(/[^a-zA-Z0-9\-_]/g, '-');
  const safeEvent   = event.replace(/:/g, '/').replace(/[^a-zA-Z0-9\-_\/]/g, '-');
  return `${PREFIX}/${safeChannel}/${safeEvent}`;
}

/** Wildcard topic for all events on a channel: "aapad/accident-abc/#" */
function channelWildcard(channel) {
  const safe = channel.replace(/[^a-zA-Z0-9\-_]/g, '-');
  return `${PREFIX}/${safe}/#`;
}

// ─── Event → MQTT topic mapping ───────────────────────────────────────────────

/**
 * Maps a Socket.IO-style logical event name (used by React components)
 * to the MQTT channel + event that the backend publishes to.
 *
 * Returns: { channel, event, filter? }  or  null for lifecycle events.
 */
function mapEventToMQTT(eventName, registration) {
  if (['connect', 'disconnect', 'connect_error', 'reconnect_attempt'].includes(eventName)) {
    return null;
  }

  let match;

  // accident:{id}:chat  →  accident-{id} / chat
  match = eventName.match(/^accident:([^:]+):chat$/);
  if (match) return { channel: `accident-${match[1]}`, event: 'chat' };

  // accident:{id}:tracking  →  accident-{id} / tracking
  match = eventName.match(/^accident:([^:]+):tracking$/);
  if (match) return { channel: `accident-${match[1]}`, event: 'tracking' };

  // accident:{id}:responded  →  accident-{id} / alert:acknowledge
  match = eventName.match(/^accident:([^:]+):responded$/);
  if (match) return { channel: `accident-${match[1]}`, event: 'alert:acknowledge' };

  // accident:{id}:status_change  →  accident-{id} / status_change
  match = eventName.match(/^accident:([^:]+):status_change$/);
  if (match) return { channel: `accident-${match[1]}`, event: 'status_change' };

  // Filtered status events
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

  // entity:location  →  locations / update
  if (eventName === 'entity:location') return { channel: 'locations', event: 'update' };

  // Global accident events
  if (eventName === 'accident:new')           return { channel: 'accidents', event: 'accident:new' };
  if (eventName === 'accident:dispatched')    return { channel: 'accidents', event: 'dispatched' };
  if (eventName === 'accident:phase2')        return { channel: 'accidents', event: 'phase2' };
  if (eventName === 'accident:responded')     return { channel: 'accidents', event: 'alert:acknowledge' };
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

let socketInstance  = null;
let registration    = null;
const watchedAccidents = new Set();

class MQTTSocketEmulator {
  constructor() {
    this.client         = null;       // mqtt.Client instance
    this.connected      = false;
    this.id             = 'mqtt-frontend-' + Math.random().toString(36).substring(2, 8);
    this.auth           = { token: null };
    this.listeners      = new Map();  // eventName → Set<fn>
    this.mqttHandlers   = new Map();  // eventName → Map<fn, binding>
    this.subscribedTopics = new Set();
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
   *   entity:register  → store registration, rebind entity-specific topics
   *   accident:watch   → subscribe to accident channel wildcard
   *   accident:unwatch → unsubscribe from accident channel
   *   location:update  → HTTP REST POST (no browser-to-broker publish)
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
      // Location updates go via REST API, not browser → broker MQTT publish
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
      debugLog('Already connected.');
      return;
    }

    // If password not yet set, silently degrade (no crash, events just won't arrive)
    if (!EMQX_PASS || EMQX_PASS === 'FILL_IN_FROM_EMQX_AUTH_DASHBOARD') {
      console.warn(
        '[MQTT-Frontend] EMQX password not configured. ' +
        'Set VITE_EMQX_PASSWORD in frontend/.env and Vercel env settings. ' +
        'Realtime alerts will not arrive until this is set.'
      );
      // Fire connect lifecycle so UI doesn't hang
      this.connected = true;
      this._triggerLifecycle('connect');
      if (window.__setSocketStatus) window.__setSocketStatus('connected');
      return;
    }

    // Unique client ID per browser tab to avoid session conflicts
    const clientId = `aapad-frontend-${Math.random().toString(16).slice(2, 10)}`;
    debugLog(`Connecting to ${BROKER_URL} as ${EMQX_USER} (clientId: ${clientId})`);

    this.client = mqtt.connect(BROKER_URL, {
      clientId,
      username: EMQX_USER,
      password: EMQX_PASS,
      clean:    true,
      reconnectPeriod: 3000,   // auto-reconnect every 3s
      connectTimeout:  10000,
      keepalive:       30,
    });

    this.client.on('connect', () => {
      this.connected = true;
      debugLog('MQTT connected to EMQX broker!');
      if (window.__setSocketStatus) window.__setSocketStatus('connected');
      this._triggerLifecycle('connect');
      this._rebindAllEvents();
    });

    this.client.on('reconnect', () => {
      debugLog('MQTT reconnecting…');
      if (window.__setSocketStatus) window.__setSocketStatus('connecting');
    });

    this.client.on('offline', () => {
      this.connected = false;
      debugWarn('MQTT client offline.');
      if (window.__setSocketStatus) window.__setSocketStatus('offline');
      this._triggerLifecycle('disconnect');
    });

    this.client.on('error', err => {
      debugWarn('MQTT error:', err.message);
      if (window.__setSocketStatus) window.__setSocketStatus('offline');
    });

    // All incoming messages are dispatched here
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

  /** Dispatch an incoming MQTT message to all matching JS handlers */
  _handleMessage(topic, payloadBuf) {
    let envelope;
    try {
      envelope = JSON.parse(payloadBuf.toString());
    } catch {
      debugWarn(`Unparseable message on topic "${topic}"`);
      return;
    }

    const { channel, event, data } = envelope;
    debugLog(`← [${topic}] channel="${channel}" event="${event}"`, data);

    for (const [eventName, fns] of this.listeners.entries()) {
      if (!this.mqttHandlers.has(eventName)) continue;

      for (const [fn, binding] of this.mqttHandlers.get(eventName).entries()) {
        const { topic: boundTopic, filter } = binding;

        // Match exact topic OR wildcard prefix
        const topicMatches =
          topic === boundTopic ||
          (boundTopic.endsWith('/#') && topic.startsWith(boundTopic.slice(0, -2)));

        if (!topicMatches) continue;
        if (filter && !filter(data)) continue;

        try {
          fn(data);
        } catch (e) {
          console.error(`[MQTT-Frontend] Handler error for "${eventName}":`, e);
        }
      }
    }
  }

  _bindEvent(eventName, fn) {
    const mapping = mapEventToMQTT(eventName, registration);
    if (!mapping) return;

    const { channel, event, filter } = mapping;
    const topic = buildTopic(channel, event);

    // Subscribe to MQTT topic (queue if not yet connected)
    if (!this.subscribedTopics.has(topic)) {
      this.subscribedTopics.add(topic);
      if (this.client && this.connected) {
        this.client.subscribe(topic, { qos: 1 }, err => {
          if (!err) debugLog(`Subscribed → ${topic}`);
          else debugWarn(`Subscribe failed for ${topic}:`, err.message);
        });
      }
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

    // Re-subscribe to all queued topics
    if (this.client && this.connected) {
      for (const topic of this.subscribedTopics) {
        this.client.subscribe(topic, { qos: 1 }, err => {
          if (!err) debugLog(`Re-subscribed → ${topic}`);
        });
      }
    }

    // Re-process all registered events (picks up entity-specific topics after login)
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
          console.error(`[MQTT-Frontend] Lifecycle error for "${eventName}":`, e);
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
  const isChanged = !registration || registration.entityId !== entityId || registration.entityType !== entityType;
  registration = { entityId, entityType };
  const s = getSocket();
  s.auth = { token: localStorage.getItem('token') };
  s.connect();
  if (isChanged && s.connected) {
    s._rebindAllEvents();
  }
  return s;
};

export const disconnectSocket = () => {
  if (socketInstance) {
    debugLog('Tearing down MQTT connection…');
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
  const wildcard = channelWildcard(`accident-${accidentId}`);
  if (!s.subscribedTopics.has(wildcard)) {
    s.subscribedTopics.add(wildcard);
    if (s.client && s.connected) {
      s.client.subscribe(wildcard, { qos: 1 }, err => {
        if (!err) debugLog(`Watching accident → ${wildcard}`);
      });
    }
  }
};

export const unwatchAccident = (accidentId) => {
  if (!accidentId) return;
  watchedAccidents.delete(accidentId);
  const s = getSocket();
  const wildcard = channelWildcard(`accident-${accidentId}`);
  if (s.subscribedTopics.has(wildcard)) {
    s.subscribedTopics.delete(wildcard);
    if (s.client) {
      s.client.unsubscribe(wildcard, () => {
        debugLog(`Unwatched accident → ${wildcard}`);
      });
    }
  }
};

export default getSocket;
