import React, { useMemo, useState } from 'react';
import Layout from '../../components/Layout';
import API from '../../api/axios';
import toast from 'react-hot-toast';
import { 
  HospitalIcon, CarIcon, ShieldIcon, WrenchIcon, BriefcaseIcon, 
  FlameIcon, HeartIcon, SirenIcon, UserIcon 
} from '../../components/Icons';

// Service roles — created in their dedicated tables (admin-only)
const SERVICE_ROLES = [
  { key: 'hospital',      label: 'Hospital',       table: 'service', icon: <HospitalIcon size={14} /> },
  { key: 'ambulance',     label: 'Ambulance',       table: 'service', icon: <CarIcon size={14} /> },
  { key: 'police_station',label: 'Police Station',  table: 'service', icon: <ShieldIcon size={14} /> },
  { key: 'policeman',     label: 'Policeman',       table: 'service', icon: <ShieldIcon size={14} /> },
  { key: 'mechanic',      label: 'Mechanic',        table: 'service', icon: <WrenchIcon size={14} /> },
  { key: 'insurance',     label: 'Insurance',       table: 'service', icon: <BriefcaseIcon size={14} /> },
];

// Citizen-type roles — stored in the users table with different role values
const CITIZEN_ROLES = [
  { key: 'volunteer',           label: 'Volunteer',             table: 'user', icon: <HeartIcon size={14} /> },
  { key: 'fire_department',     label: 'Fire Department',       table: 'user', icon: <FlameIcon size={14} /> },
  { key: 'emergency_personnel', label: 'Emergency Personnel',   table: 'user', icon: <SirenIcon size={14} /> },
];

const ALL_ROLES = [...SERVICE_ROLES, ...CITIZEN_ROLES];

