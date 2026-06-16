import React, { useState, useEffect, useCallback } from 'react';
import Layout from '../../components/Layout';
import API from '../../api/axios';
import toast from 'react-hot-toast';
import { connectSocket, getSocket } from '../../api/socket';
import { useSocketEvent } from '../../hooks/useSocket';
import { useAuth } from '../../context/AuthContext';
import {
  SirenIcon,
  ClockIcon,
  CheckIcon,
  AlertIcon,
  HospitalIcon
} from '../../components/Icons';

export default function HospitalDashboard() {
  const { user } = useAuth();
  const [alerts, setAlerts] = useState([]);
  const [available, setAvailable] = useState(user?.is_available ?? true);
  const [loading, setLoading] = useState(true);
  const [newAlert, setNewAlert] = useState(null);
  const [showEtaModal, setShowEtaModal] = useState(false);
  const [etaValue, setEtaValue] = useState('10');
  const [pendingRespondAlert, setPendingRespondAlert] = useState(null);

  const fetchAlerts = useCallback(async () => {
    try {
      const res = await API.get('/hospitals/alerts');
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
      connectSocket(user.id, 'hospital');
    }
  }, [user?.id]);

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
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.6);
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
    toast('New accident alert received!', { duration: 8000, style: { background: '#7f1d1d', color: '#fff', fontWeight: 700 } });
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
      const hospital = r.data.hospital;
      if (!hospital) return;
      setAvailable(hospital.is_available ?? true);
      localStorage.setItem('user', JSON.stringify(hospital));
    }).catch(() => {});

    fetchAlerts();
  }, [user?.id, fetchAlerts]);

  const respond = async (alertId, action) => {
    if (action === 'accepted') {
      setPendingRespondAlert({ alertId, action });
      setEtaValue('15');
      setShowEtaModal(true);
      return;
    }
    await submitResponse(alertId, action, 0);
  };

  const submitResponse = async (alertId, action, eta) => {
    try {
      await API.post(`/hospitals/alerts/${alertId}/respond`, { action, eta });
      setAlerts(a => a.map(x => x.id === alertId ? { ...x, status: action === 'accepted' ? 'accepted' : 'rejected' } : x));
      toast.success(`Alert ${action}`);
    } catch (e) {
      toast.error('Failed');
    }
  };

  const handleEtaSubmit = async (e) => {
    e.preventDefault();
    if (!pendingRespondAlert) return;
    const { alertId, action } = pendingRespondAlert;
    const eta = parseInt(etaValue, 10) || 15;
    setShowEtaModal(false);
    setPendingRespondAlert(null);
    await submitResponse(alertId, action, eta);
  };

  const toggleAvailability = async () => {
    try {
      const nextAvailable = !available;
      const res = await API.put('/hospitals/availability', { is_available: nextAvailable });
      const hospital = res.data.hospital;
      if (hospital) {
        localStorage.setItem('user', JSON.stringify(hospital));
      }
      setAvailable(nextAvailable);
      toast.success(`Hospital status: ${nextAvailable ? 'ON DUTY' : 'OFF DUTY'}`);
    } catch (e) {
      toast.error('Failed');
    }
  };

  return (
    <Layout title="Hospital Portal">
      <div className="flex-between mb-24">
        <div>
          <h1 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <HospitalIcon size={22} className="text-red" /> Hospital Dashboard
          </h1>
          <p className="section-subtitle">{user?.name || 'Hospital'} - Emergency Response Portal</p>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
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
            <AlertIcon size={32} className="text-red" />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, color: 'var(--red-primary)', marginBottom: 4 }}>INCOMING ACCIDENT ALERT</div>
              <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>{newAlert.alert?.message?.substring(0, 120)}...</div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-success" onClick={() => { respond(newAlert.alert?.id, 'accepted'); setNewAlert(null); }}>Accept</button>
              <button className="btn btn-secondary" onClick={() => { respond(newAlert.alert?.id, 'rejected'); setNewAlert(null); }}>Decline</button>
            </div>
          </div>
        </div>
      )}

      <div className="bento-grid mb-24">
        {[
          { l: 'Total Alerts', v: alerts.length, i: <AlertIcon size={16} />, c: 'blue' },
          { l: 'Pending', v: alerts.filter(a => a.status === 'sent' || a.status === 'delivered').length, i: <ClockIcon size={16} />, c: 'amber' },
          { l: 'Accepted', v: alerts.filter(a => a.status === 'accepted').length, i: <CheckIcon size={16} />, c: 'green' },
          { l: 'Status', v: available ? 'Open' : 'Closed', i: <HospitalIcon size={16} />, c: available ? 'green' : 'red' },
        ].map(s => (
          <div key={s.l} className={`stat-card span-3 ${s.c}`}>
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
          <h3 style={{ marginBottom: 16, fontSize: 15, fontWeight: 600 }}>Accident Alerts</h3>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 32 }}><div className="spinner" /></div>
          ) : alerts.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>No alerts received yet</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {alerts.map(a => (
                <div 
                  key={a.id} 
                  className={`alert-item ${a.status === 'accepted' ? 'resolved' : a.status === 'rejected' ? '' : a.accident?.severity === 'critical' ? 'critical' : 'active'}`}
                  style={{ display: 'flex', gap: 12, padding: 12, background: 'var(--zinc-800)', borderRadius: 6 }}
                >
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <SirenIcon size={24} className="text-red" />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div className="flex-between mb-4">
                      <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>{a.accident?.accident_code || 'Unknown'}</span>
                      <span className={`badge badge-${a.status === 'accepted' ? 'green' : a.status === 'rejected' ? 'muted' : 'red'}`}>{a.status}</span>
                    </div>
                    <div style={{ fontSize: 13.5, color: 'var(--text-secondary)', marginBottom: 4 }}>{a.message?.substring(0, 100)}...</div>
                    {a.victim && <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}><b>Patient:</b> {a.victim.full_name} • {a.victim.blood_group} • {a.accident?.vehicle_number}</div>}
                    {a.distance_km && <div style={{ fontSize: 12, color: 'var(--cyan-primary)', marginTop: 4, fontWeight: 600 }}>{parseFloat(a.distance_km).toFixed(1)}km away - ETA: ~{a.eta_minutes}min</div>}
                  </div>
                  {(a.status === 'sent' || a.status === 'delivered') && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0, justifyContent: 'center' }}>
                      <button className="btn btn-success btn-sm" onClick={() => respond(a.id, 'accepted')}>Accept</button>
                      <button className="btn btn-secondary btn-sm" onClick={() => respond(a.id, 'rejected')}>Decline</button>
                    </div>
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
              <ClockIcon size={20} className="text-amber" /> Specify Response ETA
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
