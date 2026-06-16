import express from 'express';
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

// ─── Self-contained HTML for Swagger UI (CDN-based for 100% reliability on Vercel) ───
const swaggerHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>AapadBandhav API Docs</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui.css" />
  <style>
    html { box-sizing: border-box; overflow: -moz-scrollbars-vertical; overflow-y: scroll; }
    *, *:before, *:after { box-sizing: inherit; }
    body { margin: 0; background: #0f172a; }
    
    /* Elegant Dark Theme overrides for Swagger UI */
    .swagger-ui { background: #0f172a !important; color: #cbd5e1 !important; font-family: sans-serif; }
    .swagger-ui .info .title, .swagger-ui .opblock-tag,
    .swagger-ui .opblock .opblock-summary-path,
    .swagger-ui .parameter__name, .swagger-ui .response-col_status,
    .swagger-ui table thead tr td, .swagger-ui table thead tr th,
    .swagger-ui .model-title, .swagger-ui .dialog-ux .modal-ux-header h3,
    .swagger-ui .scheme-container .schemes-title { color: #f8fafc !important; }
    .swagger-ui .info p, .swagger-ui .info li, .swagger-ui .info td, .swagger-ui .info th, .swagger-ui .info span, .swagger-ui .info div, .swagger-ui .info a { color: #cbd5e1 !important; }
    .swagger-ui .info a { color: #38bdf8 !important; text-decoration: underline !important; }
    .swagger-ui, .swagger-ui .wrapper, .swagger-ui .opblock,
    .swagger-ui .model-box, .swagger-ui .scheme-container,
    .swagger-ui .dialog-ux .modal-ux { background: #1e293b !important; color: #cbd5e1 !important; }
    .swagger-ui .opblock { border: 1px solid rgba(255,255,255,0.06) !important; }
    
    .swagger-ui .opblock-tag { border-bottom: 1px solid rgba(255, 255, 255, 0.1) !important; }
    .swagger-ui .opblock-tag:hover { background: rgba(255, 255, 255, 0.05) !important; }
    .swagger-ui .opblock .opblock-summary-description { color: #94a3b8 !important; }
    .swagger-ui .scheme-container { box-shadow: none !important; border-top: 1px solid rgba(255, 255, 255, 0.05) !important; border-bottom: 1px solid rgba(255, 255, 255, 0.05) !important; }
    
    .swagger-ui select, .swagger-ui input[type=text], .swagger-ui textarea {
      background: #0f172a !important; color: #f8fafc !important;
      border: 1px solid rgba(255,255,255,0.1) !important;
    }
    .swagger-ui .btn { color: #f8fafc !important; border: 1px solid rgba(255,255,255,0.15) !important; background: transparent !important; }
    .swagger-ui .btn:hover { background: rgba(255, 255, 255, 0.05) !important; }
    .swagger-ui .btn.authorize { color: #10b981 !important; border-color: #10b981 !important; }
    .swagger-ui .btn.authorize svg { fill: #10b981 !important; }
    .swagger-ui .prop-name { color: #22d3ee !important; }
    .swagger-ui .prop-type { color: #a78bfa !important; }
    .swagger-ui .parameter__name.required span { color: #ef4444 !important; }
    .swagger-ui .markdown p, .swagger-ui .renderedMarkdown p, .swagger-ui .markdown li, .swagger-ui .markdown pre, .swagger-ui .markdown code { color: #cbd5e1 !important; }
    
    .swagger-ui .model { color: #cbd5e1 !important; }
    .swagger-ui .model-box { background-color: #0f172a !important; border: 1px solid rgba(255, 255, 255, 0.05) !important; }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui-bundle.js"></script>
  <script src="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui-standalone-preset.js"></script>
  <script>
    window.onload = () => {
      window.ui = SwaggerUIBundle({
        url: '/api/openapi.json',
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIStandalonePreset
        ],
        layout: "BaseLayout",
        persistAuthorization: true,
        displayRequestDuration: true,
        filter: true,
        tryItOutEnabled: true,
        docExpansion: 'none',
        defaultModelsExpandDepth: 2,
        defaultModelExpandDepth: 3,
        showExtensions: true,
        showCommonExtensions: true,
      });
    };
  </script>
</body>
</html>`;

router.get(['/api/docs', '/api/docs/'], (req, res) => {
  res.setHeader('Content-Type', 'text/html');
  return res.status(200).send(swaggerHtml);
});

// Alias: /swagger also redirects to /api/docs
router.get(['/swagger', '/swagger-ui', '/docs'], (req, res) => {
  return res.redirect('/api/docs');
});

export default router;
