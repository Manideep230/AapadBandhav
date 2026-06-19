import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import API from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { KeyIcon, SirenIcon } from '../components/Icons';

const roleLabels = {
  user: 'Citizen / User',
  volunteer: 'Ranger',
  fire_department: 'Fire Department',
  policeman: 'Police Officer',
  police_station: 'Police Station Admin',
  ambulance: 'Ambulance Driver',
  hospital: 'Hospital Admin',
  mechanic: 'Mechanic',
  insurance: 'Insurance Provider',
  admin: 'Administrator'
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

  const { login, settings }   = useAuth();
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
      toast.success('Verification code sent to your mobile.');
      if (res.data.otp) {
        setDevOtp(res.data.otp);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to send verification code.');
    } finally {
      setLoading(false);
    }
  };

  // Verify OTP and sign in
  const handleVerifyOtp = async (preferredRole = null) => {
    if (!mobile || !otp || otp.length < 6) {
      return toast.error('Please enter the 6-digit verification code');
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
        toast('New mobile number. Redirecting to registration...');
        navigate('/register', { state: { mobile, otp } });
        return;
      }

      const entityType = res.data.entityType || 'user';
      const dataKey    = roleDataKey[entityType] || 'user';
      const entityData = res.data[dataKey] || res.data.user;

      login(entityData, res.data.token, entityType);
      setDevOtp(null);
      setShowRoleModal(false);
      toast.success('Access granted.');
      navigate(roleDashboard[entityType] || '/dashboard');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Invalid or expired code. Please try again.');
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
            background: 'var(--bg-card)',
            border: '1px solid var(--border-hover)',
            borderRadius: 12,
            padding: '12px 16px',
            cursor: 'pointer',
            boxShadow: 'var(--shadow-card)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            userSelect: 'none',
            transition: 'var(--transition)',
          }}
        >
          <div style={{ color: 'var(--cyan-primary)' }}>
            <KeyIcon size={20} />
          </div>
          <div>
            <div style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 2 }}>
              DEV MODE — OTP
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: 4, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
              {devOtp}
            </div>
            <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>
              Click to auto-fill
            </div>
          </div>
        </div>
      )}

      {/* Role Selection Modal */}
      {showRoleModal && (
        <div className="modal-overlay">
          <div className="modal" style={{ textAlign: 'center' }}>
            <h3 className="modal-title">Choose Your Role</h3>
            <p className="text-secondary text-sm" style={{ marginBottom: 24 }}>
              This mobile number is linked to multiple roles. Please select which dashboard you would like to open.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {rolesList.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => handleVerifyOtp(r)}
                  className="btn btn-secondary"
                  style={{
                    padding: '14px 20px',
                    width: '100%',
                    justifyContent: 'space-between',
                  }}
                >
                  <span>{roleLabels[r] || r}</span>
                  <span>&rarr;</span>
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowRoleModal(false)}
              className="btn btn-secondary w-full"
              style={{ marginTop: 20 }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Login Card */}
      <div className="auth-container">
        <style>{`
          .auth-container {
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 40px 20px;
            position: relative;
            overflow: hidden;
            font-family: 'Outfit', 'Inter', sans-serif;
          }
          .glow-accent {
            position: absolute;
            width: 50vw;
            height: 50vh;
            filter: blur(140px);
            opacity: 0.15;
            pointer-events: none;
            z-index: -1;
            border-radius: 50%;
          }
          .animate-pulse-light {
            animation: pulse-glow 3s infinite ease-in-out;
          }
          @keyframes pulse-glow {
            0%, 100% { opacity: 0.15; transform: scale(1); }
            50% { opacity: 0.25; transform: scale(1.1); }
          }
          .glass-auth-card {
            background: rgba(9, 7, 20, 0.45);
            border: 1px solid rgba(168, 85, 247, 0.08);
            backdrop-filter: blur(30px) saturate(210%);
            -webkit-backdrop-filter: blur(30px) saturate(210%);
            box-shadow: 0 24px 64px -12px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.03);
            border-radius: 24px;
            padding: 40px;
            width: 100%;
            max-width: 420px;
            transition: all 0.5s cubic-bezier(0.16, 1, 0.3, 1);
          }
          .auth-logo {
            text-align: center;
            margin-bottom: 28px;
            display: flex;
            flex-direction: column;
            align-items: center;
          }
          .auth-logo-icon {
            width: 48px;
            height: 48px;
            background: var(--grad-control);
            border-radius: 12px;
            box-shadow: 0 4px 16px rgba(168, 85, 247, 0.45);
            display: flex;
            align-items: center;
            justify-content: center;
            color: #fff;
            margin-bottom: 12px;
          }
          .auth-title {
            font-size: 24px;
            font-weight: 800;
            letter-spacing: -0.03em;
            color: #fff;
            margin-bottom: 4px;
          }
          .auth-subtitle {
            font-size: 13px;
            color: var(--text-secondary);
            font-weight: 500;
          }
        `}</style>

        {/* Decorative Blur Orbs */}
        <div className="glow-accent animate-pulse-light" style={{ top: '-10%', left: '-10%', background: 'radial-gradient(circle, rgba(168, 85, 247, 0.4) 0%, transparent 70%)' }}></div>
        <div className="glow-accent animate-pulse-light" style={{ bottom: '-10%', right: '-10%', background: 'radial-gradient(circle, rgba(99, 102, 241, 0.35) 0%, transparent 70%)', animationDelay: '-1.5s' }}></div>

        <div className="glass-auth-card">
          <div className="auth-logo">
            {settings?.logoUrl ? (
              <img src={settings.logoUrl} alt="Logo" style={{ width: 48, height: 48, objectFit: 'contain', marginBottom: 12, borderRadius: 'var(--radius-md)', border: '1px solid rgba(255, 255, 255, 0.08)' }} />
            ) : (
              <div className="auth-logo-icon">
                <SirenIcon size={24} />
              </div>
            )}
            <div className="auth-title">{settings?.appName || 'AapadBandhav'}</div>
            <div className="auth-subtitle">Unified Emergency Response Portal</div>
          </div>

          <form onSubmit={handleFormSubmit}>
            {/* Mobile Input */}
            <div className="form-group">
              <label className="form-label" htmlFor="login-mobile">Mobile Number</label>
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
                  autoFocus={!otpSent}
                  style={{ flex: 1 }}
                />
                {otpSent && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => { setOtpSent(false); setOtp(''); setTimer(0); setDevOtp(null); }}
                    style={{ fontSize: 12, padding: '0 16px' }}
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
                style={{ marginTop: 8 }}
              >
                {loading ? <><span className="spinner" /> Sending OTP...</> : 'Send OTP'}
              </button>
            ) : (
              <div className="animate-fade">
                <div className="form-group" style={{ marginBottom: 20 }}>
                  <label className="form-label" htmlFor="login-otp">Enter 6-Digit OTP</label>
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
                      letterSpacing: 10,
                      fontSize: 20,
                      textAlign: 'center',
                      fontFamily: 'var(--font-mono)'
                    }}
                    maxLength={6}
                    autoFocus
                  />
                </div>

                <button
                  type="submit"
                  className="btn btn-primary w-full"
                  style={{ marginBottom: 16 }}
                  disabled={loading || otp.length < 6}
                >
                  {loading ? <><span className="spinner" /> Verifying...</> : 'Verify & Sign In'}
                </button>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
                  <span className="text-muted">Didn't receive code?</span>
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs"
                    onClick={handleSendOtp}
                    disabled={timer > 0 || loading}
                    style={{ color: timer > 0 ? 'var(--text-muted)' : 'var(--cyan-primary)', padding: 0 }}
                  >
                    {timer > 0 ? `Resend in ${timer}s` : 'Resend OTP'}
                  </button>
                </div>
              </div>
            )}
          </form>

          <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', marginTop: 24, paddingTop: 20, textAlign: 'center' }}>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
              New user?{' '}
              <Link to="/register" style={{ color: 'var(--cyan-primary)', fontWeight: 600 }}>Register as Citizen</Link>
            </p>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 12, lineHeight: 1.4 }}>
              Service responder accounts are registered by organization managers.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
