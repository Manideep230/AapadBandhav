import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

const ConnectionContext = createContext(null);

export const useConnection = () => useContext(ConnectionContext);

export const ConnectionProvider = ({ children }) => {
  const [isBackendAvailable, setIsBackendAvailable] = useState(true);
  const [isRecovering, setIsRecovering] = useState(false);
  const [socketStatus, setSocketStatus] = useState('offline'); // 'connected', 'reconnecting', 'offline'
  const [socketLatency, setSocketLatency] = useState(null);
  const [isDbOnline, setIsDbOnline] = useState(true);
  const [isMqttOnline, setIsMqttOnline] = useState(true);
  const [checking, setChecking] = useState(false);

  // Bind to window so Axios and Socket.IO interceptors can update context state immediately
  useEffect(() => {
    window.__setBackendAvailable = (available, recovering = false) => {
      setIsBackendAvailable(available);
      setIsRecovering(recovering);
      if (available) {
        setIsRecovering(false);
      }
    };

    window.__setSocketStatus = (status) => {
      setSocketStatus(status);
      if (status !== 'connected') {
        setSocketLatency(null);
      }
    };

    window.__setSocketLatency = (latency) => {
      setSocketLatency(latency);
    };

    return () => {
      delete window.__setBackendAvailable;
      delete window.__setSocketStatus;
      delete window.__setSocketLatency;
    };
  }, []);

  const checkHealth = async () => {
    if (checking) return;
    setChecking(true);
    try {
      const res = await axios.get('/api/health', { _isRetryRedirect: true }); // Prevent interceptor loop
      if (res.data && res.data.success) {
        setIsBackendAvailable(true);
        setIsRecovering(false);
        setIsDbOnline(res.data.services?.database === 'online');
        setIsMqttOnline(res.data.services?.mqtt === 'online');
      } else {
        setIsBackendAvailable(false);
        setIsDbOnline(false);
        setIsMqttOnline(false);
      }
    } catch (err) {
      setIsBackendAvailable(false);
      setIsDbOnline(false);
      setIsMqttOnline(false);
    } finally {
      setChecking(false);
    }
  };

  // Startup check
  useEffect(() => {
    checkHealth();
  }, []);

  // Periodic health check (only run if backend is available to avoid spamming down server)
  useEffect(() => {
    let interval;
    if (isBackendAvailable) {
      interval = setInterval(() => {
        checkHealth();
      }, 15000);
    } else {
      // Slow check if backend is offline to see if it recovered (if axios retries aren't running)
      interval = setInterval(() => {
        checkHealth();
      }, 30000);
    }
    return () => clearInterval(interval);
  }, [isBackendAvailable]);

  return (
    <ConnectionContext.Provider
      value={{
        isBackendAvailable,
        isRecovering,
        socketStatus,
        socketLatency,
        isDbOnline,
        isMqttOnline,
        checkHealth,
        checking,
      }}
    >
      {children}
    </ConnectionContext.Provider>
  );
};

