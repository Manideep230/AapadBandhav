import express from 'express';
import { serve, setup } from 'swagger-ui-express';
import { openApiSpec } from './openapi';

const router = express.Router();

// ─── Serve raw OpenAPI JSON (CORS-open for external tools) ────────────────────
router.options(['/api/openapi.json', '/openapi.json'], (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.sendStatus(204);
});

router.get(['/api/openapi.json', '/openapi.json'], (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');
  return res.status(200).json(openApiSpec);
});

// ─── Serve Swagger UI using official swagger-ui-express package ──────────────
router.use('/api/docs', serve, setup(openApiSpec));

// Alias: /swagger also redirects to /api/docs
router.get(['/swagger', '/swagger-ui', '/docs'], (req, res) => {
  return res.redirect('/api/docs');
});

export default router;

