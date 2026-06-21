import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../../components/Layout';
import API from '../../api/axios';
import toast from 'react-hot-toast';
import { connectSocket, getSocket } from '../../api/socket';
import { useSocketEvent } from '../../hooks/useSocket';
import { useAuth } from '../../context/AuthContext';
import useGeolocationPermission from '../../hooks/useGeolocation';
import {
  SirenIcon,
  ClockIcon,
  CheckIcon,
  AlertIcon,
  UsersIcon,
  MapIcon,
  HeartIcon
} from '../../components/Icons';

export default function VolunteerDashboard() {
  const { user } = useAuth();
  useGeolocationPermission();
  const navigate = useNavigate();
  const [alerts, setAlerts] = useState([]);
  const [available, setAvailable] = useState(user?.is_available ?? true);
  const [loading, setLoading] = useState(true);
  const [newAlert, setNewAlert] = useState(null);
  const [showEtaModal, setShowEtaModal] = useState(false);
  const [etaValue, setEtaValue] = useState('12');
  const [pendingRespondAlert, setPendingRespondAlert] = useState(null);

  const fetchAlerts = useCallback(async () => {
    try {
      const res = await API.get('/volunteer/alerts');
      setAlerts(res.data.alerts || []);
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed to load alerts');
    } finally {
      setLoading(false);
    }
  }, []);

  // Ensure socket is connected and registered when user is available
  useEffect(() => {
    if (user?.id) {
      connectSocket(user.id, 'volunteer');
    }
  }, [user?.id]);

  const playAlert = useCallback(() => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(600, ctx.currentTime);
      osc.frequency.setValueAtTime(750, ctx.currentTime + 0.15);
      osc.frequency.setValueAtTime(900, ctx.currentTime + 0.3);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.5);
    } catch (_) {}
  }, []);

  const handleAlert = useCallback((data) => {
    setNewAlert(data);
    if (data?.alert?.id) {
      const fullAlert = {
        ...data.alert,
        accident: data.accident,
        user: data.user,
        victim: data.victim || data.user
      };
      setAlerts(prev => [fullAlert, ...prev.filter(a => a.id !== data.alert.id)]);
    } else {
      fetchAlerts();
    }
    playAlert();
    toast('Nearby responder alert received!', { duration: 6000, style: { background: '#1e3a8a', color: '#fff', fontWeight: 600 } });
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
  useSocketEvent('connect', fetchAlerts);

  useEffect(() => {
    setAvailable(user?.is_available ?? true);
    API.get('/auth/me').then(r => {
      const u = r.data.user;
      if (!u) return;
      setAvailable(u.is_available ?? true);
      localStorage.setItem('user', JSON.stringify(u));
    }).catch(() => {});

    fetchAlerts();

    // Set up polling interval as a fallback (every 10 seconds)
    const interval = setInterval(() => {
      fetchAlerts();
    }, 10000);

    return () => clearInterval(interval);
  }, [user?.id, fetchAlerts]);

  useEffect(() => {
    if (!user?.id || !navigator.geolocation) return undefined;
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const socket = getSocket();
        if (socket && socket.connected) {
          socket.emit('location:update', {
            entityId: user.id,
            entityType: 'volunteer',
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            speed: position.coords.speed || 0,
            heading: position.coords.heading || 0,
            accuracy: position.coords.accuracy || 0,
          });
        }
      },
      (err) => {
        console.warn('[Geolocation Error]', err);
        if (err.code === err.PERMISSION_DENIED) {
          toast.error('Location access denied. Please enable location in browser settings.', { id: 'geo-denied-toast' });
        }
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [user?.id]);

  const respond = async (alertId, action, accident) => {
    if (action === 'accepted') {
      setPendingRespondAlert({ alertId, action, accident });
      setEtaValue('12');
      setShowEtaModal(true);
      return;
    }
    await submitResponse(alertId, action, 0, accident);
  };

  const submitResponse = async (alertId, action, eta, accident) => {
    try {
      await API.post(`/volunteer/alerts/${alertId}/respond`, { action, eta });
      setAlerts(a => a.map(x => x.id === alertId ? { ...x, status: action === 'accepted' ? 'accepted' : 'rejected' } : x));
      toast.success(`Rescue alert ${action}`);
      
      if (action === 'accepted' && accident) {
        const lat = user.last_location_lat || 16.5062;
        const lng = user.last_location_lng || 80.6480;
        
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
      if (e?.response?.status === 409) {
        toast('⚠️ ' + (e.response?.data?.message || 'This alert was already accepted by another responder.'), {
          duration: 5000,
          style: { background: '#78350f', color: '#fff', fontWeight: 600 },
        });
        setAlerts(a => a.map(x => x.id === alertId ? { ...x, status: 'rejected' } : x));
      } else {
        toast.error('Response failed');
      }
    }
  };

  const handleEtaSubmit = async (e) => {
    e.preventDefault();
    if (!pendingRespondAlert) return;
    const { alertId, action, accident } = pendingRespondAlert;
    const eta = parseInt(etaValue, 10) || 12;
    setShowEtaModal(false);
    setPendingRespondAlert(null);
    await submitResponse(alertId, action, eta, accident);
  };

  const toggleAvailability = async () => {
    try {
      const nextAvailable = !available;
      const res = await API.put('/locations/status', { is_available: nextAvailable });
      const u = res.data.profile;
      if (u) {
        localStorage.setItem('user', JSON.stringify(u));
      }
      setAvailable(nextAvailable);
      toast.success(`Ranger status: ${nextAvailable ? 'ON DUTY' : 'OFF DUTY'}`);
    } catch (e) {
      toast.error('Failed to toggle status');
    }
  };

  return (
    <Layout title="Ranger Portal">
      <div className="flex-between mb-24">
        <div>
          <h1 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <UsersIcon size={22} className="text-blue" /> Ranger Hub
          </h1>
          <p className="section-subtitle">{user?.full_name || 'Ranger'} - Community Rescue Network</p>
        </div>
        <div>
          <div 
            className={`toggle-switch-container ${available ? 'active' : 'standby'}`} 
            onClick={toggleAvailability}
          >
            <span className="toggle-switch-text">
              {available ? 'ON DUTY' : 'OFF DUTY'}
            </span>
            <div className="toggle-switch-track">
              <div className="toggle-switch-thumb" />
            </div>
          </div>
        </div>
      </div>

      {newAlert && (
        <div className="bento-card card-blue animate-slideup mb-20">
          <div className="flex-center gap-16">
            <UsersIcon size={32} className="text-blue" />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 800, color: 'var(--cyan-primary)', marginBottom: 4 }}>COMMUNITY DISTRESS ALERT</div>
              <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>{newAlert.alert?.message}</div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-success" onClick={() => { respond(newAlert.alert?.id, 'accepted', newAlert.accident); setNewAlert(null); }}>Respond</button>
              <button className="btn btn-secondary" onClick={() => { respond(newAlert.alert?.id, 'rejected', newAlert.accident); setNewAlert(null); }}>Dismiss</button>
            </div>
          </div>
        </div>
      )}

      <div className="bento-grid mb-24">
        {[
          { l: 'Rescues Attended', v: alerts.filter(a => a.status === 'accepted').length, i: <UsersIcon size={16} />, c: 'blue' },
          { l: 'Pending Signals', v: alerts.filter(a => a.status === 'sent').length, i: <SirenIcon size={16} />, c: 'red' },
          { l: 'Community Points', v: alerts.filter(a => a.status === 'accepted').length * 50 + 150, i: <HeartIcon size={16} />, c: 'amber' },
          { l: 'Active Region Status', v: available ? 'Covered' : 'Uncovered', i: <MapIcon size={16} />, c: 'green' }
        ].map((s, index) => (
          <div key={index} className={`stat-card span-3 ${s.c}`}>
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
          <h3 style={{ marginBottom: 16, fontSize: 15, fontWeight: 600 }}>Community Emergency Alerts</h3>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 32 }}><div className="spinner" /></div>
          ) : alerts.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>
              All quiet in your neighborhood. Thank you for volunteering!
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {alerts.map((a) => (
                <div 
                  key={a.id} 
                  className="alert-item" 
                  style={{ 
                    display: 'flex', 
                    gap: 12, 
                    padding: 12, 
                    background: 'var(--zinc-800)', 
                    borderRadius: 6,
                    borderLeft: a.status === 'accepted' ? '4px solid var(--green-primary)' : a.status === 'rejected' ? '4px solid var(--border)' : '4px solid var(--blue-primary)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <UsersIcon size={24} className="text-blue" />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div className="flex-center gap-10 mb-4" style={{ flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{a.accident?.accident_code || 'Rescue'}</span>
                      <span className={`badge ${a.status === 'accepted' ? 'badge-green' : a.status === 'rejected' ? 'badge-muted' : 'badge-red'}`}>
                        {a.status.toUpperCase()}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{new Date(a.createdAt).toLocaleTimeString()}</span>
                    </div>
                    <p style={{ margin: '8px 0', fontSize: 13.5, color: 'var(--text-secondary)' }}>{a.message}</p>
                    {a.accident && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, fontSize: 12, color: 'var(--text-secondary)', marginTop: 8 }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><MapIcon size={12} /> Coordinates: {a.accident.latitude}, {a.accident.longitude}</span>
                        <span>Distance: {a.distance_km} km</span>
                      </div>
                    )}
                  </div>
                  {a.status === 'sent' && (
                    <div style={{ display: 'flex', gap: 8, marginLeft: 16, alignItems: 'center' }}>
                      <button className="btn btn-success btn-sm" onClick={() => respond(a.id, 'accepted', a.accident)}>Accept</button>
                      <button className="btn btn-secondary btn-sm" onClick={() => respond(a.id, 'rejected', a.accident)}>Ignore</button>
                    </div>
                  )}
                  {a.status === 'accepted' && a.accident && (
                    <button 
                      className="btn btn-primary btn-sm" 
                      style={{ marginLeft: 16, alignSelf: 'center' }}
                      onClick={() => {
                        const lat = user.last_location_lat || 16.5062;
                        const lng = user.last_location_lng || 80.6480;
                        API.post('/routes', { accident_id: a.accident.id, from_lat: lat, from_lng: lng }).then(r => {
                          if (r.data.route?.id) navigate(`/navigation/${r.data.route.id}`);
                        });
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
