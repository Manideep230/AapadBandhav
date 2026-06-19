import React, { useMemo, useState, useEffect, useCallback } from 'react';
import Layout from '../../components/Layout';
import API from '../../api/axios';
import toast from 'react-hot-toast';
import { 
  HospitalIcon, CarIcon, ShieldIcon, WrenchIcon, BriefcaseIcon, 
  FlameIcon, HeartIcon, SirenIcon, UserIcon, CheckIcon, XIcon, ClockIcon
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
  { key: 'fire_department',     label: 'Fire Department',       table: 'user', icon: <FlameIcon size={14} /> },
  { key: 'emergency_personnel', label: 'Emergency Personnel',   table: 'user', icon: <SirenIcon size={14} /> },
];

const ALL_ROLES = [...SERVICE_ROLES, ...CITIZEN_ROLES];

const ROLE_COLORS = {
  hospital:      '#10b981',
  ambulance:     '#f59e0b',
  police_station:'#3b82f6',
  policeman:     '#60a5fa',
  mechanic:      '#a78bfa',
  insurance:     '#06b6d4',
  fire_department:'#ef4444',
  volunteer:     '#ec4899',
  emergency_personnel: '#8b5cf6',
};

const ROLE_LABELS = {
  hospital: 'Hospital',
  ambulance: 'Ambulance',
  police_station: 'Police Station',
  policeman: 'Policeman',
  mechanic: 'Mechanic',
  insurance: 'Insurance',
  fire_department: 'Fire Department',
  volunteer:     'Ranger',
};

const emptyServiceForm = {
  role: 'hospital',
  name: '', mobile: '', email: '',
  latitude: '', longitude: '',
  city: '', state: '', address: '',
  registration_number: '', bed_capacity: '', available_beds: '', specializations: '',
  license_number: '', vehicle_number: '', station_code: '', badge_number: '',
  station_id: '', specialization: '',
};

const emptyCitizenForm = {
  role: 'fire_department',
  name: '', mobile: '', email: '',
  department: '', rank: '', organization: '', address: '',
};

