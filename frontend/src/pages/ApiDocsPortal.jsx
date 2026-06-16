import React from 'react';
import Layout from '../components/Layout';

export default function ApiDocsPortal() {
  return (
    <Layout title="Interactive API Console">
      <div className="flex-between mb-24 flex-wrap gap-12">
        <div>
          <h1 className="section-title">Developer API Console</h1>
          <p className="section-subtitle">
            Official Swagger UI Console integrated directly with AapadBandhav OpenAPI Specification.
          </p>
        </div>
      </div>

      <div 
        style={{ 
          width: '100%', 
          height: 'calc(100vh - 180px)', 
          background: '#0f172a', 
          borderRadius: '16px', 
          overflow: 'hidden', 
          border: '1px solid rgba(255, 255, 255, 0.08)',
          boxShadow: '0 10px 30px rgba(0, 0, 0, 0.3)'
        }}
      >
        <iframe 
          src="/api/docs" 
          title="AapadBandhav API Documentation"
          style={{ width: '100%', height: '100%', border: 'none' }}
        />
      </div>
    </Layout>
  );
}
