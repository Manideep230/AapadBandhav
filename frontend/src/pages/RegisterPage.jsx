import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import API from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { SirenIcon } from '../components/Icons';

export default function RegisterPage() {
  const { login, settings } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Read pre-filled state from Login Page redirect (if any)
  const preFilledMobile = location.state?.mobile || '';
  const preFilledOtp = location.state?.otp || '';

  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    full_name: '',
    email: '',
    mobile: preFilledMobile,
    age: '',
    gender: 'Male',
    blood_group: 'O+',
    address: '',
    otp: preFilledOtp
  });

  const [otpSent, setOtpSent] = useState(!!preFilledOtp);
  const [timer, setTimer] = useState(0);
  const timerRef = useRef(null);

  useEffect(() => {
    if (timer > 0) {
      timerRef.current = setTimeout(() => setTimer(prev => prev - 1), 1000);
    } else {
      clearTimeout(timerRef.current);
    }
    return () => clearTimeout(timerRef.current);
  }, [timer]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // Send Verification OTP
  const handleSendOtp = async () => {
    if (!form.mobile || form.mobile.length < 10) {
      return toast.error('Please enter a valid 10-digit mobile number');
    }
    setLoading(true);
    try {
      const res = await API.post('/auth/otp/send', { mobile: form.mobile });
      setOtpSent(true);
      setTimer(30);
      toast.success('Verification code sent.');
      if (res.data.otp) {
        toast(`[DEV MODE] Generated OTP: ${res.data.otp}`, { icon: '🔑', duration: 8000 });
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to send verification code.');
    } finally {
      setLoading(false);
    }
  };

  // Submit Registration Form
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.full_name || !form.mobile || !form.otp) {
      return toast.error('Please fill in Name, Mobile, and verification code');
    }
    setLoading(true);
    try {
      const payload = {
        full_name: form.full_name,
        mobile: form.mobile,
        otp: form.otp,
        email: form.email || null,
        age: form.age ? Number(form.age) : null,
        gender: form.gender,
        blood_group: form.blood_group,
        address: form.address || null
      };

      const res = await API.post('/auth/otp/register', payload);
      login(res.data.user, res.data.token, 'user');
      toast.success(`Welcome to ${settings?.appName || 'AapadBandhav'}, ${res.data.user.full_name}!`);
      navigate('/dashboard');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page" style={{ alignItems: 'flex-start', paddingTop: 40 }}>
      <div className="auth-card" style={{ maxWidth: 560 }}>
        <div className="auth-logo">
          {settings?.logoUrl ? (
            <img src={settings.logoUrl} alt="Logo" style={{ width: 48, height: 48, objectFit: 'contain', marginBottom: 12, borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }} />
          ) : (
            <div className="auth-logo-icon">
              <SirenIcon size={24} />
            </div>
          )}
          <div className="auth-title">Create Account</div>
          <div className="auth-subtitle">Join {settings?.appName || 'AapadBandhav'} — Emergency Response Network</div>
        </div>

        {preFilledOtp && (
          <div className="card" style={{ background: 'var(--green-bg)', borderColor: 'var(--green-border)', marginBottom: 20, padding: 12, borderRadius: 8, fontSize: 13, color: 'var(--green-primary)', fontWeight: 600 }}>
            Mobile number verified. Complete your profile details below to finish registration.
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-grid-2">
            <div className="form-group">
              <label className="form-label" htmlFor="register-fullname">Full Name *</label>
              <input 
                id="register-fullname"
                name="full_name"
                className="form-input" 
                value={form.full_name} 
                onChange={e => set('full_name', e.target.value)} 
                placeholder="Rahul Sharma" 
                required 
              />
            </div>
            
            <div className="form-group">
              <label className="form-label" htmlFor="register-email">Email Address (Optional)</label>
              <input 
                id="register-email"
                name="email"
                className="form-input" 
                type="email" 
                value={form.email} 
                onChange={e => set('email', e.target.value)} 
                placeholder="rahul@email.com" 
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="register-mobile">Mobile Number *</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input 
                  id="register-mobile"
                  name="mobile"
                  className="form-input" 
                  value={form.mobile} 
                  onChange={e => set('mobile', e.target.value.replace(/\D/g, '').slice(0, 10))} 
                  placeholder="9876543210" 
                  disabled={!!preFilledMobile || otpSent}
                  required
                  style={{ flex: 1 }}
                />
                {!preFilledMobile && !otpSent && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={handleSendOtp}
                    disabled={loading || form.mobile.length < 10}
                    style={{ whiteSpace: 'nowrap' }}
                  >
                    Send OTP
                  </button>
                )}
                {!preFilledMobile && otpSent && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => { setOtpSent(false); set('otp', ''); }}
                  >
                    Change
                  </button>
                )}
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="register-otp">Verification OTP *</label>
              <input 
                id="register-otp"
                name="otp"
                className="form-input" 
                value={form.otp} 
                onChange={e => set('otp', e.target.value.replace(/\D/g, '').slice(0, 6))} 
                placeholder="6-digit OTP code" 
                maxLength={6}
                disabled={!!preFilledOtp}
                required 
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="register-age">Age</label>
              <input 
                id="register-age"
                name="age"
                className="form-input" 
                type="number" 
                value={form.age} 
                onChange={e => set('age', e.target.value)} 
                placeholder="25" 
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="register-gender">Gender</label>
              <select id="register-gender" name="gender" className="form-select" value={form.gender} onChange={e => set('gender', e.target.value)}>
                {['Male', 'Female', 'Other', 'Prefer not to say'].map(g => <option key={g}>{g}</option>)}
              </select>
            </div>

            <div className="form-group" style={{ gridColumn: 'span 2' }}>
              <label className="form-label" htmlFor="register-bloodgroup">Blood Group</label>
              <select id="register-bloodgroup" name="blood_group" className="form-select" value={form.blood_group} onChange={e => set('blood_group', e.target.value)}>
                {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'Unknown'].map(b => <option key={b}>{b}</option>)}
              </select>
            </div>
          </div>

          <div className="form-group" style={{ marginTop: 12 }}>
            <label className="form-label" htmlFor="register-address">Address</label>
            <textarea 
              id="register-address"
              name="address"
              className="form-textarea" 
              value={form.address} 
              onChange={e => set('address', e.target.value)} 
              placeholder="Enter your residence details" 
              rows={2}
            />
          </div>

          <div style={{ marginTop: 20 }}>
            <button type="submit" className="btn btn-primary w-full" disabled={loading}>
              {loading ? <><span className="spinner" /> Creating Account...</> : 'Complete Registration'}
            </button>
          </div>
        </form>

        {!preFilledMobile && otpSent && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, marginTop: 12 }}>
            <span className="text-muted">Didn't receive code?</span>
            <button
              type="button"
              className="btn btn-ghost btn-xs"
              onClick={handleSendOtp}
              disabled={timer > 0}
              style={{ color: timer > 0 ? 'var(--text-muted)' : 'var(--cyan-primary)', border: 'none', padding: 0 }}
            >
              {timer > 0 ? `Resend in ${timer}s` : 'Resend OTP'}
            </button>
          </div>
        )}

        <p style={{ textAlign: 'center', marginTop: 24, fontSize: 13, color: 'var(--text-muted)' }}>
          Already have an account? <Link to="/login" style={{ color: 'var(--red-primary)', fontWeight: 600 }}>Sign in</Link>
        </p>
      </div>
    </div>
  );
}
