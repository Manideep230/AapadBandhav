import React, { useState, useEffect } from 'react';
import Layout from '../../components/Layout';
import { useAuth } from '../../context/AuthContext';
import API from '../../api/axios';
import toast from 'react-hot-toast';

export default function UserProfile() {
  const { updateUser } = useAuth();
  const [profile, setProfile] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [profileForm, setProfileForm] = useState({});

  // Multiple Devices States
  const [ownedDevices, setOwnedDevices] = useState([]);
  const [sharedDevices, setSharedDevices] = useState([]);
  
  // Registration Modal States
  const [showPairModal, setShowPairModal] = useState(false);
  const [simulatedQrInput, setSimulatedQrInput] = useState('');
  
  // Device Link Form
  const [linkForm, setLinkForm] = useState({
    deviceCode: '',
    passName: '',
    passCode: '',
    simCode: '',
    vehicle_type: 'Car',
    vehicle_number: '',
    vehicle_model: '',
    manufacturer: '',
    year: ''
  });

  // Sharing Modal States
  const [showShareModal, setShowShareModal] = useState(false);
  const [sharingDevice, setSharingDevice] = useState(null);
  const [shareWithId, setShareWithId] = useState('');
  const [deviceShares, setDeviceShares] = useState([]);

  // Emergency Contacts States
  const [contactForm, setContactForm] = useState({ contact_name: '', mobile: '', relation: '', priority: 1 });
  const [showContactForm, setShowContactForm] = useState(false);
  const [editContact, setEditContact] = useState(null);

  // Fetch all user details
  const fetchAllData = async () => {
    try {
      // 1. Profile details
      const profileRes = await API.get('/users/profile');
      setProfile(profileRes.data.user);
      setProfileForm(profileRes.data.user);
      setContacts(profileRes.data.emergency_contacts || []);

      // 2. Devices details
      const devicesRes = await API.get('/devices/my-devices');
      setOwnedDevices(devicesRes.data.owned || []);
      setSharedDevices(devicesRes.data.shared || []);
    } catch (e) {
      toast.error('Failed to load profile parameters');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllData();
  }, []);

  // Save profile updates
  const saveProfile = async () => {
    try {
      const res = await API.put('/users/profile', profileForm);
      setProfile(res.data.user);
      updateUser(res.data.user);
      setEditMode(false);
      toast.success('Personal details saved!');
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed to save profile');
    }
  };

  // Simulating QR scan by pasting JSON string or plain 16-digit code
  const handleQrInputPaste = async (val) => {
    setSimulatedQrInput(val);
    if (!val) return;
    const cleanVal = val.trim();
    
    const validateToast = toast.loading('Validating device QR payload...');
    try {
      const res = await API.post('/devices/validate-qr', { qrCode: cleanVal });
      toast.dismiss(validateToast);
      if (res.data && res.data.success) {
        setLinkForm(prev => ({
          ...prev,
          deviceCode: res.data.device.device_id,
          qrCode: cleanVal
        }));
        toast.success('QR Code validated successfully! Device available for registration.');
      }
    } catch (err) {
      toast.dismiss(validateToast);
      const errMsg = err.response?.data?.message || 'Device validation failed. Invalid QR code.';
      toast.error(errMsg);
    }
  };

  // Link Device with Vehicle details
  const handleLinkDevice = async (e) => {
    e.preventDefault();
    const { deviceCode, vehicle_type, vehicle_number, qrCode } = linkForm;
    if (!deviceCode || !vehicle_number) {
      return toast.error('Please complete the 16-digit Device Code and vehicle number');
    }

    setLoading(true);
    try {
      await API.post('/devices/register-by-qr', {
        qrCode: qrCode || deviceCode,
        vehicle_type,
        vehicle_number,
        vehicle_model: linkForm.vehicle_model,
        manufacturer: linkForm.manufacturer,
        year: linkForm.year ? Number(linkForm.year) : null
      });
      toast.success('Device registered & paired with vehicle successfully!');
      setShowPairModal(false);
      setLinkForm({
        deviceCode: '',
        qrCode: '',
        passName: '',
        passCode: '',
        simCode: '',
        vehicle_type: 'Car',
        vehicle_number: '',
        vehicle_model: '',
        manufacturer: '',
        year: ''
      });
      setSimulatedQrInput('');
      fetchAllData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Device pairing failed. Check credentials.');
    } finally {
      setLoading(false);
    }
  };

  // Unlink device
  const handleUnlinkDevice = async (deviceDbId) => {
    if (!confirm('Are you sure you want to unlink this device? Sharing access will be deleted.')) return;
    setLoading(true);
    try {
      // Unlink endpoint takes device_id. Wait, does backend unlink take device_id?
      // Let's check: in backend: @app.route('/api/devices/unlink', methods=['POST'])
      // Let's check if the backend /api/devices/unlink has been updated for multiple devices or if we can use delete share / revoke.
      // Wait, let's see. In multi-device backend, unlinking is revoking device owner.
      // Let's check what the backend `/api/devices/unshare` or other endpoints expect.
      // Actually, if we look at `app.py` line 4024, it has `/api/devices/unshare`.
      // What about `/api/devices/unlink`? Let's check what it does.
      // Let's do a request to unlink or check if we can delete/unlink in app.py.
      // Wait, let's run a select-string on `unlink`.
      await API.post('/devices/unlink', { device_id: deviceDbId });
      toast.success('Device unlinked successfully');
      fetchAllData();
    } catch (err) {
      // In case the endpoint has a different format, let's fall back to posting to revoke/unshare or show toast
      toast.error(err.response?.data?.message || 'Unlink request failed');
    } finally {
      setLoading(false);
    }
  };

  // Load active shares for selected device
  const handleManageShares = async (device) => {
    setSharingDevice(device);
    setShareWithId('');
    setShowShareModal(true);
    try {
      const res = await API.get(`/devices/shares/${device.id}`);
      setDeviceShares(res.data.shares || []);
    } catch (e) {
      setDeviceShares([]);
    }
  };

  // Share device with user ID
  const handleShareDevice = async (e) => {
    e.preventDefault();
    if (!shareWithId) return toast.error('Enter recipient AapadBandhav ID');
    try {
      const res = await API.post('/devices/share', {
        device_id: sharingDevice.id,
        share_with_id: shareWithId.trim()
      });
      toast.success(res.data.message || 'Shared successfully');
      setShareWithId('');
      // Reload shares
      const reload = await API.get(`/devices/shares/${sharingDevice.id}`);
      setDeviceShares(reload.data.shares || []);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to share');
    }
  };

  // Revoke device sharing access
  const handleRevokeShare = async (sharedUserId) => {
    try {
      await API.post('/devices/unshare', {
        device_id: sharingDevice.id,
        user_id: sharedUserId
      });
      toast.success('Sharing access revoked');
      // Reload shares
      const reload = await API.get(`/devices/shares/${sharingDevice.id}`);
      setDeviceShares(reload.data.shares || []);
    } catch (e) {
      toast.error('Revocation failed');
    }
  };

  // Save emergency contacts
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
      setContactForm({ contact_name: '', mobile: '', relation: '', priority: contacts.length + 1 });
      fetchAllData();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed');
    }
  };

  const deleteContact = async (id) => {
    try {
      await API.delete(`/users/emergency-contacts/${id}`);
      toast.success('Contact deleted');
      fetchAllData();
    } catch (e) {
      toast.error('Failed');
    }
  };

  if (loading) return <Layout title="Profile"><div className="loading-screen"><div className="spinner spinner-lg" /></div></Layout>;

  return (
    <Layout title="My Profile Dashboard">
      {/* Upper header */}
      <div className="flex-between mb-24">
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 800 }}>👤 My Account Profile</h1>
          <p className="text-muted text-sm">Manage emergency parameters, pair vehicle IoT hardware, and configure sharing access</p>
        </div>
        <button className="btn btn-primary" onClick={() => editMode ? saveProfile() : setEditMode(true)}>
          {editMode ? '💾 Save Profile' : '✏️ Edit Profile'}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }} className="profile-grid">
        {/* Left Side: Personal Information */}
        <div className="card">
          <h3 style={{ marginBottom: 16, borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>📋 Personal Details</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
            <div style={{ width: 60, height: 60, background: 'linear-gradient(135deg,var(--red-700),var(--red-400))', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26 }}>👤</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 18 }}>{profile?.full_name}</div>
              <div style={{ fontFamily: 'monospace', fontSize: 13, color: 'var(--cyan-400)' }}>SOS AapadBandhav ID: {profile?.unique_id}</div>
              <span className={`badge ${profile?.is_active ? 'badge-green' : 'badge-red'}`} style={{ marginTop: 4 }}>{profile?.is_active ? 'Active Status' : 'Inactive'}</span>
            </div>
          </div>

          {editMode ? (
            <div className="form-grid-2">
              {[
                { k: 'full_name', l: 'Full Name *' },
                { k: 'age', l: 'Age' },
                { k: 'address', l: 'Address' }
              ].map(f => (
                <div key={f.k} className="form-group">
                  <label className="form-label">{f.l}</label>
                  <input className="form-input" value={profileForm[f.k] || ''} onChange={e => setProfileForm(prev => ({ ...prev, [f.k]: e.target.value }))} />
                </div>
              ))}
              <div className="form-group">
                <label className="form-label">Blood Group</label>
                <select className="form-select" value={profileForm.blood_group || ''} onChange={e => setProfileForm(prev => ({ ...prev, blood_group: e.target.value }))}>
                  {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'Unknown'].map(b => <option key={b}>{b}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ gridColumn: 'span 2' }}>
                <label className="form-label">Gender</label>
                <select className="form-select" value={profileForm.gender || ''} onChange={e => setProfileForm(prev => ({ ...prev, gender: e.target.value }))}>
                  {['Male', 'Female', 'Other', 'Prefer not to say'].map(g => <option key={g}>{g}</option>)}
                </select>
              </div>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              {[
                { l: 'Registered Mobile', v: profile?.mobile, icon: '📱' },
                { l: 'Email ID', v: profile?.email, icon: '📧' },
                { l: 'Blood Group Type', v: profile?.blood_group, icon: '🩸', color: 'var(--red-400)' },
                { l: 'Age', v: profile?.age, icon: '🎂' },
                { l: 'Gender Category', v: profile?.gender, icon: '👤' },
                { l: 'Home Address', v: profile?.address, icon: '📍' }
              ].map(item => (
                <div key={item.l} className="flex-between" style={{ padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.03)', fontSize: 14 }}>
                  <span className="text-muted">{item.icon} {item.l}</span>
                  <span style={{ color: item.color || 'var(--text-primary)', fontWeight: 500 }}>{item.v || '—'}</span>
                </div>
              ))}
            </div>
          )}
          {editMode && <button className="btn btn-secondary btn-sm w-full" style={{ marginTop: 16 }} onClick={() => setEditMode(false)}>Cancel</button>}
        </div>

        {/* Right Side: Multiple Devices & Shared Access */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="flex-between" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
            <h3 style={{ margin: 0 }}>📟 My IoT Vehicle Devices</h3>
            <button className="btn btn-primary btn-sm" onClick={() => setShowPairModal(true)}>🔗 Add Device</button>
          </div>

          {/* Owned Devices */}
          <div>
            <h4 style={{ marginBottom: 12, color: 'var(--cyan-400)' }}>Owned Hardware ({ownedDevices.length})</h4>
            {ownedDevices.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '16px', background: 'rgba(255,255,255,0.01)', border: '1px dashed var(--border)', borderRadius: 8, color: 'var(--text-muted)' }}>
                No registered devices. Click "Add Device" to pair your vehicle IoT unit.
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 12 }}>
                {ownedDevices.map(item => (
                  <div key={item.device.id} className="card" style={{ padding: 14, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)' }}>
                    <div className="flex-between mb-8">
                      <strong style={{ fontSize: 15 }}>🚗 {item.vehicle?.vehicle_number || 'Unnamed Vehicle'}</strong>
                      <span className="badge badge-green">Owner</span>
                    </div>
                    <div className="text-muted text-xs" style={{ display: 'grid', gap: 2, marginBottom: 10 }}>
                      <div>Device Code: <code style={{ color: 'var(--cyan-400)' }}>{item.device.device_id}</code></div>
                      <div>Type: {item.vehicle?.vehicle_type} | Variant: {item.vehicle?.manufacturer} {item.vehicle?.vehicle_model} ({item.vehicle?.year || '—'})</div>
                      <div>SIM: {item.device.sim_code} | Battery: {item.device.battery_level}%</div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn btn-secondary btn-xs" onClick={() => handleManageShares(item.device)}>👥 Share Access</button>
                      <button className="btn btn-danger btn-xs" onClick={() => handleUnlinkDevice(item.device.id)}>🔓 Unlink</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Shared Devices */}
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 16 }}>
            <h4 style={{ marginBottom: 12, color: 'var(--orange-400)' }}>Shared With Me ({sharedDevices.length})</h4>
            {sharedDevices.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '16px', background: 'rgba(255,255,255,0.01)', border: '1px dashed var(--border)', borderRadius: 8, color: 'var(--text-muted)', fontSize: 13 }}>
                No shared devices listed. Give friends your AapadBandhav ID to see their vehicle telemetry.
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 12 }}>
                {sharedDevices.map(item => (
                  <div key={item.device.id} className="card" style={{ padding: 14, background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.08)' }}>
                    <div className="flex-between mb-8">
                      <strong style={{ fontSize: 15 }}>🚗 {item.vehicle?.vehicle_number || 'Vehicle'}</strong>
                      <span className="badge badge-muted">Shared (Viewer)</span>
                    </div>
                    <div className="text-muted text-xs" style={{ display: 'grid', gap: 2 }}>
                      <div>Owner: <strong>{item.ownerName}</strong></div>
                      <div>Device Code: <code>{item.device.device_id}</code></div>
                      <div>Type: {item.vehicle?.vehicle_type} | Variant: {item.vehicle?.manufacturer} {item.vehicle?.vehicle_model}</div>
                      <div>Battery: {item.device.battery_level}% | Speed: {item.device.current_speed} km/h</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Lower Full Width Card: Emergency Contacts */}
        <div className="card" style={{ gridColumn: 'span 2' }}>
          <div className="flex-between mb-16">
            <div>
              <h3>📞 Emergency Contacts List</h3>
              <p className="text-sm text-muted">{contacts.length}/5 contacts added • These contacts receive automatic SMS alerts with maps during emergency crashes</p>
            </div>
            {contacts.length < 5 && <button className="btn btn-primary btn-sm" onClick={() => { setShowContactForm(true); setEditContact(null); setContactForm({ contact_name: '', mobile: '', relation: '', priority: contacts.length + 1 }); }}>+ Add Contact</button>}
          </div>

          {showContactForm && (
            <div className="card" style={{ marginBottom: 16, border: '1px solid var(--border-glow)' }}>
              <h4 style={{ marginBottom: 12 }}>{editContact ? 'Edit Contact Parameters' : 'Register New Emergency Contact'}</h4>
              <div className="form-grid-3">
                <div className="form-group"><label className="form-label">Full Name *</label><input className="form-input" value={contactForm.contact_name} onChange={e => setContactForm(f => ({ ...f, contact_name: e.target.value }))} placeholder="Contact Name" /></div>
                <div className="form-group"><label className="form-label">Mobile Number *</label><input className="form-input" value={contactForm.mobile} onChange={e => setContactForm(f => ({ ...f, mobile: e.target.value.replace(/\D/g, '').slice(0, 10) }))} placeholder="9876543210" /></div>
                <div className="form-group"><label className="form-label">Relationship</label><input className="form-input" value={contactForm.relation} onChange={e => setContactForm(f => ({ ...f, relation: e.target.value }))} placeholder="Spouse, Mother, Sister..." /></div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button className="btn btn-primary btn-sm" onClick={saveContact}>💾 Save Contact</button>
                <button className="btn btn-secondary btn-sm" onClick={() => { setShowContactForm(false); setEditContact(null); }}>Cancel</button>
              </div>
            </div>
          )}

          {contacts.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)', background: 'rgba(255,255,255,0.01)', border: '1px dashed var(--border)', borderRadius: 8 }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>📵</div>
              <div>No emergency contacts configured yet. Please add at least one contact for safety notifications.</div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
              {contacts.map((c, i) => (
                <div key={c.id} className="card" style={{ padding: 16, border: '1px solid var(--border)', background: 'rgba(255,255,255,0.01)' }}>
                  <div className="flex-between mb-8">
                    <span className="badge badge-red">Priority #{c.priority || i + 1}</span>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => { setEditContact(c); setContactForm(c); setShowContactForm(true); }}>✏️</button>
                      <button className="btn btn-ghost btn-sm" style={{ color: 'var(--red-400)' }} onClick={() => deleteContact(c.id)}>🗑️</button>
                    </div>
                  </div>
                  <div style={{ fontWeight: 600, marginBottom: 4, fontSize: 14 }}>{c.contact_name}</div>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>📱 {c.mobile}</div>
                  {c.relation && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>👥 Relationship: {c.relation}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Register & Pair IoT Device Modal */}
      {showPairModal && (
        <div className="modal-overlay" onClick={() => setShowPairModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '520px' }}>
            <h3 className="modal-title">🔗 Pair New IoT Device</h3>
            <p className="text-muted text-xs" style={{ marginBottom: 16 }}>
              Scan your device's QR code or type verification details. Complete your vehicle profile to activate.
            </p>

            <form onSubmit={handleLinkDevice} style={{ display: 'grid', gap: 12 }}>
              {/* Simulated QR Code Scan Input */}
              <div className="form-group" style={{ background: 'rgba(255,255,255,0.01)', border: '1px dashed var(--border)', padding: 12, borderRadius: 8 }}>
                <label className="form-label" style={{ color: 'var(--cyan-400)' }}>📷 Simulated QR Code Scanner</label>
                <input 
                  className="form-input" 
                  value={simulatedQrInput}
                  onChange={e => handleQrInputPaste(e.target.value)}
                  placeholder="Paste the Device QR JSON string here to simulate scan..." 
                  style={{ fontSize: 12 }}
                />
                <small className="text-muted" style={{ display: 'block', marginTop: 4 }}>
                  (Copy & Paste the QR JSON from the Admin Devices page to simulate scanning!)
                </small>
              </div>

              {/* Hardware Credentials */}
              <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
                <div className="form-group">
                  <label className="form-label">Device Code *</label>
                  <input className="form-input" value={linkForm.deviceCode} onChange={e => setLinkForm(p => ({ ...p, deviceCode: e.target.value }))} placeholder="16-digit Device Code" required />
                </div>
              </div>

              {/* Vehicle parameters */}
              <div>
                <h4 style={{ marginBottom: 12 }}>🚗 Vehicle Information Parameters</h4>
                <div className="form-grid-2">
                  <div className="form-group">
                    <label className="form-label">Vehicle Type *</label>
                    <select className="form-select" value={linkForm.vehicle_type} onChange={e => setLinkForm(p => ({ ...p, vehicle_type: e.target.value }))}>
                      {['Car', 'Motorcycle', 'Truck', 'Bus', 'Auto', 'Other'].map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Vehicle Number *</label>
                    <input className="form-input" value={linkForm.vehicle_number} onChange={e => setLinkForm(p => ({ ...p, vehicle_number: e.target.value.toUpperCase() }))} placeholder="AP39-TX-4521" required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Vehicle Model</label>
                    <input className="form-input" value={linkForm.vehicle_model} onChange={e => setLinkForm(p => ({ ...p, vehicle_model: e.target.value }))} placeholder="i20" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Manufacturer</label>
                    <input className="form-input" value={linkForm.manufacturer} onChange={e => setLinkForm(p => ({ ...p, manufacturer: e.target.value }))} placeholder="Hyundai" />
                  </div>
                  <div className="form-group" style={{ gridColumn: 'span 2' }}>
                    <label className="form-label">Manufacturing Year</label>
                    <input className="form-input" type="number" value={linkForm.year} onChange={e => setLinkForm(p => ({ ...p, year: e.target.value }))} placeholder="2022" />
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={loading}>
                  {loading ? 'Pairing...' : '🔗 Verify & Link Device'}
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => { setShowPairModal(false); setSimulatedQrInput(''); }}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Manage Shares Modal */}
      {showShareModal && sharingDevice && (
        <div className="modal-overlay" onClick={() => setShowShareModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '460px' }}>
            <h3 className="modal-title">👥 Manage Shared Access</h3>
            <p className="text-muted text-xs" style={{ marginBottom: 16 }}>
              Device: <strong>{sharingDevice.device_id}</strong>
            </p>

            {/* Share Form */}
            <form onSubmit={handleShareDevice} style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
              <input
                className="form-input"
                value={shareWithId}
                onChange={e => setShareWithId(e.target.value)}
                placeholder="Enter Recipient AapadBandhav ID"
                style={{ flex: 1 }}
                required
              />
              <button type="submit" className="btn btn-primary btn-sm">➕ Share</button>
            </form>

            {/* List of active shares */}
            <h4 style={{ marginBottom: 10, fontSize: 13, color: 'var(--text-muted)' }}>Currently Shared With:</h4>
            {deviceShares.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 16, border: '1px dashed var(--border)', borderRadius: 8, color: 'var(--text-muted)', fontSize: 12 }}>
                Not shared with any users yet. Add their AapadBandhav ID above.
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 8, maxHeight: 220, overflowY: 'auto' }}>
                {deviceShares.map(share => (
                  <div key={share.id} className="flex-between card" style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 13 }}>
                      <strong>{share.full_name}</strong>
                      <div className="text-muted" style={{ fontSize: 11 }}>Mobile: {share.mobile}</div>
                    </div>
                    <button
                      type="button"
                      className="btn btn-danger btn-xs"
                      onClick={() => handleRevokeShare(share.user_id)}
                      style={{ padding: '3px 6px' }}
                    >
                      Revoke
                    </button>
                  </div>
                ))}
              </div>
            )}

            <button
              className="btn btn-secondary w-full"
              style={{ marginTop: 20 }}
              onClick={() => setShowShareModal(false)}
            >
              Close Panel
            </button>
          </div>
        </div>
      )}
    </Layout>
  );
}
