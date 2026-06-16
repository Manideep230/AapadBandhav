import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from './Layout';
import API from '../api/axios';
import toast from 'react-hot-toast';
import { connectSocket, getSocket } from '../api/socket';
import { useSocketEvent } from '../hooks/useSocket';
import { useAuth } from '../context/AuthContext';
import {
  SirenIcon,
  ClockIcon,
  CheckIcon,
  AlertIcon,
  ShieldIcon,
  WrenchIcon,
  CarIcon
} from './Icons';

// Shared alert dashboard for ambulance, police, mechanic
export default function ServiceDashboard({ apiBase, icon, title, entityKey }) {
  const { user, entityType } = useAuth();
  const navigate = useNavigate();
  const [alerts, setAlerts] = useState([]);
  const [available, setAvailable] = useState(true);
  const [loading, setLoading] = useState(true);
  const [showEtaModal, setShowEtaModal] = useState(false);
  const [etaValue, setEtaValue] = useState('10');
  const [pendingRespondAlert, setPendingRespondAlert] = useState(null);

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

  // Ensure socket is connected and registered when user is available
  useEffect(() => {
    if (user?.id && entityType) {
      connectSocket(user.id, entityType);
    }
  }, [user?.id, entityType]);

  const playAlert = useCallback(() => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.setValueAtTime(660, ctx.currentTime + 0.2);
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.4);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.6);
    } catch (_) {}
  }, []);

  // Helper to render correct SVG icon based on entity type / key
  const renderServiceIcon = (size = 18) => {
    const key = entityKey || entityType;
    if (key === 'ambulance') return <CarIcon size={size} className="text-blue" />;
    if (key === 'police' || key === 'policeman' || key === 'police_station') return <ShieldIcon size={size} className="text-blue" />;
    if (key === 'mechanic') return <WrenchIcon size={size} className="text-amber" />;
    return <SirenIcon size={size} className="text-red" />;
  };

  const handleAlert = useCallback((data) => {
    if (data?.alert?.id) {
      setAlerts(prev => [data.alert, ...prev.filter(a => a.id !== data.alert.id)]);
    } else {
      fetchAlerts();
    }
    playAlert();
    toast('New emergency alert!', { duration: 8000, style: { background: '#7f1d1d', color: '#fff', fontWeight: 700 } });
  }, [fetchAlerts, playAlert]);

  const handleRemovedAlert = useCallback((data) => {
    if (data?.alertId) setAlerts(prev => prev.filter(a => a.id !== data.alertId));
    else fetchAlerts();
  }, [fetchAlerts]);

  // Bind Socket.IO events using custom hook
  useSocketEvent(user?.id ? `entity:${user.id}:alert` : null, handleAlert);
  useSocketEvent('alert:new', handleAlert);
  useSocketEvent('alert:removed', handleRemovedAlert);
  useSocketEvent('accident:dispatched', fetchAlerts);
  useSocketEvent('accident:phase2', fetchAlerts);
  useSocketEvent('connect', fetchAlerts);

  useEffect(() => {
    setAvailable(user?.is_available ?? true);
    API.get('/auth/me').then(r => {
      const dataKey = entityType === 'ambulance'
        ? 'driver'
        : entityType === 'policeman'
          ? 'policeman'
          : entityType === 'mechanic'
            ? 'mechanic'
            : entityType === 'police_station'
              ? 'station'
              : null;
      const entity = dataKey ? r.data[dataKey] : null;
      if (!entity) return;
      setAvailable(entity.is_available ?? true);
      localStorage.setItem('user', JSON.stringify(entity));
    }).catch(() => {});

    fetchAlerts();
  }, [user?.id, entityType, fetchAlerts]);

  useEffect(() => {
    const liveLocationRoles = ['ambulance', 'policeman', 'mechanic'];
    if (!user?.id || !liveLocationRoles.includes(entityType) || !navigator.geolocation) return undefined;

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const socket = getSocket();
        if (socket && socket.connected) {
          socket.emit('location:update', {
            entityId: user.id,
            entityType,
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            speed: position.coords.speed || 0,
            heading: position.coords.heading || 0,
            accuracy: position.coords.accuracy || 0,
          });
        }
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [user?.id, entityType]);

  const respond = async (alertId, action, accident) => {
    if (action === 'accepted') {
      setPendingRespondAlert({ alertId, action, accident });
      setEtaValue('10');
      setShowEtaModal(true);
      return;
    }
    await submitResponse(alertId, action, 0, accident);
  };

  const submitResponse = async (alertId, action, eta, accident) => {
    try {
      await API.post(`${apiBase}/alerts/${alertId}/respond`, { action, eta });
      setAlerts(a => a.map(x => x.id === alertId ? { ...x, status: action === 'accepted' ? 'accepted' : 'rejected' } : x));
      toast.success(`Alert ${action}`);

      if (action === 'accepted' && accident) {
        const lat = user?.last_location_lat || user?.latitude || 16.5062;
        const lng = user?.last_location_lng || user?.longitude || 80.6480;
        
        const rRes = await API.post('/routes', {
          accident_id: accident.id,
          from_lat: lat,
          from_lng: lng
        });
        
        if (rRes.data.success && rRes.data.route?.id) {
          toast.success('Starting rescue routing navigation...');
          navigate(`/navigation/${rRes.data.route.id}`);
        }
      }
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed');
    }
  };

  const handleEtaSubmit = async (e) => {
    e.preventDefault();
    if (!pendingRespondAlert) return;
    const { alertId, action, accident } = pendingRespondAlert;
    const eta = parseInt(etaValue, 10) || 10;
    setShowEtaModal(false);
    setPendingRespondAlert(null);
    await submitResponse(alertId, action, eta, accident);
  };

  const toggleAvail = async () => {
    try {
      const nextAvailable = !available;
      await API.put('/locations/status', { is_available: nextAvailable });
      setAvailable(nextAvailable);
      const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
      localStorage.setItem('user', JSON.stringify({ ...storedUser, is_available: nextAvailable }));
      toast.success(`Duty status: ${nextAvailable ? 'ON DUTY' : 'OFF DUTY'}`);
    } catch (e) {
      toast.error('Failed');
    }
  };

  return (
    <Layout title={title}>
      <div className="flex-between mb-24">
        <div>
          <h1 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {renderServiceIcon(22)} {title}
          </h1>
          <p className="section-subtitle">{user?.name || 'Portal'} - Emergency Response</p>
        </div>
        {entityType !== 'police_station' && (
          <div 
            className={`toggle-switch-container ${available ? 'active' : 'standby'}`} 
            onClick={toggleAvail}
          >
            <span className="toggle-switch-text">
              {available ? 'ON DUTY' : 'OFF DUTY'}
            </span>
            <div className="toggle-switch-track">
              <div className="toggle-switch-thumb" />
            </div>
          </div>
        )}
      </div>

      <div className="bento-grid mb-24">
        {[
          { l: 'Total Alerts', v: alerts.length, i: <AlertIcon size={16} />, c: 'blue' },
          { l: 'Pending', v: alerts.filter(a => ['sent', 'delivered'].includes(a.status)).length, i: <ClockIcon size={16} />, c: 'amber' },
          { l: 'Accepted', v: alerts.filter(a => a.status === 'accepted').length, i: <CheckIcon size={16} />, c: 'green' },
        ].map(s => (
          <div key={s.l} className={`stat-card span-4 ${s.c}`}>
            <div className="stat-header">
              <span>{s.l}</span>
              <span className="stat-icon">{s.i}</span>
            </div>
            <div className="stat-value">{s.v}</div>
          </div>
        ))}
      </div>

      <div className="bento-grid">
        <div className="bento-card span-12">
          <h3 style={{ marginBottom: 16, fontSize: 15, fontWeight: 600 }}>Incoming Alerts</h3>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 32 }}><div className="spinner" /></div>
          ) : alerts.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>
              No alerts yet. You will be notified when there is an emergency nearby.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {alerts.map(a => (
                <div key={a.id} className={`alert-item ${a.status === 'accepted' ? 'resolved' : 'active'}`} style={{ display: 'flex', gap: 12, padding: 12, background: 'var(--zinc-800)', borderRadius: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    {renderServiceIcon(24)}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div className="flex-between mb-4">
                      <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>{a.accident?.accident_code || 'Alert'}</span>
                      <span className={`badge badge-${a.status === 'accepted' ? 'green' : a.status === 'rejected' ? 'muted' : 'red'}`}>{a.status}</span>
                    </div>
                    <div style={{ fontSize: 13.5, color: 'var(--text-secondary)', marginBottom: 4 }}>{(a.message || '').substring(0, 120)}...</div>
                    {a.distance_km && <div style={{ fontSize: 12, color: 'var(--cyan-primary)', fontWeight: 600 }}>{parseFloat(a.distance_km).toFixed(1)}km away - ETA ~{a.eta_minutes}min</div>}
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{new Date(a.createdAt).toLocaleString('en-IN')}</div>
                  </div>
                  {['sent', 'delivered'].includes(a.status) && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
                      <button className="btn btn-success btn-sm" onClick={() => respond(a.id, 'accepted', a.accident)}>Accept</button>
                      <button className="btn btn-secondary btn-sm" onClick={() => respond(a.id, 'rejected', a.accident)}>Decline</button>
                    </div>
                  )}
                  {a.status === 'accepted' && a.accident && (
                    <button 
                      className="btn btn-primary btn-sm"
                      style={{ marginLeft: 16, alignSelf: 'center' }}
                      onClick={async () => {
                        const lat = user?.last_location_lat || user?.latitude || 16.5062;
                        const lng = user?.last_location_lng || user?.longitude || 80.6480;
                        try {
                          const rRes = await API.post('/routes', { accident_id: a.accident.id, from_lat: lat, from_lng: lng });
                          if (rRes.data.route?.id) navigate(`/navigation/${rRes.data.route.id}`);
                        } catch (e) {
                          toast.error('Failed to launch navigation');
                        }
                      }}
                    >
                      Navigate
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showEtaModal && (
        <div className="modal-overlay">
          <div className="modal animate-slideup">
            <h2 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <ClockIcon size={20} className="text-amber" /> Specify Rescue ETA
            </h2>
            <form onSubmit={handleEtaSubmit}>
              <div className="form-group mb-24">
                <label className="form-label" htmlFor="eta-input">Estimated Time of Arrival (minutes)</label>
                <input 
                  id="eta-input"
                  className="form-input" 
                  type="number" 
                  min="1" 
                  max="120"
                  value={etaValue} 
                  onChange={(e) => setEtaValue(e.target.value)} 
                  required
                  autoFocus
                />
              </div>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  onClick={() => { setShowEtaModal(false); setPendingRespondAlert(null); }}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-success">
                  Confirm & Respond
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Layout>
  );
}
