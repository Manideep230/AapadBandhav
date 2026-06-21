import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

/**
 * Express global error-handling middleware complying with OWASP ASVS
 * to prevent stack traces and internal schema disclosure in production.
 */
export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) {
  // Log the raw error stack privately for monitoring
  logger.error(`Exception intercepted at ${req.method} ${req.path}:`, err);

  const isProduction = process.env.NODE_ENV === 'production';
  const statusCode = err.status || err.statusCode || 500;
  
  // Sanitize 500 errors in production to generic messages
  const responseMessage = isProduction && statusCode === 500
    ? 'An unexpected error occurred. Please contact the administrator.'
    : err.message || 'Internal Server Error';

  return res.status(statusCode).json({
    success: false,
    message: responseMessage,
  });
}
