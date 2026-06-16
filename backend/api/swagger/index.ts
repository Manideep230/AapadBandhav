import express from 'express';
import { serve, setup } from 'swagger-ui-express';
import { openApiSpec } from './openapi';

const router = express.Router();

// ─── Serve raw OpenAPI JSON (CORS-open for external tools) ────────────────────
router.options(['/api/openapi.json', '/openapi.json'], (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.sendStatus(204);
});

router.get(['/api/openapi.json', '/openapi.json'], (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');
  return res.status(200).json(openApiSpec);
});

// ─── Serve Swagger UI using official swagger-ui-express package ──────────────
// persistAuthorization: saves JWT token in localStorage so it survives refreshes
// tryItOutEnabled:      opens "Try it out" mode by default
// displayRequestDuration: shows how long each API call took
// url is intentionally omitted so swagger-ui-express auto-resolves from the in-process spec
const swaggerUiOptions = {
  persistAuthorization: true,
  tryItOutEnabled: true,
  displayRequestDuration: true,
  docExpansion: 'list' as const,
  filter: true,
  syntaxHighlight: { activate: true, theme: 'monokai' },
  requestInterceptor: `(req) => {
    // Ensure Authorization header is forwarded correctly
    return req;
  }`,
};

router.use('/api/docs', serve, setup(openApiSpec, { swaggerOptions: swaggerUiOptions }));

// Alias: /swagger also redirects to /api/docs
router.get(['/swagger', '/swagger-ui', '/docs'], (req, res) => {
  return res.redirect('/api/docs');
});

export default router;
