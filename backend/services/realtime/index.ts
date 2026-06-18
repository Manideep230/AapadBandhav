import Pusher from 'pusher';
import { getIO } from './socketStore';

const pusher = new Pusher({
  appId: process.env.PUSHER_APP_ID || 'dummy_app_id',
  key: process.env.PUSHER_KEY || 'dummy_key',
  secret: process.env.PUSHER_SECRET || 'dummy_secret',
  cluster: process.env.PUSHER_CLUSTER || 'mt1',
  useTLS: true,
});

export class RealtimeService {
  static async trigger(channel: string, event: string, data: any) {
    try {
      await pusher.trigger(channel, event, data);
      console.log(`[Pusher] Event "${event}" triggered on channel "${channel}"`);
    } catch (error) {
      console.error(`[Pusher Error] Failed to trigger event "${event}" on channel "${channel}":`, error);
    }

    try {
      const io = getIO();
      if (io) {
        io.to(channel).emit(event, data);
        io.to(channel).emit(`${channel}:${event}`, data);
        console.log(`[Socket.IO] Event "${event}" emitted to room "${channel}"`);
      }
    } catch (error) {
      console.error(`[Socket.IO Error] Failed to emit event "${event}" to room "${channel}":`, error);
    }
  }
}
