import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import API from '../api/axios';
import { useAuth } from '../context/AuthContext';

const portals = [
  { key: 'user', label: 'User', dataKey: 'user', role: 'user' },
  { key: 'hospital', label: 'Hospital', dataKey: 'hospital', role: 'hospital' },
  { key: 'ambulance', label: 'Ambulance', dataKey: 'driver', role: 'ambulance' },
  { key: 'police_station', label: 'Police Station', dataKey: 'station', role: 'police_station' },
  { key: 'policeman', label: 'Policeman', dataKey: 'policeman', role: 'policeman' },
  { key: 'mechanic', label: 'Mechanic', dataKey: 'mechanic', role: 'mechanic' },
  { key: 'insurance', label: 'Insurance', dataKey: 'company', role: 'insurance' },
];

export default function LoginPage() {
  const [portal, setPortal] = useState('user');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();

  const selected = portals.find(p => p.key === portal);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) return toast.error('Fill in all fields');
    setLoading(true);
    try {
      const res = await API.post('/auth/login', { email, password, role: selected.role });
      const resolvedRole = res.data.entityType || selected.role;
      const resolvedKey = resolvedRole === 'admin' ? 'user' : selected.dataKey;
      const data = res.data[resolvedKey];
      login(data, res.data.token, resolvedRole);
      toast.success('Login successful!');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <div className="auth-logo-icon">SOS</div>
          <div className="auth-title">AapadBandhav</div>
          <div className="auth-subtitle">Sign in to your portal</div>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 24 }}>
          {portals.map(p => (
            <button
              key={p.key}
              type="button"
              onClick={() => setPortal(p.key)}
              className={`btn btn-sm ${portal === p.key ? 'btn-primary' : 'btn-secondary'}`}
              style={{ fontSize: 12 }}
            >
              {p.label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Email Address</label>
            <input className="form-input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Enter your email" />
          </div>
          <div className="form-group">
            <label className="form-label">Password</label>
            <input className="form-input" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter your password" />
          </div>
          <button type="submit" className="btn btn-primary w-full" style={{ marginBottom: 12 }} disabled={loading}>
            {loading ? <><span className="spinner" /> Signing in...</> : 'Sign In'}
          </button>
        </form>

        {portal === 'user' && (
          <p style={{ textAlign: 'center', marginTop: 20, fontSize: 13, color: 'var(--text-muted)' }}>
            No account? <Link to="/register" style={{ color: 'var(--red-400)' }}>Register here</Link>
          </p>
        )}
      </div>
    </div>
  );
}
