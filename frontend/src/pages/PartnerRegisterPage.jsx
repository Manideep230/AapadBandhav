import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import API from '../api/axios';
import { useAuth } from '../context/AuthContext';
import {
  SirenIcon, HospitalIcon, CarIcon, ShieldIcon, WrenchIcon,
  BriefcaseIcon, HeartIcon, FlameIcon, CheckIcon, UserIcon,
} from '../components/Icons';

// ─── Role Catalogue ─────────────────────────────────────────────────────────
const PARTNER_ROLES = [
  {
    key: 'hospital',
    label: 'Hospital',
    description: 'Medical facility with emergency care',
    icon: <HospitalIcon size={22} />,
    color: '#10b981',
    bg: 'rgba(16,185,129,0.08)',
    border: 'rgba(16,185,129,0.25)',
  },
  {
    key: 'ambulance',
    label: 'Ambulance',
    description: 'Emergency transport service',
    icon: <CarIcon size={22} />,
    color: '#f59e0b',
    bg: 'rgba(245,158,11,0.08)',
    border: 'rgba(245,158,11,0.25)',
  },
  {
    key: 'police_station',
    label: 'Police Station',
    description: 'Law enforcement station',
    icon: <ShieldIcon size={22} />,
    color: '#3b82f6',
    bg: 'rgba(59,130,246,0.08)',
    border: 'rgba(59,130,246,0.25)',
  },
  {
    key: 'policeman',
    label: 'Policeman',
    description: 'Individual law enforcement officer',
    icon: <ShieldIcon size={22} />,
    color: '#60a5fa',
    bg: 'rgba(96,165,250,0.08)',
    border: 'rgba(96,165,250,0.25)',
  },
  {
    key: 'fire_department',
    label: 'Fire Department',
    description: 'Fire & rescue responder',
    icon: <FlameIcon size={22} />,
    color: '#ef4444',
    bg: 'rgba(239,68,68,0.08)',
    border: 'rgba(239,68,68,0.25)',
  },
  {
    key: 'mechanic',
    label: 'Mechanic',
    description: 'Vehicle repair & roadside assistance',
    icon: <WrenchIcon size={22} />,
    color: '#a78bfa',
    bg: 'rgba(167,139,250,0.08)',
    border: 'rgba(167,139,250,0.25)',
  },
  {
    key: 'insurance',
    label: 'Insurance',
    description: 'Vehicle & accident insurance company',
    icon: <BriefcaseIcon size={22} />,
    color: '#06b6d4',
    bg: 'rgba(6,182,212,0.08)',
    border: 'rgba(6,182,212,0.25)',
  },
  {
    key: 'volunteer',
    label: 'Ranger',
    description: 'Community emergency responder',
    icon: <HeartIcon size={22} />,
    color: '#ec4899',
    bg: 'rgba(236,72,153,0.08)',
    border: 'rgba(236,72,153,0.25)',
  },
];

