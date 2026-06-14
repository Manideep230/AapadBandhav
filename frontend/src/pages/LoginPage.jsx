import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import API from '../api/axios';
import { useAuth } from '../context/AuthContext';

const roleLabels = {
  user: '👤 Citizen / User',
  volunteer: '🤝 AB Volunteer',
  fire_department: '🔥 Fire Department',
  policeman: '👮 Police Officer',
  police_station: '🚔 Police Station Admin',
  ambulance: '🚑 Ambulance Driver',
  hospital: '🏥 Hospital Admin',
  mechanic: '🔧 Mechanic',
  insurance: '🛡️ Insurance Provider',
  admin: '👑 Administrator'
};

const roleDataKey = {
  user: 'user',
  admin: 'user',
  hospital: 'hospital',
  ambulance: 'driver',
  police_station: 'station',
  policeman: 'policeman',
  mechanic: 'mechanic',
  insurance: 'company',
  volunteer: 'user',
  fire_department: 'user'
};

const roleDashboard = {
  user: '/dashboard',
  admin: '/admin',
  hospital: '/hospital',
  ambulance: '/ambulance',
  police_station: '/police',
  policeman: '/police',
  mechanic: '/mechanic',
  insurance: '/insurance',
  volunteer: '/volunteer',
  fire_department: '/fire'
};

