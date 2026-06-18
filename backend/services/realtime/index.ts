/**
 * RealtimeService — EMQX MQTT backend publisher
 *
 * Publishes messages to the EMQX broker via its HTTP REST API.
 * This is fully stateless and works inside Vercel Serverless Functions.
 *
 * Broker:   s1659115.ala.asia-southeast1.emqxsl.com
 * API port: 8443  (HTTPS)
 * WSS port: 8084  (browser clients)
 * TLS port: 8883  (IoT devices)
 *
 * All callers use:  RealtimeService.trigger(channel, event, data)
 * The channel/event pair is converted to a clean MQTT topic:
 *   e.g. channel="entity-abc", event="alert:new" → "aapad/entity-abc/alert/new"
 *
 * Credentials (set in Vercel env / .env):
 *   EMQX_HOST        = s1659115.ala.asia-southeast1.emqxsl.com
 *   EMQX_HTTP_PORT   = 8443
 *   EMQX_API_KEY     = x7412807       (App ID)
 *   EMQX_API_SECRET  = EeMPA2lp*4SK!DeZ  (App Secret)
 *   EMQX_TOPIC_PREFIX = aapad
 */

const EMQX_HOST     = process.env.EMQX_HOST     || 'localhost';
const EMQX_HTTP_PORT = process.env.EMQX_HTTP_PORT || '8443';
const EMQX_API_KEY  = process.env.EMQX_API_KEY  || '';
const EMQX_API_SECRET = process.env.EMQX_API_SECRET || '';
const PREFIX        = process.env.EMQX_TOPIC_PREFIX || 'aapad';

// Always HTTPS for EMQX Cloud (HTTP only for localhost dev)
const EMQX_PROTOCOL = (EMQX_HOST === 'localhost' || EMQX_HOST === '127.0.0.1') ? 'http' : 'https';

/**
 * Converts a Pusher-style channel + event into a valid MQTT topic string.
 *
 * Rules:
 *   - Colons in event names become forward slashes (MQTT topic levels)
 *   - Other special characters become hyphens
 *
 * Examples:
 *   channel="accident-abc123", event="status_change"
 *     → "aapad/accident-abc123/status_change"
 *   channel="entity-xyz", event="alert:new"
 *     → "aapad/entity-xyz/alert/new"
 *   channel="accidents", event="accident:new"
 *     → "aapad/accidents/accident/new"
 */
function buildTopic(channel: string, event: string): string {
  const safeChannel = channel.replace(/[^a-zA-Z0-9\-_]/g, '-');
  const safeEvent   = event.replace(/:/g, '/').replace(/[^a-zA-Z0-9\-_\/]/g, '-');
  return `${PREFIX}/${safeChannel}/${safeEvent}`;
}

export class RealtimeService {
  /**
   * Publish a realtime event to all subscribed clients.
   *
   * @param channel  Pusher-style channel name (e.g. "entity-abc", "accidents")
   * @param event    Event name  (e.g. "alert:new", "status_change")
   * @param data     Arbitrary JSON payload
   */
  static async trigger(channel: string, event: string, data: any): Promise<void> {
    const topic = buildTopic(channel, event);

    // Envelope the payload — frontend mqtt.js handler reads channel/event/data
    const payload = JSON.stringify({
      channel,
      event,
      data,
      timestamp: Date.now(),
    });

    // Dev fallback: log only when EMQX credentials are not yet configured
    const configured = EMQX_API_KEY &&
      EMQX_API_KEY !== 'your_emqx_api_key' &&
      EMQX_API_KEY !== 'FILL_IN_FROM_EMQX_AUTH_DASHBOARD';

    if (!configured) {
      console.log(`[EMQX-DEV] Would publish to "${topic}":`, data);
      return;
    }

    try {
      // EMQX Cloud API v5 uses Basic Auth with App ID : App Secret
      const authHeader =
        'Basic ' + Buffer.from(`${EMQX_API_KEY}:${EMQX_API_SECRET}`).toString('base64');

      const apiUrl = `${EMQX_PROTOCOL}://${EMQX_HOST}:${EMQX_HTTP_PORT}/api/v5/publish`;

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: authHeader,
        },
        body: JSON.stringify({
          topic,
          payload,
          qos: 1,        // at-least-once delivery — critical for emergency alerts
          retain: false,
        }),
        // @ts-ignore — AbortSignal.timeout available in Node 18+
        signal: AbortSignal.timeout(5000), // 5s timeout; Vercel limit is 10s
      });

      if (!response.ok) {
        const body = await response.text();
        console.error(
          `[EMQX] Publish failed (HTTP ${response.status}) for topic "${topic}":`,
          body
        );
      } else {
        console.log(
          `[EMQX] ✓ Published event "${event}" on channel "${channel}" → topic "${topic}"`
        );
      }
    } catch (error: any) {
      // Non-fatal: realtime is best-effort. Accident data is already saved in DB.
      console.error(`[EMQX Error] Failed to publish to "${topic}":`, error.message);
    }
  }
}
