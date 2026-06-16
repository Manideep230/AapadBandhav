import React, { useState, useEffect, useRef, useCallback } from 'react';
import Layout from '../../components/Layout';
import API from '../../api/axios';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { getSocket } from '../../api/socket';
import { useSocketEvent, useAccidentWatch } from '../../hooks/useSocket';
import { useAuth } from '../../context/AuthContext';
import { 
  SirenIcon, CpuIcon, MapIcon, BriefcaseIcon, UserIcon, EditIcon, 
  ShareIcon, DownloadIcon, TrashIcon, CheckIcon, InfoIcon, CameraIcon, 
  ClockIcon, WifiIcon, HospitalIcon, CarIcon, ShieldIcon, WrenchIcon, FlameIcon 
} from '../../components/Icons';

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
  const [responders, setResponders] = useState({
    ambulance: null,
    police: null,
    hospital: null,
    mechanic: null,
    insurance: null
  });
  const timerRef = useRef(null);

  // Get user location
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => {
          // Fallback - Mumbai coords
          setLocation({ lat: 19.076 + (Math.random() - 0.5) * 0.02, lng: 72.8777 + (Math.random() - 0.5) * 0.02 });
          toast('Using backup location');
        }
      );
    } else {
      setLocation({ lat: 19.076, lng: 72.8777 });
    }
  }, []);

  // Register accident watch to join room and restore on reconnect
  useAccidentWatch(accident?.id);

  const handlePhase2 = useCallback(() => {
    setPhase(2);
    toast('Expanding search to 25km radius');
  }, []);

  const mapTypeToKey = (type) => {
    if (type === 'police_station' || type === 'policeman') return 'police';
    return type; // 'hospital', 'ambulance', 'mechanic', 'insurance'
  };

  const handleResponded = useCallback((data) => {
    if (data.action === 'accepted') {
      const key = mapTypeToKey(data.responderType);
      setResponders(prev => ({
        ...prev,
        [key]: {
          id: data.responderId,
          type: data.responderType,
          name: data.responderName || 'Responder',
          mobile: data.responderMobile || '',
          eta: data.etaMinutes || 0,
          distance: data.distanceKm || 0,
          lat: data.responderLocation?.lat || 0,
          lng: data.responderLocation?.lng || 0,
          status: 'Accepted'
        }
      }));
      toast.success(`${data.responderType.toUpperCase()} has accepted your SOS!`);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  }, []);

  const handleTracking = useCallback((data) => {
    const key = mapTypeToKey(data.responderType);
    setResponders(prev => {
      if (!prev[key]) return prev;
      return {
        ...prev,
        [key]: {
          ...prev[key],
          lat: data.latitude,
          lng: data.longitude,
          distance: data.distanceToDestKm,
          eta: data.etaMinutes,
          status: prev[key].status === 'Accepted' ? 'En Route' : prev[key].status
        }
      };
    });
  }, []);

  const handleStatusChange = useCallback((data) => {
    const key = mapTypeToKey(data.responderType);
    setResponders(prev => {
      if (!prev[key]) return prev;
      let status = prev[key].status;
      if (data.status === 'arrived') status = 'Reached';
      else if (data.status === 'resolved' || data.status === 'closed') status = 'Completed';
      else if (data.status === 'responded') status = 'En Route';
      return {
        ...prev,
        [key]: {
          ...prev[key],
          status
        }
      };
    });
  }, []);

  const handleResolved = useCallback((data) => {
    if (data?.accidentId === accident?.id) {
      toast.success('Emergency resolved successfully.');
      if (timerRef.current) clearInterval(timerRef.current);
      setTriggered(false);
      setAccident(null);
      setResponders({
        ambulance: null,
        police: null,
        hospital: null,
        mechanic: null,
        insurance: null
      });
      navigate('/dashboard');
    }
  }, [accident?.id, navigate]);

  const handleClosed = useCallback((data) => {
    if (data?.accidentId === accident?.id) {
      toast('Emergency cancelled/closed');
      if (timerRef.current) clearInterval(timerRef.current);
      setTriggered(false);
      setAccident(null);
      setResponders({
        ambulance: null,
        police: null,
        hospital: null,
        mechanic: null,
        insurance: null
      });
      navigate('/dashboard');
    }
  }, [accident?.id, navigate]);

  // Listen directly for responses, tracking, and status changes
  useSocketEvent(accident?.id ? `accident:${accident.id}:responded` : null, handleResponded);
  useSocketEvent(accident?.id ? `accident:${accident.id}:tracking` : null, handleTracking);
  useSocketEvent(accident?.id ? `accident:${accident.id}:status_change` : null, handleStatusChange);
  useSocketEvent('accident:phase2', handlePhase2);
  useSocketEvent('accident:resolved', handleResolved);
  useSocketEvent('accident:cancelled', handleClosed);
  useSocketEvent('accident:false_alarm', handleClosed);

  // Countdown timer after trigger
  useEffect(() => {
    const hasResponder = Object.values(responders).some(r => r !== null);
    if (triggered && !hasResponder) {
      timerRef.current = setInterval(() => {
        setCountdown(c => {
          if (c <= 1) { clearInterval(timerRef.current); return 0; }
          return c - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timerRef.current);
  }, [triggered, responders]);

  const triggerAccident = async () => {
    if (!location) return toast.error('Location not available');
    
    // Optimistic UI Update: transition to emergency active screen instantly
    const optimisticAccident = {
      id: 'optimistic-id-' + Math.random().toString(36).substring(2, 9),
      code: 'ACC-PENDING',
      severity,
      description,
      latitude: location.lat,
      longitude: location.lng,
      status: 'active',
    };
    setAccident(optimisticAccident);
    setTriggered(true);
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
      toast.success('Emergency dispatched. Help is on the way.');
    } catch (err) {
      const active = err.response?.status === 409 || err.response?.status === 200 ? (err.response?.data?.accident || err.data?.accident) : null;
      if (active?.id) {
        setAccident(active);
        toast.error('Active emergency already logged.');
        return;
      }
      // Revert if failed
      setTriggered(false);
      setAccident(null);
      toast.error(err.response?.data?.message || 'Failed to trigger accident');
    } finally {
      setLoading(false);
    }
  };

  const cancelAccident = async () => {
    if (!accident) return;
    try {
      await API.post(`/accidents/${accident.id}/cancel`);
      toast.success('Accident cancelled.');
      navigate('/dashboard');
    } catch (err) { toast.error('Failed to cancel'); }
  };

  const markFalseAlarm = async () => {
    if (!accident) return;
    try {
      await API.post(`/accidents/${accident.id}/false-alarm`);
      toast.success('Marked as false alarm.');
      navigate('/dashboard');
    } catch (err) { toast.error('Failed'); }
  };

  if (triggered && accident) {
    return (
      <Layout title="Emergency Active">
        <div style={{ maxWidth: 600, margin: '0 auto' }}>
          {/* Active Emergency Card */}
          <div className="bento-card" style={{ border: '1px solid var(--red-border)', textAlign: 'center', padding: 40, marginBottom: 20 }}>
            <div style={{ color: 'var(--red-primary)', display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
              <SirenIcon size={48} />
            </div>
            <h2 style={{ fontSize: 22, color: 'var(--red-primary)', marginBottom: 8, fontWeight: 700 }}>EMERGENCY ACTIVE</h2>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 15, color: 'var(--cyan-primary)', marginBottom: 16 }}>{accident.code}</div>

            {Object.values(responders).some(r => r !== null) ? (
              <div style={{ marginBottom: 20 }}>
                <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12, textAlign: 'left', color: 'var(--text-primary)' }}>Assigned Responders</h3>
                {Object.entries(responders).map(([role, r]) => {
                  if (!r) return null;
                  return (
                    <div key={role} className="bento-card" style={{ padding: 16, marginBottom: 12, border: '1px solid var(--border)', textAlign: 'left' }}>
                      <div className="flex-between mb-8">
                        <span style={{ fontWeight: 700, textTransform: 'capitalize', color: 'var(--cyan-primary)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          {role === 'ambulance' && <CarIcon size={14} />}
                          {role === 'hospital' && <HospitalIcon size={14} />}
                          {role === 'police' && <ShieldIcon size={14} />}
                          {role === 'mechanic' && <WrenchIcon size={14} />}
                          {role === 'insurance' && <BriefcaseIcon size={14} />}
                          {role}
                        </span>
                        <span className={`badge badge-${r.status === 'Completed' ? 'green' : r.status === 'Reached' ? 'cyan' : r.status === 'En Route' ? 'blue' : 'amber'}`}>
                          {r.status}
                        </span>
                      </div>
                      
                      <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>{r.name}</div>
                      {r.mobile && (
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>
                          Contact: <a href={`tel:${r.mobile}`} style={{ color: 'var(--link)', textDecoration: 'underline' }}>{r.mobile}</a>
                        </div>
                      )}
                      
                      <div className="flex-between text-xs text-muted" style={{ background: 'var(--bg-secondary)', padding: '6px 10px', borderRadius: 6 }}>
                        <span>Distance: {r.distance ? `${r.distance} km` : 'Calculating...'}</span>
                        <span>ETA: {r.eta ? `${r.eta} mins` : 'Calculating...'}</span>
                      </div>

                      {/* Live Timeline Tracker */}
                      <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', position: 'relative' }}>
                        <div style={{ position: 'absolute', top: 6, left: 10, right: 10, height: 2, background: 'var(--border)', zIndex: 1 }} />
                        {['Accepted', 'En Route', 'Reached', 'Completed'].map((s, index) => {
                          const states = ['Accepted', 'En Route', 'Reached', 'Completed'];
                          const activeIndex = states.indexOf(r.status);
                          const isDone = index <= activeIndex;
                          const isCurrent = index === activeIndex;
                          return (
                            <div key={s} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 2, flex: 1 }}>
                              <div style={{
                                width: 14,
                                height: 14,
                                borderRadius: '50%',
                                background: isDone ? 'var(--cyan-primary)' : 'var(--bg-card)',
                                border: `2px solid ${isDone ? 'var(--cyan-primary)' : 'var(--border)'}`,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                boxShadow: isCurrent ? '0 0 8px var(--cyan-primary)' : 'none'
                              }} />
                              <span style={{ fontSize: 9, marginTop: 4, fontWeight: isCurrent ? 700 : 500, color: isCurrent ? 'var(--cyan-primary)' : 'var(--text-muted)' }}>{s}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 40, fontWeight: 800, color: phase === 2 ? 'var(--amber-primary)' : 'var(--red-primary)', fontFamily: 'var(--font-mono)' }}>{countdown}s</div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
                  Phase {phase} — {phase === 1 ? '8km' : '25km'} radius dispatch
                </div>
                <div style={{ marginTop: 12 }}>
                  <div style={{ background: 'var(--border)', borderRadius: 4, height: 6, overflow: 'hidden' }}>
                    <div style={{ height: '100%', background: 'var(--red-primary)', width: `${(countdown / 30) * 100}%`, transition: 'width 1s linear', borderRadius: 4 }} />
                  </div>
                </div>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 20, textAlign: 'left' }}>
              <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>LOCATION</div>
                <div style={{ fontSize: 12, fontFamily: 'var(--font-mono)', marginTop: 4 }}>{location?.lat?.toFixed(4)}, {location?.lng?.toFixed(4)}</div>
              </div>
              <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>SEVERITY</div>
                <div style={{ fontSize: 12, textTransform: 'uppercase', color: 'var(--red-primary)', fontWeight: 700, marginTop: 4 }}>{severity}</div>
              </div>
              <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>BLOOD GROUP</div>
                <div style={{ fontSize: 12, color: 'var(--amber-primary)', fontWeight: 700, marginTop: 4 }}>{user?.blood_group}</div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-secondary" style={{ flex: 1 }} onClick={markFalseAlarm}>False Alarm</button>
              <button className="btn btn-danger" style={{ flex: 1 }} onClick={cancelAccident}>Cancel Emergency</button>
            </div>
          </div>

          {/* Dispatch Status */}
          <div className="bento-card">
            <h3 style={{ marginBottom: 16, fontSize: 15, fontWeight: 600 }}>Dispatch Pipeline</h3>
            {[
              { icon: <UserIcon size={14} />, label: 'Emergency Contacts', status: 'notified', color: 'green' },
              { icon: <HospitalIcon size={14} />, label: 'Nearest Hospitals', status: phase >= 1 ? 'alerted' : 'pending', color: 'blue' },
              { icon: <CarIcon size={14} />, label: 'Ambulance Drivers', status: phase >= 1 ? 'alerted' : 'pending', color: 'blue' },
              { icon: <ShieldIcon size={14} />, label: 'Police', status: phase >= 1 ? 'alerted' : 'pending', color: 'purple' },
              { icon: <WrenchIcon size={14} />, label: 'Mechanics', status: phase >= 1 ? 'alerted' : 'pending', color: 'amber' },
              { icon: <BriefcaseIcon size={14} />, label: 'Insurance Company', status: phase >= 1 ? 'alerted' : 'pending', color: 'cyan' },
            ].map(item => (
              <div key={item.label} className="flex-between" style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <span style={{ color: 'var(--text-muted)' }}>{item.icon}</span>
                  <span style={{ fontSize: 13.5 }}>{item.label}</span>
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
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <h1 style={{ fontSize: 24, marginBottom: 8, fontWeight: 700 }}>Emergency Trigger</h1>
          <p className="text-muted text-sm">Press the button below to immediately alert nearby emergency services</p>
        </div>

        {/* Emergency Button */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 32 }}>
          <button className="emergency-btn" onClick={triggerAccident} disabled={loading || !location}>
            <SirenIcon size={32} />
            <span style={{ fontSize: 16 }}>{loading ? 'SENDING...' : 'SOS'}</span>
            <span style={{ fontSize: 10, opacity: 0.8, letterSpacing: 0.5 }}>EMERGENCY</span>
          </button>
        </div>

        {/* Options */}
        <div className="bento-card">
          <h3 style={{ marginBottom: 16, fontSize: 15, fontWeight: 600 }}>Incident Details (Optional)</h3>
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
              <input className="form-input" value={location ? `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}` : 'Getting...'} readOnly style={{ color: 'var(--green-primary)', fontFamily: 'var(--font-mono)' }} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Description</label>
            <textarea className="form-textarea" value={description} onChange={e => setDescription(e.target.value)} placeholder="Describe what happened..." />
          </div>
        </div>

        {/* Info */}
        <div style={{ marginTop: 20, padding: 16, background: 'var(--red-bg)', border: '1px solid var(--red-border)', borderRadius: 12 }}>
          <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 14 }}>What happens when you press SOS?</div>
          <ul style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.8, paddingLeft: 16 }}>
            <li>Your emergency contacts are notified instantly.</li>
            <li><strong>Phase 1 (0-30s):</strong> All services within 8km are alerted.</li>
            <li><strong>Phase 2 (30s+):</strong> Search expands to 25km if no response.</li>
            <li>Your vehicle & blood group info is shared with responders.</li>
            <li>Your linked insurance company is automatically notified.</li>
          </ul>
        </div>
      </div>
    </Layout>
  );
}
