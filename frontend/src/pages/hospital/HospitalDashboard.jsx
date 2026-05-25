import React, { useState, useEffect, useCallback } from 'react';
import Layout from '../../components/Layout';
import API from '../../api/axios';
import toast from 'react-hot-toast';
import { connectSocket } from '../../api/socket';
import { useAuth } from '../../context/AuthContext';

export default function HospitalDashboard() {
  const { user } = useAuth();
  const [alerts, setAlerts] = useState([]);
  const [available, setAvailable] = useState(user?.is_available ?? true);
  const [loading, setLoading] = useState(true);
  const [newAlert, setNewAlert] = useState(null);

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

  useEffect(() => {
    setAvailable(user?.is_available ?? true);
    API.get('/auth/me').then(r => {
      const hospital = r.data.hospital;
      if (!hospital) return;
      setAvailable(hospital.is_available ?? true);
      localStorage.setItem('user', JSON.stringify(hospital));
    }).catch(() => {});

    fetchAlerts();
    if (!user?.id) return undefined;

    const socket = connectSocket(user.id, 'hospital');
    const refreshAlerts = () => fetchAlerts();
    const handleAlert = (data) => {
      setNewAlert(data);
      if (data?.alert?.id) setAlerts(prev => [data.alert, ...prev.filter(a => a.id !== data.alert.id)]);
      else fetchAlerts();
      toast('New accident alert received!', { duration: 8000 });
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
  }, [user?.id, user?.is_available, fetchAlerts]);

  const respond = async (alertId, action) => {
    const eta = action === 'accepted' ? parseInt(prompt('ETA in minutes?') || '15') : 0;
    try {
      await API.post(`/hospitals/alerts/${alertId}/respond`, { action, eta });
      setAlerts(a => a.map(x => x.id === alertId ? { ...x, status: action === 'accepted' ? 'accepted' : 'rejected' } : x));
      toast.success(`Alert ${action}`);
    } catch (e) {
      toast.error('Failed');
    }
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
      toast.success(`Status: ${nextAvailable ? 'Available' : 'Unavailable'}`);
    } catch (e) {
      toast.error('Failed');
    }
  };

  return (
    <Layout title="Hospital Portal">
      <div className="flex-between mb-24">
        <div>
          <h1 className="section-title">Hospital Dashboard</h1>
          <p className="section-subtitle">{user?.name || 'Hospital'} - Emergency Response Portal</p>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <button className={`btn ${available ? 'btn-success' : 'btn-danger'}`} onClick={toggleAvailability}>
            {available ? 'Available' : 'Unavailable'}
          </button>
        </div>
      </div>

      {newAlert && (
        <div className="card card-red animate-slideup mb-20">
          <div className="flex-center gap-16">
            <span style={{ fontSize: 40 }}>!</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, color: 'var(--red-400)', marginBottom: 4 }}>INCOMING ACCIDENT ALERT</div>
              <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>{newAlert.alert?.message?.substring(0, 120)}...</div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-success" onClick={() => { respond(newAlert.alert?.id, 'accepted'); setNewAlert(null); }}>Accept</button>
              <button className="btn btn-secondary" onClick={() => { respond(newAlert.alert?.id, 'rejected'); setNewAlert(null); }}>Decline</button>
            </div>
          </div>
        </div>
      )}

      <div className="stat-grid">
        {[
          { l: 'Total Alerts', v: alerts.length, i: 'T', c: 'blue' },
          { l: 'Pending', v: alerts.filter(a => a.status === 'sent' || a.status === 'delivered').length, i: 'P', c: 'amber' },
          { l: 'Accepted', v: alerts.filter(a => a.status === 'accepted').length, i: 'A', c: 'green' },
          { l: 'Status', v: available ? 'Open' : 'Closed', i: 'S', c: available ? 'green' : 'red' },
        ].map(s => (
          <div key={s.l} className={`stat-card ${s.c}`}>
            <div className="stat-icon">{s.i}</div>
            <div className="stat-value">{s.v}</div>
            <div className="stat-label">{s.l}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <h3 style={{ marginBottom: 16 }}>Accident Alerts</h3>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 32 }}><div className="spinner" /></div>
        ) : alerts.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>No alerts received yet</div>
        ) : (
          alerts.map(a => (
            <div key={a.id} className={`alert-item ${a.status === 'accepted' ? 'resolved' : a.status === 'rejected' ? '' : a.accident?.severity === 'critical' ? 'critical' : 'active'}`}>
              <span style={{ fontSize: 24 }}>!</span>
              <div style={{ flex: 1 }}>
                <div className="flex-between mb-4">
                  <span style={{ fontWeight: 700, fontSize: 14 }}>{a.accident?.accident_code || 'Unknown'}</span>
                  <span className={`badge badge-${a.status === 'accepted' ? 'green' : a.status === 'rejected' ? 'muted' : 'red'}`}>{a.status}</span>
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>{a.message?.substring(0, 100)}...</div>
                {a.victim && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Patient: {a.victim.full_name} - {a.victim.blood_group} - {a.accident?.vehicle_number}</div>}
                {a.distance_km && <div style={{ fontSize: 12, color: 'var(--cyan-400)', marginTop: 4 }}>{parseFloat(a.distance_km).toFixed(1)}km away - ETA: ~{a.eta_minutes}min</div>}
              </div>
              {(a.status === 'sent' || a.status === 'delivered') && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
                  <button className="btn btn-success btn-sm" onClick={() => respond(a.id, 'accepted')}>Accept</button>
                  <button className="btn btn-secondary btn-sm" onClick={() => respond(a.id, 'rejected')}>Decline</button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </Layout>
  );
}