// ─── Pending Approvals Tab ────────────────────────────────────────────────────
function PendingApprovals() {
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actioning, setActioning] = useState(null); // id being actioned

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await API.get('/admin/partners/pending');
      setPending(res.data.pending || []);
    } catch {
      toast.error('Failed to load pending applications');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleApprove = async (role, id, name) => {
    setActioning(id);
    try {
      await API.post(`/admin/partners/${role}/${id}/approve`);
      toast.success(`✅ ${name} approved! They can now log in.`);
      setPending(prev => prev.filter(p => p.id !== id));
    } catch (err) {
      toast.error(err.response?.data?.message || 'Approval failed');
    } finally {
      setActioning(null);
    }
  };

  const handleReject = async (role, id, name) => {
    if (!window.confirm(`Reject and remove the application from ${name}? This cannot be undone.`)) return;
    setActioning(id);
    try {
      await API.post(`/admin/partners/${role}/${id}/reject`);
      toast.success(`Application from ${name} rejected and removed.`);
      setPending(prev => prev.filter(p => p.id !== id));
    } catch (err) {
      toast.error(err.response?.data?.message || 'Rejection failed');
    } finally {
      setActioning(null);
    }
  };

  const formatDate = (d) => {
    if (!d) return '—';
    try { return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); }
    catch { return '—'; }
  };

  if (loading) return (
    <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
      <span className="spinner" style={{ display: 'inline-block', marginBottom: 10 }} />
      <div>Loading pending applications...</div>
    </div>
  );

  if (pending.length === 0) return (
    <div style={{
      textAlign: 'center', padding: '48px 0',
      color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12
    }}>
      <div style={{
        width: 56, height: 56, borderRadius: '50%',
        background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--green-primary)',
      }}>
        <CheckIcon size={24} />
      </div>
      <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--text-primary)' }}>All Clear!</div>
      <div style={{ fontSize: 13 }}>No pending partner applications at this time.</div>
      <button className="btn btn-secondary btn-sm" onClick={load} style={{ marginTop: 4 }}>Refresh</button>
    </div>
  );

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          {pending.length} application{pending.length !== 1 ? 's' : ''} awaiting review
        </div>
        <button className="btn btn-secondary btn-sm" onClick={load}>↻ Refresh</button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {pending.map(app => {
          const role = app._role;
          const color = ROLE_COLORS[role] || '#94a3b8';
          const label = ROLE_LABELS[role] || role;
          const displayName = app._displayName || app.name || app.fullName || '—';
          const mobile = app.mobile || '—';
          const email = app.email || null;
          const isActioning = actioning === app.id;

          return (
            <div key={app.id} style={{
              background: 'rgba(255,255,255,0.015)',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 14,
              padding: '16px 18px',
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              flexWrap: 'wrap',
              transition: 'border-color 0.2s',
            }}>
              {/* Role color bar */}
              <div style={{
                width: 4, height: 52, borderRadius: 4,
                background: color, flexShrink: 0,
              }} />

              {/* Info */}
              <div style={{ flex: 1, minWidth: 180 }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)', marginBottom: 3 }}>
                  {displayName}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                  <span style={{
                    fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
                    background: `${color}18`, color, border: `1px solid ${color}30`,
                  }}>
                    {label}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>📱 {mobile}</span>
                  {email && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>✉️ {email}</span>}
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    <ClockIcon size={11} style={{ verticalAlign: 'middle' }} /> {formatDate(app.createdAt)}
                  </span>
                </div>
                {(app.city || app.address) && (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                    📍 {[app.address, app.city, app.state].filter(Boolean).join(', ')}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                <button
                  id={`approve-${app.id}`}
                  className="btn btn-sm"
                  onClick={() => handleApprove(role, app.id, displayName)}
                  disabled={isActioning}
                  style={{
                    background: 'rgba(16,185,129,0.12)',
                    border: '1px solid rgba(16,185,129,0.3)',
                    color: 'var(--green-primary, #10b981)',
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    fontWeight: 600,
                  }}
                >
                  {isActioning ? <span className="spinner" /> : <CheckIcon size={13} />}
                  Approve
                </button>
                <button
                  id={`reject-${app.id}`}
                  className="btn btn-sm"
                  onClick={() => handleReject(role, app.id, displayName)}
                  disabled={isActioning}
                  style={{
                    background: 'rgba(239,68,68,0.08)',
                    border: '1px solid rgba(239,68,68,0.25)',
                    color: '#f87171',
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    fontWeight: 600,
                  }}
                >
                  {isActioning ? <span className="spinner" /> : <XIcon size={13} />}
                  Reject
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main AdminServices ───────────────────────────────────────────────────────
export default function AdminServices() {
  const [activeTab, setActiveTab] = useState('service'); // 'service' | 'citizen' | 'pending'
  const [pendingCount, setPendingCount] = useState(0);
  const [form, setForm] = useState(emptyServiceForm);
  const [loading, setLoading] = useState(false);

  // Fetch pending count for badge
  useEffect(() => {
    API.get('/admin/partners/pending')
      .then(res => setPendingCount(res.data?.count || 0))
      .catch(() => {});
  }, []);

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
    else if (tab === 'citizen') resetForRole('fire_department');
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
          <h1 className="section-title">Register &amp; Manage Accounts</h1>
          <p className="section-subtitle">
            Create service accounts, personnel accounts, or review self-registered partner applications.
          </p>
        </div>
      </div>

      {/* Tab Navigation */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        <button
          className={`btn ${activeTab === 'service' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => handleTabChange('service')}
          type="button"
          id="tab-service-accounts"
        >
          Service Accounts
        </button>
        <button
          className={`btn ${activeTab === 'citizen' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => handleTabChange('citizen')}
          type="button"
          id="tab-citizen-accounts"
        >
          Personnel Accounts
        </button>
        <button
          className={`btn ${activeTab === 'pending' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => handleTabChange('pending')}
          type="button"
          id="tab-pending-approvals"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
        >
          Pending Approvals
          {pendingCount > 0 && (
            <span style={{
              background: '#ef4444', color: '#fff',
              borderRadius: 20, fontSize: 11, fontWeight: 700,
              padding: '1px 7px', minWidth: 20, textAlign: 'center',
              boxShadow: '0 0 8px rgba(239,68,68,0.5)',
            }}>
              {pendingCount}
            </span>
          )}
        </button>
      </div>

      {/* ── Pending Approvals Tab ── */}
      {activeTab === 'pending' && (
        <div className="bento-card">
          <PendingApprovals />
        </div>
      )}

      {/* ── Register Forms ── */}
      {activeTab !== 'pending' && (
        <>
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
        </>
      )}
    </Layout>
  );
}
