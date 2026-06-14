import React, { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import API from '../api/axios';
import toast from 'react-hot-toast';

export default function ApiDocsPortal() {
  const [spec, setSpec] = useState(null);
  const [endpoints, setEndpoints] = useState([]);
  const [groupedEndpoints, setGroupedEndpoints] = useState({});
  const [selectedEndpoint, setSelectedEndpoint] = useState(null);
  const [expandedTags, setExpandedTags] = useState({});
  const [loading, setLoading] = useState(true);

  // Authentication override state
  const [authToken, setAuthToken] = useState(localStorage.getItem('token') || '');
  const [isAuthorized, setIsAuthorized] = useState(!!localStorage.getItem('token'));

  // Request parameters states
  const [pathParams, setPathParams] = useState({});
  const [queryParams, setQueryParams] = useState({});
  const [requestBody, setRequestBody] = useState('{}');

  // Response execution states
  const [executing, setExecuting] = useState(false);
  const [responseStatus, setResponseStatus] = useState(null);
  const [responseLatency, setResponseLatency] = useState(null);
  const [responseHeaders, setResponseHeaders] = useState(null);
  const [responseData, setResponseData] = useState(null);
  const [curlCommand, setCurlCommand] = useState('');

  // Fetch OpenAPI Spec
  const fetchOpenApiSpec = async () => {
    setLoading(true);
    try {
      const res = await API.get('/openapi.json');
      if (res.data) {
        setSpec(res.data);
        parseSpec(res.data);
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to load OpenAPI Spec from server');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOpenApiSpec();
  }, []);

  // Parse Spec into endpoints list
  const parseSpec = (openApiSpec) => {
    const list = [];
    const paths = openApiSpec.paths || {};
    const components = openApiSpec.components || {};

    Object.entries(paths).forEach(([path, pathObj]) => {
      Object.entries(pathObj).forEach(([method, methodObj]) => {
        // Skip parameters defined on path level or custom tags
        if (['get', 'post', 'put', 'delete', 'patch'].includes(method.toLowerCase())) {
          const tag = (methodObj.tags && methodObj.tags[0]) || 'General';
          list.push({
            id: `${method.toUpperCase()}-${path}`,
            path,
            method: method.toUpperCase(),
            tag,
            summary: methodObj.summary || '',
            description: methodObj.description || '',
            parameters: methodObj.parameters || [],
            requestBody: methodObj.requestBody || null,
            responses: methodObj.responses || {},
            security: methodObj.security || openApiSpec.security || []
          });
        }
      });
    });

    // Sort endpoints by tag, then path
    list.sort((a, b) => a.tag.localeCompare(b.tag) || a.path.localeCompare(b.path));

    setEndpoints(list);

    // Group by tag
    const grouped = {};
    list.forEach(ep => {
      if (!grouped[ep.tag]) grouped[ep.tag] = [];
      grouped[ep.tag].push(ep);
    });
    setGroupedEndpoints(grouped);

    // Default expand all tags
    const defaultExpanded = {};
    Object.keys(grouped).forEach(tag => {
      defaultExpanded[tag] = true;
    });
    setExpandedTags(defaultExpanded);

    // Select first endpoint if available
    if (list.length > 0) {
      selectEndpoint(list[0], openApiSpec);
    }
  };

  const selectEndpoint = (ep, currentSpec = spec) => {
    setSelectedEndpoint(ep);
    setResponseStatus(null);
    setResponseLatency(null);
    setResponseHeaders(null);
    setResponseData(null);

    // Initialize parameters
    const initialPath = {};
    const initialQuery = {};
    ep.parameters.forEach(param => {
      if (param.in === 'path') {
        initialPath[param.name] = param.schema?.default || param.schema?.example || '';
      } else if (param.in === 'query') {
        initialQuery[param.name] = param.schema?.default || param.schema?.example || '';
      }
    });
    setPathParams(initialPath);
    setQueryParams(initialQuery);

    // Initialize Request Body
    if (ep.requestBody) {
      const content = ep.requestBody.content || {};
      const jsonContent = content['application/json'] || {};
      if (jsonContent.schema) {
        const example = getExampleFromSchema(jsonContent.schema, currentSpec);
        setRequestBody(JSON.stringify(example, null, 2));
      } else {
        setRequestBody('{}');
      }
    } else {
      setRequestBody('');
    }
  };

  // Helper to extract examples from OpenAPI schemas
  const getExampleFromSchema = (schema, currentSpec) => {
    if (!schema) return {};
    const specComponents = currentSpec?.components || {};

    if (schema.$ref) {
      const refPath = schema.$ref.replace('#/components/schemas/', '');
      const resolved = specComponents.schemas?.[refPath];
      return getExampleFromSchema(resolved, currentSpec);
    }

    if (schema.example !== undefined) {
      return schema.example;
    }

    if (schema.properties) {
      const obj = {};
      Object.entries(schema.properties).forEach(([key, val]) => {
        obj[key] = getExampleFromSchema(val, currentSpec);
      });
      return obj;
    }

    if (schema.type === 'array') {
      const itemExample = getExampleFromSchema(schema.items, currentSpec);
      return [itemExample];
    }

    switch (schema.type) {
      case 'string': return '';
      case 'integer':
      case 'number': return 0;
      case 'boolean': return false;
      default: return {};
    }
  };

  const handleToggleTag = (tag) => {
    setExpandedTags(prev => ({
      ...prev,
      [tag]: !prev[tag]
    }));
  };

  // Build current executable URL and cURL command
  useEffect(() => {
    if (!selectedEndpoint) return;
    const base = import.meta.env.VITE_API_URL || `${window.location.protocol}//${window.location.hostname}:5000/api`;
    
    // Replace path params
    let finalPath = selectedEndpoint.path;
    Object.entries(pathParams).forEach(([key, val]) => {
      finalPath = finalPath.replace(`{${key}}`, val || `{${key}}`);
    });

    // Append query params
    const qParts = [];
    Object.entries(queryParams).forEach(([key, val]) => {
      if (val !== undefined && val !== '') {
        qParts.push(`${key}=${encodeURIComponent(val)}`);
      }
    });

    const fullUrl = `${base}${finalPath}${qParts.length > 0 ? '?' + qParts.join('&') : ''}`;

    // Build cURL Command
    let curl = `curl -X ${selectedEndpoint.method} "${fullUrl}"`;
    if (isAuthorized && authToken) {
      curl += ` \\\n  -H "Authorization: Bearer ${authToken}"`;
    }
    if (selectedEndpoint.requestBody && requestBody) {
      curl += ` \\\n  -H "Content-Type: application/json" \\\n  -d '${requestBody.replace(/'/g, "'\\''")}'`;
    }
    setCurlCommand(curl);
  }, [selectedEndpoint, pathParams, queryParams, requestBody, authToken, isAuthorized]);

  // Execute API Request
  const handleExecute = async () => {
    if (!selectedEndpoint) return;
    setExecuting(true);
    setResponseStatus(null);
    setResponseLatency(null);
    setResponseHeaders(null);
    setResponseData(null);

    const base = import.meta.env.VITE_API_URL || `${window.location.protocol}//${window.location.hostname}:5000/api`;
    
    let finalPath = selectedEndpoint.path;
    Object.entries(pathParams).forEach(([key, val]) => {
      finalPath = finalPath.replace(`{${key}}`, val);
    });

    let bodyData = null;
    if (selectedEndpoint.requestBody) {
      try {
        bodyData = JSON.parse(requestBody);
      } catch (err) {
        toast.error('Invalid JSON payload in request body');
        setExecuting(false);
        return;
      }
    }

    const headers = {};
    if (isAuthorized && authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }

    const startTime = performance.now();
    try {
      const res = await API({
        url: finalPath,
        method: selectedEndpoint.method,
        params: queryParams,
        data: bodyData,
        headers
      });
      const endTime = performance.now();
      setResponseLatency(Math.round(endTime - startTime));
      setResponseStatus(res.status);
      setResponseHeaders(res.headers);
      setResponseData(res.data);
    } catch (err) {
      const endTime = performance.now();
      setResponseLatency(Math.round(endTime - startTime));
      if (err.response) {
        setResponseStatus(err.response.status);
        setResponseHeaders(err.response.headers);
        setResponseData(err.response.data);
      } else {
        setResponseStatus('NETWORK_ERROR');
        setResponseData({ message: err.message || 'No response received' });
      }
    } finally {
      setExecuting(false);
    }
  };

  const handleCopy = (text, message) => {
    navigator.clipboard.writeText(text);
    toast.success(message || 'Copied to clipboard');
  };

  const handleExportCollection = () => {
    if (!spec) return;
    const blob = new Blob([JSON.stringify(spec, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'aapadbandhav-openapi.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('OpenAPI Collection exported successfully');
  };

  const getMethodBadgeStyle = (method) => {
    switch (method) {
      case 'GET': return { background: 'rgba(74, 222, 128, 0.15)', color: '#4ade80', border: '1px solid rgba(74, 222, 128, 0.3)' };
      case 'POST': return { background: 'rgba(96, 165, 250, 0.15)', color: '#60a5fa', border: '1px solid rgba(96, 165, 250, 0.3)' };
      case 'PUT': return { background: 'rgba(251, 191, 36, 0.15)', color: '#fbbf24', border: '1px solid rgba(251, 191, 36, 0.3)' };
      case 'DELETE': return { background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.3)' };
      default: return { background: 'var(--card-bg)', color: 'var(--text-muted)' };
    }
  };

  const isJwtRequired = (ep) => {
    if (!ep || !ep.security) return false;
    return ep.security.some(s => s.BearerAuth);
  };

  return (
    <Layout title="Interactive API Console">
      <div className="flex-between mb-24">
        <div>
          <h1 className="section-title">Developer Testing Console</h1>
          <p className="section-subtitle">
            Synchronized directly with the OpenAPI schema. Securely test API nodes, inspect response objects, and copy code templates.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-secondary" onClick={handleExportCollection} disabled={!spec}>
            📥 Export OpenAPI Collection
          </button>
          <button
            className="btn btn-primary"
            onClick={() => {
              const base = import.meta.env.VITE_API_URL || `${window.location.protocol}//${window.location.hostname}:5000/api`;
              const host = base.replace(/\/api$/, '');
              window.open(`${host}/api/docs`, '_blank');
            }}
          >
            🚀 Open Swagger UI
          </button>
        </div>
      </div>

      {/* Authorize Panel */}
      <div className="card" style={{ padding: 16, marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 22 }}>🔑</span>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>Global Session Authorization</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Paste your JWT token to authorize protected API dispatches.</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, flex: '1 1 300px', maxWidth: 600 }}>
          <input
            type="text"
            className="form-input"
            placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
            value={authToken}
            onChange={e => {
              setAuthToken(e.target.value);
              setIsAuthorized(false);
            }}
            style={{ fontSize: 12 }}
          />
          <button
            className={`btn ${isAuthorized ? 'btn-danger' : 'btn-success'}`}
            onClick={() => {
              if (isAuthorized) {
                setAuthToken('');
                setIsAuthorized(false);
                localStorage.removeItem('token');
                toast.success('Authorization token cleared');
              } else {
                if (!authToken) {
                  toast.error('Please enter a valid JWT token first');
                  return;
                }
                setIsAuthorized(true);
                localStorage.setItem('token', authToken);
                toast.success('JWT Token Authorized locally');
              }
            }}
            style={{ minWidth: 100 }}
          >
            {isAuthorized ? 'Lockout' : 'Authorize'}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="loading-screen" style={{ height: 300 }}><div className="spinner-lg spinner" /></div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 24 }}>
          
          {/* Left Endpoint List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 'calc(100vh - 280px)', overflowY: 'auto', paddingRight: 8 }}>
            {Object.entries(groupedEndpoints).map(([tag, eps]) => (
              <div key={tag} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div
                  onClick={() => handleToggleTag(tag)}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '8px 12px',
                    background: 'rgba(255,255,255,0.02)',
                    borderRadius: 6,
                    cursor: 'pointer',
                    fontWeight: 600,
                    fontSize: 13,
                    border: '1px solid var(--border)'
                  }}
                >
                  <span>📂 {tag}</span>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                    {expandedTags[tag] ? '▼' : '▶'}
                  </span>
                </div>

                {expandedTags[tag] && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3, paddingLeft: 6, marginTop: 4 }}>
                    {eps.map(ep => (
                      <div
                        key={ep.id}
                        onClick={() => selectEndpoint(ep)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          padding: '8px 10px',
                          borderRadius: 6,
                          cursor: 'pointer',
                          background: selectedEndpoint?.id === ep.id ? 'rgba(96, 165, 250, 0.1)' : 'transparent',
                          border: selectedEndpoint?.id === ep.id ? '1px solid rgba(96, 165, 250, 0.3)' : '1px solid transparent',
                          transition: 'all 0.2s'
                        }}
                        className="hover-bg-adjust"
                      >
                        <span
                          style={{
                            fontSize: '9px',
                            fontWeight: 'bold',
                            padding: '2px 5px',
                            borderRadius: '4px',
                            minWidth: '45px',
                            textAlign: 'center',
                            ...getMethodBadgeStyle(ep.method)
                          }}
                        >
                          {ep.method}
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '11px', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={ep.path}>
                            {ep.path}
                          </div>
                          <div style={{ fontSize: '10px', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {ep.summary}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Right Interface Console */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {selectedEndpoint ? (
              <div className="card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
                
                {/* Header info */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
                    <span
                      style={{
                        fontSize: '12px',
                        fontWeight: 'bold',
                        padding: '4px 10px',
                        borderRadius: '6px',
                        ...getMethodBadgeStyle(selectedEndpoint.method)
                      }}
                    >
                      {selectedEndpoint.method}
                    </span>
                    <code style={{ fontSize: 16, fontWeight: 'bold' }}>{selectedEndpoint.path}</code>
                    
                    {isJwtRequired(selectedEndpoint) ? (
                      <span className="badge badge-red" style={{ fontSize: 10 }}>🔒 JWT Auth Required</span>
                    ) : (
                      <span className="badge badge-green" style={{ fontSize: 10 }}>🔓 Public Endpoint</span>
                    )}
                  </div>
                  <h3>{selectedEndpoint.summary}</h3>
                  <p className="text-muted" style={{ fontSize: 13, marginTop: 4 }}>{selectedEndpoint.description}</p>
                </div>

                {/* Parameters Editor */}
                <div>
                  <h4 style={{ borderBottom: '1px solid var(--border)', paddingBottom: 6, marginBottom: 12 }}>🔧 Request Parameters</h4>
                  
                  {selectedEndpoint.parameters.length === 0 && !selectedEndpoint.requestBody && (
                    <div className="text-xs text-muted" style={{ padding: '8px 0', fontStyle: 'italic' }}>
                      No parameters or request body payloads required for this endpoint.
                    </div>
                  )}

                  {/* Path Parameters */}
                  {selectedEndpoint.parameters.some(p => p.in === 'path') && (
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ fontSize: 12, fontWeight: 'bold', color: 'var(--text-muted)', marginBottom: 8 }}>Path Variables</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        {selectedEndpoint.parameters.filter(p => p.in === 'path').map(param => (
                          <div key={param.name}>
                            <label style={{ fontSize: 11, display: 'block', marginBottom: 4 }}>
                              <code>{param.name}</code> {param.required && <span style={{ color: 'var(--red-400)' }}>*</span>}
                              <span style={{ opacity: 0.6, fontSize: 10, marginLeft: 4 }}>({param.schema?.type})</span>
                            </label>
                            <input
                              type="text"
                              className="form-input"
                              placeholder={param.description || 'value'}
                              value={pathParams[param.name] || ''}
                              onChange={e => setPathParams(prev => ({ ...prev, [param.name]: e.target.value }))}
                              style={{ height: '36px', fontSize: 12 }}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Query Parameters */}
                  {selectedEndpoint.parameters.some(p => p.in === 'query') && (
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ fontSize: 12, fontWeight: 'bold', color: 'var(--text-muted)', marginBottom: 8 }}>Query Parameters</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        {selectedEndpoint.parameters.filter(p => p.in === 'query').map(param => (
                          <div key={param.name}>
                            <label style={{ fontSize: 11, display: 'block', marginBottom: 4 }}>
                              <code>{param.name}</code> {param.required && <span style={{ color: 'var(--red-400)' }}>*</span>}
                              <span style={{ opacity: 0.6, fontSize: 10, marginLeft: 4 }}>({param.schema?.type})</span>
                            </label>
                            <input
                              type="text"
                              className="form-input"
                              placeholder={param.description || 'value'}
                              value={queryParams[param.name] || ''}
                              onChange={e => setQueryParams(prev => ({ ...prev, [param.name]: e.target.value }))}
                              style={{ height: '36px', fontSize: 12 }}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Request Body Payload Editor */}
                  {selectedEndpoint.requestBody && (
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 'bold', color: 'var(--text-muted)', marginBottom: 8 }}>JSON Request Body Payload</div>
                      <textarea
                        className="form-input"
                        rows={8}
                        value={requestBody}
                        onChange={e => setRequestBody(e.target.value)}
                        style={{ fontFamily: 'monospace', fontSize: 12, lineHeight: 1.5, background: 'rgba(0,0,0,0.2)' }}
                        placeholder="{}"
                      />
                    </div>
                  )}
                </div>

                {/* Action dispatches */}
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <button
                    className="btn btn-primary"
                    onClick={handleExecute}
                    disabled={executing}
                    style={{ minWidth: 130 }}
                  >
                    {executing ? '🔄 Executing...' : '⚡ Send Request'}
                  </button>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => handleCopy(curlCommand, 'cURL command copied')}
                    type="button"
                    style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                  >
                    📋 Copy cURL
                  </button>
                </div>

                {/* Curl visualization preview */}
                <div style={{ background: 'rgba(0,0,0,0.3)', padding: 12, borderRadius: 6, border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ fontSize: 10, fontWeight: 'bold', color: 'var(--text-muted)' }}>EQUIVALENT CURL REQUEST COMMAND</span>
                  </div>
                  <pre style={{ margin: 0, fontSize: 11, fontFamily: 'monospace', color: 'var(--cyan-400)', overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                    {curlCommand}
                  </pre>
                </div>

                {/* Response Visualizer */}
                {(responseStatus !== null || responseData !== null) && (
                  <div>
                    <h4 style={{ borderBottom: '1px solid var(--border)', paddingBottom: 6, marginBottom: 12 }}>📥 Response Panel</h4>
                    
                    <div style={{ display: 'flex', gap: 12, marginBottom: 10 }}>
                      <span className={`badge ${responseStatus >= 200 && responseStatus < 300 ? 'badge-green' : 'badge-red'}`}>
                        HTTP {responseStatus}
                      </span>
                      {responseLatency !== null && (
                        <span className="badge badge-muted">
                          ⏱️ {responseLatency} ms
                        </span>
                      )}
                      <button
                        className="btn btn-ghost btn-xs"
                        onClick={() => handleCopy(JSON.stringify(responseData, null, 2), 'Response JSON copied')}
                        style={{ marginLeft: 'auto', fontSize: 11, padding: '2px 8px' }}
                      >
                        Copy Response JSON
                      </button>
                    </div>

                    <pre style={{ background: 'rgba(0,0,0,0.4)', padding: 16, borderRadius: 8, border: '1px solid var(--border)', maxHeight: '400px', overflowY: 'auto', margin: 0, fontSize: 12, fontFamily: 'monospace', color: '#f0f0f5' }}>
                      {JSON.stringify(responseData, null, 2)}
                    </pre>

                    {responseHeaders && (
                      <details style={{ marginTop: 12, cursor: 'pointer' }}>
                        <summary style={{ fontSize: 11, color: 'var(--text-muted)' }}>View Response Headers</summary>
                        <pre style={{ background: 'rgba(0,0,0,0.2)', padding: 10, borderRadius: 6, marginTop: 6, fontSize: 11, fontFamily: 'monospace', maxHeight: '150px', overflowY: 'auto' }}>
                          {Object.entries(responseHeaders).map(([k, v]) => `${k}: ${v}`).join('\n')}
                        </pre>
                      </details>
                    )}
                  </div>
                )}

              </div>
            ) : (
              <div className="card" style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>
                Select an endpoint from the left menu explorer list to begin interactive testing.
              </div>
            )}
          </div>

        </div>
      )}
    </Layout>
  );
}
