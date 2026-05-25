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
  const { entityType, updateUser } = useAuth();
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

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
    </Layout>
  );
}
