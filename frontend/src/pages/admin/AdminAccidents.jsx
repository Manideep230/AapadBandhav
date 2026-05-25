import React, { useState, useEffect } from 'react';
import Layout from '../../components/Layout';
import API from '../../api/axios';
import toast from 'react-hot-toast';

export default function AdminAccidents() {
  const [accidents, setAccidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  const fetch = async () => {
    setLoading(true);
    try {
      const q = filter === 'all' ? '' : `?status=${filter}`;
      const res = await API.get(`/admin/accidents${q}`);
      setAccidents(res.data.accidents || []);
    } catch (e) { toast.error('Failed'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetch(); }, [filter]);

  const resolve = async (id) => {
    try {
      await API.post(`/accidents/${id}/resolve`);
      toast.success('Accident resolved');
      fetch();
    } catch (e) { toast.error('Failed'); }
  };

  const statuses = ['all','active','dispatched','responded','resolved','cancelled'];
  const severityColor = { low:'blue', medium:'amber', high:'red', critical:'red' };

  return (
    <Layout title="Admin - Accidents">
      <div className="flex-between mb-24">
        <div><h1 className="section-title">🚨 Accident Monitor</h1><p className="section-subtitle">{accidents.length} incidents</p></div>
        <button className="btn btn-secondary btn-sm" onClick={fetch}>🔄 Refresh</button>
      </div>
      <div style={{ display:'flex', gap:8, marginBottom:20 }}>
        {statuses.map(s => (
          <button key={s} onClick={() => setFilter(s)} className={`btn btn-sm ${filter===s ? 'btn-primary' : 'btn-secondary'}`} style={{ textTransform:'capitalize' }}>{s}</button>
        ))}
      </div>
      <div className="card">
        {loading ? <div style={{ textAlign:'center', padding:40 }}><div className="spinner" /></div> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Code</th><th>Date/Time</th><th>Location</th><th>Vehicle</th><th>Severity</th><th>Status</th><th>Phase</th><th>Action</th></tr></thead>
              <tbody>
                {accidents.map(a => (
                  <tr key={a.id}>
                    <td><code style={{ color:'var(--cyan-400)', fontSize:12 }}>{a.accident_code}</code></td>
                    <td className="text-sm text-muted">{new Date(a.createdAt).toLocaleString('en-IN', { dateStyle:'short', timeStyle:'short' })}</td>
                    <td className="text-sm">{parseFloat(a.latitude).toFixed(4)}, {parseFloat(a.longitude).toFixed(4)}</td>
                    <td className="text-sm">{a.vehicle_number || '—'}</td>
                    <td><span className={`badge badge-${severityColor[a.severity] || 'muted'}`}>{a.severity}</span></td>
                    <td><span className={`badge badge-${a.status==='resolved'?'green':a.status==='active'?'red':a.status==='responded'?'green':'amber'}`}>{a.status}</span></td>
                    <td><span className="badge badge-purple">P{a.phase}</span></td>
                    <td>{['active','dispatched','responded'].includes(a.status) && <button className="btn btn-success btn-sm" onClick={() => resolve(a.id)}>✅ Resolve</button>}</td>
                  </tr>
                ))}
                {accidents.length === 0 && <tr><td colSpan={8} style={{ textAlign:'center', padding:32, color:'var(--text-muted)' }}>No accidents found</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Layout>
  );
}
