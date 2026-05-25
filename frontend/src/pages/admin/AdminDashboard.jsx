import React, { useState, useEffect, useCallback } from 'react';
import Layout from '../../components/Layout';
import API from '../../api/axios';
import toast from 'react-hot-toast';
import { getSocket } from '../../api/socket';
import { useAuth } from '../../context/AuthContext';
import MapView, { ICONS } from '../../components/MapView';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

export default function AdminDashboard() {
  const { user } = useAuth();
  const [dashboard, setDashboard] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [accidents, setAccidents] = useState([]);
  const [liveAccidents, setLiveAccidents] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    try {
      const [dbRes, anRes, accRes] = await Promise.all([
        API.get('/admin/dashboard'),
        API.get('/admin/analytics'),
        API.get('/accidents?status=active&limit=5'),
      ]);
      setDashboard(dbRes.data.dashboard);
      setAnalytics(anRes.data.analytics);
      setAccidents(accRes.data.accidents || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => {
    const socket = getSocket();
    socket.on('accident:new', (data) => {
      setLiveAccidents(prev => [data, ...prev].slice(0, 10));
      toast('🚨 New accident reported!', { icon: '🆘', duration: 5000 });
    });
    socket.on('accident:dispatched', (data) => {
      toast(`📡 Phase ${data.phase} dispatch: ${data.alertsSent} alerts sent`, { icon: '⚡' });
    });
    return () => { socket.off('accident:new'); socket.off('accident:dispatched'); };
  }, []);

  const COLORS = ['#ef4444', '#f59e0b', '#3b82f6', '#22c55e', '#8b5cf6'];

  if (loading) return <Layout title="Admin Dashboard"><div className="loading-screen"><div className="spinner spinner-lg" /></div></Layout>;

  const db = dashboard || {};
  return (
    <Layout title="Admin Dashboard">
      {/* Live Accident Feed */}
      {liveAccidents.length > 0 && (
        <div className="card card-red animate-slideup mb-24">
          <div className="flex-between mb-12">
            <h3>🚨 Live Accident Feed</h3>
            <span className="badge badge-red animate-blink">● LIVE</span>
          </div>
          {liveAccidents.slice(0, 3).map((a, i) => (
            <div key={i} className="flex-center gap-12" style={{ padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 14 }}>
              <span className="status-dot alert" />
              <span style={{ fontFamily: 'monospace', color: 'var(--cyan-400)' }}>{a.code}</span>
              <span className="text-muted">{a.lat?.toFixed(4)}, {a.lng?.toFixed(4)}</span>
              <span className="badge badge-red">{a.severity}</span>
              <span className="text-muted text-xs">{new Date(a.timestamp).toLocaleTimeString()}</span>
            </div>
          ))}
        </div>
      )}

      <div className="stat-grid">
        {[
          { l: 'Total Users', v: db.users?.total || 0, i: '👥', c: 'blue' },
          { l: 'Active Incidents', v: db.accidents?.active || 0, i: '🚨', c: 'red' },
          { l: 'Resolved', v: db.accidents?.resolved || 0, i: '✅', c: 'green' },
          { l: 'Hospitals', v: db.services?.hospitals || 0, i: '🏥', c: 'cyan' },
          { l: 'Ambulances', v: db.services?.ambulances || 0, i: '🚑', c: 'blue' },
          { l: 'Devices Linked', v: db.devices?.linked || 0, i: '📟', c: 'amber' },
        ].map(s => (
          <div key={s.l} className={`stat-card ${s.c}`}>
            <div className="stat-icon">{s.i}</div>
            <div className="stat-value">{s.v}</div>
            <div className="stat-label">{s.l}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
        {/* Severity Chart */}
        <div className="card">
          <h3 style={{ marginBottom: 16 }}>📊 Accidents by Severity</h3>
          {analytics?.bySeverity?.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={analytics.bySeverity}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="severity" tick={{ fill: '#9ca3af', fontSize: 12 }} />
                <YAxis tick={{ fill: '#9ca3af', fontSize: 12 }} />
                <Tooltip contentStyle={{ background: '#16161f', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, color: '#f0f0f5' }} />
                <Bar dataKey="count" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>No data yet</div>}
        </div>

        {/* Status Pie */}
        <div className="card">
          <h3 style={{ marginBottom: 16 }}>📈 Accident Status</h3>
          {analytics?.byStatus?.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={analytics.byStatus} dataKey="count" nameKey="status" cx="50%" cy="50%" outerRadius={80} label={({ status, count }) => `${status}:${count}`}>
                  {analytics.byStatus.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ background: '#16161f', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, color: '#f0f0f5' }} />
              </PieChart>
            </ResponsiveContainer>
          ) : <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>No data yet</div>}
        </div>
      </div>

      {/* Recent Accidents */}
      <div className="card">
        <div className="flex-between mb-16">
          <h3>🕐 Recent Active Incidents</h3>
          <span className="badge badge-red animate-blink">{accidents.length} active</span>
        </div>
        {accidents.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>✅ No active incidents</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Code</th><th>Time</th><th>Location</th><th>Severity</th><th>Status</th><th>Phase</th></tr></thead>
              <tbody>
                {accidents.map(a => (
                  <tr key={a.id}>
                    <td><code style={{ color: 'var(--cyan-400)', fontSize: 12 }}>{a.accident_code}</code></td>
                    <td className="text-sm text-muted">{new Date(a.createdAt).toLocaleTimeString('en-IN')}</td>
                    <td className="text-sm">{parseFloat(a.latitude).toFixed(4)}, {parseFloat(a.longitude).toFixed(4)}</td>
                    <td><span className={`badge badge-${a.severity === 'critical' ? 'red' : a.severity === 'high' ? 'amber' : 'blue'}`}>{a.severity}</span></td>
                    <td><span className={`badge badge-${a.status === 'responded' ? 'green' : a.status === 'dispatched' ? 'blue' : 'red'}`}>{a.status}</span></td>
                    <td><span className="badge badge-purple">Phase {a.phase}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Layout>
  );
}
