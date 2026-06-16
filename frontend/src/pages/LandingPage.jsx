import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import API from '../api/axios';
import { 
  SirenIcon, CpuIcon, MapIcon, BriefcaseIcon, HospitalIcon, 
  CarIcon, ShieldIcon, WrenchIcon, HeartIcon, FlameIcon, UserIcon, CheckIcon, AlertIcon
} from '../components/Icons';

export default function LandingPage() {
  const navigate = useNavigate();
  const { settings } = useAuth();
  const [simulationState, setSimulationState] = useState('idle'); // idle -> impact -> transmit -> dispatch -> resolved
  const [logs, setLogs] = useState([]);
  const [activeStep, setActiveStep] = useState(0);

  // Live statistics state (with defaults requested by user)
  const [stats, setStats] = useState({
    livesSaved: 1422,
    responseTime: 8.5,
    activeNodes: 129
  });

  useEffect(() => {
    // Fetch real metrics from the database public route
    API.get('/locations/public/stats')
      .then(res => {
        if (res.data && res.data.success && res.data.stats) {
          setStats(res.data.stats);
        }
      })
      .catch(err => console.error('Failed to load landing stats:', err));

    // Tick active stats occasionally to make them look alive
    const interval = setInterval(() => {
      setStats(prev => ({
        livesSaved: prev.livesSaved + (Math.random() > 0.7 ? 1 : 0),
        responseTime: parseFloat((prev.responseTime + (Math.random() * 0.2 - 0.1)).toFixed(1)),
        activeNodes: prev.activeNodes + (Math.random() > 0.85 ? (Math.random() > 0.5 ? 1 : -1) : 0)
      }));
    }, 4000);
    return () => clearInterval(interval);
  }, []);


  const triggerSimulation = () => {
    setSimulationState('impact');
    setActiveStep(1);
    setLogs(['[SYSTEM] Telemetry uplink established...', '[MONITOR] Diagnostic level: 1.0G (Normal)']);

    // Step 1: Force Impact
    setTimeout(() => {
      setSimulationState('transmit');
      setActiveStep(2);
      setLogs(prev => [
        ...prev,
        '💥 [SENSOR] Critical impact detected! Force: 8.7 Gs',
        '📍 [GPS] Incident coordinates locked: 16.5062° N, 80.6480° E',
        '⚡ [SOS] Initiating emergency payload transmission...'
      ]);
    }, 1200);

    // Step 2: Transmission & Server Handshake
    setTimeout(() => {
      setSimulationState('dispatch');
      setActiveStep(3);
      setLogs(prev => [
        ...prev,
        '📡 [UPLINK] Payload successfully broadcasted.',
        '🤖 [AI ENGINE] Nearest responder nodes mapped:',
        '🏥 [DISPATCH] Hospital: Apollo General (2.1km) -> ALERTED',
        '🚑 [DISPATCH] Ambulance: Unit AMB-09 -> DISPATCHED (ETA: 4m)',
        '🚓 [DISPATCH] Police: City Traffic Patrol -> EN ROUTE (ETA: 7m)'
      ]);
    }, 3200);

    // Step 3: Resolution / Finished
    setTimeout(() => {
      setSimulationState('resolved');
      setActiveStep(4);
      setLogs(prev => [
        ...prev,
        '💚 [STATUS] Responders arrived at location. Assistance active.',
        '🚀 [BENCHMARK] Total platform dispatch latency: 420ms (SLA 100%)'
      ]);
    }, 5500);
  };

  const resetSimulation = () => {
    setSimulationState('idle');
    setActiveStep(0);
    setLogs([]);
  };

  return (
    <div style={{ 
      minHeight: '100vh', 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center', 
      padding: '60px 24px',
      position: 'relative',
      overflow: 'hidden',
      fontFamily: "'Outfit', 'Inter', sans-serif"
    }}>
      {/* Stylesheet injector for local animations */}
      <style>{`
        .glass-panel {
          background: rgba(9, 7, 20, 0.45);
          border: 1px solid rgba(168, 85, 247, 0.08);
          backdrop-filter: blur(30px) saturate(210%);
          -webkit-backdrop-filter: blur(30px) saturate(210%);
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.03);
          border-radius: 24px;
          transition: all 0.5s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .glow-accent {
          position: absolute;
          width: 50vw;
          height: 50vh;
          filter: blur(140px);
          opacity: 0.15;
          pointer-events: none;
          z-index: -1;
          border-radius: 50%;
        }
        .animate-pulse-light {
          animation: pulse-glow 3s infinite ease-in-out;
        }
        @keyframes pulse-glow {
          0%, 100% { opacity: 0.15; transform: scale(1); }
          50% { opacity: 0.25; transform: scale(1.1); }
        }
        .simulator-log {
          font-family: 'Consolas', 'Courier New', monospace;
          font-size: 11.5px;
          color: #a78bfa;
          background: rgba(0, 0, 0, 0.4);
          border-radius: 12px;
          padding: 12px;
          height: 120px;
          overflow-y: auto;
          border: 1px solid rgba(255, 255, 255, 0.05);
          margin-top: 14px;
        }
        .bento-hover-effect:hover {
          transform: translateY(-4px) scale(1.01);
          border-color: rgba(168, 85, 247, 0.3) !important;
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4), 0 0 20px rgba(168, 85, 247, 0.15) !important;
        }
        .simulation-card-active {
          animation: card-shake 0.4s ease-in-out 3;
          border-color: #ef4444 !important;
          box-shadow: 0 0 30px rgba(239, 68, 68, 0.25) !important;
        }
        @keyframes card-shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-4px); }
          75% { transform: translateX(4px); }
        }
        .step-indicator {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 28px;
          height: 28px;
          border-radius: 50%;
          font-size: 11px;
          font-weight: 700;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: var(--text-muted);
          transition: all 0.3s;
        }
        .step-indicator.active {
          background: var(--purple-primary);
          color: #fff;
          border-color: var(--purple-primary);
          box-shadow: 0 0 10px rgba(168, 85, 247, 0.4);
        }
        .step-indicator.completed {
          background: #10b981;
          color: #fff;
          border-color: #10b981;
        }
        .glare-heading {
          background: linear-gradient(135deg, #fff 30%, #a78bfa 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
      `}</style>

      {/* Decorative Blur Orbs */}
      <div className="glow-accent animate-pulse-light" style={{ top: '-10%', left: '-10%', background: 'radial-gradient(circle, rgba(168, 85, 247, 0.4) 0%, transparent 70%)' }}></div>
      <div className="glow-accent animate-pulse-light" style={{ bottom: '-10%', right: '-10%', background: 'radial-gradient(circle, rgba(99, 102, 241, 0.35) 0%, transparent 70%)', animationDelay: '-1.5s' }}></div>

      <div style={{ maxWidth: '1150px', width: '100%', display: 'flex', flexDirection: 'column', gap: 24, zIndex: 1 }}>
        
        {/* Top Header Panel */}
        <div className="glass-panel" style={{ padding: '48px 32px', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
          {/* Logo element */}
          {settings?.logoUrl ? (
            <img src={settings.logoUrl} alt="Logo" style={{ width: 68, height: 68, objectFit: 'contain', marginBottom: 20, borderRadius: 'var(--radius-md)', border: '1px solid rgba(255, 255, 255, 0.08)' }} />
          ) : (
            <div style={{ 
              width: 68, 
              height: 68, 
              background: 'linear-gradient(135deg, #f43f5e 0%, #e11d48 100%)', 
              borderRadius: 16, 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              color: '#fff', 
              margin: '0 auto 20px auto',
              boxShadow: '0 8px 20px rgba(244, 63, 94, 0.3)'
            }}>
              <SirenIcon size={34} />
            </div>
          )}

          <h1 className="glare-heading" style={{ 
            fontSize: 'calc(2.5rem + 1vw)', 
            fontWeight: 800, 
            marginBottom: 14, 
            letterSpacing: '-0.04em',
            lineHeight: 1.1
          }}>
            {settings?.appName || 'AapadBandhav'}
          </h1>
          
          <p style={{ 
            fontSize: '17px', 
            color: 'var(--text-secondary)', 
            maxWidth: '650px', 
            margin: '0 auto 16px auto',
            fontWeight: 500,
            lineHeight: 1.5
          }}>
            IoT-Powered Collision Detection &amp; Automated Multi-Agency Rescue Dispatch System
          </p>

          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <span className="badge badge-purple" style={{ textTransform: 'uppercase', fontSize: '9px', letterSpacing: 1 }}>Beta 2.0 Live</span>
            <span className="badge badge-green" style={{ textTransform: 'uppercase', fontSize: '9px', letterSpacing: 1 }}>IoT Connected</span>
          </div>
        </div>

        {/* Middle Two-Column Bento Layout */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1.1fr) minmax(400px, 1.9fr)', gap: 24 }}>
          
          {/* Left Column: Portal Entry and Live Stats */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            
            {/* Quick Access Card */}
            <div className="glass-panel bento-hover-effect" style={{ padding: 28, display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div>
                <h2 style={{ fontSize: 19, fontWeight: 700, margin: '0 0 6px 0', color: '#fff' }}>Portal Access</h2>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>Access dispatch consoles, responder portals, or manage citizen links.</p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
                <button className="btn btn-primary" style={{ width: '100%', height: 44 }} onClick={() => navigate('/login')}>
                  Open Portal Console
                </button>
                <button className="btn btn-secondary" style={{ width: '100%', height: 44 }} onClick={() => navigate('/register')}>
                  Register New Account
                </button>
              </div>
            </div>

            {/* Simulated Live Analytics Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div className="glass-panel" style={{ padding: 20, textAlign: 'left' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Lives Protected</div>
                <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--green-primary)' }}>{stats.livesSaved}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Realtime saved tally</div>
              </div>
              <div className="glass-panel" style={{ padding: 20, textAlign: 'left' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Avg Response</div>
                <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--cyan-primary)' }}>{stats.responseTime}m</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Call to arrival dispatch</div>
              </div>
            </div>

            {/* Active Infrastructure Card */}
            <div className="glass-panel" style={{ padding: 24, textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Network Terminals</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>{stats.activeNodes} Nodes Registered</div>
              </div>
              <div className="status-dot online"></div>
            </div>

          </div>

          {/* Right Column: Dynamic Interactive IoT & Dispatch Simulator */}
          <div className={`glass-panel ${['impact', 'transmit'].includes(simulationState) ? 'simulation-card-active' : ''}`} style={{ padding: 32, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <h3 style={{ fontSize: 17, fontWeight: 700, margin: '0 0 4px 0', color: '#fff', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <CpuIcon size={18} className="text-purple" /> Emergency Simulator
                </h3>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>Test platform dispatch logic and sensor events.</p>
              </div>

              {simulationState !== 'idle' && (
                <button className="btn btn-ghost" style={{ fontSize: 11, padding: '4px 10px' }} onClick={resetSimulation}>
                  Reset
                </button>
              )}
            </div>

            {/* Simulation Status Steps Container */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)', padding: '12px 20px', borderRadius: 14, border: '1px solid rgba(255,255,255,0.04)', marginBottom: 20 }}>
              {[
                { label: 'Normal', step: 1 },
                { label: 'Impact', step: 2 },
                { label: 'Uplink', step: 3 },
                { label: 'Dispatch', step: 4 }
              ].map(s => {
                const isActive = activeStep === s.step;
                const isCompleted = activeStep > s.step;
                return (
                  <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div className={`step-indicator ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''}`}>
                      {isCompleted ? <CheckIcon size={12} /> : s.step}
                    </div>
                    <span style={{ fontSize: 11.5, fontWeight: isActive || isCompleted ? 600 : 500, color: isActive ? 'var(--text-primary)' : isCompleted ? 'var(--green-primary)' : 'var(--text-muted)' }}>
                      {s.label}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Main Interactive Workspace Area */}
            <div style={{ flex: 1, minHeight: 180, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              {simulationState === 'idle' && (
                <div style={{ textAlign: 'center', padding: '20px 0' }}>
                  <div style={{ fontSize: 36, marginBottom: 12 }}>🚗</div>
                  <h4 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 6px 0', color: '#fff' }}>Device State: Standby Mode</h4>
                  <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', maxWidth: 360, margin: '0 auto 16px auto', lineHeight: 1.4 }}>
                    The vehicle IoT simulation is connected. Press the collision trigger below to simulate an 8.5G crash impact event.
                  </p>
                  <button className="btn btn-primary" style={{ background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)', boxShadow: '0 8px 24px rgba(239, 68, 68, 0.4)' }} onClick={triggerSimulation}>
                    Simulate Vehicle Crash
                  </button>
                </div>
              )}

              {simulationState === 'impact' && (
                <div style={{ textAlign: 'center', padding: '20px 0' }}>
                  <div style={{ fontSize: 36, marginBottom: 12, animation: 'card-shake 0.2s infinite' }}>💥</div>
                  <h4 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 6px 0', color: '#ef4444' }}>IMPACT DETECTED</h4>
                  <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', margin: 0 }}>
                    Sensing collision force threshold exceedance. Initializing crash payload...
                  </p>
                  <div style={{ width: '60px', height: '3px', background: '#ef4444', margin: '12px auto 0 auto', borderRadius: 99 }} />
                </div>
              )}

              {simulationState === 'transmit' && (
                <div style={{ textAlign: 'center', padding: '20px 0' }}>
                  <div style={{ fontSize: 36, marginBottom: 12 }}>📡</div>
                  <h4 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 6px 0', color: 'var(--cyan-primary)' }}>BROADCASTING CRITICAL SOS</h4>
                  <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', margin: '0 auto 12px auto', maxWidth: 300 }}>
                    Uploading telemetry payload to AapadBandhav server terminals...
                  </p>
                  <div style={{ width: '60%', height: 4, background: 'rgba(255,255,255,0.05)', borderRadius: 2, margin: '0 auto', overflow: 'hidden', position: 'relative' }}>
                    <div style={{ position: 'absolute', height: '100%', width: '40%', background: 'var(--cyan-primary)', borderRadius: 2, animation: 'pulse-glow 1s infinite alternate' }} />
                  </div>
                </div>
              )}

              {simulationState === 'dispatch' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '10px 0' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--purple-primary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    🤖 AI Dispatch Recommendation
                  </div>
                  
                  {[
                    { node: 'Ambulance Unit AMB-09', dist: '1.8km', eta: '4 min', role: 'ambulance', status: 'En Route', color: 'blue' },
                    { node: 'Apollo Emergency Hospital', dist: '2.1km', eta: 'Direct Intake', role: 'hospital', status: 'Alerted', color: 'green' },
                    { node: 'City Traffic Patrol 4', dist: '3.1km', eta: '7 min', role: 'police', status: 'Notified', color: 'purple' }
                  ].map((d, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'rgba(255,255,255,0.02)', borderRadius: 10, border: '1px solid rgba(255,255,255,0.04)' }}>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>{d.node}</div>
                        <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>({d.dist})</span>
                      </div>
                      <span className={`badge badge-${d.color}`} style={{ fontSize: 9, padding: '2px 6px' }}>{d.status} • {d.eta}</span>
                    </div>
                  ))}
                </div>
              )}

              {simulationState === 'resolved' && (
                <div style={{ textAlign: 'center', padding: '16px 0' }}>
                  <div style={{ display: 'inline-flex', width: 44, height: 44, borderRadius: '50%', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid var(--green-primary)', alignItems: 'center', justifyContent: 'center', color: 'var(--green-primary)', marginBottom: 12 }}>
                    <CheckIcon size={20} />
                  </div>
                  <h4 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 4px 0', color: 'var(--green-primary)' }}>DISPATCH COMPLETED</h4>
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', maxWidth: 380, margin: '0 auto 16px auto', lineHeight: 1.4 }}>
                    Emergency signals successfully routed. Local agencies are currently tracking dispatch details live.
                  </p>
                  <button className="btn btn-secondary" style={{ height: 34, fontSize: 12 }} onClick={resetSimulation}>
                    Restart Sandbox Simulator
                  </button>
                </div>
              )}
            </div>

            {/* Live Terminal Logger */}
            {logs.length > 0 && (
              <div className="simulator-log">
                {logs.map((log, idx) => (
                  <div key={idx} style={{ marginBottom: 4 }}>{log}</div>
                ))}
              </div>
            )}

          </div>

        </div>

        {/* Footer Role Badges Panel */}
        <div className="glass-panel" style={{ padding: '28px 24px', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
            {[
              { label: 'Hospital Portal', icon: <HospitalIcon size={12} /> },
              { label: 'Ambulance Portal', icon: <CarIcon size={12} /> },
              { label: 'Police Portal', icon: <ShieldIcon size={12} /> },
              { label: 'Mechanic Portal', icon: <WrenchIcon size={12} /> },
              { label: 'Insurance Portal', icon: <BriefcaseIcon size={12} /> },
              { label: 'Fire Dept Portal', icon: <FlameIcon size={12} /> },
              { label: 'Volunteer Portal', icon: <HeartIcon size={12} /> },
              { label: 'Admin Console', icon: <UserIcon size={12} /> }
            ].map(p => (
              <span key={p.label} className="badge badge-muted" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                {p.icon} {p.label}
              </span>
            ))}
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
            System Status: Operational • API Latency: 42ms • Secure Socket Terminals: Connected
          </p>
        </div>

      </div>
    </div>
  );
}
