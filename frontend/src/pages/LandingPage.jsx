import React from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  SirenIcon, CpuIcon, MapIcon, BriefcaseIcon, HospitalIcon, 
  CarIcon, ShieldIcon, WrenchIcon, HeartIcon, FlameIcon, UserIcon 
} from '../components/Icons';

export default function LandingPage() {
  const navigate = useNavigate();

  return (
    <div style={{ 
      minHeight: '100vh', 
      background: 'var(--bg-primary)', 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center', 
      padding: '40px 24px' 
    }}>
      <div style={{ maxWidth: '1100px', width: '100%', display: 'flex', flexDirection: 'column', gap: 24 }}>
        
        {/* Header Block (Full Width) */}
        <div className="bento-card" style={{ textAlign: 'center', alignItems: 'center', padding: '48px 32px' }}>
          <div style={{ 
            width: 64, 
            height: 64, 
            background: 'var(--red-primary)', 
            borderRadius: 14, 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            color: '#fff', 
            marginBottom: 20 
          }}>
            <SirenIcon size={32} />
          </div>
          <h1 style={{ 
            fontSize: 48, 
            fontWeight: 800, 
            marginBottom: 12, 
            letterSpacing: '-0.03em' 
          }}>
            AapadBandhav
          </h1>
          <p style={{ 
            fontSize: 18, 
            color: 'var(--text-secondary)', 
            maxWidth: 600, 
            marginBottom: 8,
            fontWeight: 500
          }}>
            Smart Accident Detection &amp; Emergency Response Platform
          </p>
          <p style={{ 
            fontSize: 13.5, 
            color: 'var(--text-muted)', 
            maxWidth: 500 
          }}>
            IoT-powered vehicle accident detection with real-time multi-agency emergency dispatch. Saving lives through technology.
          </p>
        </div>

        {/* Middle Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: 24 }}>
          
          {/* Left Block: Call to Action */}
          <div className="bento-card" style={{ justifyContent: 'center', alignItems: 'center', gap: 20, padding: 32 }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, textAlign: 'center', color: 'var(--text-primary)' }}>
              Portal Access
            </h2>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', textAlign: 'center', marginBottom: 8 }}>
              Access specialized dispatch consoles or manage your vehicle tracking link.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
              <button className="btn btn-primary btn-lg" style={{ width: '100%' }} onClick={() => navigate('/login')}>
                Login to Portal
              </button>
              <button className="btn btn-secondary btn-lg" style={{ width: '100%' }} onClick={() => navigate('/register')}>
                Register Now
              </button>
            </div>
          </div>

          {/* Right Block: 2x2 Feature Bento */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {[
              { icon: <CpuIcon size={24} style={{ color: 'var(--cyan-primary)' }} />, title: 'IoT Detection', desc: 'Real-time accident sensing via vehicle IoT devices' },
              { icon: <SirenIcon size={24} style={{ color: 'var(--red-primary)' }} />, title: 'Auto Dispatch', desc: 'Nearest ambulance, police & hospital alerted instantly' },
              { icon: <MapIcon size={24} style={{ color: 'var(--blue-primary)' }} />, title: 'Live Tracking', desc: 'Real-time GPS tracking of all emergency responders' },
              { icon: <BriefcaseIcon size={24} style={{ color: 'var(--amber-primary)' }} />, title: 'Insurance Link', desc: 'Automatic claim alerts to your insurance company' },
            ].map(f => (
              <div key={f.title} className="bento-card" style={{ padding: 20, gap: 10 }}>
                <div>{f.icon}</div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{f.title}</div>
                <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.4 }}>{f.desc}</div>
              </div>
            ))}
          </div>

        </div>

        {/* Footer Portals Block */}
        <div className="bento-card" style={{ padding: 24, alignItems: 'center', gap: 16 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
            {[
              { label: 'Hospital', icon: <HospitalIcon size={12} /> },
              { label: 'Ambulance', icon: <CarIcon size={12} /> },
              { label: 'Police', icon: <ShieldIcon size={12} /> },
              { label: 'Mechanic', icon: <WrenchIcon size={12} /> },
              { label: 'Insurance', icon: <BriefcaseIcon size={12} /> },
              { label: 'Fire Dept', icon: <FlameIcon size={12} /> },
              { label: 'Volunteer', icon: <HeartIcon size={12} /> },
              { label: 'Admin', icon: <UserIcon size={12} /> }
            ].map(p => (
              <span key={p.label} className="badge badge-muted" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px' }}>
                {p.icon} {p.label}
              </span>
            ))}
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            8 specialized portals • Real-time dispatch • Phase 1 (8km) + Phase 2 (25km)
          </p>
        </div>

      </div>
    </div>
  );
}