const emptyServiceForm = {
  role: 'hospital',
  name: '',
  mobile: '',
  email: '',
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

const emptyCitizenForm = {
  role: 'volunteer',
  name: '',
  mobile: '',
  email: '',
  department: '',
  rank: '',
  organization: '',
  address: '',
};

export default function AdminServices() {
  const [activeTab, setActiveTab] = useState('service'); // 'service' | 'citizen'
  const [form, setForm] = useState(emptyServiceForm);
  const [loading, setLoading] = useState(false);

  const isServiceRole = ALL_ROLES.find(r => r.key === form.role)?.table === 'service';
  const selectedRole = ALL_ROLES.find(r => r.key === form.role);

  const set = (key, value) => setForm(prev => ({ ...prev, [key]: value }));

  const resetForRole = (role) => {
    const roleInfo = ALL_ROLES.find(r => r.key === role);
    if (roleInfo?.table === 'user') {
      setForm({ ...emptyCitizenForm, role });
    } else {
      setForm({ ...emptyServiceForm, role });
    }
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    if (tab === 'service') resetForRole('hospital');
    else resetForRole('volunteer');
  };

  const buildServicePayload = () => {
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

  const buildCitizenPayload = () => {
    const payload = { ...form };
    Object.keys(payload).forEach(key => {
      if (payload[key] === '') delete payload[key];
    });
    return payload;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.mobile) return toast.error('Name and mobile number are required');
    if (String(form.mobile).length < 10) return toast.error('Mobile number must be 10 digits');

    if (isServiceRole) {
      if (['hospital', 'police_station', 'insurance'].includes(form.role) && (!form.latitude || !form.longitude)) {
        return toast.error(`${selectedRole?.label} coordinates are required`);
      }
    }

    setLoading(true);
    try {
      if (isServiceRole) {
        await API.post('/admin/services/register', buildServicePayload());
      } else {
        await API.post('/admin/users/create', buildCitizenPayload());
      }
      toast.success(`${selectedRole?.label} account created. Welcome SMS sent.`);
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
      <input
        className="form-input"
        type={type}
        value={form[key] ?? ''}
        onChange={e => set(key, e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );

  return (
    <Layout title="Admin - Register Accounts">
      <div className="flex-between mb-24">
        <div>
          <h1 className="section-title">Register Service Account</h1>
          <p className="section-subtitle">
            All service and personnel accounts are created by the administrator.
            Accounts authenticate via Mobile Number + OTP — no password required.
          </p>
        </div>
      </div>

      {/* Category Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button
          className={`btn ${activeTab === 'service' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => handleTabChange('service')}
          type="button"
        >
          Service Accounts
        </button>
        <button
          className={`btn ${activeTab === 'citizen' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => handleTabChange('citizen')}
          type="button"
        >
          Personnel Accounts
        </button>
      </div>

      {/* Role Selector */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
        {(activeTab === 'service' ? SERVICE_ROLES : CITIZEN_ROLES).map(role => (
          <button
            key={role.key}
            className={`btn btn-sm ${form.role === role.key ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => resetForRole(role.key)}
            type="button"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            {role.icon} <span>{role.label}</span>
          </button>
        ))}
      </div>

      <div className="bento-card">
        {/* Info Banner */}
        <div style={{
          background: 'var(--blue-bg)',
          border: '1px solid var(--blue-border)',
          borderRadius: 8,
          padding: '10px 14px',
          marginBottom: 20,
          fontSize: 13,
          color: 'var(--text-secondary)',
        }}>
          Accounts authenticate via Mobile Number + OTP. A welcome SMS will be sent to the registered mobile number automatically.
        </div>

        <form onSubmit={handleSubmit}>
          {/* Common Fields */}
          <div className="form-grid-2">
            {renderField(['name', `${selectedRole?.label} Name *`, `e.g. City ${selectedRole?.label ?? 'Account'}`])}
            {renderField(['mobile', 'Mobile Number *', '9876543210', 'tel'])}
            {renderField(['email', 'Email (Optional)', 'account@example.com', 'email'])}
          </div>

          {/* === SERVICE ROLE EXTRA FIELDS === */}
          {isServiceRole && (
            <>
              {['hospital', 'police_station', 'insurance', 'ambulance', 'policeman', 'mechanic'].includes(form.role) && (
                <div className="form-grid-2" style={{ marginTop: 12 }}>
                  {renderField([
                    'latitude',
                    ['hospital', 'police_station', 'insurance'].includes(form.role) ? 'Latitude *' : 'Latitude',
                    '16.5063', 'number',
                  ])}
                  {renderField([
                    'longitude',
                    ['hospital', 'police_station', 'insurance'].includes(form.role) ? 'Longitude *' : 'Longitude',
                    '80.6480', 'number',
                  ])}
                </div>
              )}

              {form.role === 'hospital' && (
                <div className="form-grid-2" style={{ marginTop: 12 }}>
                  {renderField(['registration_number', 'Registration Number', 'AP-HOSP-1001'])}
                  {renderField(['specializations', 'Specializations (comma-separated)', 'Emergency, Trauma, ICU'])}
                  {renderField(['bed_capacity', 'Bed Capacity', '100', 'number'])}
                  {renderField(['available_beds', 'Available Beds', '30', 'number'])}
                  {renderField(['city', 'City', 'Vijayawada'])}
                  {renderField(['state', 'State', 'Andhra Pradesh'])}
                </div>
              )}

              {form.role === 'ambulance' && (
                <div className="form-grid-2" style={{ marginTop: 12 }}>
                  {renderField(['license_number', 'License Number', 'AP-DL-1234567'])}
                  {renderField(['vehicle_number', 'Vehicle Number', 'AP16AMB001'])}
                </div>
              )}

              {form.role === 'police_station' && (
                <div className="form-grid-2" style={{ marginTop: 12 }}>
                  {renderField(['station_code', 'Station Code', 'AP-PS-VJA'])}
                  {renderField(['city', 'City', 'Vijayawada'])}
                  {renderField(['state', 'State', 'Andhra Pradesh'])}
                  {renderField(['address', 'Address', 'Station address'])}
                </div>
              )}

              {form.role === 'policeman' && (
                <div className="form-grid-2" style={{ marginTop: 12 }}>
                  {renderField(['badge_number', 'Badge Number', 'AP-12345'])}
                  {renderField(['station_id', 'Station ID (Optional)', 'Station UUID'])}
                </div>
              )}

              {form.role === 'mechanic' && (
                <div className="form-grid-2" style={{ marginTop: 12 }}>
                  {renderField(['specialization', 'Specialization', 'Car, Motorcycle'])}
                </div>
              )}

              {form.role === 'insurance' && (
                <div className="form-grid-2" style={{ marginTop: 12 }}>
                  {renderField(['license_number', 'License Number', 'IRDAI-AP-1001'])}
                  {renderField(['city', 'City', 'Vijayawada'])}
                  {renderField(['address', 'Address', 'Company address'])}
                </div>
              )}
            </>
          )}

          {/* === CITIZEN/PERSONNEL ROLE EXTRA FIELDS === */}
          {!isServiceRole && (
            <div className="form-grid-2" style={{ marginTop: 12 }}>
              {renderField(['department', 'Department', 'Fire & Rescue Services'])}
              {renderField(['rank', 'Rank / Designation', 'Senior Officer'])}
              {renderField(['organization', 'Organization', 'AP State Disaster Response Force'])}
              {renderField(['address', 'Address', 'Residential address'])}
            </div>
          )}

          <button className="btn btn-primary" type="submit" disabled={loading} style={{ marginTop: 16 }}>
            {loading ? <><span className="spinner" /> Creating...</> : `Create ${selectedRole?.label ?? ''} Account`}
          </button>
        </form>
      </div>
    </Layout>
  );
}
