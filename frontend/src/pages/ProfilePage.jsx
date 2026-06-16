import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import Layout from '../components/Layout';
import API from '../api/axios';
import { useAuth } from '../context/AuthContext';
import UserProfile from './user/UserProfile';

const FIELD_CONFIG = {
  hospital: [
    ['name', 'Name'],
    ['mobile', 'Mobile'],
    ['latitude', 'Latitude', 'number'],
    ['longitude', 'Longitude', 'number'],
    ['registration_number', 'Registration Number'],
    ['specializations', 'Specializations'],
    ['bed_capacity', 'Bed Capacity', 'number'],
    ['available_beds', 'Available Beds', 'number'],
    ['city', 'City'],
    ['state', 'State'],
  ],
  ambulance: [
    ['name', 'Name'],
    ['mobile', 'Mobile'],
    ['license_number', 'License Number'],
    ['vehicle_number', 'Vehicle Number'],
  ],
  police_station: [
    ['name', 'Name'],
    ['mobile', 'Mobile'],
    ['station_code', 'Station Code'],
    ['latitude', 'Latitude', 'number'],
    ['longitude', 'Longitude', 'number'],
    ['address', 'Address'],
    ['city', 'City'],
    ['state', 'State'],
  ],
  policeman: [
    ['name', 'Name'],
    ['mobile', 'Mobile'],
    ['badge_number', 'Badge Number'],
    ['station_id', 'Station ID'],
  ],
  mechanic: [
    ['name', 'Name'],
    ['mobile', 'Mobile'],
    ['specialization', 'Specialization'],
  ],
  insurance: [
    ['name', 'Name'],
    ['mobile', 'Mobile'],
    ['license_number', 'License Number'],
    ['latitude', 'Latitude', 'number'],
    ['longitude', 'Longitude', 'number'],
    ['address', 'Address'],
    ['city', 'City'],
  ],
};

const ROLE_LABELS = {
  admin: 'Admin',
  hospital: 'Hospital',
  ambulance: 'Ambulance',
  police_station: 'Police Station',
  policeman: 'Policeman',
  mechanic: 'Mechanic',
  insurance: 'Insurance',
};

