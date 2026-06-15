import React, { useState, useEffect } from 'react';
import Sidebar from './Sidebar';
import { SunIcon, MoonIcon, ClockIcon } from './Icons';

export default function Layout({ children, title }) {
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('theme') || 'dark';
  });

  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  return (
    <div className="app-layout">
      {sidebarOpen && (
        <div 
          onClick={() => setSidebarOpen(false)} 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.4)',
            zIndex: 998,
            backdropFilter: 'blur(3px)'
          }}
        />
      )}
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="main-content">
        <div className="topbar" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={() => setSidebarOpen(true)}
            className="btn btn-secondary btn-sm mobile-menu-btn"
            style={{
              padding: '6px 10px',
              fontSize: 18,
              display: 'none',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer'
            }}
          >
            ☰
          </button>
          <span className="topbar-title" style={{ flex: 1 }}>{title || 'AapadBandhav'}</span>
          <div className="topbar-actions" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button 
              onClick={toggleTheme} 
              className="btn btn-secondary btn-sm"
              style={{ padding: '6px 10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            >
              {theme === 'dark' ? <SunIcon size={16} /> : <MoonIcon size={16} />}
            </button>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: 6 }} className="topbar-time">
              <ClockIcon size={14} /> {new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
            </span>
            <span className="badge badge-red" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <span className="status-dot alert" /> LIVE
            </span>
          </div>
        </div>
        <div className="page animate-fade">
          {children}
        </div>
      </main>
    </div>
  );
}
