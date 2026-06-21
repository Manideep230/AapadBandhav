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
  FlameIcon,
  CarIcon,
  MapIcon
} from '../../components/Icons';

export default function FireDashboard() {
  const { user } = useAuth();
  useGeolocationPermission();
  const navigate = useNavigate();
  const [alerts, setAlerts] = useState([]);
  const [available, setAvailable] = useState(user?.is_available ?? true);
  const [loading, setLoading] = useState(true);
  const [newAlert, setNewAlert] = useState(null);
  const [showEtaModal, setShowEtaModal] = useState(false);
  const [etaValue, setEtaValue] = useState('10');
  const [pendingRespondAlert, setPendingRespondAlert] = useState(null);

  const fetchAlerts = useCallback(async () => {
    try {
      const res = await API.get('/fire/alerts');
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
      connectSocket(user.id, 'fire_department');
    }
  }, [user?.id]);

  const playAlert = useCallback(() => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(900, ctx.currentTime);
      osc.frequency.setValueAtTime(600, ctx.currentTime + 0.25);
      osc.frequency.setValueAtTime(900, ctx.currentTime + 0.5);
      gain.gain.setValueAtTime(0.4, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.8);
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
    toast('NEW FIRE / ACCIDENT CALL RECEIVED!', { duration: 8000, style: { background: '#dc2626', color: '#fff', fontWeight: 700 } });
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
  }, [user?.id, fetchAlerts]);

  useEffect(() => {
    if (!user?.id || !navigator.geolocation) return undefined;
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const socket = getSocket();
        if (socket && socket.connected) {
          socket.emit('location:update', {
            entityId: user.id,
            entityType: 'fire_department',
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
      setEtaValue('10');
      setShowEtaModal(true);
      return;
    }
    await submitResponse(alertId, action, 0, accident);
  };

  const submitResponse = async (alertId, action, eta, accident) => {
    try {
      await API.post(`/fire/alerts/${alertId}/respond`, { action, eta });
      setAlerts(a => a.map(x => x.id === alertId ? { ...x, status: action === 'accepted' ? 'accepted' : 'rejected' } : x));
      toast.success(`Emergency call ${action}`);
      
      if (action === 'accepted' && accident) {
        // Create navigation route
        const lat = user.last_location_lat || 16.5062;
        const lng = user.last_location_lng || 80.6480;
        
        const rRes = await API.post('/routes', {
          accident_id: accident.id,
          from_lat: lat,
          from_lng: lng
        });
        
        if (rRes.data.success && rRes.data.route?.id) {
          toast.success('Launching turn-by-turn navigation...');
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
    const eta = parseInt(etaValue, 10) || 10;
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
      toast.success(`Fire Department status: ${nextAvailable ? 'ON DUTY' : 'OFF DUTY'}`);
    } catch (e) {
      toast.error('Failed to toggle status');
    }
  };

  return (
    <Layout title="Fire Department Portal">
      <div className="flex-between mb-24">
        <div>
          <h1 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <FlameIcon size={22} className="text-red" /> Fire Department Dashboard
          </h1>
          <p className="section-subtitle">{user?.full_name || 'Station 1'} - Emergency Service Console</p>
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
        <div className="bento-card card-red animate-slideup mb-20">
          <div className="flex-center gap-16">
            <FlameIcon size={32} className="text-red" />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 800, color: 'var(--red-primary)', marginBottom: 4 }}>CRITICAL FIRE EMERGENCY SIGNAL</div>
              <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>{newAlert.alert?.message}</div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-success" onClick={() => { respond(newAlert.alert?.id, 'accepted', newAlert.accident); setNewAlert(null); }}>Accept & Navigate</button>
              <button className="btn btn-secondary" onClick={() => { respond(newAlert.alert?.id, 'rejected', newAlert.accident); setNewAlert(null); }}>Ignore</button>
            </div>
          </div>
        </div>
      )}

      <div className="bento-grid mb-24">
        {[
          { l: 'Total Callouts', v: alerts.length, i: <FlameIcon size={16} />, c: 'red' },
          { l: 'Pending Tasks', v: alerts.filter(a => a.status === 'sent').length, i: <SirenIcon size={16} />, c: 'amber' },
          { l: 'Completed Rescue Runs', v: alerts.filter(a => a.status === 'accepted').length, i: <CheckIcon size={16} />, c: 'green' },
          { l: 'Avg Dispatch Lag', v: '4.8 min', i: <ClockIcon size={16} />, c: 'cyan' }
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
          <h3 style={{ marginBottom: 16, fontSize: 15, fontWeight: 600 }}>Incident Alert Queue</h3>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 32 }}><div className="spinner" /></div>
          ) : alerts.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>
              No active fire incidents reported. Standing down.
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
                    borderLeft: a.status === 'accepted' ? '4px solid var(--green-primary)' : a.status === 'rejected' ? '4px solid var(--border)' : '4px solid var(--red-primary)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <FlameIcon size={24} className="text-red" />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div className="flex-center gap-10 mb-4" style={{ flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{a.accident?.accident_code || 'Report'}</span>
                      <span className={`badge ${a.status === 'accepted' ? 'badge-green' : a.status === 'rejected' ? 'badge-muted' : 'badge-red'}`}>
                        {a.status.toUpperCase()}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{new Date(a.createdAt).toLocaleTimeString()}</span>
                    </div>
                    <p style={{ margin: '8px 0', fontSize: 13.5, color: 'var(--text-secondary)' }}>{a.message}</p>
                    {a.accident && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, fontSize: 12, color: 'var(--text-secondary)', marginTop: 8 }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><MapIcon size={12} /> Coordinates: {a.accident.latitude}, {a.accident.longitude}</span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><CarIcon size={12} /> Vehicle: {a.accident.vehicle_number} ({a.accident.vehicle_type})</span>
                        <span>Distance: {a.distance_km} km</span>
                      </div>
                    )}
                  </div>
                  {a.status === 'sent' && (
                    <div style={{ display: 'flex', gap: 8, marginLeft: 16, alignItems: 'center' }}>
                      <button className="btn btn-success btn-sm" onClick={() => respond(a.id, 'accepted', a.accident)}>Accept</button>
                      <button className="btn btn-secondary btn-sm" onClick={() => respond(a.id, 'rejected', a.accident)}>Decline</button>
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
