import React, { useState, useEffect } from 'react';
import Layout from '../../components/Layout';
import { useAuth } from '../../context/AuthContext';
import API from '../../api/axios';
import toast from 'react-hot-toast';

export default function UserProfile() {
  const { updateUser } = useAuth();
  const [profile, setProfile] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [device, setDevice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState({});
  const [showDeviceModal, setShowDeviceModal] = useState(false);
  const [deviceInput, setDeviceInput] = useState('');
  const [contactForm, setContactForm] = useState({ contact_name:'', mobile:'', relation:'', priority:1 });
  const [showContactForm, setShowContactForm] = useState(false);
  const [editContact, setEditContact] = useState(null);

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    try {
      const res = await API.get('/users/profile');
      setProfile(res.data.user);
      setContacts(res.data.emergency_contacts || []);
      setDevice(res.data.device);
      setForm(res.data.user);
    } catch (e) { toast.error('Failed to load profile'); }
    finally { setLoading(false); }
  };

  const saveProfile = async () => {
    try {
      const res = await API.put('/users/profile', form);
      setProfile(res.data.user);
      updateUser(res.data.user);
      setEditMode(false);
      toast.success('Profile updated');
    } catch (e) { toast.error(e.response?.data?.message || 'Failed'); }
  };

  const linkDevice = async () => {
    if (!deviceInput) return toast.error('Enter device ID or QR code');
    try {
      await API.post('/devices/link', { device_id: deviceInput.length === 16 ? deviceInput : undefined, qr_code: deviceInput.length !== 16 ? deviceInput : undefined });
      toast.success('Device linked!');
      setShowDeviceModal(false);
      setDeviceInput('');
      fetchAll();
    } catch (e) { toast.error(e.response?.data?.message || 'Failed to link'); }
  };

  const unlinkDevice = async () => {
    try {
      await API.post('/devices/unlink');
      toast.success('Device unlinked');
      setDevice(null);
    } catch (e) { toast.error('Failed'); }
  };

  const saveContact = async () => {
    if (!contactForm.contact_name || !contactForm.mobile) return toast.error('Name and mobile required');
    try {
      if (editContact) {
        await API.put(`/users/emergency-contacts/${editContact.id}`, contactForm);
        toast.success('Contact updated');
      } else {
        await API.post('/users/emergency-contacts', contactForm);
        toast.success('Contact added');
      }
      setShowContactForm(false);
      setEditContact(null);
      setContactForm({ contact_name:'', mobile:'', relation:'', priority:1 });
      fetchAll();
    } catch (e) { toast.error(e.response?.data?.message || 'Failed'); }
  };

  const deleteContact = async (id) => {
    try {
      await API.delete(`/users/emergency-contacts/${id}`);
      toast.success('Contact deleted');
      fetchAll();
    } catch (e) { toast.error('Failed'); }
  };

  if (loading) return <Layout title="Profile"><div className="loading-screen"><div className="spinner spinner-lg" /></div></Layout>;

  return (
    <Layout title="My Profile">
      {/* Header */}
      <div className="flex-between mb-24">
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800 }}>👤 My Profile</h1>
          <p className="text-muted text-sm">Manage your personal and emergency information</p>
        </div>
        <button className="btn btn-primary" onClick={() => editMode ? saveProfile() : setEditMode(true)}>
          {editMode ? '💾 Save Changes' : '✏️ Edit Profile'}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Personal Info */}
        <div className="card">
          <h3 style={{ marginBottom: 16 }}>📋 Personal Information</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
            <div style={{ width: 64, height: 64, background: 'linear-gradient(135deg,var(--red-700),var(--red-400))', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>👤</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 18 }}>{profile?.full_name}</div>
              <div style={{ fontFamily: 'monospace', fontSize: 13, color: 'var(--cyan-400)' }}>ID: {profile?.unique_id}</div>
              <span className={`badge ${profile?.is_active ? 'badge-green' : 'badge-red'}`}>{profile?.is_active ? 'Active' : 'Inactive'}</span>
            </div>
          </div>
          {editMode ? (
            <div className="form-grid-2">
              {[['full_name','Full Name'],['address','Address'],['age','Age'],['vehicle_number','Vehicle Number']].map(([k,l]) => (
                <div key={k} className="form-group">
                  <label className="form-label">{l}</label>
                  <input className="form-input" value={form[k] || ''} onChange={e => setForm(f => ({...f,[k]:e.target.value}))} />
                </div>
              ))}
              <div className="form-group">
                <label className="form-label">Blood Group</label>
                <select className="form-select" value={form.blood_group || ''} onChange={e => setForm(f => ({...f, blood_group: e.target.value}))}>
                  {['A+','A-','B+','B-','AB+','AB-','O+','O-','Unknown'].map(b => <option key={b}>{b}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Vehicle Type</label>
                <select className="form-select" value={form.vehicle_type || ''} onChange={e => setForm(f => ({...f, vehicle_type: e.target.value}))}>
                  {['Car','Motorcycle','Truck','Bus','Auto','Bicycle','Other'].map(v => <option key={v}>{v}</option>)}
                </select>
              </div>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              {[
                { l: 'Email', v: profile?.email, icon: '📧' },
                { l: 'Mobile', v: profile?.mobile, icon: '📱' },
                { l: 'Blood Group', v: profile?.blood_group, icon: '🩸', color: 'var(--red-400)' },
                { l: 'Age', v: profile?.age, icon: '🎂' },
                { l: 'Gender', v: profile?.gender, icon: '👤' },
                { l: 'Vehicle', v: `${profile?.vehicle_number || '-'} (${profile?.vehicle_type || '-'})`, icon: '🚗' },
              ].map(item => (
                <div key={item.l} className="flex-between" style={{ padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 14 }}>
                  <span className="text-muted">{item.icon} {item.l}</span>
                  <span style={{ color: item.color || 'var(--text-primary)', fontWeight: 500 }}>{item.v || '—'}</span>
                </div>
              ))}
            </div>
          )}
          {editMode && <button className="btn btn-secondary btn-sm w-full" style={{ marginTop: 12 }} onClick={() => setEditMode(false)}>Cancel</button>}
        </div>

        {/* Device */}
        <div className="card">
          <div className="flex-between mb-16">
            <h3>📟 IoT Device</h3>
            {!device && <button className="btn btn-primary btn-sm" onClick={() => setShowDeviceModal(true)}>🔗 Link Device</button>}
          </div>
          {device ? (
            <>
              <div style={{ textAlign: 'center', padding: 20 }}>
                <div style={{ fontSize: 48, marginBottom: 8 }}>📡</div>
                <div style={{ fontFamily: 'monospace', fontSize: 20, letterSpacing: 3, color: 'var(--cyan-400)', marginBottom: 12 }}>{device.device_id}</div>
                <div style={{ marginBottom: 12 }}>
                  <span className="badge badge-green">● Active</span>
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 4 }}>QR: {device.qr_code}</div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>Battery: {device.battery_level}% • Firmware: {device.firmware_version}</div>
              </div>
              <button className="btn btn-danger btn-sm w-full" onClick={unlinkDevice}>🔓 Unlink Device</button>
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>📡</div>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>No Device Linked</div>
              <div style={{ fontSize: 13, marginBottom: 16 }}>Link your IoT vehicle device by scanning the QR code or entering the 16-digit device ID</div>
              <button className="btn btn-primary" onClick={() => setShowDeviceModal(true)}>🔗 Link Device</button>
            </div>
          )}
        </div>

        {/* Emergency Contacts */}
        <div className="card" style={{ gridColumn: '1 / -1' }}>
          <div className="flex-between mb-16">
            <div>
              <h3>📞 Emergency Contacts</h3>
              <p className="text-sm text-muted">{contacts.length}/5 contacts • These are notified first during an accident</p>
            </div>
            {contacts.length < 5 && <button className="btn btn-primary btn-sm" onClick={() => { setShowContactForm(true); setEditContact(null); setContactForm({ contact_name:'', mobile:'', relation:'', priority: contacts.length + 1 }); }}>+ Add Contact</button>}
          </div>

          {showContactForm && (
            <div className="card" style={{ marginBottom: 16, border: '1px solid var(--border-glow)' }}>
              <h4 style={{ marginBottom: 12 }}>{editContact ? 'Edit Contact' : 'New Emergency Contact'}</h4>
              <div className="form-grid-3">
                <div className="form-group"><label className="form-label">Name *</label><input className="form-input" value={contactForm.contact_name} onChange={e => setContactForm(f => ({...f, contact_name: e.target.value}))} placeholder="Contact Name" /></div>
                <div className="form-group"><label className="form-label">Mobile *</label><input className="form-input" value={contactForm.mobile} onChange={e => setContactForm(f => ({...f, mobile: e.target.value}))} placeholder="9876543210" /></div>
                <div className="form-group"><label className="form-label">Relation</label><input className="form-input" value={contactForm.relation} onChange={e => setContactForm(f => ({...f, relation: e.target.value}))} placeholder="Spouse, Parent..." /></div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary btn-sm" onClick={saveContact}>💾 Save</button>
                <button className="btn btn-secondary btn-sm" onClick={() => { setShowContactForm(false); setEditContact(null); }}>Cancel</button>
              </div>
            </div>
          )}

          {contacts.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>📵</div>
              <div>No emergency contacts added yet</div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
              {contacts.map((c, i) => (
                <div key={c.id} className="card" style={{ padding: 16 }}>
                  <div className="flex-between mb-8">
                    <span className="badge badge-red">#{c.priority || i+1}</span>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => { setEditContact(c); setContactForm(c); setShowContactForm(true); }}>✏️</button>
                      <button className="btn btn-ghost btn-sm" style={{ color: 'var(--red-400)' }} onClick={() => deleteContact(c.id)}>🗑️</button>
                    </div>
                  </div>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>{c.contact_name}</div>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>📱 {c.mobile}</div>
                  {c.relation && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>👥 {c.relation}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Device Link Modal */}
      {showDeviceModal && (
        <div className="modal-overlay" onClick={() => setShowDeviceModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3 className="modal-title">🔗 Link IoT Device</h3>
            <p className="text-muted text-sm" style={{ marginBottom: 20 }}>Enter your 16-digit Device ID or QR code from your vehicle's IoT device</p>
            <div className="form-group">
              <label className="form-label">Device ID or QR Code</label>
              <input className="form-input" value={deviceInput} onChange={e => setDeviceInput(e.target.value)} placeholder="AAPAD-1234567890123456 or 16-digit ID" style={{ fontFamily: 'monospace' }} />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={linkDevice}>🔗 Link Device</button>
              <button className="btn btn-secondary" onClick={() => setShowDeviceModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
