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
    { icon: '📟', label: 'Devices', path: '/admin/devices' },
    { icon: 'S', label: 'Services', path: '/admin/services' },
    { icon: 'A', label: 'Accidents', path: '/admin/accidents' },
    { icon: 'M', label: 'Live Map', path: '/admin/map' },
    { icon: 'B', label: 'API Docs', path: '/docs' },
    profileItem,
  ],
  superadmin: [
    { icon: 'D', label: 'Dashboard', path: '/admin' },
    { icon: 'U', label: 'Users', path: '/admin/users' },
    { icon: '🔑', label: 'Manage Admins', path: '/admin/manage-admins' },
    { icon: '📟', label: 'Devices', path: '/admin/devices' },
    { icon: 'S', label: 'Services', path: '/admin/services' },
    { icon: 'A', label: 'Accidents', path: '/admin/accidents' },
    { icon: 'M', label: 'Live Map', path: '/admin/map' },
    { icon: 'B', label: 'API Docs', path: '/docs' },
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
  fire_department: [
    { icon: '🚒', label: 'Fire Dashboard', path: '/fire' },
    mapItem,
    profileItem,
  ],
  volunteer: [
    { icon: '🤝', label: 'Volunteer Dashboard', path: '/volunteer' },
    mapItem,
    profileItem,
  ],
  emergency_personnel: [
    { icon: '🚨', label: 'Emergency Dashboard', path: '/volunteer' },
    mapItem,
    profileItem,
  ],
};

export default function Sidebar({ isOpen, onClose }) {
  const { user, entityType, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const navItems = navConfigs[entityType] || [];

  const handleNavClick = (path) => {
    navigate(path);
    if (onClose) onClose();
  };

  return (
    <aside className={`sidebar ${isOpen ? 'open' : ''}`} style={{ zIndex: 999 }}>
      <div className="sidebar-logo" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="logo-icon">SOS</div>
          <div>
            <div className="logo-text">AapadBandhav</div>
            <div className="logo-sub">Emergency Response</div>
          </div>
        </div>
        <button
          onClick={onClose}
          className="btn btn-ghost btn-sm mobile-close-btn"
          style={{
            display: 'none',
            padding: '4px 8px',
            fontSize: 16,
            color: 'var(--text-muted)'
          }}
        >
          ✕
        </button>
      </div>

      <nav className="sidebar-nav">
        <div className="nav-section-label">Navigation</div>
        {navItems.map((item) => (
          <div
            key={item.path}
            className={`nav-item ${location.pathname === item.path ? 'active' : ''}`}
            onClick={() => handleNavClick(item.path)}
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
