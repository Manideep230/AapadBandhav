import React, { useState, useEffect } from 'react';
import Sidebar from './Sidebar';
import { SunIcon, MoonIcon, ClockIcon, MenuIcon } from './Icons';
import { useAuth } from '../context/AuthContext';

export default function Layout({ children, title }) {
  const { settings } = useAuth();
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('theme') || 'dark';
  });

  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    document.body.classList.toggle('sidebar-lock', sidebarOpen);
    return () => document.body.classList.remove('sidebar-lock');
  }, [sidebarOpen]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  return (
    <div className="app-layout">
      {sidebarOpen && <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />}
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="main-content">
        <div className="topbar" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={() => setSidebarOpen(true)}
            className="btn btn-secondary btn-sm mobile-menu-btn icon-btn"
            style={{
              display: 'none',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer'
            }}
            aria-label="Open navigation"
            title="Open navigation"
          >
            <MenuIcon size={18} />
          </button>
          <span className="topbar-title" style={{ flex: 1 }}>{title || settings?.appName || 'AapadBandhav'}</span>
          <div className="topbar-actions" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              onClick={toggleTheme}
              className="btn btn-secondary btn-sm icon-btn"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
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
