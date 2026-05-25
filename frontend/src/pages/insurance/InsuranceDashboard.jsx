import React, { useState, useEffect } from 'react';
import Layout from '../../components/Layout';
import API from '../../api/axios';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';

export default function InsuranceDashboard() {
  const { user } = useAuth();
  const [customers, setCustomers] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [linkId, setLinkId] = useState('');
  const [policyNo, setPolicyNo] = useState('');
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('customers');

  useEffect(() => {
    Promise.all([
      API.get('/insurance/customers'),
      API.get('/insurance/alerts'),
    ]).then(([c, a]) => {
      setCustomers(c.data.customers || []);
      setAlerts(a.data.alerts || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const linkCustomer = async () => {
    if (!linkId || linkId.length !== 10) return toast.error('Enter valid 10-digit User ID');
    try {
      const res = await API.post('/insurance/link-customer', { unique_id: linkId, policy_number: policyNo });
      toast.success(`Customer ${res.data.user.full_name} linked!`);
      setLinkId(''); setPolicyNo('');
      const c = await API.get('/insurance/customers');
      setCustomers(c.data.customers || []);
    } catch (e) { toast.error(e.response?.data?.message || 'Failed'); }
  };

  const unlinkCustomer = async (userId) => {
    try {
      await API.delete(`/insurance/customers/${userId}`);
      toast.success('Customer unlinked');
      setCustomers(prev => prev.filter(c => c.user_id !== userId));
    } catch (e) { toast.error('Failed'); }
  };

  return (
    <Layout title="Insurance Portal">
      <div className="flex-between mb-24">
        <div><h1 className="section-title">🛡️ Insurance Portal</h1><p className="section-subtitle">{user?.name || 'Company'} • Customer & Claims Management</p></div>
      </div>

      <div className="stat-grid">
        {[
          { l:'Linked Customers', v:customers.length, i:'👥', c:'blue' },
          { l:'Accident Alerts', v:alerts.length, i:'🚨', c:'red' },
          { l:'Pending Claims', v:alerts.filter(a=>a.status==='sent').length, i:'📋', c:'amber' },
        ].map(s => <div key={s.l} className={`stat-card ${s.c}`}><div className="stat-icon">{s.i}</div><div className="stat-value">{s.v}</div><div className="stat-label">{s.l}</div></div>)}
      </div>

      {/* Link Customer */}
      <div className="card mb-24">
        <h3 style={{ marginBottom:16 }}>🔗 Link New Customer</h3>
        <div style={{ display:'flex', gap:12 }}>
          <input className="form-input" style={{ fontFamily:'monospace', maxWidth:200 }} value={linkId} onChange={e => setLinkId(e.target.value)} placeholder="10-digit User ID" maxLength={10} />
          <input className="form-input" style={{ maxWidth:200 }} value={policyNo} onChange={e => setPolicyNo(e.target.value)} placeholder="Policy Number (optional)" />
          <button className="btn btn-primary" onClick={linkCustomer}>🔗 Link Customer</button>
        </div>
        <p className="text-sm text-muted" style={{ marginTop:8 }}>Enter the customer's unique 10-digit AapadBandhav ID to link their account</p>
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:8, marginBottom:16 }}>
        <button onClick={() => setTab('customers')} className={`btn btn-sm ${tab==='customers'?'btn-primary':'btn-secondary'}`}>👥 Customers ({customers.length})</button>
        <button onClick={() => setTab('alerts')} className={`btn btn-sm ${tab==='alerts'?'btn-primary':'btn-secondary'}`}>🚨 Accident Alerts ({alerts.length})</button>
      </div>

      {tab === 'customers' && (
        <div className="card">
          <h3 style={{ marginBottom:16 }}>👥 Linked Customers</h3>
          {loading ? <div style={{ textAlign:'center', padding:32 }}><div className="spinner" /></div> :
            customers.length === 0 ? <div style={{ textAlign:'center', padding:32, color:'var(--text-muted)' }}>No customers linked yet</div> : (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>User ID</th><th>Name</th><th>Vehicle</th><th>Blood Group</th><th>Policy No.</th><th>Linked</th><th>Action</th></tr></thead>
                  <tbody>
                    {customers.map(c => (
                      <tr key={c.id}>
                        <td><code style={{ color:'var(--cyan-400)', fontSize:12 }}>{c.user?.unique_id}</code></td>
                        <td style={{ fontWeight:500 }}>{c.user?.full_name || '—'}</td>
                        <td className="text-sm">{c.user?.vehicle_number || '—'} <span className="text-muted">({c.user?.vehicle_type})</span></td>
                        <td><span className="badge badge-red">{c.user?.blood_group || '—'}</span></td>
                        <td className="text-sm">{c.policy_number || '—'}</td>
                        <td className="text-sm text-muted">{new Date(c.linked_at).toLocaleDateString('en-IN')}</td>
                        <td><button className="btn btn-danger btn-sm" onClick={() => unlinkCustomer(c.user_id)}>Unlink</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          }
        </div>
      )}

      {tab === 'alerts' && (
        <div className="card">
          <h3 style={{ marginBottom:16 }}>🚨 Accident Alerts</h3>
          {alerts.length === 0 ? <div style={{ textAlign:'center', padding:32, color:'var(--text-muted)' }}>No accident alerts</div> :
            alerts.map(a => (
              <div key={a.id} className="alert-item critical">
                <span style={{ fontSize:24 }}>🛡️</span>
                <div style={{ flex:1 }}>
                  <div className="flex-between mb-4">
                    <span style={{ fontWeight:700 }}>{a.accident?.accident_code}</span>
                    <span className={`badge badge-${a.status==='sent'?'red':'muted'}`}>{a.status}</span>
                  </div>
                  {a.victim && <div style={{ fontSize:13, color:'var(--text-secondary)' }}>Insured: {a.victim.full_name} • 🚗 {a.accident?.vehicle_number} • 🩸 {a.victim.blood_group}</div>}
                  <div style={{ fontSize:12, color:'var(--text-muted)', marginTop:4 }}>Incident at: {new Date(a.createdAt).toLocaleString('en-IN')}</div>
                </div>
              </div>
            ))
          }
        </div>
      )}
    </Layout>
  );
}
