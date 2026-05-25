import React, { useMemo, useState } from 'react';
import Layout from '../../components/Layout';
import API from '../../api/axios';
import toast from 'react-hot-toast';

const roles = [
  { key: 'hospital', label: 'Hospital' },
  { key: 'ambulance', label: 'Ambulance' },
  { key: 'police_station', label: 'Police Station' },
  { key: 'policeman', label: 'Policeman' },
  { key: 'mechanic', label: 'Mechanic' },
  { key: 'insurance', label: 'Insurance' },
];

const emptyForm = {
  role: 'hospital',
  name: '',
  email: '',
  password: '',
  mobile: '',
  latitude: '',
  longitude: '',
  city: '',
  state: '',
  address: '',
  registration_number: '',
  bed_capacity: '',
  available_beds: '',
  specializations: '',
  license_number: '',
  vehicle_number: '',
  station_code: '',
  badge_number: '',
  station_id: '',
  specialization: '',
};

export default function AdminServices() {
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(false);
  const selectedRole = roles.find(r => r.key === form.role);

  const commonFields = useMemo(() => [
    ['name', 'Name *', 'City Hospital'],
    ['email', 'Email *', 'service@example.com'],
    ['password', 'Password *', 'Minimum 6 characters', 'password'],
    ['mobile', 'Mobile', '9876543210'],
  ], []);

  const set = (key, value) => setForm(prev => ({ ...prev, [key]: value }));

  const resetForRole = (role) => {
    setForm({ ...emptyForm, role });
  };

  const buildPayload = () => {
    const payload = { ...form };
    ['latitude', 'longitude'].forEach(key => {
      if (payload[key] !== '') payload[key] = Number(payload[key]);
      else delete payload[key];
    });
    ['bed_capacity', 'available_beds'].forEach(key => {
      if (payload[key] !== '') payload[key] = Number(payload[key]);
      else delete payload[key];
    });
    if (payload.specializations) {
      payload.specializations = payload.specializations.split(',').map(x => x.trim()).filter(Boolean);
    } else {
      delete payload.specializations;
    }
    Object.keys(payload).forEach(key => {
      if (payload[key] === '') delete payload[key];
    });
    return payload;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.email || !form.password) return toast.error('Name, email, and password are required');
    if (['hospital', 'police_station', 'insurance'].includes(form.role) && (!form.latitude || !form.longitude)) {
      return toast.error(`${selectedRole.label} coordinates are required`);
    }

    setLoading(true);
    try {
      await API.post('/admin/services/register', buildPayload());
      toast.success(`${selectedRole.label} registered`);
      resetForRole(form.role);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const renderField = ([key, label, placeholder, type = 'text']) => (
    <div className="form-group" key={key}>
      <label className="form-label">{label}</label>
      <input className="form-input" type={type} value={form[key]} onChange={e => set(key, e.target.value)} placeholder={placeholder} />
    </div>
  );

  return (
    <Layout title="Admin - Register Services">
      <div className="flex-between mb-24">
        <div>
          <h1 className="section-title">Register Service Account</h1>
          <p className="section-subtitle">Create hospital, responder, police, mechanic, and insurance accounts</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
        {roles.map(role => (
          <button
            key={role.key}
            className={`btn btn-sm ${form.role === role.key ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => resetForRole(role.key)}
            type="button"
          >
            {role.label}
          </button>
        ))}
      </div>

      <div className="card">
        <form onSubmit={handleSubmit}>
          <div className="form-grid-2">
            {commonFields.map(renderField)}
          </div>

          {['hospital', 'police_station', 'insurance'].includes(form.role) && (
            <div className="form-grid-2">
              {renderField(['latitude', 'Latitude *', '19.076', 'number'])}
              {renderField(['longitude', 'Longitude *', '72.8777', 'number'])}
            </div>
          )}

          {form.role === 'hospital' && (
            <div className="form-grid-2">
              {renderField(['registration_number', 'Registration Number', 'MH-HOSP-1001'])}
              {renderField(['specializations', 'Specializations', 'Emergency, Trauma, ICU'])}
              {renderField(['bed_capacity', 'Bed Capacity', '100', 'number'])}
              {renderField(['available_beds', 'Available Beds', '30', 'number'])}
              {renderField(['city', 'City', 'Mumbai'])}
              {renderField(['state', 'State', 'Maharashtra'])}
            </div>
          )}

          {form.role === 'ambulance' && (
            <div className="form-grid-2">
              {renderField(['license_number', 'License Number', 'DL-1234567'])}
              {renderField(['vehicle_number', 'Vehicle Number', 'MH01AMB001'])}
            </div>
          )}

          {form.role === 'police_station' && (
            <div className="form-grid-2">
              {renderField(['station_code', 'Station Code', 'MH-PS-ANW'])}
              {renderField(['city', 'City', 'Mumbai'])}
              {renderField(['state', 'State', 'Maharashtra'])}
              {renderField(['address', 'Address', 'Station address'])}
            </div>
          )}

          {form.role === 'policeman' && (
            <div className="form-grid-2">
              {renderField(['badge_number', 'Badge Number', 'MH-12345'])}
              {renderField(['station_id', 'Station ID', 'Optional station UUID'])}
            </div>
          )}

          {form.role === 'mechanic' && (
            <div className="form-grid-2">
              {renderField(['specialization', 'Specialization', 'Car, Motorcycle'])}
            </div>
          )}

          {form.role === 'insurance' && (
            <div className="form-grid-2">
              {renderField(['license_number', 'License Number', 'INS-1001'])}
              {renderField(['city', 'City', 'Mumbai'])}
              {renderField(['address', 'Address', 'Company address'])}
            </div>
          )}

          <button className="btn btn-primary" type="submit" disabled={loading}>
            {loading ? <><span className="spinner" /> Creating...</> : `Create ${selectedRole.label}`}
          </button>
        </form>
      </div>
    </Layout>
  );
}
