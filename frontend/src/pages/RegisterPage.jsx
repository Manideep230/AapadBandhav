import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import API from '../api/axios';
import { useAuth } from '../context/AuthContext';

export default function RegisterPage() {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ full_name:'', email:'', mobile:'', password:'', vehicle_number:'', vehicle_type:'Car', address:'', blood_group:'O+', age:'', gender:'Male' });
  const { login } = useAuth();
  const navigate = useNavigate();

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.full_name || !form.email || !form.mobile || !form.password) return toast.error('Fill all required fields');
    setLoading(true);
    try {
      const res = await API.post('/auth/user/register', form);
      login(res.data.user, res.data.token, 'user');
      toast.success(`Welcome, ${res.data.user.full_name}! Your ID: ${res.data.user.unique_id}`);
      navigate('/dashboard');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Registration failed');
    } finally { setLoading(false); }
  };

  return (
    <div className="auth-page" style={{ alignItems: 'flex-start', paddingTop: 40 }}>
      <div className="auth-card" style={{ maxWidth: 560 }}>
        <div className="auth-logo">
          <div className="auth-logo-icon">🚨</div>
          <div className="auth-title">Create Account</div>
          <div className="auth-subtitle">Join AapadBandhav — Emergency Response Network</div>
        </div>

        <div style={{ display:'flex', gap:8, marginBottom:24 }}>
          {[1,2].map(s => <div key={s} style={{ flex:1, height:4, borderRadius:2, background: step >= s ? 'var(--red-500)' : 'var(--border)', transition:'all 0.3s' }} />)}
        </div>

        <form onSubmit={handleSubmit}>
          {step === 1 && (
            <>
              <div className="form-grid-2">
                <div className="form-group"><label className="form-label">Full Name *</label><input className="form-input" value={form.full_name} onChange={e => set('full_name', e.target.value)} placeholder="Rahul Sharma" /></div>
                <div className="form-group"><label className="form-label">Email *</label><input className="form-input" type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="rahul@email.com" /></div>
                <div className="form-group"><label className="form-label">Mobile *</label><input className="form-input" value={form.mobile} onChange={e => set('mobile', e.target.value)} placeholder="9876543210" /></div>
                <div className="form-group"><label className="form-label">Password *</label><input className="form-input" type="password" value={form.password} onChange={e => set('password', e.target.value)} placeholder="Min 6 characters" /></div>
                <div className="form-group"><label className="form-label">Age</label><input className="form-input" type="number" value={form.age} onChange={e => set('age', e.target.value)} placeholder="25" /></div>
                <div className="form-group"><label className="form-label">Gender</label>
                  <select className="form-select" value={form.gender} onChange={e => set('gender', e.target.value)}>
                    {['Male','Female','Other','Prefer not to say'].map(g => <option key={g}>{g}</option>)}
                  </select>
                </div>
              </div>
              <button type="button" className="btn btn-primary w-full" onClick={() => { if(!form.full_name||!form.email||!form.mobile||!form.password) return toast.error('Fill required fields'); setStep(2); }}>Next: Vehicle Details →</button>
            </>
          )}

          {step === 2 && (
            <>
              <div className="form-grid-2">
                <div className="form-group"><label className="form-label">Vehicle Number</label><input className="form-input" value={form.vehicle_number} onChange={e => set('vehicle_number', e.target.value)} placeholder="MH01AB1234" /></div>
                <div className="form-group"><label className="form-label">Vehicle Type</label>
                  <select className="form-select" value={form.vehicle_type} onChange={e => set('vehicle_type', e.target.value)}>
                    {['Car','Motorcycle','Truck','Bus','Auto','Bicycle','Other'].map(v => <option key={v}>{v}</option>)}
                  </select>
                </div>
                <div className="form-group"><label className="form-label">Blood Group</label>
                  <select className="form-select" value={form.blood_group} onChange={e => set('blood_group', e.target.value)}>
                    {['A+','A-','B+','B-','AB+','AB-','O+','O-','Unknown'].map(b => <option key={b}>{b}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-group"><label className="form-label">Address</label><textarea className="form-textarea" value={form.address} onChange={e => set('address', e.target.value)} placeholder="Your full address" /></div>
              <div style={{ display:'flex', gap:12 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setStep(1)}>← Back</button>
                <button type="submit" className="btn btn-primary" style={{ flex:1 }} disabled={loading}>
                  {loading ? <><span className="spinner" /> Creating...</> : '✅ Create Account'}
                </button>
              </div>
            </>
          )}
        </form>

        <p style={{ textAlign:'center', marginTop:20, fontSize:13, color:'var(--text-muted)' }}>
          Already have an account? <Link to="/login" style={{ color:'var(--red-400)' }}>Sign in</Link>
        </p>
      </div>
    </div>
  );
}
