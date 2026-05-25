import React, { useState, useEffect, useCallback } from 'react';
import Layout from '../../components/Layout';
import { useAuth } from '../../context/AuthContext';
import API from '../../api/axios';
import toast from 'react-hot-toast';
import { getSocket } from '../../api/socket';
import { useNavigate } from 'react-router-dom';

export default function UserDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [accidents, setAccidents] = useState([]);
  const [device, setDevice] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [liveAlert, setLiveAlert] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [accRes, devRes, notifRes] = await Promise.all([
        API.get('/accidents/my'),
        API.get('/devices/my-device'),
        API.get('/notifications'),
      ]);
      setAccidents(accRes.data.accidents || []);
      setDevice(devRes.data.device);
      setNotifications(notifRes.data.notifications || []);
    } catch (e) {
      console.error(e);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Listen for real-time accident acknowledgements
  useEffect(() => {
    const socket = getSocket();
    const onResponded = (data) => {
      setLiveAlert(data);
      toast.success(`🚑 ${data.type} is coming to help! ETA: ${data.eta} min`);
    };
    socket.on('accident:responded', onResponded);
    return () => socket.off('accident:responded', onResponded);
  }, []);

  const activeAccident = accidents.find(a => ['active','dispatched','responded'].includes(a.status));
  const stats = [
    { label: 'Total Incidents', value: accidents.length, icon: '📋', color: 'blue' },
    { label: 'Active Alerts', value: accidents.filter(a => a.status === 'active').length, icon: '🔴', color: 'red' },
    { label: 'Resolved', value: accidents.filter(a => a.status === 'resolved').length, icon: '✅', color: 'green' },
    { label: 'Device Status', value: device ? 'Linked' : 'None', icon: '📟', color: device ? 'green' : 'amber' },
  ];

  if (loading) return <Layout title="Dashboard"><div className="loading-screen"><div className="spinner-lg spinner" /></div></Layout>;

  return (
    <Layout title="User Dashboard">
      {/* Live Alert Banner */}
      {liveAlert && (
        <div className="card card-red animate-slideup" style={{ marginBottom: 20, display: 'flex', gap: 16, alignItems: 'center' }}>
          <span style={{ fontSize: 32 }}>🚑</span>
          <div>
            <div style={{ fontWeight: 700, color: 'var(--green-400)' }}>Emergency Responder En Route!</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>A {liveAlert.type} has accepted your emergency • ETA: {liveAlert.eta} minutes</div>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={() => setLiveAlert(null)} style={{ marginLeft: 'auto' }}>✕</button>
        </div>
      )}

      {/* Welcome Header */}
      <div className="flex-between mb-24">
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 800 }}>Welcome, {user?.full_name?.split(' ')[0]} 👋</h1>
          <p className="text-muted text-sm">User ID: <strong style={{ color: 'var(--text-primary)', fontFamily: 'monospace' }}>{user?.unique_id}</strong> • Blood Group: <strong style={{ color: 'var(--red-400)' }}>{user?.blood_group}</strong></p>
        </div>
        <button className="btn btn-primary" onClick={() => navigate('/accident')}>🚨 Report Accident</button>
      </div>

      {/* Stats */}
      <div className="stat-grid">
        {stats.map(s => (
          <div key={s.label} className={`stat-card ${s.color}`}>
            <div className="stat-icon">{s.icon}</div>
            <div className="stat-value">{s.value}</div>
            <div className="stat-label">{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Device Info */}
        <div className="card">
          <div className="flex-between mb-16">
            <h3>📟 IoT Device</h3>
            <button className="btn btn-secondary btn-sm" onClick={() => navigate('/profile')}>Manage</button>
          </div>
          {device ? (
            <>
              <div style={{ fontFamily: 'monospace', fontSize: 18, letterSpacing: 2, color: 'var(--cyan-400)', marginBottom: 8 }}>{device.device_id}</div>
              <div className="flex gap-8 mb-8">
                <span className="badge badge-green">● Linked</span>
                <span className="badge badge-blue">{device.status}</span>
              </div>
              <div className="text-sm text-muted">Battery: {device.battery_level}% • Firmware: {device.firmware_version}</div>
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>📡</div>
              <div style={{ fontSize: 13 }}>No device linked yet</div>
              <button className="btn btn-primary btn-sm" style={{ marginTop: 12 }} onClick={() => navigate('/profile')}>Link Device</button>
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="card">
          <h3 style={{ marginBottom: 16 }}>⚡ Quick Actions</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button className="btn btn-danger w-full" onClick={() => navigate('/accident')}>🚨 Report Emergency</button>
            <button className="btn btn-secondary w-full" onClick={() => navigate('/map')}>🗺️ View Live Map</button>
            <button className="btn btn-secondary w-full" onClick={() => navigate('/profile')}>👤 Edit Profile</button>
          </div>
          <div style={{ marginTop: 16, padding: 12, background: 'rgba(239,68,68,0.06)', borderRadius: 8, fontSize: 12, color: 'var(--text-muted)', border: '1px solid rgba(239,68,68,0.1)' }}>
            🛡️ Always keep emergency contacts updated for faster response
          </div>
        </div>
      </div>

      {/* Accident History */}
      <div className="card" style={{ marginTop: 20 }}>
        <div className="flex-between mb-16">
          <h3>📋 Incident History</h3>
          <span className="badge badge-muted">{accidents.length} total</span>
        </div>
        {accidents.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>✅</div>
            <div>No accidents recorded. Stay safe!</div>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Code</th><th>Date</th><th>Location</th><th>Severity</th><th>Status</th></tr></thead>
              <tbody>
                {accidents.slice(0, 8).map(a => (
                  <tr key={a.id}>
                    <td><code style={{ fontSize: 12, color: 'var(--cyan-400)' }}>{a.accident_code}</code></td>
                    <td className="text-sm text-muted">{new Date(a.createdAt).toLocaleDateString('en-IN')}</td>
                    <td className="text-sm">{a.location_address || `${parseFloat(a.latitude).toFixed(4)}, ${parseFloat(a.longitude).toFixed(4)}`}</td>
                    <td><span className={`badge badge-${a.severity === 'critical' ? 'red' : a.severity === 'high' ? 'amber' : 'blue'}`}>{a.severity}</span></td>
                    <td><span className={`badge badge-${a.status === 'resolved' ? 'green' : a.status === 'active' ? 'red' : 'amber'}`}>{a.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Notifications */}
      {notifications.length > 0 && (
        <div className="card" style={{ marginTop: 20 }}>
          <h3 style={{ marginBottom: 16 }}>🔔 Recent Notifications</h3>
          {notifications.slice(0, 5).map(n => (
            <div key={n.id} className={`alert-item ${n.type === 'accident' ? 'critical' : 'active'}`}>
              <span style={{ fontSize: 20 }}>{n.type === 'accident' ? '🚨' : 'ℹ️'}</span>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{n.title}</div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{n.message}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{new Date(n.createdAt).toLocaleString('en-IN')}</div>
              </div>
              {!n.is_read && <span className="status-dot alert" style={{ marginLeft: 'auto', flexShrink: 0 }} />}
            </div>
          ))}
        </div>
      )}
    </Layout>
  );
}