// Sleek glassmorphic diagnostics widget for system status
export const ConnectionMonitorWidget = () => {
  const {
    isBackendAvailable,
    isRecovering,
    socketStatus,
    socketLatency,
    isDbOnline,
    isMqttOnline,
    checkHealth,
    checking,
  } = useConnection();

  const [expanded, setExpanded] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    try {
      const userStr = localStorage.getItem('user');
      if (userStr) {
        const user = JSON.parse(userStr);
        setIsAdmin(user.role === 'admin' || user.role === 'superadmin');
      }
    } catch (e) {
      setIsAdmin(false);
    }
  }, []);

  // Overall status helper
  const getOverallStatus = () => {
    if (!isBackendAvailable) return { label: 'Server Offline', color: '#ef4444', dot: '🔴' };
    if (isRecovering) return { label: 'Reconnecting...', color: '#f59e0b', dot: '🟡' };
    if (socketStatus === 'reconnecting') return { label: 'Syncing Sockets...', color: '#f59e0b', dot: '🟡' };
    if (!isDbOnline || !isMqttOnline) return { label: 'Degraded Service', color: '#f59e0b', dot: '🟡' };
    return { label: 'System Online', color: '#10b981', dot: '🟢' };
  };

  const status = getOverallStatus();

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        zIndex: 9999,
        fontFamily: "'Outfit', 'Inter', sans-serif",
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
      }}
    >
      {/* Expanded status card */}
      {expanded && (
        <div
          style={{
            background: 'rgba(15, 23, 42, 0.95)',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '16px',
            padding: '20px',
            marginBottom: '10px',
            width: '280px',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3), 0 8px 10px -6px rgba(0, 0, 0, 0.3)',
            color: '#f8fafc',
            transition: 'all 0.3s ease',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <span style={{ fontWeight: 700, fontSize: '15px', letterSpacing: '0.5px', color: '#3b82f6' }}>SYSTEM CONNECTIVITY</span>
            <button
              onClick={() => setExpanded(false)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#94a3b8',
                cursor: 'pointer',
                fontSize: '16px',
                padding: '0 4px',
              }}
            >
              ✕
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {/* API Status */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: '#94a3b8', fontSize: '13px' }}>Backend API</span>
              <span style={{ fontSize: '13px', fontWeight: 600, color: isBackendAvailable ? '#10b981' : '#ef4444' }}>
                {isBackendAvailable ? '🟢 Online' : '🔴 Offline'}
              </span>
            </div>

            {/* Socket Status */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: '#94a3b8', fontSize: '13px' }}>Socket.IO Service</span>
              <span
                style={{
                  fontSize: '13px',
                  fontWeight: 600,
                  color: socketStatus === 'connected' ? '#10b981' : socketStatus === 'reconnecting' ? '#f59e0b' : '#ef4444',
                }}
              >
                {socketStatus === 'connected' ? '🟢 Connected' : socketStatus === 'reconnecting' ? '🟡 Syncing' : '🔴 Offline'}
              </span>
            </div>

            {/* Socket Latency */}
            {socketStatus === 'connected' && socketLatency !== null && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#94a3b8', fontSize: '13px' }}>Connection Latency</span>
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#22d3ee' }}>
                  ⚡ {socketLatency}ms
                </span>
              </div>
            )}

            {/* Admin diagnostics */}
            {isAdmin && (
              <>
                <div style={{ height: '1px', background: 'rgba(255, 255, 255, 0.1)', margin: '4px 0' }}></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: '#94a3b8', fontSize: '13px' }}>MongoDB Database</span>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: isDbOnline ? '#10b981' : '#ef4444' }}>
                    {isDbOnline ? '🟢 Connected' : '🔴 Disconnected'}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: '#94a3b8', fontSize: '13px' }}>MQTT Event Broker</span>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: isMqttOnline ? '#10b981' : '#ef4444' }}>
                    {isMqttOnline ? '🟢 Bound' : '🔴 Unreachable'}
                  </span>
                </div>
              </>
            )}
          </div>

          <button
            onClick={checkHealth}
            disabled={checking}
            style={{
              marginTop: '16px',
              width: '100%',
              background: '#3b82f6',
              border: 'none',
              borderRadius: '8px',
              color: '#ffffff',
              padding: '8px',
              fontWeight: 600,
              fontSize: '12px',
              cursor: 'pointer',
              opacity: checking ? 0.7 : 1,
              transition: 'background 0.2s',
            }}
          >
            {checking ? 'Checking Connection...' : 'Diagnose Network'}
          </button>
        </div>
      )}

      {/* Floating status bubble */}
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          background: 'rgba(15, 23, 42, 0.9)',
          backdropFilter: 'blur(8px)',
          border: `1.5px solid ${status.color}`,
          borderRadius: '30px',
          padding: '8px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          cursor: 'pointer',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
          transition: 'transform 0.2s, box-shadow 0.2s',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'translateY(-2px)';
          e.currentTarget.style.boxShadow = '0 6px 16px rgba(0, 0, 0, 0.25)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'translateY(0)';
          e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)';
        }}
      >
        <span style={{ fontSize: '10px' }}>{status.dot}</span>
        <span style={{ color: '#f8fafc', fontSize: '12px', fontWeight: 600 }}>{status.label}</span>
      </button>
    </div>
  );
};
