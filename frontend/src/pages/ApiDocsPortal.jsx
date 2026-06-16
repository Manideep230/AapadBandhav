import React, { useEffect } from 'react';

export default function ApiDocsPortal() {
  useEffect(() => {
    window.location.replace('/api/docs');
  }, []);

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      background: '#0f172a',
      color: '#cbd5e1',
      fontFamily: 'sans-serif'
    }}>
      Redirecting to API Console...
    </div>
  );
}

