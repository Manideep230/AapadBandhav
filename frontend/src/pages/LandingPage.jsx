import React from 'react';
import { useNavigate } from 'react-router-dom';

export default function LandingPage() {
  const navigate = useNavigate();
  return (
    <div style={{ minHeight: '100vh', background: 'radial-gradient(ellipse at top, rgba(220,38,38,0.15) 0%, transparent 55%), var(--bg-primary)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center' }}>
      <div style={{ fontSize: 72, marginBottom: 16 }}>🚨</div>
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 52, fontWeight: 900, marginBottom: 12, background: 'linear-gradient(135deg,#f87171,#fbbf24)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>AapadBandhav</h1>
      <p style={{ fontSize: 20, color: 'var(--text-secondary)', maxWidth: 540, marginBottom: 8 }}>Smart Accident Detection &amp; Emergency Response Platform</p>
      <p style={{ fontSize: 14, color: 'var(--text-muted)', maxWidth: 480, marginBottom: 40 }}>IoT-powered vehicle accident detection with real-time multi-agency emergency dispatch. Saving lives through technology.</p>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 64 }}>
        <button className="btn btn-primary btn-lg" onClick={() => navigate('/login')}>🔐 Login to Portal</button>
        <button className="btn btn-secondary btn-lg" onClick={() => navigate('/register')}>📋 Register Now</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 20, maxWidth: 900, width: '100%' }}>
        {[
          { icon: '📡', title: 'IoT Detection', desc: 'Real-time accident sensing via vehicle IoT devices' },
          { icon: '🚑', title: 'Auto Dispatch', desc: 'Nearest ambulance, police & hospital alerted instantly' },
          { icon: '🗺️', title: 'Live Tracking', desc: 'Real-time GPS tracking of all emergency responders' },
          { icon: '🛡️', title: 'Insurance Link', desc: 'Automatic claim alerts to your insurance company' },
        ].map(f => (
          <div key={f.title} className="card" style={{ textAlign: 'left' }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>{f.icon}</div>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>{f.title}</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{f.desc}</div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 40, display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
        {['🏥 Hospital', '🚑 Ambulance', '👮 Police', '🔧 Mechanic', '🛡️ Insurance', '🔥 Fire Dept', '🤝 Volunteer', '📊 Admin'].map(p => (
          <span key={p} className="badge badge-muted">{p}</span>
        ))}
      </div>
      <p style={{ marginTop: 16, fontSize: 12, color: 'var(--text-muted)' }}>8 specialized portals • Real-time dispatch • Phase 1 (8km) + Phase 2 (25km)</p>
    </div>
  );
}
