import { Request, Response, NextFunction } from 'express';

interface RateLimiterOptions {
  windowMs: number;
  max: number;
  message?: string;
}

export function createRateLimiter(options: RateLimiterOptions) {
  const store = new Map<string, number[]>();

  // Periodically clean up expired entries from memory to prevent memory leaks
  const interval = setInterval(() => {
    const now = Date.now();
    for (const [ip, timestamps] of store.entries()) {
      const validTimestamps = timestamps.filter(t => now - t < options.windowMs);
      if (validTimestamps.length === 0) {
        store.delete(ip);
      } else {
        store.set(ip, validTimestamps);
      }
    }
  }, Math.min(options.windowMs, 60000));

  // Allow the node process to exit cleanly if this is the only remaining active handle
  if (interval.unref) {
    interval.unref();
  }

  return (req: Request, res: Response, next: NextFunction) => {
    const rawIp = (req.headers['x-forwarded-for'] as string) || req.ip || req.socket.remoteAddress || 'unknown';
    // Clean up the IP if it's a comma-separated list of IPs (e.g. behind proxies)
    const ip = rawIp.split(',')[0].trim();
    const now = Date.now();

    let timestamps = store.get(ip) || [];
    // Filter out expired timestamps
    timestamps = timestamps.filter(t => now - t < options.windowMs);

    if (timestamps.length >= options.max) {
      const oldestValid = timestamps[0];
      const msLeft = options.windowMs - (now - oldestValid);
      const secondsLeft = Math.ceil(msLeft / 1000);

      res.setHeader('Retry-After', secondsLeft);
      return res.status(429).json({
        success: false,
        message: options.message || `Too many requests. Please try again in ${secondsLeft} seconds.`
      });
    }

    timestamps.push(now);
    store.set(ip, timestamps);
    
    // Set headers to give feedback on limit limits
    res.setHeader('X-RateLimit-Limit', options.max);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, options.max - timestamps.length));
    
    next();
  };
}
