import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  MapIcon, UserIcon, DashboardIcon, AlertIcon, UsersIcon, CpuIcon, BriefcaseIcon,
  KeyIcon, FileTextIcon, HospitalIcon, CarIcon, ShieldIcon, WrenchIcon, HeartIcon, FlameIcon,
  XIcon
} from './Icons';

const mapItem = { icon: <MapIcon size={16} />, label: 'Live Map', path: '/map' };
const profileItem = { icon: <UserIcon size={16} />, label: 'My Profile', path: '/profile' };

const navConfigs = {
  user: [
    { icon: <DashboardIcon size={16} />, label: 'Dashboard', path: '/dashboard' },
    { icon: <AlertIcon size={16} />, label: 'Report Accident', path: '/accident' },
    mapItem,
    profileItem,
  ],
  admin: [
    { icon: <DashboardIcon size={16} />, label: 'Dashboard', path: '/admin' },
    { icon: <UsersIcon size={16} />, label: 'Users', path: '/admin/users' },
    { icon: <CpuIcon size={16} />, label: 'Devices', path: '/admin/devices' },
    { icon: <BriefcaseIcon size={16} />, label: 'Services', path: '/admin/services' },
    { icon: <AlertIcon size={16} />, label: 'Accidents', path: '/admin/accidents' },
    { icon: <MapIcon size={16} />, label: 'Live Map', path: '/admin/map' },
    { icon: <FileTextIcon size={16} />, label: 'API Docs', path: '/docs' },
    profileItem,
  ],
  superadmin: [
    { icon: <DashboardIcon size={16} />, label: 'Dashboard', path: '/admin' },
    { icon: <UsersIcon size={16} />, label: 'Users', path: '/admin/users' },
    { icon: <KeyIcon size={16} />, label: 'Manage Admins', path: '/admin/manage-admins' },
    { icon: <CpuIcon size={16} />, label: 'Devices', path: '/admin/devices' },
    { icon: <BriefcaseIcon size={16} />, label: 'Services', path: '/admin/services' },
    { icon: <AlertIcon size={16} />, label: 'Accidents', path: '/admin/accidents' },
    { icon: <MapIcon size={16} />, label: 'Live Map', path: '/admin/map' },
    { icon: <FileTextIcon size={16} />, label: 'API Docs', path: '/docs' },
    profileItem,
  ],
  hospital: [
    { icon: <HospitalIcon size={16} />, label: 'Hospital Dashboard', path: '/hospital' },
    mapItem,
    profileItem,
  ],
  ambulance: [
    { icon: <CarIcon size={16} />, label: 'Ambulance Dashboard', path: '/ambulance' },
    mapItem,
    profileItem,
  ],
  police_station: [
    { icon: <ShieldIcon size={16} />, label: 'Police Dashboard', path: '/police' },
    mapItem,
    profileItem,
  ],
  policeman: [
    { icon: <ShieldIcon size={16} />, label: 'Officer Dashboard', path: '/police' },
    mapItem,
    profileItem,
  ],
  mechanic: [
    { icon: <WrenchIcon size={16} />, label: 'Mechanic Dashboard', path: '/mechanic' },
    mapItem,
    profileItem,
  ],
  insurance: [
    { icon: <FileTextIcon size={16} />, label: 'Insurance Portal', path: '/insurance' },
    mapItem,
    profileItem,
  ],
  fire_department: [
    { icon: <FlameIcon size={16} />, label: 'Fire Dashboard', path: '/fire' },
    mapItem,
    profileItem,
  ],
  volunteer: [
    { icon: <HeartIcon size={16} />, label: 'Volunteer Dashboard', path: '/volunteer' },
    mapItem,
    profileItem,
  ],
  emergency_personnel: [
    { icon: <AlertIcon size={16} />, label: 'Emergency Dashboard', path: '/volunteer' },
    mapItem,
    profileItem,
  ],
};

export default function Sidebar({ isOpen, onClose }) {
  const { user, entityType, logout, settings } = useAuth();
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
          {settings?.logoUrl ? (
            <img src={settings.logoUrl} alt="Logo" style={{ width: 36, height: 36, objectFit: 'contain', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }} />
          ) : (
            <div className="logo-icon">SOS</div>
          )}
          <div>
            <div className="logo-text">{settings?.appName || 'AapadBandhav'}</div>
            <div className="logo-sub">Emergency Response</div>
          </div>
        </div>
        <button
          onClick={onClose}
          className="btn btn-ghost btn-sm mobile-close-btn icon-btn"
          style={{ display: 'none', color: 'var(--text-muted)' }}
          aria-label="Close navigation"
          title="Close navigation"
        >
          <XIcon size={18} />
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
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 500, color: 'var(--text-primary)' }}>
            <span className="status-dot online" />
            {user?.full_name || user?.name || 'User'}
          </span>
          <span style={{ fontSize: 10, opacity: 0.6, display: 'block', marginTop: 2 }}>{entityType?.toUpperCase()}</span>
        </div>
        <button className="btn btn-secondary btn-sm w-full" onClick={logout}>Logout</button>
      </div>
    </aside>
  );
}
