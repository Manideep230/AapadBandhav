import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const mapItem = { icon: 'M', label: 'Live Map', path: '/map' };
const profileItem = { icon: 'P', label: 'My Profile', path: '/profile' };

const navConfigs = {
  user: [
    { icon: 'D', label: 'Dashboard', path: '/dashboard' },
    { icon: 'A', label: 'Report Accident', path: '/accident' },
    mapItem,
    profileItem,
  ],
  admin: [
    { icon: 'D', label: 'Dashboard', path: '/admin' },
    { icon: 'U', label: 'Users', path: '/admin/users' },
    { icon: 'S', label: 'Services', path: '/admin/services' },
    { icon: 'A', label: 'Accidents', path: '/admin/accidents' },
    { icon: 'M', label: 'Live Map', path: '/admin/map' },
    profileItem,
  ],
  hospital: [
    { icon: 'H', label: 'Hospital Dashboard', path: '/hospital' },
    mapItem,
    profileItem,
  ],
  ambulance: [
    { icon: 'R', label: 'Ambulance Dashboard', path: '/ambulance' },
    mapItem,
    profileItem,
  ],
  police_station: [
    { icon: 'P', label: 'Police Dashboard', path: '/police' },
    mapItem,
    profileItem,
  ],
  policeman: [
    { icon: 'O', label: 'Officer Dashboard', path: '/police' },
    mapItem,
    profileItem,
  ],
  mechanic: [
    { icon: 'T', label: 'Mechanic Dashboard', path: '/mechanic' },
    mapItem,
    profileItem,
  ],
  insurance: [
    { icon: 'I', label: 'Insurance Portal', path: '/insurance' },
    mapItem,
    profileItem,
  ],
};

export default function Sidebar() {
  const { user, entityType, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const navItems = navConfigs[entityType] || [];

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="logo-icon">SOS</div>
        <div>
          <div className="logo-text">AapadBandhav</div>
          <div className="logo-sub">Emergency Response</div>
        </div>
      </div>

      <nav className="sidebar-nav">
        <div className="nav-section-label">Navigation</div>
        {navItems.map((item) => (
          <div
            key={item.path}
            className={`nav-item ${location.pathname === item.path ? 'active' : ''}`}
            onClick={() => navigate(item.path)}
          >
            <span className="nav-icon">{item.icon}</span>
            <span className="nav-item-label">{item.label}</span>
          </div>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="status-dot online" />
            {user?.full_name || user?.name || 'User'}
          </span>
          <span style={{ fontSize: 11, opacity: 0.6 }}>{entityType?.toUpperCase()}</span>
        </div>
        <button className="btn btn-secondary btn-sm w-full" onClick={logout}>Logout</button>
      </div>
    </aside>
  );
}
