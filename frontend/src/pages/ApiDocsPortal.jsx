import React, { useEffect, useRef, useState } from 'react';
import Layout from '../components/Layout';
import API from '../api/axios';

// Swagger UI is loaded from CDN to avoid bundle bloat
const SWAGGER_CDN_CSS = 'https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui.css';
const SWAGGER_CDN_JS  = 'https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui-bundle.js';

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

function loadStylesheet(href) {
  if (document.querySelector(`link[href="${href}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
}

export default function ApiDocsPortal() {
  const containerRef = useRef(null);
  const [status, setStatus] = useState('loading'); // 'loading' | 'ready' | 'error'
  const [spec, setSpec] = useState(null);

  useEffect(() => {
    // 1. Fetch the OpenAPI JSON spec from our backend
    API.get('/openapi.json')
      .then(res => setSpec(res.data))
      .catch(() => {
        // Fallback: try the raw path
        fetch('/api/openapi.json')
          .then(r => r.json())
          .then(data => setSpec(data))
          .catch(() => setStatus('error'));
      });
  }, []);

  useEffect(() => {
    if (!spec) return;

    // 2. Load Swagger UI from CDN then initialize
    loadStylesheet(SWAGGER_CDN_CSS);
    loadScript(SWAGGER_CDN_JS)
      .then(() => {
        if (!containerRef.current || !window.SwaggerUIBundle) return;

        const darkCss = `
          .swagger-ui { background: #0f172a !important; }
          .swagger-ui .info .title, .swagger-ui .opblock-tag,
          .swagger-ui .opblock .opblock-summary-path,
          .swagger-ui .parameter__name, .swagger-ui .response-col_status,
          .swagger-ui table thead tr td, .swagger-ui table thead tr th,
          .swagger-ui .model-title, .swagger-ui .dialog-ux .modal-ux-header h3,
          .swagger-ui .scheme-container .schemes-title { color: #f8fafc !important; }
          .swagger-ui, .swagger-ui .wrapper, .swagger-ui .opblock,
          .swagger-ui .model-box, .swagger-ui .scheme-container,
          .swagger-ui .dialog-ux .modal-ux { background: #1e293b !important; color: #cbd5e1 !important; }
          .swagger-ui .opblock { border: 1px solid rgba(255,255,255,0.06) !important; }
          .swagger-ui select, .swagger-ui input[type=text], .swagger-ui textarea {
            background: #0f172a !important; color: #f8fafc !important;
            border: 1px solid rgba(255,255,255,0.1) !important;
          }
          .swagger-ui .btn { color: #f8fafc !important; border: 1px solid rgba(255,255,255,0.15) !important; }
          .swagger-ui .btn.authorize { color: #10b981 !important; border-color: #10b981 !important; }
          .swagger-ui .prop-name { color: #22d3ee !important; }
          .swagger-ui .prop-type { color: #a78bfa !important; }
          .swagger-ui .parameter__name.required span { color: #ef4444 !important; }
          .swagger-ui .markdown p, .swagger-ui .renderedMarkdown p { color: #cbd5e1 !important; }
        `;

        // Inject dark CSS override
        const styleEl = document.createElement('style');
        styleEl.textContent = darkCss;
        document.head.appendChild(styleEl);

        window.SwaggerUIBundle({
          spec,
          domNode: containerRef.current,
          deepLinking: true,
          presets: [window.SwaggerUIBundle.presets.apis],
          layout: 'BaseLayout',
          persistAuthorization: true,
          displayRequestDuration: true,
          filter: true,
          docExpansion: 'none',
          defaultModelsExpandDepth: 2,
        });

        setStatus('ready');
      })
      .catch(() => setStatus('error'));
  }, [spec]);

  return (
    <Layout title="Interactive API Console">
      <div className="flex-between mb-24 flex-wrap gap-12">
        <div>
          <h1 className="section-title">Developer API Console</h1>
          <p className="section-subtitle">
            Interactive Swagger UI — explore and test all AapadBandhav API endpoints.
          </p>
        </div>
        <a
          href="/api/openapi.json"
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-secondary btn-sm"
        >
          ↓ Download OpenAPI Spec
        </a>
      </div>

      {/* Loading state */}
      {status === 'loading' && (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', padding: '80px 0', gap: 16,
          color: 'var(--text-muted)',
        }}>
          <span className="spinner" style={{ width: 32, height: 32 }} />
          <div style={{ fontSize: 14 }}>Loading API Documentation...</div>
        </div>
      )}

      {/* Error state */}
      {status === 'error' && (
        <div style={{
          background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)',
          borderRadius: 14, padding: '28px', textAlign: 'center', color: '#f87171',
        }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Failed to load API specification</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
            The OpenAPI spec could not be fetched from the backend.
          </div>
          <button className="btn btn-secondary btn-sm" onClick={() => window.location.reload()}>
            Retry
          </button>
        </div>
      )}

      {/* Swagger UI mount point */}
      <div
        ref={containerRef}
        id="swagger-ui-root"
        style={{
          display: status === 'loading' || status === 'error' ? 'none' : 'block',
          background: '#0f172a',
          borderRadius: 16,
          border: '1px solid rgba(255,255,255,0.07)',
          overflow: 'hidden',
          minHeight: 'calc(100vh - 220px)',
          boxShadow: '0 10px 30px rgba(0,0,0,0.3)',
        }}
      />
    </Layout>
  );
}
