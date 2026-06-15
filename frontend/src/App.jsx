import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';

// Pages
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import ProfilePage from './pages/ProfilePage';
import UserDashboard from './pages/user/UserDashboard';
import UserMap from './pages/user/UserMap';
import AccidentPage from './pages/user/AccidentPage';
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminUsers from './pages/admin/AdminUsers';
import AdminDevices from './pages/admin/AdminDevices';
import AdminServices from './pages/admin/AdminServices';
import AdminAccidents from './pages/admin/AdminAccidents';
import AdminMap from './pages/admin/AdminMap';
import AdminAdmins from './pages/admin/AdminAdmins';
import HospitalDashboard from './pages/hospital/HospitalDashboard';
import AmbulanceDashboard from './pages/ambulance/AmbulanceDashboard';
import PoliceDashboard from './pages/police/PoliceDashboard';
import MechanicDashboard from './pages/mechanic/MechanicDashboard';
import InsuranceDashboard from './pages/insurance/InsuranceDashboard';
import ApiDocsPortal from './pages/ApiDocsPortal';
import FireDashboard from './pages/fire/FireDashboard';
import VolunteerDashboard from './pages/volunteer/VolunteerDashboard';
import NavigationScreen from './pages/NavigationScreen';

const ALL_ROLES = ['user', 'admin', 'superadmin', 'hospital', 'ambulance', 'police_station', 'policeman', 'mechanic', 'insurance', 'volunteer', 'fire_department', 'emergency_personnel'];

const ProtectedRoute = ({ children, allowedRoles }) => {
  const { user, entityType, loading } = useAuth();
  if (loading) return <div className="loading-screen"><div className="spinner-lg spinner" /></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (allowedRoles && !allowedRoles.includes(entityType)) return <Navigate to="/" replace />;
  return children;
};

