import { Request, Response, NextFunction } from 'express';
import { redis } from '../services/redis';

interface RateLimiterOptions {
  windowMs: number;
  max: number;
  message?: string;
  keyPrefix?: string;
}

export function createRateLimiter(options: RateLimiterOptions) {
  const fallbackStore = new Map<string, number[]>();
  const prefix = options.keyPrefix || 'ratelimit';

  // Periodically clean up expired entries from memory to prevent memory leaks
  const interval = setInterval(() => {
    const now = Date.now();
    for (const [ip, timestamps] of fallbackStore.entries()) {
      const validTimestamps = timestamps.filter(t => now - t < options.windowMs);
      if (validTimestamps.length === 0) {
        fallbackStore.delete(ip);
      } else {
        fallbackStore.set(ip, validTimestamps);
      }
    }
  }, Math.min(options.windowMs, 60000));

  // Allow the node process to exit cleanly if this is the only remaining active handle
  if (interval.unref) {
    interval.unref();
  }

  return async (req: Request, res: Response, next: NextFunction) => {
    if (process.env.NODE_ENV === 'test') {
      return next();
    }
    const rawIp = (req.headers['x-forwarded-for'] as string) || req.ip || req.socket.remoteAddress || 'unknown';
    // Clean up the IP if it's a comma-separated list of IPs (e.g. behind proxies)
    const ip = rawIp.split(',')[0].trim();
    const now = Date.now();

    // Check if Redis is ready
    const isRedisReady = redis && redis.status === 'ready';

    if (isRedisReady) {
      const key = `${prefix}:${req.path}:${ip}`;
      const clearBefore = now - options.windowMs;

      try {
        const multi = redis.multi();
        multi.zremrangebyscore(key, 0, clearBefore);
        multi.zcard(key);
        // Get the oldest element in the set to compute Retry-After accurately
        multi.zrangebyscore(key, '-inf', '+inf', 'LIMIT', 0, 1);

        const results = await multi.exec();
        if (results) {
          const cardResult = results[1];
          const rangeResult = results[2];

          const currentRequests = cardResult ? (cardResult[1] as number) : 0;
          const oldestRequestArr = rangeResult ? (rangeResult[1] as string[]) : [];

          if (currentRequests >= options.max) {
            let secondsLeft = Math.ceil(options.windowMs / 1000);
            if (oldestRequestArr && oldestRequestArr.length > 0) {
              const oldestTime = parseInt(oldestRequestArr[0].split(':')[0]);
              if (!isNaN(oldestTime)) {
                const msLeft = options.windowMs - (now - oldestTime);
                secondsLeft = Math.max(1, Math.ceil(msLeft / 1000));
              }
            }

            res.setHeader('Retry-After', secondsLeft);
            res.setHeader('X-RateLimit-Limit', options.max);
            res.setHeader('X-RateLimit-Remaining', 0);

            return res.status(429).json({
              success: false,
              message: options.message || `Too many requests. Please try again in ${secondsLeft} seconds.`
            });
          }

          // Add this request to the set with a unique member ID (to handle same-millisecond requests)
          const randomId = Math.random().toString(36).substring(2, 7);
          const member = `${now}:${randomId}`;

          const writeMulti = redis.multi();
          writeMulti.zadd(key, now, member);
          writeMulti.expire(key, Math.ceil(options.windowMs / 1000));
          await writeMulti.exec();

          res.setHeader('X-RateLimit-Limit', options.max);
          res.setHeader('X-RateLimit-Remaining', Math.max(0, options.max - (currentRequests + 1)));

          return next();
        }
      } catch (err: any) {
        console.warn(`⚠️ Redis rate limiter error: ${err.message}. Falling back to in-memory rate limiting.`);
      }
    }

    // ── Fallback Memory Limiter ──
    let timestamps = fallbackStore.get(ip) || [];
    // Filter out expired timestamps
    timestamps = timestamps.filter(t => now - t < options.windowMs);

    if (timestamps.length >= options.max) {
      const oldestValid = timestamps[0];
      const msLeft = options.windowMs - (now - oldestValid);
      const secondsLeft = Math.ceil(msLeft / 1000);

      res.setHeader('Retry-After', secondsLeft);
      res.setHeader('X-RateLimit-Limit', options.max);
      res.setHeader('X-RateLimit-Remaining', 0);

      return res.status(429).json({
        success: false,
        message: options.message || `Too many requests. Please try again in ${secondsLeft} seconds.`
      });
    }

    timestamps.push(now);
    fallbackStore.set(ip, timestamps);
    
    // Set headers to give feedback on limit limits
    res.setHeader('X-RateLimit-Limit', options.max);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, options.max - timestamps.length));
    
    next();
  };
}

