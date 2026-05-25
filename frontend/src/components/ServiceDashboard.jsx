import React, { useState, useEffect, useCallback } from 'react';
import Layout from './Layout';
import API from '../api/axios';
import toast from 'react-hot-toast';
import { connectSocket, getSocket } from '../api/socket';
import { useAuth } from '../context/AuthContext';

// Shared alert dashboard for ambulance, police, mechanic
export default function ServiceDashboard({ apiBase, icon, title }) {
  const { user, entityType } = useAuth();
  const [alerts, setAlerts] = useState([]);
  const [available, setAvailable] = useState(true);
  const [loading, setLoading] = useState(true);

  const fetchAlerts = useCallback(async () => {
    try {
      const res = await API.get(`${apiBase}/alerts`);
      setAlerts(res.data.alerts || []);
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed to load alerts');
    } finally {
      setLoading(false);
    }
  }, [apiBase]);

  useEffect(() => {
    setAvailable(user?.is_available ?? true);
    API.get('/auth/me').then(r => {
      const dataKey = entityType === 'ambulance'
        ? 'driver'
        : entityType === 'policeman'
          ? 'policeman'
          : entityType === 'mechanic'
            ? 'mechanic'
            : null;
      const entity = dataKey ? r.data[dataKey] : null;
      if (!entity) return;
      setAvailable(entity.is_available ?? true);
      localStorage.setItem('user', JSON.stringify(entity));
    }).catch(() => {});

    fetchAlerts();
    if (!user?.id || !entityType) return undefined;

    const socket = connectSocket(user.id, entityType);
    const refreshAlerts = () => fetchAlerts();
    const handleAlert = (data) => {
      if (data?.alert?.id) {
        setAlerts(prev => [data.alert, ...prev.filter(a => a.id !== data.alert.id)]);
      } else {
        fetchAlerts();
      }
      toast('New emergency alert!', { icon, duration: 6000 });
    };
    const handleRemovedAlert = (data) => {
      if (data?.alertId) setAlerts(prev => prev.filter(a => a.id !== data.alertId));
      else fetchAlerts();
    };

    socket.on(`entity:${user.id}:alert`, handleAlert);
    socket.on('alert:new', handleAlert);
    socket.on('alert:removed', handleRemovedAlert);
    socket.on('accident:dispatched', refreshAlerts);
    socket.on('accident:phase2', refreshAlerts);
    socket.on('connect', refreshAlerts);

    return () => {
      socket.off(`entity:${user.id}:alert`, handleAlert);
      socket.off('alert:new', handleAlert);
      socket.off('alert:removed', handleRemovedAlert);
      socket.off('accident:dispatched', refreshAlerts);
      socket.off('accident:phase2', refreshAlerts);
      socket.off('connect', refreshAlerts);
    };
  }, [user?.id, user?.is_available, entityType, fetchAlerts, icon]);

  useEffect(() => {
    const liveLocationRoles = ['ambulance', 'policeman', 'mechanic'];
    if (!user?.id || !liveLocationRoles.includes(entityType) || !navigator.geolocation) return undefined;

    const socket = getSocket();
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        socket.emit('location:update', {
          entityId: user.id,
          entityType,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          speed: position.coords.speed || 0,
          heading: position.coords.heading || 0,
          accuracy: position.coords.accuracy || 0,
        });
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [user?.id, entityType]);

  const respond = async (alertId, action) => {
    const eta = action === 'accepted' ? parseInt(prompt('ETA in minutes?') || '10', 10) : 0;
    try {
      await API.post(`${apiBase}/alerts/${alertId}/respond`, { action, eta });
      setAlerts(a => a.map(x => x.id === alertId ? { ...x, status: action === 'accepted' ? 'accepted' : 'rejected' } : x));
      toast.success(`Alert ${action}`);
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed');
    }
  };

  const toggleAvail = async () => {
    try {
      const nextAvailable = !available;
      await API.put('/locations/status', { is_available: nextAvailable });
      setAvailable(nextAvailable);
      const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
      localStorage.setItem('user', JSON.stringify({ ...storedUser, is_available: nextAvailable }));
      toast.success('Status updated');
    } catch (e) {
      toast.error('Failed');
    }
  };

  return (
    <Layout title={title}>
      <div className="flex-between mb-24">
        <div>
          <h1 className="section-title">{icon} {title}</h1>
          <p className="section-subtitle">{user?.name || 'Portal'} - Emergency Response</p>
        </div>
        {entityType !== 'police_station' && (
          <button className={`btn ${available ? 'btn-success' : 'btn-danger'}`} onClick={toggleAvail}>
            {available ? 'Available' : 'Unavailable'}
          </button>
        )}
      </div>
      <div className="stat-grid">
        {[
          { l: 'Total Alerts', v: alerts.length, i: 'T', c: 'blue' },
          { l: 'Pending', v: alerts.filter(a => ['sent', 'delivered'].includes(a.status)).length, i: 'P', c: 'amber' },
          { l: 'Accepted', v: alerts.filter(a => a.status === 'accepted').length, i: 'A', c: 'green' },
        ].map(s => <div key={s.l} className={`stat-card ${s.c}`}><div className="stat-icon">{s.i}</div><div className="stat-value">{s.v}</div><div className="stat-label">{s.l}</div></div>)}
      </div>
      <div className="card">
        <h3 style={{ marginBottom: 16 }}>Incoming Alerts</h3>
        {loading ? <div style={{ textAlign: 'center', padding: 32 }}><div className="spinner" /></div> :
          alerts.length === 0 ? <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>No alerts yet. You will be notified when there is an emergency nearby.</div> :
          alerts.map(a => (
            <div key={a.id} className={`alert-item ${a.status === 'accepted' ? 'resolved' : 'active'}`}>
              <span style={{ fontSize: 24 }}>{icon}</span>
              <div style={{ flex: 1 }}>
                <div className="flex-between mb-4">
                  <span style={{ fontWeight: 700, fontSize: 14 }}>{a.accident?.accident_code || 'Alert'}</span>
                  <span className={`badge badge-${a.status === 'accepted' ? 'green' : a.status === 'rejected' ? 'muted' : 'red'}`}>{a.status}</span>
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>{(a.message || '').substring(0, 120)}...</div>
                {a.distance_km && <div style={{ fontSize: 12, color: 'var(--cyan-400)' }}>{parseFloat(a.distance_km).toFixed(1)}km away - ETA ~{a.eta_minutes}min</div>}
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{new Date(a.createdAt).toLocaleString('en-IN')}</div>
              </div>
              {['sent', 'delivered'].includes(a.status) && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
                  <button className="btn btn-success btn-sm" onClick={() => respond(a.id, 'accepted')}>Accept</button>
                  <button className="btn btn-secondary btn-sm" onClick={() => respond(a.id, 'rejected')}>Decline</button>
                </div>
              )}
            </div>
          ))
        }
      </div>
    </Layout>
  );
}
