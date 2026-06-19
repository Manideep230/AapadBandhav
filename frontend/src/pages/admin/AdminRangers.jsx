import React, { useState, useEffect, useCallback } from 'react';
import Layout from '../../components/Layout';
import API from '../../api/axios';
import toast from 'react-hot-toast';
import { HeartIcon, CheckIcon, XIcon, UserIcon } from '../../components/Icons';

const RANGER_COLOR = '#ec4899';

// ─── Register Form ─────────────────────────────────────────────────────────────
function RegisterRangerForm({ onSuccess }) {
  const [form, setForm] = useState({ name: '', mobile: '', email: '', organization: '', address: '' });
  const [loading, setLoading] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.mobile) return toast.error('Name and mobile are required');
    if (String(form.mobile).length < 10) return toast.error('Mobile must be 10 digits');
    setLoading(true);
    try {
      await API.post('/admin/users/create', { role: 'volunteer', ...form });
      toast.success(`✅ Ranger "${form.name}" registered. Welcome SMS sent.`);
      setForm({ name: '', mobile: '', email: '', organization: '', address: '' });
      if (onSuccess) onSuccess();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const field = (key, label, placeholder, type = 'text') => (
    <div className="form-group" key={key}>
      <label className="form-label">{label}</label>
      <input className="form-input" type={type} value={form[key] || ''} onChange={e => set(key, e.target.value)} placeholder={placeholder} />
    </div>
  );

  return (
    <div className="bento-card" style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10,
          background: 'rgba(236,72,153,0.1)', border: '1px solid rgba(236,72,153,0.25)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', color: RANGER_COLOR,
        }}>
          <HeartIcon size={18} />
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>Register New Ranger</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Admin-created Rangers are activated immediately</div>
        </div>
      </div>

      <div style={{
        background: 'var(--blue-bg)', border: '1px solid var(--blue-border)',
        borderRadius: 8, padding: '10px 14px', marginBottom: 16,
        fontSize: 13, color: 'var(--text-secondary)',
      }}>
        Rangers authenticate via Mobile Number + OTP. A welcome SMS will be sent automatically.
      </div>

      <form onSubmit={handleSubmit}>
        <div className="form-grid-2">
          {field('name', 'Ranger Full Name *', 'e.g. Ravi Kumar')}
          {field('mobile', 'Mobile Number *', '9876543210', 'tel')}
          {field('email', 'Email (Optional)', 'ranger@example.com', 'email')}
          {field('organization', 'Organization / Group (Optional)', 'NGO, RWA, etc.')}
        </div>
        <div className="form-group">
          <label className="form-label">Residential Address</label>
          <input className="form-input" value={form.address} onChange={e => set('address', e.target.value)} placeholder="Home address" />
        </div>
        <button className="btn btn-primary" type="submit" disabled={loading} style={{
          marginTop: 12, background: 'linear-gradient(135deg, #ec4899, #be185d)',
          boxShadow: '0 4px 16px rgba(236,72,153,0.3)',
        }}>
          {loading ? <><span className="spinner" /> Creating Ranger...</> : '🛡️ Create Ranger Account'}
        </button>
      </form>
    </div>
  );
}

// ─── Ranger List ───────────────────────────────────────────────────────────────
function RangerList({ refresh }) {
  const [rangers, setRangers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await API.get(`/admin/users?search=${encodeURIComponent(search)}&role=volunteer&limit=100`);
      setRangers(res.data.users || []);
    } catch {
      toast.error('Failed to load rangers');
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => { load(); }, [load, refresh]);

  const toggle = async (ranger) => {
    try {
      const res = await API.put(`/admin/users/${ranger.id}/toggle?role=volunteer`);
      const updated = res.data.account;
      setRangers(prev => prev.map(r => r.id === ranger.id ? { ...r, ...updated } : r));
      toast.success(ranger.is_active ? 'Ranger deactivated' : 'Ranger activated');
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed');
    }
  };

  const deleteRanger = async (ranger) => {
    if (!confirm(`Remove Ranger "${ranger.display_name || ranger.full_name}"? This cannot be undone.`)) return;
    try {
      await API.delete(`/admin/users/${ranger.id}?role=volunteer`);
      setRangers(prev => prev.filter(r => r.id !== ranger.id));
      toast.success('Ranger removed');
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed');
    }
  };

  const filtered = rangers.filter(r => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (r.display_name || r.full_name || '').toLowerCase().includes(q) ||
      (r.mobile || '').includes(q) ||
      (r.email || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="bento-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ fontWeight: 700, fontSize: 15 }}>
          Active Rangers
          <span style={{
            marginLeft: 8, fontSize: 12, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
            background: 'rgba(236,72,153,0.1)', color: RANGER_COLOR, border: '1px solid rgba(236,72,153,0.25)',
          }}>{rangers.length}</span>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={load}>↻ Refresh</button>
      </div>

      <input
        className="form-input"
        placeholder="Search rangers by name, mobile, or email..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        style={{ marginBottom: 14 }}
      />

      {loading ? (
        <div style={{ textAlign: 'center', padding: 32 }}><span className="spinner" /></div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>
          No rangers found. Register one above!
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Mobile</th>
                <th>Email</th>
                <th>Organization</th>
                <th>Status</th>
                <th>Active</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 600 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{
                        width: 28, height: 28, borderRadius: '50%',
                        background: 'rgba(236,72,153,0.1)', border: '1px solid rgba(236,72,153,0.2)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: RANGER_COLOR, flexShrink: 0,
                      }}>
                        <HeartIcon size={13} />
                      </div>
                      {r.display_name || r.full_name || '—'}
                    </div>
                  </td>
                  <td className="text-sm">{r.mobile || '—'}</td>
                  <td className="text-sm text-muted">{r.email || '—'}</td>
                  <td className="text-sm text-muted">{r.organization || '—'}</td>
                  <td>
                    <span className={`badge ${r.available ? 'badge-green' : 'badge-muted'}`}>
                      {r.available ? '🟢 On Duty' : '⚫ Off Duty'}
                    </span>
                  </td>
                  <td>
                    <div
                      className={`toggle-switch-container ${r.is_active ? 'active' : 'standby'}`}
                      onClick={() => toggle(r)}
                      style={{ padding: '4px 8px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}
                      title={r.is_active ? 'Click to Deactivate' : 'Click to Activate'}
                    >
                      <div className="toggle-switch-track" style={{ width: 34, height: 18, borderRadius: 9, position: 'relative', transition: 'background 0.2s', display: 'block' }}>
                        <div className="toggle-switch-thumb" style={{
                          width: 14, height: 14, borderRadius: '50%', position: 'absolute',
                          top: 2, left: r.is_active ? 18 : 2, transition: 'left 0.2s', background: '#fff', display: 'block'
                        }} />
                      </div>
                    </div>
                  </td>
                  <td>
                    <button className="btn btn-danger btn-sm" onClick={() => deleteRanger(r)}>Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function AdminRangers() {
  const [listKey, setListKey] = useState(0);

  return (
    <Layout title="Admin - Ranger Management">
      <div className="flex-between mb-24">
        <div>
          <h1 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <HeartIcon size={22} style={{ color: RANGER_COLOR }} />
            Ranger Management
          </h1>
          <p className="section-subtitle">
            Register and manage community Rangers — first-responders from the public network.
          </p>
        </div>
      </div>

      <RegisterRangerForm onSuccess={() => setListKey(k => k + 1)} />
      <RangerList refresh={listKey} />
    </Layout>
  );
}
