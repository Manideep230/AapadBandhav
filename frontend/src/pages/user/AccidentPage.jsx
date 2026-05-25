import React, { useState, useEffect, useRef } from 'react';
import Layout from '../../components/Layout';
import API from '../../api/axios';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { getSocket } from '../../api/socket';
import { useAuth } from '../../context/AuthContext';

export default function AccidentPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [location, setLocation] = useState(null);
  const [locError, setLocError] = useState(null);
  const [severity, setSeverity] = useState('medium');
  const [description, setDescription] = useState('');
  const [speed, setSpeed] = useState('0');
  const [triggered, setTriggered] = useState(false);
  const [loading, setLoading] = useState(false);
  const [accident, setAccident] = useState(null);
  const [countdown, setCountdown] = useState(30);
  const [phase, setPhase] = useState(1);
  const [responder, setResponder] = useState(null);
  const timerRef = useRef(null);

  // Get user location
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => {
          // Fallback - Mumbai coords
          setLocation({ lat: 19.076 + (Math.random() - 0.5) * 0.02, lng: 72.8777 + (Math.random() - 0.5) * 0.02 });
          toast('Using backup location', { icon: '📍' });
        }
      );
    } else {
      setLocation({ lat: 19.076, lng: 72.8777 });
    }
  }, []);

  // Socket: listen for responses
  useEffect(() => {
    const socket = getSocket();
    socket.on('accident:phase2', () => { setPhase(2); toast('📡 Expanding search to 25km radius', { icon: '⚡' }); });
    socket.onAny((event, data) => {
      if (event.includes('responded') && accident) {
        setResponder(data);
        if (timerRef.current) clearInterval(timerRef.current);
      }
    });
    return () => { socket.off('accident:phase2'); socket.offAny(); };
  }, [accident]);

  // Countdown timer after trigger
  useEffect(() => {
    if (triggered && !responder) {
      timerRef.current = setInterval(() => {
        setCountdown(c => {
          if (c <= 1) { clearInterval(timerRef.current); return 0; }
          return c - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timerRef.current);
  }, [triggered, responder]);

  const triggerAccident = async () => {
    if (!location) return toast.error('Location not available');
    setLoading(true);
    try {
      const res = await API.post('/accidents/trigger', {
        latitude: location.lat,
        longitude: location.lng,
        severity,
        description,
        speed_at_impact: parseFloat(speed),
      });
      setAccident(res.data.accident);
      setTriggered(true);
      toast.success('🚨 Emergency dispatched! Help is on the way!');
    } catch (err) {
      const active = err.response?.status === 409 ? err.response?.data?.accident : null;
      if (active?.id) {
        setAccident(active);
        setTriggered(true);
        toast.error('You already have an active emergency open.');
        return;
      }
      toast.error(err.response?.data?.message || 'Failed to trigger accident');
    } finally { setLoading(false); }
  };

  const cancelAccident = async () => {
    if (!accident) return;
    try {
      await API.post(`/accidents/${accident.id}/cancel`);
      toast.success('Accident cancelled');
      navigate('/dashboard');
    } catch (err) { toast.error('Failed to cancel'); }
  };

  const markFalseAlarm = async () => {
    if (!accident) return;
    try {
      await API.post(`/accidents/${accident.id}/false-alarm`);
      toast.success('Marked as false alarm');
      navigate('/dashboard');
    } catch (err) { toast.error('Failed'); }
  };

  if (triggered && accident) {
    return (
      <Layout title="🚨 Emergency Active">
        <div style={{ maxWidth: 600, margin: '0 auto' }}>
          {/* Active Emergency Card */}
          <div className="card card-red animate-slideup" style={{ textAlign: 'center', padding: 40, marginBottom: 20 }}>
            <div style={{ fontSize: 56, marginBottom: 8, animation: 'blink 1s infinite' }}>🚨</div>
            <h2 style={{ fontSize: 24, color: 'var(--red-400)', marginBottom: 8 }}>EMERGENCY ACTIVE</h2>
            <div style={{ fontFamily: 'monospace', fontSize: 16, color: 'var(--cyan-400)', marginBottom: 16 }}>{accident.code}</div>

            {responder ? (
              <div style={{ background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.2)', borderRadius: 12, padding: 20, marginBottom: 20 }}>
                <div style={{ fontSize: 32 }}>✅</div>
                <div style={{ color: 'var(--green-400)', fontWeight: 700, fontSize: 18 }}>Responder Accepted!</div>
                <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 8 }}>
                  A {responder.type} is on the way • ETA: {responder.eta} minutes
                </div>
              </div>
            ) : (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 48, fontWeight: 900, color: phase === 2 ? 'var(--amber-400)' : 'var(--red-400)', fontFamily: 'monospace' }}>{countdown}s</div>
                <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>
                  Phase {phase} — {phase === 1 ? '8km' : '25km'} radius dispatch
                </div>
                <div style={{ marginTop: 12 }}>
                  <div style={{ background: 'var(--border)', borderRadius: 4, height: 6, overflow: 'hidden' }}>
                    <div style={{ height: '100%', background: 'var(--red-500)', width: `${(countdown / 30) * 100}%`, transition: 'width 1s linear', borderRadius: 4 }} />
                  </div>
                </div>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12, textAlign: 'left' }}>
              <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: 12 }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>LOCATION</div>
                <div style={{ fontSize: 13, fontFamily: 'monospace' }}>{location?.lat?.toFixed(4)}, {location?.lng?.toFixed(4)}</div>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: 12 }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>SEVERITY</div>
                <div style={{ fontSize: 13, textTransform: 'uppercase', color: 'var(--red-400)' }}>{severity}</div>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: 12 }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>BLOOD GROUP</div>
                <div style={{ fontSize: 13, color: 'var(--amber-400)' }}>{user?.blood_group}</div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-secondary" style={{ flex: 1 }} onClick={markFalseAlarm}>⚠️ False Alarm</button>
              <button className="btn btn-danger" style={{ flex: 1 }} onClick={cancelAccident}>✕ Cancel Emergency</button>
            </div>
          </div>

          {/* Dispatch Status */}
          <div className="card">
            <h3 style={{ marginBottom: 16 }}>📡 Dispatch Pipeline</h3>
            {[
              { icon: '📞', label: 'Emergency Contacts', status: 'notified', color: 'green' },
              { icon: '🏥', label: 'Nearest Hospitals', status: phase >= 1 ? 'alerted' : 'pending', color: 'blue' },
              { icon: '🚑', label: 'Ambulance Drivers', status: phase >= 1 ? 'alerted' : 'pending', color: 'blue' },
              { icon: '👮', label: 'Police', status: phase >= 1 ? 'alerted' : 'pending', color: 'purple' },
              { icon: '🔧', label: 'Mechanics', status: phase >= 1 ? 'alerted' : 'pending', color: 'amber' },
              { icon: '🛡️', label: 'Insurance Company', status: phase >= 1 ? 'alerted' : 'pending', color: 'cyan' },
            ].map(item => (
              <div key={item.label} className="flex-between" style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <span>{item.icon}</span>
                  <span style={{ fontSize: 14 }}>{item.label}</span>
                </span>
                <span className={`badge badge-${item.color}`}>{item.status}</span>
              </div>
            ))}
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Report Accident">
      <div style={{ maxWidth: 600, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <h1 style={{ fontSize: 24, marginBottom: 8 }}>🚨 Emergency Trigger</h1>
          <p className="text-muted text-sm">Press the button below to immediately alert nearby emergency services</p>
        </div>

        {/* Emergency Button */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 40 }}>
          <button className="emergency-btn" onClick={triggerAccident} disabled={loading || !location}>
            <span className="btn-icon">🆘</span>
            <span style={{ fontSize: 16 }}>{loading ? 'SENDING...' : 'SOS'}</span>
            <span style={{ fontSize: 11, opacity: 0.8 }}>EMERGENCY</span>
          </button>
        </div>

        {/* Options */}
        <div className="card">
          <h3 style={{ marginBottom: 16 }}>⚙️ Incident Details (Optional)</h3>
          <div className="form-group">
            <label className="form-label">Severity Level</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {['low','medium','high','critical'].map(s => (
                <button key={s} onClick={() => setSeverity(s)}
                  className={`btn btn-sm ${severity === s ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ flex: 1, textTransform: 'capitalize' }}>
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div className="form-grid-2">
            <div className="form-group">
              <label className="form-label">Speed at Impact (km/h)</label>
              <input className="form-input" type="number" value={speed} onChange={e => setSpeed(e.target.value)} placeholder="0" />
            </div>
            <div className="form-group">
              <label className="form-label">Location</label>
              <input className="form-input" value={location ? `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}` : 'Getting...'} readOnly style={{ color: 'var(--green-400)' }} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Description</label>
            <textarea className="form-textarea" value={description} onChange={e => setDescription(e.target.value)} placeholder="Describe what happened..." />
          </div>
        </div>

        {/* Info */}
        <div style={{ marginTop: 20, padding: 16, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)', borderRadius: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>🚀 What happens when you press SOS?</div>
          <ul style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 2, paddingLeft: 16 }}>
            <li>Your emergency contacts are notified instantly</li>
            <li><strong>Phase 1 (0-30s):</strong> All services within 8km are alerted</li>
            <li><strong>Phase 2 (30s+):</strong> Search expands to 25km if no response</li>
            <li>Your vehicle & blood group info is shared with responders</li>
            <li>Your linked insurance company is automatically notified</li>
          </ul>
        </div>
      </div>
    </Layout>
  );
}
