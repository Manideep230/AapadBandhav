import React, { useState, useEffect } from 'react';
import Sidebar from './Sidebar';

export default function Layout({ children, title }) {
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('theme') || 'dark';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content">
        <div className="topbar">
          <span className="topbar-title">{title || 'AapadBandhav'}</span>
          <div className="topbar-actions">
            <button 
              onClick={toggleTheme} 
              className="btn btn-secondary btn-sm"
              style={{ padding: '6px 10px', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            >
              {theme === 'dark' ? '☀️' : '🌙'}
            </button>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              🕐 {new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
            </span>
            <span className="badge badge-red animate-blink">● LIVE</span>
          </div>
        </div>
        <div className="page animate-fade">
          {children}
        </div>
      </main>
    </div>
  );
}
