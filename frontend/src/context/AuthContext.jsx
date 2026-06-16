import React, { createContext, useContext, useState, useEffect } from 'react';
import { connectSocket, disconnectSocket } from '../api/socket';
import API from '../api/axios';
import { registerPushNotifications } from '../utils/notifications';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [entityType, setEntityType] = useState(null);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState({ appName: 'AapadBandhav', logoUrl: null });

  const fetchSettings = async () => {
    try {
      const res = await API.get('/admin/settings');
      if (res.data && res.data.success) {
        setSettings({
          appName: res.data.appName,
          logoUrl: res.data.logoUrl
        });
      }
    } catch (err) {
      console.error('Failed to fetch system settings:', err);
    }
  };

  useEffect(() => {
    fetchSettings();
    const stored = localStorage.getItem('user');
    const token = localStorage.getItem('token');
    const type = localStorage.getItem('entityType');
    if (stored && token) {
      const u = JSON.parse(stored);
      setUser(u);
      setEntityType(type || 'user');
      connectSocket(u.id, type || 'user');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (user && user.id) {
      registerPushNotifications();
    }
  }, [user]);

  const login = (userData, token, type = 'user') => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(userData));
    localStorage.setItem('entityType', type);
    setUser(userData);
    setEntityType(type);
    connectSocket(userData.id, type);
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('entityType');
    setUser(null);
    setEntityType(null);
    disconnectSocket();
  };

  const updateUser = (userData) => {
    localStorage.setItem('user', JSON.stringify(userData));
    setUser(userData);
  };

  return (
    <AuthContext.Provider value={{ user, entityType, loading, login, logout, updateUser, isAdmin: user?.role === 'admin' || user?.role === 'superadmin', settings, refreshSettings: fetchSettings }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
