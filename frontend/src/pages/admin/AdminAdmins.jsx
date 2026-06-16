import React, { useState, useEffect } from 'react';
import Layout from '../../components/Layout';
import API from '../../api/axios';
import toast from 'react-hot-toast';
import { KeyIcon, FileTextIcon } from '../../components/Icons';

const AVAILABLE_PERMISSIONS = [
  { code: 'manage_users', label: 'Manage Users', desc: 'Can create, edit, deactivate, or delete user accounts' },
  { code: 'manage_devices', label: 'Manage Devices', desc: 'Can generate and manage IoT hardware codes' },
  { code: 'manage_vehicles', label: 'Manage Vehicles', desc: 'Can register, modify, or unlink vehicle profiles' },
  { code: 'manage_police', label: 'Manage Police', desc: 'Can set police responder availability and patrol modes' },
  { code: 'manage_reports', label: 'Manage Reports', desc: 'Can review accident history and crash analytics' },
  { code: 'manage_documentation', label: 'Manage Documentation', desc: 'Can update or preview developer APIs' }
];

export default function AdminAdmins() {
  const [activeTab, setActiveTab] = useState('admins'); // 'admins' | 'logs'
  const [admins, setAdmins] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedAdmin, setSelectedAdmin] = useState(null);

  // Form states
  const [formData, setFormData] = useState({
    name: '',
    mobile: '',
    email: '',
    role: 'admin',
    permissions: []
  });

  const fetchAdmins = async () => {
    setLoading(true);
    try {
      const res = await API.get('/admin/manage/admins');
      if (res.data && res.data.success) {
        setAdmins(res.data.admins || []);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to fetch administrators');
    } finally {
      setLoading(false);
    }
  };

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const res = await API.get('/admin/manage/logs');
      if (res.data && res.data.success) {
        setLogs(res.data.logs || []);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to fetch audit logs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'admins') {
      fetchAdmins();
    } else {
      fetchLogs();
    }
  }, [activeTab]);

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name || !formData.mobile) {
      toast.error('Name and Mobile number are required');
      return;
    }
    try {
      const res = await API.post('/admin/manage/admins', formData);
      if (res.data && res.data.success) {
        toast.success(res.data.message || 'Administrator created successfully');
        setShowCreateModal(false);
        setFormData({ name: '', mobile: '', email: '', role: 'admin', permissions: [] });
        fetchAdmins();
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create administrator');
    }
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!selectedAdmin) return;
    try {
      const res = await API.put(`/admin/manage/admins/${selectedAdmin.id}`, {
        name: formData.name,
        email: formData.email,
        role: formData.role,
        permissions: formData.permissions
      });
      if (res.data && res.data.success) {
        toast.success('Administrator updated successfully');
        setShowEditModal(false);
        setSelectedAdmin(null);
        setFormData({ name: '', mobile: '', email: '', role: 'admin', permissions: [] });
        fetchAdmins();
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update administrator');
    }
  };

  const handleToggleStatus = async (admin) => {
    if (admin.id === 'admin-001') {
      toast.error('Cannot suspend synthetic system administrator');
      return;
    }
    try {
      const res = await API.put(`/admin/manage/admins/${admin.id}/toggle`);
      if (res.data && res.data.success) {
        toast.success(res.data.message);
        fetchAdmins();
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to toggle status');
    }
  };

  const handleDeleteAdmin = async (admin) => {
    if (admin.id === 'admin-001') {
      toast.error('Cannot delete synthetic system administrator');
      return;
    }
    if (!confirm(`Are you sure you want to permanently delete the administrator account for ${admin.full_name}?`)) {
      return;
    }
    try {
      const res = await API.delete(`/admin/manage/admins/${admin.id}`);
      if (res.data && res.data.success) {
        toast.success(res.data.message || 'Administrator deleted successfully');
        fetchAdmins();
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete administrator');
    }
  };

  const openEditModal = (admin) => {
    setSelectedAdmin(admin);
    setFormData({
      name: admin.full_name || '',
      mobile: admin.mobile || '',
      email: admin.email || '',
      role: admin.role || 'admin',
      permissions: admin.permissions || []
    });
    setShowEditModal(true);
  };

  const handlePermissionChange = (permCode) => {
    setFormData(prev => {
      const current = prev.permissions || [];
      if (current.includes(permCode)) {
        return { ...prev, permissions: current.filter(x => x !== permCode) };
      } else {
        return { ...prev, permissions: [...current, permCode] };
      }
    });
  };

  const handleSelectAllPermissions = () => {
    setFormData(prev => ({
      ...prev,
      permissions: AVAILABLE_PERMISSIONS.map(p => p.code)
    }));
  };

  const handleClearAllPermissions = () => {
    setFormData(prev => ({
      ...prev,
      permissions: []
    }));
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    try {
      const d = new Date(dateString);
      return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    } catch {
      return dateString;
    }
  };

  const filteredAdmins = admins.filter(admin => {
    const term = searchQuery.toLowerCase();
    return (
      (admin.full_name || '').toLowerCase().includes(term) ||
      (admin.mobile || '').toLowerCase().includes(term) ||
      (admin.email || '').toLowerCase().includes(term) ||
      (admin.unique_id || '').toLowerCase().includes(term)
    );
  });

  const getRoleBadgeClass = (role) => {
    return role === 'superadmin' ? 'badge-red' : 'badge-cyan';
  };

  return (
    <Layout title="Admin Management System">
      <div className="flex-between mb-24">
        <div>
          <h1 className="section-title">Admin Management System</h1>
          <p className="section-subtitle">
            Configure administrative accounts, manage permission scopes, and audit admin activities.
          </p>
        </div>
        {activeTab === 'admins' && (
          <button
            className="btn btn-primary"
            onClick={() => {
              setFormData({ name: '', mobile: '', email: '', role: 'admin', permissions: [] });
              setShowCreateModal(true);
            }}
          >
            Create Admin
          </button>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
        <button
          className={`btn ${activeTab === 'admins' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setActiveTab('admins')}
          style={{ padding: '8px 16px', borderRadius: '6px', display: 'inline-flex', alignItems: 'center', gap: 8 }}
        >
          <KeyIcon size={14} /> Administrators List
        </button>
        <button
          className={`btn ${activeTab === 'logs' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setActiveTab('logs')}
          style={{ padding: '8px 16px', borderRadius: '6px', display: 'inline-flex', alignItems: 'center', gap: 8 }}
        >
          <FileTextIcon size={14} /> Audit Trail Logs
        </button>
      </div>

      {activeTab === 'admins' && (
        <div className="bento-card">
          <div style={{ marginBottom: 16 }}>
            <input
              type="text"
              className="form-input"
              placeholder="Search by name, mobile, email, or unique ID..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{ maxWidth: 400 }}
            />
          </div>

          {loading ? (
            <div className="loading-screen" style={{ height: 200 }}><div className="spinner" /></div>
          ) : (
            <>
            <div className="table-wrap mobile-card-table">
              <table>
                <thead>
                  <tr>
                    <th>Unique ID</th>
                    <th>Name</th>
                    <th>Contact Info</th>
                    <th>Role</th>
                    <th>Permissions</th>
                    <th>Created By / Date</th>
                    <th>Last Login</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAdmins.map(admin => (
                    <tr key={admin.id || admin.mobile}>
                      <td>
                        <code style={{ color: 'var(--cyan-primary)', fontSize: 12 }}>
                          {admin.unique_id || 'AB-ADMIN'}
                        </code>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{admin.full_name || 'System Administrator'}</div>
                      </td>
                      <td>
                        <div className="text-sm">{admin.mobile}</div>
                        <div className="text-xs text-muted">{admin.email || 'No email registered'}</div>
                      </td>
                      <td>
                        <span className={`badge ${getRoleBadgeClass(admin.role)}`} style={{ textTransform: 'uppercase' }}>
                          {admin.role === 'superadmin' ? 'Super Admin' : 'Admin'}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, maxWidth: '240px' }}>
                          {admin.permissions && admin.permissions.length > 0 ? (
                            admin.permissions.map(perm => (
                              <span
                                key={perm}
                                className="badge badge-muted text-xs"
                                style={{ fontSize: '10px', padding: '2px 6px' }}
                                title={AVAILABLE_PERMISSIONS.find(p => p.code === perm)?.desc || perm}
                              >
                                {perm.replace('manage_', '')}
                              </span>
                            ))
                          ) : (
                            <span className="text-xs text-muted" style={{ fontStyle: 'italic' }}>None</span>
                          )}
                        </div>
                      </td>
                      <td>
                        <div className="text-xs">{admin.created_by ? `By: ${admin.created_by}` : 'System'}</div>
                        <div className="text-xs text-muted">{formatDate(admin.created_at || admin.created_date)}</div>
                      </td>
                      <td>
                        <span className="text-xs">{formatDate(admin.last_login)}</span>
                      </td>
                      <td>
                        <span className={`badge badge-${admin.is_active ? 'green' : 'warning'}`}>
                          {admin.is_active ? 'Active' : 'Suspended'}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          {admin.id !== 'admin-001' ? (
                            <>
                              <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => openEditModal(admin)}
                                style={{ padding: '4px 8px', fontSize: '11px' }}
                              >
                                Edit
                              </button>
                              <button
                                className={`btn btn-sm ${admin.is_active ? 'btn-warning' : 'btn-success'}`}
                                onClick={() => handleToggleStatus(admin)}
                                style={{ padding: '4px 8px', fontSize: '11px' }}
                              >
                                {admin.is_active ? 'Suspend' : 'Activate'}
                              </button>
                              <button
                                className="btn btn-danger btn-sm"
                                onClick={() => handleDeleteAdmin(admin)}
                                style={{ padding: '4px 8px', fontSize: '11px' }}
                              >
                                Delete
                              </button>
                            </>
                          ) : (
                            <span className="text-xs text-muted" style={{ fontStyle: 'italic', paddingRight: 10 }}>System Lock</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredAdmins.length === 0 && (
                    <tr>
                      <td colSpan="9" style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>
                        No administrators matching your query were found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="mobile-record-grid">
              {filteredAdmins.map(admin => (
                <article className="mobile-record-card" key={admin.id || admin.mobile}>
                  <div className="mobile-record-card-row">
                    <div className="mobile-record-card-label">Name</div>
                    <div className="mobile-record-card-value" style={{ fontWeight: 700 }}>
                      {admin.full_name || 'System Administrator'}
                    </div>
                  </div>
                  <div className="mobile-record-card-row">
                    <div className="mobile-record-card-label">ID</div>
                    <div className="mobile-record-card-value">
                      <code style={{ color: 'var(--cyan-primary)', fontSize: 12 }}>
                        {admin.unique_id || 'AB-ADMIN'}
                      </code>
                    </div>
                  </div>
                  <div className="mobile-record-card-row">
                    <div className="mobile-record-card-label">Role</div>
                    <div className="mobile-record-card-value">
                      <span className={`badge ${getRoleBadgeClass(admin.role)}`} style={{ textTransform: 'uppercase' }}>
                        {admin.role === 'superadmin' ? 'Super Admin' : 'Admin'}
                      </span>
                    </div>
                  </div>
                  <div className="mobile-record-card-row">
                    <div className="mobile-record-card-label">Contact</div>
                    <div className="mobile-record-card-value">
                      <div>{admin.mobile}</div>
                      <div className="text-xs text-muted">{admin.email || 'No email registered'}</div>
                    </div>
                  </div>
                  <div className="mobile-record-card-row">
                    <div className="mobile-record-card-label">Status</div>
                    <div className="mobile-record-card-value">
                      <span className={`badge badge-${admin.is_active ? 'green' : 'warning'}`}>
                        {admin.is_active ? 'Active' : 'Suspended'}
                      </span>
                    </div>
                  </div>
                  <div className="mobile-record-card-row">
                    <div className="mobile-record-card-label">Actions</div>
                    <div className="mobile-record-card-value">
                      {admin.id !== 'admin-001' ? (
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <button className="btn btn-secondary btn-sm" onClick={() => openEditModal(admin)}>Edit</button>
                          <button className={`btn btn-sm ${admin.is_active ? 'btn-warning' : 'btn-success'}`} onClick={() => handleToggleStatus(admin)}>
                            {admin.is_active ? 'Suspend' : 'Activate'}
                          </button>
                          <button className="btn btn-danger btn-sm" onClick={() => handleDeleteAdmin(admin)}>Delete</button>
                        </div>
                      ) : (
                        <span className="text-xs text-muted" style={{ fontStyle: 'italic' }}>System Lock</span>
                      )}
                    </div>
                  </div>
                </article>
              ))}
              {filteredAdmins.length === 0 && (
                <div className="mobile-record-card" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                  No administrators matching your query were found.
                </div>
              )}
            </div>
            </>
          )}
        </div>
      )}

      {activeTab === 'logs' && (
        <div className="bento-card">
          <div className="flex-between mb-16">
            <h3 style={{ fontSize: 15, fontWeight: 600 }}>Security & Audit Trails</h3>
            <button className="btn btn-secondary btn-sm" onClick={fetchLogs}>
              Refresh Logs
            </button>
          </div>

          {loading ? (
            <div className="loading-screen" style={{ height: 200 }}><div className="spinner" /></div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Role Context</th>
                    <th>Admin User ID</th>
                    <th>Action</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map(log => (
                    <tr key={log.id}>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <span className="text-xs text-muted">{formatDate(log.created_at)}</span>
                      </td>
                      <td>
                        <span className="badge badge-muted" style={{ textTransform: 'uppercase' }}>
                          {log.entity_type}
                        </span>
                      </td>
                      <td>
                        <code style={{ fontSize: 11, color: 'var(--cyan-primary)' }}>{log.entity_id}</code>
                      </td>
                      <td>
                        <span className="badge badge-blue" style={{ fontSize: 11 }}>
                          {log.action}
                        </span>
                      </td>
                      <td>
                        <span className="text-sm" style={{ wordBreak: 'break-all' }}>{log.details}</span>
                      </td>
                    </tr>
                  ))}
                  {logs.length === 0 && (
                    <tr>
                      <td colSpan="5" style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>
                        No audit trail actions logged yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* CREATE MODAL */}
      {showCreateModal && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: '600px' }}>
            <h3 className="modal-title">Create Administrative Account</h3>
            <form onSubmit={handleCreateSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label className="form-label" style={{ display: 'block', marginBottom: 6 }}>Full Name *</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Ramesh Patel"
                  value={formData.name}
                  onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label className="form-label" style={{ display: 'block', marginBottom: 6 }}>Mobile Number *</label>
                  <input
                    type="tel"
                    className="form-input"
                    placeholder="10-digit number"
                    value={formData.mobile}
                    onChange={e => setFormData(prev => ({ ...prev, mobile: e.target.value }))}
                    required
                  />
                </div>
                <div>
                  <label className="form-label" style={{ display: 'block', marginBottom: 6 }}>Email Address</label>
                  <input
                    type="email"
                    className="form-input"
                    placeholder="email@aapadbandhav.in"
                    value={formData.email}
                    onChange={e => setFormData(prev => ({ ...prev, email: e.target.value }))}
                  />
                </div>
              </div>

              <div>
                <label className="form-label" style={{ display: 'block', marginBottom: 6 }}>Administrative Role</label>
                <select
                  className="form-select"
                  value={formData.role}
                  onChange={e => setFormData(prev => ({ ...prev, role: e.target.value }))}
                >
                  <option value="admin">Administrator (Limited Authority)</option>
                  <option value="superadmin">Super Administrator (Highest Authority)</option>
                </select>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <label className="form-label">Assign Permissions</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="button" className="btn btn-ghost btn-xs" onClick={handleSelectAllPermissions} style={{ fontSize: 11, padding: '2px 6px' }}>Select All</button>
                    <button type="button" className="btn btn-ghost btn-xs" onClick={handleClearAllPermissions} style={{ fontSize: 11, padding: '2px 6px' }}>Clear</button>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, background: 'var(--bg-secondary)', padding: 12, borderRadius: 8, border: '1px solid var(--border)' }}>
                  {AVAILABLE_PERMISSIONS.map(perm => (
                    <label
                      key={perm.code}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 8,
                        cursor: 'pointer',
                        padding: 6,
                        borderRadius: 4,
                        transition: 'background 0.2s'
                      }}
                      className="hover-bg-adjust"
                    >
                      <input
                        type="checkbox"
                        checked={(formData.permissions || []).includes(perm.code)}
                        onChange={() => handlePermissionChange(perm.code)}
                        style={{ marginTop: 3 }}
                      />
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{perm.label}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{perm.desc}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 10 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowCreateModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Create Account
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT MODAL */}
      {showEditModal && selectedAdmin && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: '600px' }}>
            <h3 className="modal-title">Edit Administrative Profile</h3>
            <form onSubmit={handleEditSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label className="form-label" style={{ display: 'block', marginBottom: 6 }}>Full Name *</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Ramesh Patel"
                  value={formData.name}
                  onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label className="form-label" style={{ display: 'block', marginBottom: 6 }}>Mobile Number (Locked)</label>
                  <input
                    type="text"
                    className="form-input"
                    value={formData.mobile}
                    disabled
                    style={{ opacity: 0.6, cursor: 'not-allowed' }}
                  />
                </div>
                <div>
                  <label className="form-label" style={{ display: 'block', marginBottom: 6 }}>Email Address</label>
                  <input
                    type="email"
                    className="form-input"
                    placeholder="email@aapadbandhav.in"
                    value={formData.email}
                    onChange={e => setFormData(prev => ({ ...prev, email: e.target.value }))}
                  />
                </div>
              </div>

              <div>
                <label className="form-label" style={{ display: 'block', marginBottom: 6 }}>Administrative Role</label>
                <select
                  className="form-select"
                  value={formData.role}
                  onChange={e => setFormData(prev => ({ ...prev, role: e.target.value }))}
                >
                  <option value="admin">Administrator (Limited Authority)</option>
                  <option value="superadmin">Super Administrator (Highest Authority)</option>
                </select>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <label className="form-label">Assign Permissions</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="button" className="btn btn-ghost btn-xs" onClick={handleSelectAllPermissions} style={{ fontSize: 11, padding: '2px 6px' }}>Select All</button>
                    <button type="button" className="btn btn-ghost btn-xs" onClick={handleClearAllPermissions} style={{ fontSize: 11, padding: '2px 6px' }}>Clear</button>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, background: 'var(--bg-secondary)', padding: 12, borderRadius: 8, border: '1px solid var(--border)' }}>
                  {AVAILABLE_PERMISSIONS.map(perm => (
                    <label
                      key={perm.code}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 8,
                        cursor: 'pointer',
                        padding: 6,
                        borderRadius: 4,
                        transition: 'background 0.2s'
                      }}
                      className="hover-bg-adjust"
                    >
                      <input
                        type="checkbox"
                        checked={(formData.permissions || []).includes(perm.code)}
                        onChange={() => handlePermissionChange(perm.code)}
                        style={{ marginTop: 3 }}
                      />
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{perm.label}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{perm.desc}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 10 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => { setShowEditModal(false); setSelectedAdmin(null); }}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Layout>
  );
}
