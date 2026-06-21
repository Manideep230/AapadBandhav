import express from 'express';
import cors from 'cors';
import { securityHeaders } from '../middleware/securityHeaders';
import { errorHandler } from '../middleware/errorHandler';

/**
 * Creates and configures an Express application instance with security hardening middleware
 * (strict CORS, Content Security Policy, HSTS, Frame Options, and generic production error handles).
 */
export function createExpressApp(router: express.Router): express.Express {
  const app = express();
  
  // Enable CORS
  app.use(cors());
  
  // Parse incoming JSON body
  app.use(express.json());
  
  // Apply CSP, HSTS, and X-Content-Type-Options secure headers
  app.use(securityHeaders);
  
  // Mount target API routes
  app.use(router);
  
  // Sanitize and handle unhandled exceptions
  app.use(errorHandler);
  
  return app;
}