export default function ProfilePage() {
  const { entityType, updateUser, user, settings, refreshSettings } = useAuth();
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [customAppName, setCustomAppName] = useState('');
  const [logoFile, setLogoFile] = useState(null);
  const [logoPreview, setLogoPreview] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);

  useEffect(() => {
    if (settings) {
      setCustomAppName(settings.appName || 'AapadBandhav');
      setLogoPreview(settings.logoUrl || '');
    }
  }, [settings]);

  const handleLogoChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setLogoFile(file);
      setLogoPreview(URL.createObjectURL(file));
    }
  };

  const handleSaveSettings = async () => {
    if (!customAppName.trim()) {
      return toast.error('Application name cannot be empty');
    }
    setSavingSettings(true);
    try {
      const formData = new FormData();
      formData.append('appName', customAppName);
      if (logoFile) {
        formData.append('logo', logoFile);
      }
      
      const res = await API.post('/admin/settings', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      if (res.data && res.data.success) {
        toast.success('System settings updated successfully');
        if (refreshSettings) {
          await refreshSettings();
        }
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update system settings');
    } finally {
      setSavingSettings(false);
    }
  };

  const fields = useMemo(() => FIELD_CONFIG[entityType] || [], [entityType]);

  useEffect(() => {
    if (entityType === 'user') return;
    API.get('/profile')
      .then((res) => {
        const data = res.data.profile || {};
        const normalized = {
          ...data,
          specializations: Array.isArray(data.specializations) ? data.specializations.join(', ') : data.specializations,
        };
        setProfile(data);
        setForm(normalized);
      })
      .catch(() => toast.error('Failed to load profile'))
      .finally(() => setLoading(false));
  }, [entityType]);

  if (entityType === 'user') return <UserProfile />;

  const saveProfile = async () => {
    setSaving(true);
    try {
      const payload = { ...form };
      ['latitude', 'longitude', 'bed_capacity', 'available_beds'].forEach((key) => {
        if (payload[key] !== undefined && payload[key] !== '') payload[key] = Number(payload[key]);
      });
      const res = await API.put('/profile', payload);
      const updated = res.data.profile;
      setProfile(updated);
      setForm({
        ...updated,
        specializations: Array.isArray(updated.specializations) ? updated.specializations.join(', ') : updated.specializations,
      });
      updateUser(updated);
      toast.success('Profile updated');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <Layout title="Profile"><div className="loading-screen"><div className="spinner spinner-lg" /></div></Layout>;
  }

  return (
    <Layout title="Profile">
      <div className="flex-between mb-24">
        <div>
          <h1 className="section-title">My Profile</h1>
          <p className="section-subtitle">{ROLE_LABELS[entityType] || 'Account'} account details</p>
        </div>
        {entityType !== 'admin' && (
          <button className="btn btn-primary" onClick={saveProfile} disabled={saving}>
            {saving ? <><span className="spinner" /> Saving...</> : 'Save Changes'}
          </button>
        )}
      </div>

      <div className="card">
        <div style={{ display: 'grid', gap: 16 }}>
          <div className="form-grid-2">
            <div className="form-group">
              <label className="form-label">Email</label>
              <input className="form-input" value={profile?.email || ''} disabled />
            </div>
            <div className="form-group">
              <label className="form-label">Role</label>
              <input className="form-input" value={ROLE_LABELS[entityType] || entityType || ''} disabled />
            </div>
          </div>

          {entityType === 'admin' ? (
            <div className="text-muted">Admin profile details are managed from server configuration.</div>
          ) : (
            <div className="form-grid-2">
              {fields.map(([key, label, type = 'text']) => (
                <div className="form-group" key={key}>
                  <label className="form-label">{label}</label>
                  <input
                    className="form-input"
                    type={type}
                    value={form[key] ?? ''}
                    onChange={(event) => setForm(prev => ({ ...prev, [key]: event.target.value }))}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {user?.role === 'superadmin' && (
        <div className="card" style={{ marginTop: 24 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Site Branding &amp; Settings</h2>
          <p className="text-muted" style={{ fontSize: 13, marginBottom: 20 }}>
            Configure global website name and brand logo. (Super Admin Only)
          </p>

          <div style={{ display: 'grid', gap: 16 }}>
            <div className="form-grid-2">
              <div className="form-group">
                <label className="form-label">Application Name</label>
                <input
                  className="form-input"
                  value={customAppName}
                  onChange={(e) => setCustomAppName(e.target.value)}
                  placeholder="e.g. AapadBandhav"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Application Logo</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div 
                    style={{ 
                      width: 56, 
                      height: 56, 
                      borderRadius: 'var(--radius-md)', 
                      border: '1px dashed var(--border-color)', 
                      background: 'var(--bg-secondary)', 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center',
                      overflow: 'hidden'
                    }}
                  >
                    {logoPreview ? (
                      <img src={logoPreview} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                    ) : (
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>No Logo</span>
                    )}
                  </div>
                  <div style={{ flex: 1 }}>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleLogoChange}
                      style={{ display: 'none' }}
                      id="logo-upload"
                    />
                    <label 
                      htmlFor="logo-upload" 
                      className="btn btn-secondary btn-sm"
                      style={{ cursor: 'pointer', display: 'inline-block' }}
                    >
                      Choose Image
                    </label>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                      Supports PNG, JPG, WEBP, SVG up to 5MB
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
              <button 
                className="btn btn-primary" 
                onClick={handleSaveSettings} 
                disabled={savingSettings}
              >
                {savingSettings ? <><span className="spinner" /> Saving Branding...</> : 'Save Branding'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
