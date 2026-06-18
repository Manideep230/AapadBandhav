import Redis from 'ioredis';

const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
export const redis = new Redis(redisUrl, {
  connectTimeout: 2000,
  maxRetriesPerRequest: 1,
  enableReadyCheck: false,
  retryStrategy(times) {
    if (times > 1) {
      return null; // Stop retrying after 1 attempt
    }
    return 50; // Retry once after 50ms
  }
});

redis.on('connect', () => {
  console.log('🔌 Connected to Redis successfully');
});

redis.on('error', (err) => {
  console.error('❌ Redis Connection Error:', err);
});
