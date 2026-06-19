import React from 'react';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
    try {
      sessionStorage.removeItem('chunk-load-error-reload-attempted');
    } catch (e) {}
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    
    // Catch dynamic import failures (due to new build deployment)
    const errorStr = error?.toString() || '';
    if (
      errorStr.includes('Failed to fetch dynamically imported module') ||
      errorStr.includes('Loading chunk') ||
      errorStr.includes('chunk load failed')
    ) {
      const reloadKey = 'chunk-load-error-reload-attempted';
      try {
        const hasReloaded = sessionStorage.getItem(reloadKey);
        if (!hasReloaded) {
          sessionStorage.setItem(reloadKey, 'true');
          console.warn('Dynamic import failed (chunk load error). Automatically reloading the screen to fetch fresh assets...');
          window.location.reload();
          return;
        }
      } catch (e) {
        console.error('Failed to access sessionStorage:', e);
      }
    }

    this.setState({ errorInfo });
  }

  handleRestart = () => {
    localStorage.clear(); // Clear potentially corrupted storage states
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'radial-gradient(circle at center, #1e293b 0%, #0f172a 100%)',
            fontFamily: "'Outfit', 'Inter', sans-serif",
            color: '#f8fafc',
            padding: '24px',
            boxSizing: 'border-box',
          }}
        >
          <div
            style={{
              background: 'rgba(30, 41, 59, 0.7)',
              backdropFilter: 'blur(12px)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '24px',
              padding: '40px',
              maxWidth: '540px',
              width: '100%',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                width: '64px',
                height: '64px',
                background: 'rgba(239, 68, 68, 0.15)',
                border: '1.5px solid #ef4444',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 24px',
                fontSize: '28px',
              }}
            >
              ⚠️
            </div>

            <h1
              style={{
                fontSize: '24px',
                fontWeight: 800,
                marginBottom: '12px',
                letterSpacing: '-0.5px',
                color: '#ef4444',
              }}
            >
              Component Rendering Crash
            </h1>

            <p style={{ color: '#94a3b8', fontSize: '15px', lineHeight: '1.6', marginBottom: '24px' }}>
              An unexpected layout error occurred on this screen. We have captured the diagnostics and logged it for the administration team.
            </p>

            <div
              style={{
                background: 'rgba(15, 23, 42, 0.6)',
                border: '1.5px solid rgba(255, 255, 255, 0.05)',
                borderRadius: '12px',
                padding: '16px',
                fontSize: '13px',
                fontFamily: 'monospace',
                textAlign: 'left',
                color: '#e2e8f0',
                maxHeight: '150px',
                overflowY: 'auto',
                marginBottom: '32px',
              }}
            >
              <strong>Error:</strong> {this.state.error?.toString() || 'Unknown rendering error'}
              {this.state.errorInfo?.componentStack && (
                <pre style={{ marginTop: '8px', whiteSpace: 'pre-wrap', color: '#94a3b8' }}>
                  {this.state.errorInfo.componentStack}
                </pre>
              )}
            </div>

            <div style={{ display: 'flex', gap: '16px', justifyContent: 'center' }}>
              <button
                onClick={() => window.location.reload()}
                style={{
                  background: 'transparent',
                  border: '1.5px solid rgba(255, 255, 255, 0.15)',
                  borderRadius: '10px',
                  color: '#ffffff',
                  padding: '12px 24px',
                  fontWeight: 600,
                  fontSize: '14px',
                  cursor: 'pointer',
                  transition: 'background 0.2s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                Reload Screen
              </button>
              <button
                onClick={this.handleRestart}
                style={{
                  background: '#ef4444',
                  border: 'none',
                  borderRadius: '10px',
                  color: '#ffffff',
                  padding: '12px 24px',
                  fontWeight: 600,
                  fontSize: '14px',
                  cursor: 'pointer',
                  transition: 'background 0.2s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#dc2626')}
                onMouseLeave={(e) => (e.currentTarget.style.background = '#ef4444')}
              >
                Reset & Return Home
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