export default function LoginPage() {
  const [mobile, setMobile]     = useState('');
  const [otp, setOtp]           = useState('');
  const [otpSent, setOtpSent]   = useState(false);
  const [loading, setLoading]   = useState(false);
  const [timer, setTimer]       = useState(0);
  const [devOtp, setDevOtp]     = useState(null); // DEV: store OTP for display
  const [rolesList, setRolesList] = useState([]);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const timerRef                = useRef(null);

  const { login }   = useAuth();
  const navigate    = useNavigate();

  // Countdown for OTP resend rate-limit
  useEffect(() => {
    if (timer > 0) {
      timerRef.current = setTimeout(() => setTimer(prev => prev - 1), 1000);
    } else {
      clearTimeout(timerRef.current);
    }
    return () => clearTimeout(timerRef.current);
  }, [timer]);

  // Send OTP
  const handleSendOtp = async () => {
    if (!mobile || mobile.length < 10) {
      return toast.error('Please enter a valid 10-digit mobile number');
    }
    setLoading(true);
    try {
      const res = await API.post('/auth/otp/send', { mobile });
      setOtpSent(true);
      setTimer(30);
      toast.success('OTP sent to your mobile!');
      if (res.data.otp) {
        setDevOtp(res.data.otp);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to send OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Verify OTP and sign in
  const handleVerifyOtp = async (preferredRole = null) => {
    if (!mobile || !otp || otp.length < 6) {
      return toast.error('Please enter the 6-digit OTP');
    }
    setLoading(true);
    try {
      const payload = { mobile, otp };
      if (preferredRole) {
        payload.role = preferredRole;
      }
      
      const res = await API.post('/auth/otp/verify', payload);

      if (res.data.needs_role_selection) {
        setRolesList(res.data.roles || []);
        setShowRoleModal(true);
        return;
      }

      if (res.data.is_new_user) {
        toast('Mobile not registered. Redirecting to registration…', { icon: '📝' });
        navigate('/register', { state: { mobile, otp } });
        return;
      }

      const entityType = res.data.entityType || 'user';
      const dataKey    = roleDataKey[entityType] || 'user';
      const entityData = res.data[dataKey] || res.data.user;

      login(entityData, res.data.token, entityType);
      setDevOtp(null);
      setShowRoleModal(false);
      toast.success('Logged in successfully!');
      navigate(roleDashboard[entityType] || '/dashboard');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Invalid or expired OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleFormSubmit = (e) => {
    e.preventDefault();
    if (!otpSent) {
      handleSendOtp();
    } else {
      handleVerifyOtp();
    }
  };

  return (
    <>
      {/* DEV OTP Badge */}
      {devOtp && (
        <div
          onClick={() => { setOtp(devOtp); }}
          title="Click to auto-fill OTP"
          style={{
            position: 'fixed',
            top: 16,
            left: 16,
            zIndex: 9999,
            background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
            border: '1.5px solid rgba(99,179,237,0.4)',
            borderRadius: 12,
            padding: '10px 16px',
            cursor: 'pointer',
            boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            userSelect: 'none',
            transition: 'all 0.2s',
          }}
        >
          <div style={{ fontSize: 18 }}>🔑</div>
          <div>
            <div style={{ fontSize: 10, color: '#63b3ed', fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 2 }}>
              DEV MODE — OTP
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: 6, color: '#fff', fontFamily: 'monospace' }}>
              {devOtp}
            </div>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
              Click to auto-fill
            </div>
          </div>
        </div>
      )}

      {/* Role Selection Modal */}
      {showRoleModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.85)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 10000,
          backdropFilter: 'blur(8px)'
        }}>
          <div style={{
            background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: 16,
            padding: 32,
            maxWidth: 440,
            width: '90%',
            boxShadow: '0 10px 40px rgba(0,0,0,0.6)',
            textAlign: 'center'
          }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: 22, color: '#f8fafc', fontWeight: 700 }}>Choose Your Role</h3>
            <p style={{ margin: '0 0 24px 0', fontSize: 14, color: '#94a3b8' }}>
              This mobile number is linked to multiple roles. Please select which dashboard you would like to open.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {rolesList.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => handleVerifyOtp(r)}
                  className="btn btn-primary"
                  style={{
                    padding: '14px 20px',
                    fontSize: 15,
                    fontWeight: 600,
                    textAlign: 'left',
                    borderRadius: 12,
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    color: '#f8fafc',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                    e.currentTarget.style.borderColor = 'var(--cyan-400)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                  }}
                >
                  <span>{roleLabels[r] || r}</span>
                  <span style={{ fontSize: 18 }}>➔</span>
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowRoleModal(false)}
              className="btn btn-secondary"
              style={{
                marginTop: 24,
                width: '100%',
                padding: '12px 20px',
                borderRadius: 12,
                cursor: 'pointer'
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Login Card */}
      <div className="auth-page" style={{ background: 'radial-gradient(circle at center, #0f172a 0%, #020617 100%)' }}>
        <div className="auth-card" style={{
          background: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(16px)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
          borderRadius: 20,
          padding: '40px 32px'
        }}>
          <div className="auth-logo" style={{ marginBottom: 32 }}>
            <div className="auth-logo-icon" style={{
              background: 'linear-gradient(135deg, var(--red-500) 0%, #b91c1c 100%)',
              boxShadow: '0 0 20px rgba(239, 68, 68, 0.4)',
              width: 64,
              height: 64,
              fontSize: 20,
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '50%',
              margin: '0 auto 16px auto',
              color: '#fff'
            }}>SOS</div>
            <div className="auth-title" style={{ fontSize: 26, fontWeight: 800, color: '#f8fafc', letterSpacing: -0.5 }}>AapadBandhav</div>
            <div className="auth-subtitle" style={{ fontSize: 14, color: '#94a3b8', marginTop: 6 }}>Unified Emergency Response Portal</div>
          </div>

          <form onSubmit={handleFormSubmit}>
            {/* Mobile Input */}
            <div className="form-group" style={{ marginBottom: 20 }}>
              <label className="form-label" htmlFor="login-mobile" style={{ color: '#94a3b8', fontSize: 13, fontWeight: 500, marginBottom: 8, display: 'block' }}>Mobile Number</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  id="login-mobile"
                  name="mobile"
                  className="form-input"
                  type="tel"
                  value={mobile}
                  onChange={e => setMobile(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  placeholder="Enter 10-digit mobile number"
                  disabled={otpSent}
                  style={{
                    flex: 1,
                    background: 'rgba(2, 6, 23, 0.5)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 10,
                    padding: '12px 16px',
                    color: '#f8fafc',
                    fontSize: 15
                  }}
                  autoFocus={!otpSent}
                />
                {otpSent && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => { setOtpSent(false); setOtp(''); setTimer(0); setDevOtp(null); }}
                    style={{ fontSize: 13, whiteSpace: 'nowrap', borderRadius: 10 }}
                  >
                    Change
                  </button>
                )}
              </div>
            </div>

            {/* Send OTP / Enter OTP button */}
            {!otpSent ? (
              <button
                type="submit"
                className="btn btn-primary w-full"
                disabled={loading || !mobile || mobile.length < 10}
                style={{
                  marginTop: 8,
                  padding: '14px 20px',
                  borderRadius: 10,
                  fontSize: 15,
                  fontWeight: 600,
                  background: 'linear-gradient(135deg, var(--cyan-500) 0%, var(--cyan-700) 100%)',
                  border: 'none',
                  color: '#fff',
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(6, 182, 212, 0.2)'
                }}
              >
                {loading ? <><span className="spinner" /> Sending OTP…</> : '📲 Send OTP'}
              </button>
            ) : (
              <div className="animate-fade">
                <div className="form-group" style={{ marginBottom: 24 }}>
                  <label className="form-label" htmlFor="login-otp" style={{ color: '#94a3b8', fontSize: 13, fontWeight: 500, marginBottom: 8, display: 'block' }}>Enter 6-Digit OTP</label>
                  <input
                    id="login-otp"
                    name="otp"
                    className="form-input"
                    type="text"
                    inputMode="numeric"
                    value={otp}
                    onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="------"
                    style={{
                      letterSpacing: 12,
                      fontSize: 24,
                      textAlign: 'center',
                      fontFamily: 'monospace',
                      background: 'rgba(2, 6, 23, 0.5)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: 10,
                      padding: '12px 16px',
                      color: '#f8fafc'
                    }}
                    maxLength={6}
                    autoFocus
                  />
                </div>

                <button
                  type="submit"
                  className="btn btn-primary w-full"
                  style={{
                    marginBottom: 16,
                    padding: '14px 20px',
                    borderRadius: 10,
                    fontSize: 15,
                    fontWeight: 600,
                    background: 'linear-gradient(135deg, var(--red-500) 0%, var(--red-700) 100%)',
                    border: 'none',
                    color: '#fff',
                    cursor: 'pointer',
                    boxShadow: '0 4px 12px rgba(239, 68, 68, 0.2)'
                  }}
                  disabled={loading || otp.length < 6}
                >
                  {loading ? <><span className="spinner" /> Verifying…</> : '🔑 Verify & Sign In'}
                </button>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, marginTop: 8 }}>
                  <span className="text-muted" style={{ color: '#64748b' }}>Didn't receive OTP?</span>
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs"
                    onClick={handleSendOtp}
                    disabled={timer > 0 || loading}
                    style={{ color: timer > 0 ? '#64748b' : 'var(--cyan-400)', border: 'none', padding: 0, background: 'none', cursor: 'pointer' }}
                  >
                    {timer > 0 ? `Resend in ${timer}s` : '🔄 Resend OTP'}
                  </button>
                </div>
              </div>
            )}
          </form>

          <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', marginTop: 32, paddingTop: 20, textAlign: 'center' }}>
            <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>
              New user?{' '}
              <Link to="/register" style={{ color: 'var(--cyan-400)', fontWeight: 600, textDecoration: 'none' }}>Register as Citizen</Link>
            </p>
            <p style={{ fontSize: 11, color: '#475569', marginTop: 12, margin: '12px 0 0 0' }}>
              Service responder accounts are registered by organization managers.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