// ─── Step Indicator ──────────────────────────────────────────────────────────
function StepIndicator({ current, total }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 28 }}>
      {Array.from({ length: total }, (_, i) => {
        const step = i + 1;
        const done = step < current;
        const active = step === current;
        return (
          <React.Fragment key={step}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 700,
              background: done ? 'var(--green-primary, #10b981)' : active ? 'var(--purple-primary, #8b5cf6)' : 'rgba(255,255,255,0.05)',
              border: `2px solid ${done ? 'var(--green-primary, #10b981)' : active ? 'var(--purple-primary, #8b5cf6)' : 'rgba(255,255,255,0.12)'}`,
              color: done || active ? '#fff' : 'var(--text-muted)',
              transition: 'all 0.25s ease',
            }}>
              {done ? <CheckIcon size={13} /> : step}
            </div>
            {i < total - 1 && (
              <div style={{
                flex: 1, height: 2, maxWidth: 40,
                background: done ? 'var(--green-primary, #10b981)' : 'rgba(255,255,255,0.06)',
                transition: 'background 0.3s ease',
              }} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ─── Field renderers ─────────────────────────────────────────────────────────
function Field({ id, label, value, onChange, placeholder, type = 'text', required = false, hint }) {
  return (
    <div className="form-group">
      <label className="form-label" htmlFor={id}>
        {label}{required && <span style={{ color: 'var(--red-primary)', marginLeft: 3 }}>*</span>}
      </label>
      <input
        id={id}
        className="form-input"
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
      />
      {hint && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>{hint}</div>}
    </div>
  );
}

function TextareaField({ id, label, value, onChange, placeholder }) {
  return (
    <div className="form-group">
      <label className="form-label" htmlFor={id}>{label}</label>
      <textarea id={id} className="form-textarea" value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder} rows={2} />
    </div>
  );
}

// ─── Role-specific Extra Fields ───────────────────────────────────────────────
function RoleFields({ role, form, setField }) {
  const f = (id, label, placeholder, type = 'text', required = false) => (
    <Field key={id} id={`pf-${id}`} label={label} value={form[id] || ''} onChange={v => setField(id, v)}
      placeholder={placeholder} type={type} required={required} />
  );

  if (role === 'hospital') return (
    <div className="form-grid-2" style={{ marginTop: 12 }}>
      {f('registration_number', 'Registration Number', 'AP-HOSP-1001')}
      {f('bed_capacity', 'Bed Capacity', '100', 'number')}
      {f('available_beds', 'Available Beds', '30', 'number')}
      {f('city', 'City', 'Vijayawada')}
      {f('state', 'State', 'Andhra Pradesh')}
      <Field id="pf-specializations" label="Specializations" value={form.specializations || ''}
        onChange={v => setField('specializations', v)} placeholder="Emergency, Trauma, ICU"
        hint="Comma-separated list" />
      {f('latitude', 'Latitude *', '16.5063', 'number', true)}
      {f('longitude', 'Longitude *', '80.6480', 'number', true)}
    </div>
  );

  if (role === 'ambulance') return (
    <div className="form-grid-2" style={{ marginTop: 12 }}>
      {f('license_number', 'License Number', 'AP-DL-1234567')}
      {f('vehicle_number', 'Vehicle Number', 'AP16AMB001')}
      {f('organization', 'Organization / Hospital', 'Apollo Hospital Trust')}
    </div>
  );

  if (role === 'police_station') return (
    <div className="form-grid-2" style={{ marginTop: 12 }}>
      {f('station_code', 'Station Code', 'AP-PS-VJA')}
      {f('city', 'City', 'Vijayawada')}
      {f('state', 'State', 'Andhra Pradesh')}
      {f('latitude', 'Latitude', '16.5063', 'number')}
      {f('longitude', 'Longitude', '80.6480', 'number')}
      <div className="form-group" style={{ gridColumn: 'span 2' }}>
        <TextareaField id="pf-address" label="Address" value={form.address || ''}
          onChange={v => setField('address', v)} placeholder="Police station address" />
      </div>
    </div>
  );

  if (role === 'policeman') return (
    <div className="form-grid-2" style={{ marginTop: 12 }}>
      {f('badge_number', 'Badge Number', 'AP-12345')}
      {f('department', 'Department', 'Traffic, Crime, etc.')}
      {f('rank', 'Rank', 'Sub-Inspector')}
      {f('station_id', 'Station ID (Optional)', 'UUID of your station')}
    </div>
  );

  if (role === 'fire_department') return (
    <div className="form-grid-2" style={{ marginTop: 12 }}>
      {f('department', 'Department / Division', 'AP State Fire & Emergency')}
      {f('rank', 'Rank / Designation', 'Senior Officer')}
      {f('organization', 'Organization', 'Andhra Pradesh Fire Services')}
    </div>
  );

  if (role === 'mechanic') return (
    <div className="form-grid-2" style={{ marginTop: 12 }}>
      {f('specialization', 'Specialization', 'Car, Motorcycle, Heavy Vehicle')}
      {f('latitude', 'Workshop Latitude', '16.5063', 'number')}
      {f('longitude', 'Workshop Longitude', '80.6480', 'number')}
    </div>
  );

  if (role === 'insurance') return (
    <div className="form-grid-2" style={{ marginTop: 12 }}>
      {f('license_number', 'IRDAI License Number', 'IRDAI-AP-1001')}
      {f('city', 'City', 'Vijayawada')}
      {f('latitude', 'Latitude', '16.5063', 'number')}
      {f('longitude', 'Longitude', '80.6480', 'number')}
      <div className="form-group" style={{ gridColumn: 'span 2' }}>
        <TextareaField id="pf-address" label="Office Address" value={form.address || ''}
          onChange={v => setField('address', v)} placeholder="Company registered address" />
      </div>
    </div>
  );

  if (role === 'volunteer') return (
    <div className="form-grid-2" style={{ marginTop: 12 }}>
      {f('organization', 'Organization / Group (Optional)', 'NGO, RWA, etc.')}
      <div className="form-group" style={{ gridColumn: 'span 2' }}>
        <TextareaField id="pf-address" label="Residential Address" value={form.address || ''}
          onChange={v => setField('address', v)} placeholder="Your home address" />
      </div>
    </div>
  );

  return null;
}

// ─── Main Partner Register Page ───────────────────────────────────────────────
export default function PartnerRegisterPage() {
  const { settings } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState(1); // 1=choose role, 2=core info, 3=role-specific, 4=done
  const [selectedRole, setSelectedRole] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  // OTP state
  const [otpSent, setOtpSent] = useState(false);
  const [timer, setTimer] = useState(0);
  const timerRef = useRef(null);

  const [form, setForm] = useState({
    name: '', mobile: '', email: '', otp: '',
    address: '', city: '', state: '',
    latitude: '', longitude: '',
    registration_number: '', bed_capacity: '', available_beds: '', specializations: '',
    license_number: '', vehicle_number: '', station_code: '', badge_number: '',
    station_id: '', department: '', rank: '', organization: '', specialization: '',
  });

  useEffect(() => {
    if (timer > 0) {
      timerRef.current = setTimeout(() => setTimer(p => p - 1), 1000);
    } else {
      clearTimeout(timerRef.current);
    }
    return () => clearTimeout(timerRef.current);
  }, [timer]);

  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const roleInfo = PARTNER_ROLES.find(r => r.key === selectedRole);

  const handleSendOtp = async () => {
    if (!form.mobile || form.mobile.length < 10) {
      return toast.error('Please enter a valid 10-digit mobile number');
    }
    setLoading(true);
    try {
      const res = await API.post('/auth/otp/send', { mobile: form.mobile });
      setOtpSent(true);
      setTimer(30);
      toast.success('OTP sent to your mobile.');
      if (res.data.otp) {
        toast(`[DEV MODE] OTP: ${res.data.otp}`, { icon: '🔑', duration: 8000 });
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to send OTP');
    } finally {
      setLoading(false);
    }
  };

  const handleCoreNext = (e) => {
    e.preventDefault();
    if (!form.name || !form.mobile || !form.otp) {
      return toast.error('Name, mobile, and OTP are required');
    }
    if (!otpSent) {
      return toast.error('Please send and verify OTP first');
    }
    setStep(3);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = { role: selectedRole, ...form };
      // Parse specializations from comma-separated string to array for hospital
      if (selectedRole === 'hospital' && form.specializations) {
        payload.specializations = form.specializations.split(',').map(s => s.trim()).filter(Boolean);
      }
      // Clean up empty strings
      Object.keys(payload).forEach(k => {
        if (payload[k] === '') delete payload[k];
      });

      await API.post('/auth/partner/register', payload);
      setSubmitted(true);
      setStep(4);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ── Styles ──
  const cardStyle = {
    background: 'rgba(15,12,30,0.75)',
    backdropFilter: 'blur(24px)',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: 20,
    padding: '36px 32px',
    width: '100%',
    maxWidth: step === 1 ? 700 : 560,
    boxShadow: '0 32px 64px rgba(0,0,0,0.45)',
    transition: 'max-width 0.3s ease',
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'flex-start',
      paddingTop: 48,
      paddingBottom: 48,
      paddingLeft: 20,
      paddingRight: 20,
      fontFamily: "'Outfit', 'Inter', sans-serif",
      position: 'relative',
    }}>
      <style>{`
        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .preg-card { animation: fadeSlideUp 0.32s ease both; }
        .role-tile {
          display: flex; flex-direction: column; align-items: flex-start; gap: 10px;
          padding: 16px 18px;
          border-radius: 14px;
          border: 1.5px solid;
          background: transparent;
          cursor: pointer;
          transition: all 0.2s ease;
          text-align: left;
          width: 100%;
        }
        .role-tile:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(0,0,0,0.3); }
        .role-tile.selected { transform: translateY(-2px); }
        .badge-purple { background: rgba(139,92,246,0.12); color: #a78bfa; border: 1px solid rgba(139,92,246,0.2); }
        .badge-blue   { background: rgba(59,130,246,0.12);  color: #60a5fa; border: 1px solid rgba(59,130,246,0.2); }
      `}</style>

      <div className="preg-card" style={cardStyle}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{
            width: 52, height: 52, borderRadius: 14,
            background: 'rgba(139,92,246,0.12)',
            border: '1px solid rgba(139,92,246,0.25)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 14px',
            color: '#8b5cf6',
          }}>
            {step === 4 ? <CheckIcon size={24} /> : <BriefcaseIcon size={24} />}
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, color: '#f8fafc' }}>
            {step === 1 ? 'Partner Registration' : step === 4 ? 'Application Submitted' : `Register as ${roleInfo?.label || 'Partner'}`}
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted, #94a3b8)', margin: '6px 0 0' }}>
            {step === 1 && `${settings?.appName || 'AapadBandhav'} — Select your organization type`}
            {step === 2 && 'Enter your contact details and verify your mobile number'}
            {step === 3 && 'Provide specific details about your organization'}
            {step === 4 && 'Your application is now under review'}
          </p>
        </div>

        {/* Step indicator for steps 2-3 */}
        {step >= 2 && step <= 3 && <StepIndicator current={step - 1} total={2} />}

        {/* ── Step 1: Role Selection ── */}
        {step === 1 && (
          <div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))',
              gap: 12,
              marginBottom: 24,
            }}>
              {PARTNER_ROLES.map(role => (
                <button
                  key={role.key}
                  type="button"
                  id={`role-select-${role.key}`}
                  className={`role-tile ${selectedRole === role.key ? 'selected' : ''}`}
                  style={{
                    borderColor: selectedRole === role.key ? role.color : 'rgba(255,255,255,0.07)',
                    background: selectedRole === role.key ? role.bg : 'rgba(255,255,255,0.015)',
                    boxShadow: selectedRole === role.key ? `0 0 20px ${role.color}25` : 'none',
                  }}
                  onClick={() => setSelectedRole(role.key)}
                >
                  <div style={{
                    width: 38, height: 38, borderRadius: 10,
                    background: role.bg, border: `1px solid ${role.border}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: role.color,
                  }}>
                    {role.icon}
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: '#f8fafc', marginBottom: 2 }}>{role.label}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted, #94a3b8)', lineHeight: 1.4 }}>{role.description}</div>
                  </div>
                  {selectedRole === role.key && (
                    <div style={{
                      marginLeft: 'auto', width: 18, height: 18, borderRadius: '50%',
                      background: role.color, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <CheckIcon size={10} color="#fff" />
                    </div>
                  )}
                </button>
              ))}
            </div>

            {/* Info banner */}
            <div style={{
              background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.15)',
              borderRadius: 10, padding: '10px 14px', marginBottom: 20,
              fontSize: 12, color: 'var(--text-muted, #94a3b8)', lineHeight: 1.5,
            }}>
              ℹ️ Partner accounts require admin approval before activation. You will authenticate via Mobile OTP — no password required.
            </div>

            <button
              type="button"
              id="partner-next-step1"
              className="btn btn-primary w-full"
              disabled={!selectedRole}
              onClick={() => setStep(2)}
            >
              Continue with {selectedRole ? roleInfo?.label : 'Selected Role'} →
            </button>
          </div>
        )}

        {/* ── Step 2: Core Info + OTP ── */}
        {step === 2 && (
          <form onSubmit={handleCoreNext}>
            <div className="form-grid-2">
              <Field id="pf-name" label={`${roleInfo?.label} Name`} value={form.name}
                onChange={v => setField('name', v)} placeholder={`e.g. City ${roleInfo?.label}`} required />
              <Field id="pf-email" label="Email Address" value={form.email}
                onChange={v => setField('email', v)} placeholder="contact@example.com" type="email" />
              <div className="form-group">
                <label className="form-label" htmlFor="pf-mobile">
                  Mobile Number<span style={{ color: 'var(--red-primary)', marginLeft: 3 }}>*</span>
                </label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    id="pf-mobile"
                    className="form-input"
                    value={form.mobile}
                    onChange={e => {
                      if (!otpSent) setField('mobile', e.target.value.replace(/\D/g, '').slice(0, 10));
                    }}
                    placeholder="9876543210"
                    disabled={otpSent}
                    required
                    style={{ flex: 1 }}
                  />
                  {!otpSent ? (
                    <button type="button" className="btn btn-secondary btn-sm"
                      onClick={handleSendOtp}
                      disabled={loading || form.mobile.length < 10}
                      style={{ whiteSpace: 'nowrap' }}>
                      {loading ? <span className="spinner" /> : 'Send OTP'}
                    </button>
                  ) : (
                    <button type="button" className="btn btn-secondary btn-sm"
                      onClick={() => { setOtpSent(false); setField('otp', ''); }}>
                      Change
                    </button>
                  )}
                </div>
              </div>
              <Field id="pf-otp" label="Verification OTP" value={form.otp}
                onChange={v => setField('otp', v.replace(/\D/g, '').slice(0, 6))}
                placeholder="6-digit OTP" required />
            </div>

            {otpSent && timer > 0 && (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, textAlign: 'right' }}>
                Resend in {timer}s
              </div>
            )}
            {otpSent && timer === 0 && (
              <div style={{ fontSize: 12, textAlign: 'right', marginTop: 4 }}>
                <button type="button" className="btn btn-ghost btn-xs"
                  onClick={handleSendOtp}
                  style={{ color: 'var(--cyan-primary)', border: 'none', padding: 0 }}>
                  Resend OTP
                </button>
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button type="button" className="btn btn-secondary" onClick={() => setStep(1)} style={{ flex: 1 }}>
                ← Back
              </button>
              <button type="submit" id="partner-next-step2" className="btn btn-primary" style={{ flex: 2 }}>
                Continue →
              </button>
            </div>
          </form>
        )}

        {/* ── Step 3: Role-Specific Fields ── */}
        {step === 3 && (
          <form onSubmit={handleSubmit}>
            <RoleFields role={selectedRole} form={form} setField={setField} />

            <div style={{
              background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)',
              borderRadius: 10, padding: '10px 14px', marginTop: 20,
              fontSize: 12, color: '#fbbf24', lineHeight: 1.5,
            }}>
              ⚠️ Your application will be reviewed by the admin team. You will be notified once your account is approved.
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button type="button" className="btn btn-secondary" onClick={() => setStep(2)} style={{ flex: 1 }} disabled={loading}>
                ← Back
              </button>
              <button type="submit" id="partner-submit" className="btn btn-primary" style={{ flex: 2 }} disabled={loading}>
                {loading ? <><span className="spinner" /> Submitting...</> : `Submit Application`}
              </button>
            </div>
          </form>
        )}

        {/* ── Step 4: Confirmation ── */}
        {step === 4 && (
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            <div style={{
              width: 72, height: 72, borderRadius: '50%',
              background: 'rgba(16,185,129,0.1)',
              border: '2px solid var(--green-primary, #10b981)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 20px',
              color: 'var(--green-primary, #10b981)',
              boxShadow: '0 0 32px rgba(16,185,129,0.2)',
            }}>
              <CheckIcon size={32} />
            </div>

            <h2 style={{ fontSize: 20, fontWeight: 800, color: '#f8fafc', margin: '0 0 10px' }}>
              Application Submitted!
            </h2>
            <p style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 24 }}>
              Your <strong style={{ color: '#f8fafc' }}>{roleInfo?.label}</strong> partner application has been received.
              The admin team will review and approve your account shortly.
              Once approved, you can log in using your mobile number and OTP.
            </p>

            <div style={{
              background: 'rgba(15,23,42,0.6)', borderRadius: 12, padding: '14px 18px',
              border: '1px solid rgba(255,255,255,0.05)', marginBottom: 24, textAlign: 'left',
            }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8, fontWeight: 600 }}>
                📋 WHAT HAPPENS NEXT
              </div>
              {[
                'Admin reviews your application',
                'You get approved and account activated',
                'Log in via Mobile OTP at any time',
              ].map((s, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, fontSize: 13 }}>
                  <div style={{
                    width: 20, height: 20, borderRadius: '50%', fontSize: 11, fontWeight: 700,
                    background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.3)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8b5cf6', flexShrink: 0,
                  }}>{i + 1}</div>
                  <span style={{ color: '#cbd5e1' }}>{s}</span>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ flex: 1 }}
                onClick={() => navigate('/')}
              >
                Back to Home
              </button>
              <button
                type="button"
                className="btn btn-primary"
                style={{ flex: 1 }}
                onClick={() => navigate('/login')}
              >
                Go to Login
              </button>
            </div>
          </div>
        )}

        {/* Footer link */}
        {step < 4 && (
          <p style={{ textAlign: 'center', marginTop: 20, fontSize: 13, color: 'var(--text-muted, #94a3b8)' }}>
            Already registered? <Link to="/login" style={{ color: 'var(--red-primary, #ef4444)', fontWeight: 600 }}>Sign in here</Link>
            {' · '}
            <Link to="/register" style={{ color: 'var(--cyan-primary, #06b6d4)', fontWeight: 600 }}>Register as User</Link>
          </p>
        )}
      </div>
    </div>
  );
}
