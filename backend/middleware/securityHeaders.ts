import { Request, Response, NextFunction } from 'express';

/**
 * Global middleware to inject secure HTTP response headers
 * complying with OWASP ASVS and secure deployment guidelines.
 */
export function securityHeaders(req: Request, res: Response, next: NextFunction) {
  // 1. Content Security Policy (CSP)
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://unpkg.com; " +
    "font-src 'self' data: https://fonts.gstatic.com; " +
    "img-src 'self' data: https://dummy.supabase.co https://*.supabase.co https://unpkg.com https://*.tile.openstreetmap.org; " +
    "connect-src 'self' wss://*.emqxsl.com wss://*.emqx.io wss://*.emqx.net https://*.supabase.co https://43.252.88.250 https://43.252.88.250/;"
  );

  // 2. HTTP Strict Transport Security (HSTS)
  res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');

  // 3. Clickjacking mitigation
  res.setHeader('X-Frame-Options', 'DENY');

  // 4. Mime Sniffing mitigation
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // 5. Referrer Control
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // 6. XSS Auditor legacy defense in depth
  res.setHeader('X-XSS-Protection', '1; mode=block');

  // 7. Device Access Restrictions
  res.setHeader('Permissions-Policy', 'geolocation=(self), microphone=(), camera=()');

  next();
}
