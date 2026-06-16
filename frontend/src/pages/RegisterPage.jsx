import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import API from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { SirenIcon, UserIcon, BriefcaseIcon } from '../components/Icons';

// ─── User Registration Sub-Form ───────────────────────────────────────────────
function UserRegisterForm({ settings }) {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

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
    otp: preFilledOtp,
    profile_photo: '',
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
        toast(`[DEV MODE] OTP: ${res.data.otp}`, { icon: '🔑', duration: 8000 });
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to send verification code.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.full_name || !form.mobile || !form.otp) {
      return toast.error('Please fill in Name, Mobile, and OTP');
    }
    setLoading(true);
    try {
      const res = await API.post('/auth/otp/register', {
        full_name: form.full_name,
        mobile: form.mobile,
        otp: form.otp,
        email: form.email || null,
        age: form.age ? Number(form.age) : null,
        gender: form.gender,
        blood_group: form.blood_group,
        address: form.address || null,
        profile_photo: form.profile_photo || null,
      });
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
    <form onSubmit={handleSubmit}>
      {preFilledOtp && (
        <div className="card" style={{ background: 'var(--green-bg)', borderColor: 'var(--green-border)', marginBottom: 20, padding: 12, borderRadius: 8, fontSize: 13, color: 'var(--green-primary)', fontWeight: 600 }}>
          Mobile number verified. Complete your profile below.
        </div>
      )}
      <div className="form-grid-2">
        <div className="form-group">
          <label className="form-label" htmlFor="reg-fullname">Full Name *</label>
          <input id="reg-fullname" name="full_name" className="form-input" value={form.full_name}
            onChange={e => set('full_name', e.target.value)} placeholder="Rahul Sharma" required />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="reg-email">Email (Optional)</label>
          <input id="reg-email" name="email" className="form-input" type="email" value={form.email}
            onChange={e => set('email', e.target.value)} placeholder="rahul@email.com" />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="reg-mobile">Mobile Number *</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input id="reg-mobile" name="mobile" className="form-input" value={form.mobile}
              onChange={e => set('mobile', e.target.value.replace(/\D/g, '').slice(0, 10))}
              placeholder="9876543210" disabled={!!preFilledMobile || otpSent} required style={{ flex: 1 }} />
            {!preFilledMobile && !otpSent && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={handleSendOtp}
                disabled={loading || form.mobile.length < 10} style={{ whiteSpace: 'nowrap' }}>
                Send OTP
              </button>
            )}
            {!preFilledMobile && otpSent && (
              <button type="button" className="btn btn-secondary btn-sm"
                onClick={() => { setOtpSent(false); set('otp', ''); }}>
                Change
              </button>
            )}
          </div>
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="reg-otp">Verification OTP *</label>
          <input id="reg-otp" name="otp" className="form-input" value={form.otp}
            onChange={e => set('otp', e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="6-digit OTP code" maxLength={6} disabled={!!preFilledOtp} required />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="reg-age">Age</label>
          <input id="reg-age" name="age" className="form-input" type="number" value={form.age}
            onChange={e => set('age', e.target.value)} placeholder="25" />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="reg-gender">Gender</label>
          <select id="reg-gender" name="gender" className="form-select" value={form.gender} onChange={e => set('gender', e.target.value)}>
            {['Male', 'Female', 'Other', 'Prefer not to say'].map(g => <option key={g}>{g}</option>)}
          </select>
        </div>
        <div className="form-group" style={{ gridColumn: 'span 2' }}>
          <label className="form-label" htmlFor="reg-bloodgroup">Blood Group</label>
          <select id="reg-bloodgroup" name="blood_group" className="form-select" value={form.blood_group} onChange={e => set('blood_group', e.target.value)}>
            {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'Unknown'].map(b => <option key={b}>{b}</option>)}
          </select>
        </div>
      </div>
      <div className="form-group" style={{ marginTop: 12 }}>
        <label className="form-label" htmlFor="reg-address">Address</label>
        <textarea id="reg-address" name="address" className="form-textarea" value={form.address}
          onChange={e => set('address', e.target.value)} placeholder="Enter your residence details" rows={2} />
      </div>
      <div className="form-group" style={{ marginTop: 12 }}>
        <label className="form-label" htmlFor="reg-profilephoto">Profile Picture (Optional)</label>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {form.profile_photo ? (
            <img src={form.profile_photo} style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover', border: '1px solid var(--border)' }} alt="Preview" />
          ) : (
            <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--bg-secondary)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
              <UserIcon size={18} />
            </div>
          )}
          <input id="reg-profilephoto" type="file" accept="image/*" className="form-input" style={{ padding: '6px 10px', flex: 1 }}
            onChange={e => {
              const file = e.target.files[0];
              if (file) {
                const reader = new FileReader();
                reader.onloadend = () => set('profile_photo', reader.result);
                reader.readAsDataURL(file);
              }
            }} />
          {form.profile_photo && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => set('profile_photo', '')}>Remove</button>
          )}
        </div>
      </div>
      <div style={{ marginTop: 20 }}>
        <button type="submit" className="btn btn-primary w-full" disabled={loading}>
          {loading ? <><span className="spinner" /> Creating Account...</> : 'Complete Registration'}
        </button>
      </div>
      {!preFilledMobile && otpSent && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, marginTop: 12 }}>
          <span className="text-muted">Didn't receive code?</span>
          <button type="button" className="btn btn-ghost btn-xs" onClick={handleSendOtp} disabled={timer > 0}
            style={{ color: timer > 0 ? 'var(--text-muted)' : 'var(--cyan-primary)', border: 'none', padding: 0 }}>
            {timer > 0 ? `Resend in ${timer}s` : 'Resend OTP'}
          </button>
        </div>
      )}
    </form>
  );
}

