const UPSTASH_REDIS_REST_URL = process.env.UPSTASH_REDIS_REST_URL || '';
const UPSTASH_REDIS_REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || '';

export default async function middleware(request: Request) {
  const url = new URL(request.url);
  const path = url.pathname;
  
  // Only target the specific high-frequency auth endpoints at the Edge
  if (!path.startsWith('/api/auth/otp/send') && !path.startsWith('/api/auth/login')) {
    return new Response(null, {
      headers: {
        'x-middleware-next': '1'
      }
    });
  }

  if (!UPSTASH_REDIS_REST_URL || !UPSTASH_REDIS_REST_TOKEN) {
    // Fail-open at edge, let Express application rate limiter handle it
    return new Response(null, {
      headers: {
        'x-middleware-next': '1'
      }
    });
  }

  const ip = request.headers.get('x-forwarded-for') || '127.0.0.1';
  const cleanIp = ip.split(',')[0].trim();
  
  const key = `edge:ratelimit:${path.replace(/\//g, ':')}:${cleanIp}`;
  const now = Date.now();
  const windowMs = 60000; // 1 minute window
  const limit = 30; // Max 30 requests per minute per IP

  try {
    const clearBefore = now - windowMs;
    const randomMember = `${now}:${Math.random().toString(36).substring(2, 7)}`;

    // Query Upstash Redis in a single REST Pipeline call to maximize speed
    const pipelinePayload = [
      ["ZREMRANGEBYSCORE", key, "0", String(clearBefore)],
      ["ZCARD", key],
      ["ZADD", key, String(now), randomMember],
      ["EXPIRE", key, "60"]
    ];

    const res = await fetch(`${UPSTASH_REDIS_REST_URL}/pipeline`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${UPSTASH_REDIS_REST_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(pipelinePayload)
    });

    if (res.ok) {
      const data = await res.json();
      const currentRequests = data[1]?.result || 0;

      if (currentRequests >= limit) {
        return new Response(
          JSON.stringify({
            success: false,
            message: 'Too many requests at the edge. Please try again in 1 minute.'
          }),
          {
            status: 429,
            headers: {
              'Content-Type': 'application/json',
              'Retry-After': '60'
            }
          }
        );
      }
    }
  } catch (err) {
    console.error('Edge middleware rate limiter fallback:', err);
  }

  return new Response(null, {
    headers: {
      'x-middleware-next': '1'
    }
  });
}