const AppRoutes = () => {
  const { user, entityType } = useAuth();

  const getDashboard = () => {
    switch (entityType) {
      case 'admin':
      case 'superadmin': return '/admin';
      case 'hospital': return '/hospital';
      case 'ambulance': return '/ambulance';
      case 'police_station': case 'policeman': return '/police';
      case 'mechanic': return '/mechanic';
      case 'insurance': return '/insurance';
      case 'volunteer': return '/volunteer';
      case 'fire_department': return '/fire';
      default: return '/dashboard';
    }
  };

  return (
    <Routes>
      <Route path="/" element={user ? <Navigate to={getDashboard()} replace /> : <LandingPage />} />
      <Route path="/login" element={user ? <Navigate to={getDashboard()} replace /> : <LoginPage />} />
      <Route path="/register" element={user ? <Navigate to={getDashboard()} replace /> : <RegisterPage />} />

      {/* User Routes */}
      <Route path="/dashboard" element={<ProtectedRoute allowedRoles={['user']}><UserDashboard /></ProtectedRoute>} />
      <Route path="/profile" element={<ProtectedRoute allowedRoles={ALL_ROLES}><ProfilePage /></ProtectedRoute>} />
      <Route path="/map" element={<ProtectedRoute allowedRoles={ALL_ROLES}><UserMap /></ProtectedRoute>} />
      <Route path="/accident" element={<ProtectedRoute allowedRoles={['user']}><AccidentPage /></ProtectedRoute>} />

      {/* Admin Routes */}
      <Route path="/admin" element={<ProtectedRoute allowedRoles={['admin', 'superadmin']}><AdminDashboard /></ProtectedRoute>} />
      <Route path="/admin/users" element={<ProtectedRoute allowedRoles={['admin', 'superadmin']}><AdminUsers /></ProtectedRoute>} />
      <Route path="/admin/manage-admins" element={<ProtectedRoute allowedRoles={['superadmin']}><AdminAdmins /></ProtectedRoute>} />
      <Route path="/admin/devices" element={<ProtectedRoute allowedRoles={['admin', 'superadmin']}><AdminDevices /></ProtectedRoute>} />
      <Route path="/admin/services" element={<ProtectedRoute allowedRoles={['admin', 'superadmin']}><AdminServices /></ProtectedRoute>} />
      <Route path="/admin/accidents" element={<ProtectedRoute allowedRoles={['admin', 'superadmin']}><AdminAccidents /></ProtectedRoute>} />
      <Route path="/admin/map" element={<ProtectedRoute allowedRoles={['admin', 'superadmin']}><AdminMap /></ProtectedRoute>} />

      {/* Developer API Portal */}
      <Route path="/docs" element={<ProtectedRoute allowedRoles={['admin', 'superadmin']}><ApiDocsPortal /></ProtectedRoute>} />


      {/* Emergency Service Routes */}
      <Route path="/hospital" element={<ProtectedRoute allowedRoles={['hospital']}><HospitalDashboard /></ProtectedRoute>} />
      <Route path="/ambulance" element={<ProtectedRoute allowedRoles={['ambulance']}><AmbulanceDashboard /></ProtectedRoute>} />
      <Route path="/police" element={<ProtectedRoute allowedRoles={['police_station','policeman']}><PoliceDashboard /></ProtectedRoute>} />
      <Route path="/mechanic" element={<ProtectedRoute allowedRoles={['mechanic']}><MechanicDashboard /></ProtectedRoute>} />
      <Route path="/insurance" element={<ProtectedRoute allowedRoles={['insurance']}><InsuranceDashboard /></ProtectedRoute>} />
      <Route path="/fire" element={<ProtectedRoute allowedRoles={['fire_department']}><FireDashboard /></ProtectedRoute>} />
      <Route path="/volunteer" element={<ProtectedRoute allowedRoles={['volunteer']}><VolunteerDashboard /></ProtectedRoute>} />
      <Route path="/navigation/:routeId" element={<ProtectedRoute allowedRoles={ALL_ROLES}><NavigationScreen /></ProtectedRoute>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

import ErrorBoundary from './components/ErrorBoundary';
import { ConnectionProvider, ConnectionMonitorWidget, useConnection } from './context/ConnectionContext';

const AppContent = () => {
  const { isBackendAvailable, isRecovering } = useConnection();

  if (!isBackendAvailable && !isRecovering) {
    return <ServerUnavailableScreen />;
  }

  return (
    <>
      <AppRoutes />
      <ConnectionMonitorWidget />
    </>
  );
};

const ServerUnavailableScreen = () => {
  const { checkHealth, checking, healthUrl, lastError } = useConnection();
  const [showTroubleshoot, setShowTroubleshoot] = useState(false);

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'radial-gradient(circle at center, #1e293b 0%, #0f172a 100%)',
      fontFamily: "'Outfit', 'Inter', sans-serif",
      color: '#f8fafc',
      padding: '24px',
      boxSizing: 'border-box'
    }}>
      <div style={{
        background: 'rgba(30, 41, 59, 0.7)',
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '24px',
        padding: '40px',
        maxWidth: '520px',
        width: '100%',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
      }}>
        <div style={{ fontSize: '48px', marginBottom: '20px', textAlign: 'center' }}>🔌</div>
        <h1 style={{ fontSize: '24px', fontWeight: 800, marginBottom: '12px', color: '#ef4444', textAlign: 'center' }}>Server Temporarily Unavailable</h1>
        <p style={{ color: '#94a3b8', fontSize: '15px', lineHeight: '1.6', marginBottom: '24px', textAlign: 'center' }}>
          We are unable to establish a secure link to the emergency service backend. The system will automatically attempt to reconnect once service is restored.
        </p>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', marginBottom: '24px' }}>
          <button
            onClick={checkHealth}
            disabled={checking}
            style={{
              background: '#3b82f6',
              border: 'none',
              borderRadius: '10px',
              color: '#ffffff',
              padding: '12px 24px',
              fontWeight: 600,
              fontSize: '14px',
              cursor: 'pointer',
              opacity: checking ? 0.7 : 1,
              transition: 'background 0.2s',
              boxShadow: '0 4px 14px rgba(59, 130, 246, 0.4)',
              flex: 1
            }}
          >
            {checking ? 'Checking Link...' : 'Retry Connection'}
          </button>
          
          <button
            onClick={() => setShowTroubleshoot(!showTroubleshoot)}
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: '10px',
              color: '#f8fafc',
              padding: '12px 20px',
              fontWeight: 600,
              fontSize: '14px',
              cursor: 'pointer',
              transition: 'background 0.2s',
              flex: 1
            }}
          >
            {showTroubleshoot ? 'Hide Diagnostics' : 'Show Diagnostics'}
          </button>
        </div>

        {/* Troubleshooting details */}
        {showTroubleshoot && (
          <div style={{
            background: 'rgba(15, 23, 42, 0.6)',
            borderRadius: '16px',
            padding: '20px',
            border: '1px solid rgba(255, 255, 255, 0.05)',
            fontSize: '13px',
            lineHeight: '1.5',
            color: '#cbd5e1',
            textAlign: 'left'
          }}>
            <div style={{ marginBottom: '12px' }}>
              <strong style={{ color: '#60a5fa' }}>Backend Target URL:</strong>
              <div style={{ wordBreak: 'break-all', fontFamily: 'monospace', background: 'rgba(0,0,0,0.2)', padding: '8px', borderRadius: '6px', marginTop: '4px' }}>
                {healthUrl}
              </div>
            </div>
            {lastError && (
              <div style={{ marginBottom: '12px' }}>
                <strong style={{ color: '#f87171' }}>Last Connection Error:</strong>
                <div style={{ wordBreak: 'break-all', fontFamily: 'monospace', background: 'rgba(239, 68, 68, 0.1)', color: '#fca5a5', padding: '8px', borderRadius: '6px', marginTop: '4px' }}>
                  {lastError}
                </div>
              </div>
            )}
            <div style={{ marginTop: '12px', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '10px' }}>
              <strong style={{ color: '#34d399', display: 'block', marginBottom: '6px' }}>Troubleshooting Tips:</strong>
              <ul style={{ paddingLeft: '20px', margin: 0 }}>
                <li style={{ marginBottom: '4px' }}>Confirm that the backend container or process is running.</li>
                <li style={{ marginBottom: '4px' }}>If accessing via mobile/LAN, verify your device is on the same network.</li>
                <li style={{ marginBottom: '4px' }}>Check the browser console (F12) for CORS or Mixed Content errors.</li>
                <li style={{ marginBottom: '4px' }}>Make sure the backend config allows the host origin.</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default function App() {
  return (
    <ErrorBoundary>
      <ConnectionProvider>
        <AuthProvider>
          <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <AppContent />
            <Toaster
              position="top-right"
              toastOptions={{
                style: { background: '#16161f', color: '#f0f0f5', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px' },
                success: { iconTheme: { primary: '#4ade80', secondary: '#fff' } },
                error: { iconTheme: { primary: '#ef4444', secondary: '#fff' } },
              }}
            />
          </BrowserRouter>
        </AuthProvider>
      </ConnectionProvider>
    </ErrorBoundary>
  );
}
