import React, { useState, useEffect, useCallback } from 'react';
import Layout from '../../components/Layout';
import API from '../../api/axios';
import toast from 'react-hot-toast';
import { getSocket } from '../../api/socket';
import { useAuth } from '../../context/AuthContext';
import MapView, { ICONS } from '../../components/MapView';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { 
  SirenIcon, UsersIcon, CheckIcon, HospitalIcon, CarIcon, CpuIcon, AlertIcon 
} from '../../components/Icons';

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

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    const socket = getSocket();
    
    const handleNewAccident = (data) => {
      setLiveAccidents(prev => [data, ...prev].slice(0, 10));
      toast('New accident reported!', { duration: 5000 });
    };
    
    const handleDispatched = (data) => {
      toast(`Phase ${data.phase} dispatch: ${data.alertsSent} alerts sent`);
    };

    socket.on('accident:new', handleNewAccident);
    socket.on('accident:dispatched', handleDispatched);
    
    return () => {
      socket.off('accident:new', handleNewAccident);
      socket.off('accident:dispatched', handleDispatched);
    };
  }, []);

  const COLORS = ['#ef4444', '#f59e0b', '#3b82f6', '#10b981', '#8b5cf6'];

  if (loading) return <Layout title="Admin Dashboard"><div className="loading-screen"><div className="spinner spinner-lg" /></div></Layout>;

  const db = dashboard || {};
  return (
    <Layout title="Admin Dashboard">
      
      {/* Live Accident Feed */}
      {liveAccidents.length > 0 && (
        <div className="bento-card card-red animate-slideup" style={{ marginBottom: 24 }}>
          <div className="flex-between mb-12">
            <h3 style={{ fontSize: 15, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <SirenIcon size={16} /> Live Accident Feed
            </h3>
            <span className="badge badge-red" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <span className="status-dot alert" /> LIVE
            </span>
          </div>
          {liveAccidents.slice(0, 3).map((a, i) => (
            <div key={i} className="flex-center gap-12" style={{ padding: '10px 0', borderBottom: '1px solid var(--border)', fontSize: 13.5 }}>
              <span className="status-dot alert" />
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--cyan-primary)' }}>{a.code}</span>
              <span className="text-muted">{a.lat?.toFixed(4)}, {a.lng?.toFixed(4)}</span>
              <span className="badge badge-red">{a.severity}</span>
              <span className="text-muted text-xs">{new Date(a.timestamp).toLocaleTimeString()}</span>
            </div>
          ))}
        </div>
      )}

      {/* Stats Bento Row */}
      <div className="bento-grid">
        {[
          { l: 'Total Users', v: db.users?.total || 0, i: <UsersIcon size={16} />, c: 'blue' },
          { l: 'Active Incidents', v: db.accidents?.active || 0, i: <SirenIcon size={16} />, c: 'red' },
          { l: 'Resolved', v: db.accidents?.resolved || 0, i: <CheckIcon size={16} />, c: 'green' },
          { l: 'Hospitals', v: db.services?.hospitals || 0, i: <HospitalIcon size={16} />, c: 'cyan' },
          { l: 'Ambulances', v: db.services?.ambulances || 0, i: <CarIcon size={16} />, c: 'blue' },
          { l: 'Devices Linked', v: db.devices?.linked || 0, i: <CpuIcon size={16} />, c: 'amber' },
        ].map(s => (
          <div key={s.l} className={`stat-card span-2 ${s.c}`}>
            <div className="stat-header">
              <span>{s.l}</span>
              <span className="stat-icon">{s.i}</span>
            </div>
            <div className="stat-value">{s.v}</div>
          </div>
        ))}
      </div>

      {/* Analytics Charts Bento Row */}
      <div className="bento-grid">
        {/* Severity Chart */}
        <div className="bento-card span-6">
          <h3 style={{ marginBottom: 16, fontSize: 15, fontWeight: 600 }}>Accidents by Severity</h3>
          {analytics?.bySeverity?.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={analytics.bySeverity}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="severity" tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} />
                <YAxis tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} />
                <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontFamily: 'var(--font-body)', fontSize: 12 }} />
                <Bar dataKey="count" fill="var(--red-primary)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>No data yet</div>}
        </div>

        {/* Status Pie */}
        <div className="bento-card span-6">
          <h3 style={{ marginBottom: 16, fontSize: 15, fontWeight: 600 }}>Accident Status</h3>
          {analytics?.byStatus?.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={analytics.byStatus} dataKey="count" nameKey="status" cx="50%" cy="50%" outerRadius={70} label={({ status, count }) => `${status}:${count}`} style={{ fontFamily: 'var(--font-body)', fontSize: 11, fill: 'var(--text-primary)' }}>
                  {analytics.byStatus.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontFamily: 'var(--font-body)', fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>No data yet</div>}
        </div>
      </div>

      {/* Recent Accidents Bento Row */}
      <div className="bento-grid">
        <div className="bento-card span-12">
          <div className="flex-between mb-16">
            <h3 style={{ fontSize: 15, fontWeight: 600 }}>Recent Active Incidents</h3>
            <span className="badge badge-red">{accidents.length} active</span>
          </div>
          {accidents.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>
              <CheckIcon size={24} style={{ color: 'var(--green-primary)', marginBottom: 8 }} />
              <div>No active incidents.</div>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Time</th>
                    <th>Location</th>
                    <th>Severity</th>
                    <th>Status</th>
                    <th>Phase</th>
                  </tr>
                </thead>
                <tbody>
                  {accidents.map(a => (
                    <tr key={a.id}>
                      <td><code style={{ color: 'var(--cyan-primary)', fontSize: 12 }}>{a.accident_code}</code></td>
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
      </div>

    </Layout>
  );
}
