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
import AdminServices from './pages/admin/AdminServices';
import AdminAccidents from './pages/admin/AdminAccidents';
import AdminMap from './pages/admin/AdminMap';
import HospitalDashboard from './pages/hospital/HospitalDashboard';
import AmbulanceDashboard from './pages/ambulance/AmbulanceDashboard';
import PoliceDashboard from './pages/police/PoliceDashboard';
import MechanicDashboard from './pages/mechanic/MechanicDashboard';
import InsuranceDashboard from './pages/insurance/InsuranceDashboard';

const ALL_ROLES = ['user', 'admin', 'hospital', 'ambulance', 'police_station', 'policeman', 'mechanic', 'insurance'];

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
      case 'admin': return '/admin';
      case 'hospital': return '/hospital';
      case 'ambulance': return '/ambulance';
      case 'police_station': case 'policeman': return '/police';
      case 'mechanic': return '/mechanic';
      case 'insurance': return '/insurance';
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
      <Route path="/admin" element={<ProtectedRoute allowedRoles={['admin']}><AdminDashboard /></ProtectedRoute>} />
      <Route path="/admin/users" element={<ProtectedRoute allowedRoles={['admin']}><AdminUsers /></ProtectedRoute>} />
      <Route path="/admin/services" element={<ProtectedRoute allowedRoles={['admin']}><AdminServices /></ProtectedRoute>} />
      <Route path="/admin/accidents" element={<ProtectedRoute allowedRoles={['admin']}><AdminAccidents /></ProtectedRoute>} />
      <Route path="/admin/map" element={<ProtectedRoute allowedRoles={['admin']}><AdminMap /></ProtectedRoute>} />

      {/* Emergency Service Routes */}
      <Route path="/hospital" element={<ProtectedRoute allowedRoles={['hospital']}><HospitalDashboard /></ProtectedRoute>} />
      <Route path="/ambulance" element={<ProtectedRoute allowedRoles={['ambulance']}><AmbulanceDashboard /></ProtectedRoute>} />
      <Route path="/police" element={<ProtectedRoute allowedRoles={['police_station','policeman']}><PoliceDashboard /></ProtectedRoute>} />
      <Route path="/mechanic" element={<ProtectedRoute allowedRoles={['mechanic']}><MechanicDashboard /></ProtectedRoute>} />
      <Route path="/insurance" element={<ProtectedRoute allowedRoles={['insurance']}><InsuranceDashboard /></ProtectedRoute>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
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
  );
}
