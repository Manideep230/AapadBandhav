import express from 'express';
import swaggerUi from 'swagger-ui-express';
import { openApiSpec } from './openapi';

const router = express.Router();

const customCss = `
  body { background-color: #0f172a !important; color: #cbd5e1 !important; }
  .swagger-ui { background-color: #0f172a !important; color: #cbd5e1 !important; }
  .swagger-ui .info .title, .swagger-ui .info h1, .swagger-ui .info h2, .swagger-ui .info h3, .swagger-ui .info h4, .swagger-ui .info h5, .swagger-ui .info p, .swagger-ui .info li, .swagger-ui .info a, .swagger-ui .info td, .swagger-ui .info th, .swagger-ui .info span, .swagger-ui .info div { color: #f8fafc !important; }
  .swagger-ui .info a { color: #38bdf8 !important; text-decoration: underline !important; }
  .swagger-ui .markdown p, .swagger-ui .markdown li, .swagger-ui .markdown pre, .swagger-ui .markdown code, .swagger-ui .renderedMarkdown p, .swagger-ui .renderedMarkdown li, .swagger-ui .renderedMarkdown pre, .swagger-ui .renderedMarkdown code { color: #cbd5e1 !important; }
  .swagger-ui .opblock-tag { color: #f8fafc !important; border-bottom: 1px solid rgba(255, 255, 255, 0.1) !important; }
  .swagger-ui .opblock-tag:hover { background: rgba(255, 255, 255, 0.05) !important; }
  .swagger-ui .opblock .opblock-summary-path, .swagger-ui .opblock .opblock-summary-path__deprecated { color: #f8fafc !important; }
  .swagger-ui .opblock .opblock-summary-description { color: #94a3b8 !important; }
  .swagger-ui .scheme-container { background-color: #1e293b !important; box-shadow: none !important; border-top: 1px solid rgba(255, 255, 255, 0.05) !important; border-bottom: 1px solid rgba(255, 255, 255, 0.05) !important; }
  .swagger-ui .scheme-container .schemes-title { color: #f8fafc !important; }
  .swagger-ui select, .swagger-ui input[type=text], .swagger-ui textarea { background-color: #0f172a !important; color: #f8fafc !important; border: 1px solid rgba(255, 255, 255, 0.1) !important; }
  .swagger-ui .btn { color: #f8fafc !important; border: 1px solid rgba(255, 255, 255, 0.2) !important; background-color: transparent !important; }
  .swagger-ui .btn:hover { background-color: rgba(255, 255, 255, 0.05) !important; }
  .swagger-ui .btn.authorize { color: #10b981 !important; border-color: #10b981 !important; }
  .swagger-ui .btn.authorize svg { fill: #10b981 !important; }
  .swagger-ui .opblock { background: #1e293b !important; border: 1px solid rgba(255, 255, 255, 0.05) !important; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1) !important; }
  .swagger-ui .opblock .opblock-section-header { background: #1e293b !important; border-bottom: 1px solid rgba(255, 255, 255, 0.05) !important; }
  .swagger-ui .opblock .opblock-section-header h4 { color: #f8fafc !important; }
  .swagger-ui .parameter__name, .swagger-ui .parameter__type, .swagger-ui .parameter__in { color: #f8fafc !important; }
  .swagger-ui .parameter__name.required span { color: #ef4444 !important; }
  .swagger-ui .response-col_status, .swagger-ui .response-col_description { color: #f8fafc !important; }
  .swagger-ui table thead tr td, .swagger-ui table thead tr th { color: #f8fafc !important; border-bottom: 1px solid rgba(255, 255, 255, 0.1) !important; }
  .swagger-ui .tabli a { color: #f8fafc !important; }
  .swagger-ui .model-box { background-color: #0f172a !important; border: 1px solid rgba(255, 255, 255, 0.05) !important; }
  .swagger-ui .model { color: #cbd5e1 !important; }
  .swagger-ui .model-title { color: #f8fafc !important; }
  .swagger-ui .prop-name { color: #22d3ee !important; }
  .swagger-ui .prop-type { color: #a78bfa !important; }
  .swagger-ui .dialog-ux .modal-ux { background-color: #1e293b !important; border: 1px solid rgba(255, 255, 255, 0.1) !important; }
  .swagger-ui .dialog-ux .modal-ux-header h3, .swagger-ui .dialog-ux .modal-ux-content h4 { color: #f8fafc !important; }
  .swagger-ui .dialog-ux .modal-ux-content p { color: #cbd5e1 !important; }
`;

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

// ─── Official Swagger UI served at /api/docs ──────────────────────────────────
const swaggerUiOptions: swaggerUi.SwaggerUiOptions = {
  customSiteTitle: 'AapadBandhav API Docs',
  customCss: customCss,
  swaggerOptions: {
    persistAuthorization: true,
    displayRequestDuration: true,
    filter: true,
    tryItOutEnabled: true,          // Enable "Try it out" on all endpoints
    docExpansion: 'none',           // Collapse all sections by default
    defaultModelsExpandDepth: 2,
    defaultModelExpandDepth: 3,
    showExtensions: true,
    showCommonExtensions: true,
    requestSnippetsEnabled: true,
  },
};

router.use('/api/docs', swaggerUi.serve);
router.get('/api/docs', swaggerUi.setup(openApiSpec as any, swaggerUiOptions));

// Alias: /swagger also redirects to /api/docs
router.get(['/swagger', '/swagger-ui', '/docs'], (req, res) => {
  return res.redirect('/api/docs');
});

export default router;
