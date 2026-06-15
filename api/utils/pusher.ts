import Pusher from 'pusher';

const pusher = new Pusher({
  appId: process.env.PUSHER_APP_ID || 'dummy_app_id',
  key: process.env.PUSHER_KEY || 'dummy_key',
  secret: process.env.PUSHER_SECRET || 'dummy_secret',
  cluster: process.env.PUSHER_CLUSTER || 'mt1',
  useTLS: true,
});

export async function triggerRealtimeEvent(channel: string, event: string, data: any) {
  try {
    await pusher.trigger(channel, event, data);
    console.log(`[Pusher] Event "${event}" triggered on channel "${channel}"`);
  } catch (error) {
    console.error(`[Pusher Error] Failed to trigger event "${event}" on channel "${channel}":`, error);
  }
}
