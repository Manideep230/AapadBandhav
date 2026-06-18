/**
 * RealtimeService — EMQX MQTT backend publisher
 *
 * Publishes messages to an EMQX broker via its HTTP REST API.
 * This is fully stateless and works inside Vercel Serverless Functions.
 *
 * All callers use:  RealtimeService.trigger(channel, event, data)
 * The channel/event pair is converted to a clean MQTT topic:
 *   e.g. channel="entity-abc", event="alert:new" → "aapad/entity-abc/alert-new"
 *
 * EMQX Cloud setup: https://www.emqx.com/en/cloud/serverless-mqtt
 * EMQX HTTP API docs: https://docs.emqx.com/en/cloud/latest/api/api.html
 */

const EMQX_HOST = process.env.EMQX_HOST || 'localhost';
const EMQX_HTTP_PORT = process.env.EMQX_HTTP_PORT || '8081';
const EMQX_API_KEY = process.env.EMQX_API_KEY || '';
const EMQX_API_SECRET = process.env.EMQX_API_SECRET || '';
const PREFIX = process.env.EMQX_TOPIC_PREFIX || 'aapad';

// Use TLS/HTTPS if not localhost
const EMQX_PROTOCOL = EMQX_HOST === 'localhost' || EMQX_HOST === '127.0.0.1' ? 'http' : 'https';

/**
 * Converts a Pusher-style channel + event into a valid MQTT topic string.
 *
 * Rules:
 *   - Colons in event names become forward slashes (MQTT topic levels)
 *   - All other special characters become hyphens
 *   - e.g. channel="accident-abc123", event="status_change"
 *          → "aapad/accident-abc123/status_change"
 *   - e.g. channel="entity-xyz", event="alert:new"
 *          → "aapad/entity-xyz/alert/new"
 */
function buildTopic(channel: string, event: string): string {
  // Sanitise channel: keep alphanumerics, hyphens, underscores
  const safeChannel = channel.replace(/[^a-zA-Z0-9\-_]/g, '-');
  // Convert colons in event to MQTT sub-levels, sanitise rest
  const safeEvent = event.replace(/:/g, '/').replace(/[^a-zA-Z0-9\-_\/]/g, '-');
  return `${PREFIX}/${safeChannel}/${safeEvent}`;
}

export class RealtimeService {
  /**
   * Publish a realtime event to all subscribed browser clients.
   *
   * @param channel  Pusher-style channel name (e.g. "entity-abc", "accidents")
   * @param event    Event name (e.g. "alert:new", "status_change")
   * @param data     Arbitrary JSON payload
   */
  static async trigger(channel: string, event: string, data: any): Promise<void> {
    const topic = buildTopic(channel, event);

    // Envelope matches what the frontend mqtt.js handler expects
    const payload = JSON.stringify({
      channel,
      event,
      data,
      timestamp: Date.now(),
    });

    // Fallback: log only if EMQX is not configured yet (e.g. local dev without broker)
    if (!EMQX_API_KEY || EMQX_API_KEY === 'your_emqx_api_key') {
      console.log(`[EMQX-DEV] Would publish to "${topic}":`, data);
      return;
    }

    try {
      const authHeader =
        'Basic ' +
        Buffer.from(`${EMQX_API_KEY}:${EMQX_API_SECRET}`).toString('base64');

      const response = await fetch(
        `${EMQX_PROTOCOL}://${EMQX_HOST}:${EMQX_HTTP_PORT}/api/v5/publish`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: authHeader,
          },
          body: JSON.stringify({
            topic,
            payload,
            qos: 1,       // at-least-once delivery — important for emergency alerts
            retain: false, // no retained messages (fresh data on every event)
          }),
          // @ts-ignore — AbortSignal.timeout available in Node 18+
          signal: AbortSignal.timeout(4000), // 4 s max; Vercel functions have a 10 s limit
        }
      );

      if (!response.ok) {
        const body = await response.text();
        console.error(`[EMQX] Publish failed (${response.status}) for topic "${topic}":`, body);
      } else {
        console.log(`[EMQX] Published event "${event}" on channel "${channel}" → topic "${topic}"`);
      }
    } catch (error: any) {
      // Non-fatal: realtime is best-effort. Core accident data is already saved in DB.
      console.error(`[EMQX Error] Failed to publish to "${topic}":`, error.message);
    }
  }
}
