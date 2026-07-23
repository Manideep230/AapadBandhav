import mqtt from 'mqtt';
import { ingestTelemetry } from '../../api/devices/iot';

const EMQX_HOST = process.env.EMQX_HOST || 's1659115.ala.asia-southeast1.emqxsl.com';
const EMQX_WSS_PORT = process.env.EMQX_WSS_PORT || '8084';
const EMQX_USER = process.env.EMQX_BACKEND_USERNAME || 'aapadbandhav-backend';
const EMQX_PASS = process.env.EMQX_BACKEND_PASSWORD || 'aapadbandhav-backend';

export function startMQTTListener() {
  const isLocal = EMQX_HOST === 'localhost' || EMQX_HOST === '127.0.0.1';
  const url = isLocal ? `ws://${EMQX_HOST}:${EMQX_WSS_PORT}/mqtt` : `wss://${EMQX_HOST}:${EMQX_WSS_PORT}/mqtt`;

  console.log(`📡 [MQTT Listener] Connecting to EMQX broker at ${url}...`);

  const client = mqtt.connect(url, {
    clientId: `aapad-backend-listener-${Math.random().toString(16).slice(2, 8)}`,
    username: EMQX_USER,
    password: EMQX_PASS,
    clean: true,
    reconnectPeriod: 5000,
  });

  client.on('connect', () => {
    console.log('📡 [MQTT Listener] Successfully connected to EMQX broker!');
    // Subscribe to all vehicle hardware topics: vehicle/{deviceId}/{nodeId}
    client.subscribe('vehicle/#', { qos: 1 }, (err) => {
      if (!err) {
        console.log('📡 [MQTT Listener] Subscribed to telemetry topic filter: vehicle/#');
      } else {
        console.error('❌ [MQTT Listener] Subscription error:', err.message);
      }
    });
  });

  client.on('message', async (topic, payloadBuf) => {
    const rawPayload = payloadBuf.toString();
    console.log(`⚡ [MQTT Telemetry Received] Topic: "${topic}" | Payload: ${rawPayload}`);
    try {
      const result = await ingestTelemetry(topic, rawPayload);
      console.log(`✓ [MQTT Telemetry Ingested] Topic: "${topic}" | Result:`, result);
    } catch (err: any) {
      console.error(`❌ [MQTT Listener] Ingest error for topic "${topic}":`, err.message);
    }
  });

  client.on('error', (err) => {
    console.warn('⚠️ [MQTT Listener Warning]', err.message);
  });
}