// ─── Main RegisterPage (role chooser + form) ─────────────────────────────────
export default function RegisterPage() {
  const { settings } = useAuth();
  const navigate = useNavigate();
  // 'choose' | 'user' | 'partner'
  const [mode, setMode] = useState('choose');

  return (
    <div className="auth-page" style={{ alignItems: 'flex-start', paddingTop: 40, paddingBottom: 40 }}>
      {/* Injected animation styles */}
      <style>{`
        @keyframes slideUpIn {
          from { opacity: 0; transform: translateY(24px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .reg-card-anim {
          animation: slideUpIn 0.35s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        .choice-tile {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 14px;
          padding: 28px 20px;
          border-radius: 16px;
          border: 1.5px solid rgba(255,255,255,0.06);
          background: rgba(255,255,255,0.02);
          cursor: pointer;
          transition: all 0.22s ease;
          text-align: center;
        }
        .choice-tile:hover {
          border-color: rgba(139,92,246,0.45);
          background: rgba(139,92,246,0.06);
          transform: translateY(-3px);
          box-shadow: 0 12px 32px rgba(139,92,246,0.15);
        }
        .choice-icon {
          width: 56px;
          height: 56px;
          border-radius: 14px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 24px;
        }
      `}</style>

      <div className="auth-card reg-card-anim" style={{ maxWidth: mode === 'user' ? 560 : 520 }}>

        {/* Logo */}
        <div className="auth-logo">
          {settings?.logoUrl ? (
            <img src={settings.logoUrl} alt="Logo" style={{ width: 48, height: 48, objectFit: 'contain', marginBottom: 12, borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }} />
          ) : (
            <div className="auth-logo-icon"><SirenIcon size={24} /></div>
          )}

          {mode === 'choose' && (
            <>
              <div className="auth-title">Join {settings?.appName || 'AapadBandhav'}</div>
              <div className="auth-subtitle">Select how you want to register</div>
            </>
          )}
          {mode === 'user' && (
            <>
              <div className="auth-title">Create Account</div>
              <div className="auth-subtitle">Join as a Citizen — Emergency Response Network</div>
            </>
          )}
          {mode === 'partner' && (
            <>
              <div className="auth-title">Partner Registration</div>
              <div className="auth-subtitle">Register your organization or service</div>
            </>
          )}
        </div>

        {/* ── Mode: Choose ── */}
        {mode === 'choose' && (
          <div style={{ display: 'flex', gap: 14, marginTop: 8 }}>
            <button
              id="register-as-user"
              className="choice-tile"
              onClick={() => setMode('user')}
              type="button"
            >
              <div className="choice-icon" style={{ background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.25)' }}>
                <UserIcon size={26} color="var(--blue-primary, #3b82f6)" />
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text-primary)', marginBottom: 4 }}>Register as User</div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  Citizen emergency access, accident reporting & device management
                </div>
              </div>
              <span className="badge badge-blue" style={{ fontSize: 11 }}>OTP Login</span>
            </button>

            <button
              id="register-as-partner"
              className="choice-tile"
              onClick={() => navigate('/register/partner')}
              type="button"
            >
              <div className="choice-icon" style={{ background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.25)' }}>
                <BriefcaseIcon size={26} color="var(--purple-primary, #8b5cf6)" />
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text-primary)', marginBottom: 4 }}>Register as Partner</div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  Hospital, Ambulance, Police, Fire, Mechanic, Insurance or Volunteer
                </div>
              </div>
              <span className="badge badge-purple" style={{ fontSize: 11 }}>Requires Approval</span>
            </button>
          </div>
        )}

        {/* ── Mode: User ── */}
        {mode === 'user' && (
          <>
            <button
              type="button"
              onClick={() => setMode('choose')}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0', marginBottom: 16 }}
            >
              ← Back to options
            </button>
            <UserRegisterForm settings={settings} />
          </>
        )}

        <p style={{ textAlign: 'center', marginTop: 24, fontSize: 13, color: 'var(--text-muted)' }}>
          Already have an account? <Link to="/login" style={{ color: 'var(--red-primary)', fontWeight: 600 }}>Sign in</Link>
        </p>
      </div>
    </div>
  );
}
