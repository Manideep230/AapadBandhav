import React, { useState, useEffect } from 'react';
import Layout from '../../components/Layout';
import API from '../../api/axios';
import toast from 'react-hot-toast';

const roles = [
  { key: 'user', label: 'Users', hint: 'Vehicle owners' },
  { key: 'hospital', label: 'Hospitals', hint: 'Care providers' },
  { key: 'ambulance', label: 'Ambulances', hint: 'Drivers' },
  { key: 'police_station', label: 'Police Stations', hint: 'Stations' },
  { key: 'policeman', label: 'Policemen', hint: 'Officers' },
  { key: 'mechanic', label: 'Mechanics', hint: 'Roadside help' },
  { key: 'insurance', label: 'Insurance', hint: 'Companies' },
  { key: 'fire_department', label: 'Fire Dept', hint: 'Fire units' },
  { key: 'volunteer', label: 'Rangers', hint: 'Community Responders' },
];

const roleLabel = (role) => ({
  user: 'User',
  hospital: 'Hospital',
  ambulance: 'Ambulance',
  police_station: 'Police Station',
  policeman: 'Policeman',
  mechanic: 'Mechanic',
  insurance: 'Insurance',
  fire_department: 'Fire Dept',
  volunteer: 'Ranger',
}[role] || role);

export default function AdminUsers() {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('user');
  const [status, setStatus] = useState('all');

  const selectedRole = roles.find(item => item.key === role) || roles[0];
  const filteredAccounts = accounts.filter(account => {
    if (status === 'active') return account.is_active;
    if (status === 'inactive') return !account.is_active;
    return true;
  });

  const fetchAccounts = async () => {
    setLoading(true);
    try {
      const res = await API.get(`/admin/users?search=${encodeURIComponent(search)}&role=${role}&limit=100`);
      setAccounts(res.data.users || []);
    } catch (e) {
      toast.error('Failed to load accounts');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAccounts(); }, [search, role]);

  const toggle = async (account) => {
    try {
      const res = await API.put(`/admin/users/${account.id}/toggle?role=${account.entityType}`);
      const updated = res.data.account;
      setAccounts(items => items.map(item => item.id === account.id && item.entityType === account.entityType ? { ...item, ...updated } : item));
      toast.success(account.is_active ? 'Account deactivated' : 'Account activated');
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed');
    }
  };

  const deleteAccount = async (account) => {
    if (!confirm(`Delete ${account.display_name || account.email}? This cannot be undone.`)) return;
    try {
      await API.delete(`/admin/users/${account.id}?role=${account.entityType}`);
      setAccounts(items => items.filter(item => !(item.id === account.id && item.entityType === account.entityType)));
      toast.success('Account deleted');
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed to delete');
    }
  };

  return (
    <Layout title="Admin - Accounts">
      <div className="flex-between mb-24">
        <div>
          <h1 className="section-title">Account Management</h1>
          <p className="section-subtitle">
            Showing {filteredAccounts.length} {selectedRole.label.toLowerCase()}
            {status !== 'all' ? ` (${status})` : ''}
          </p>
        </div>
      </div>

      <div className="card">
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: 10,
            marginBottom: 18,
          }}
        >
          {roles.map(item => (
            <button
              key={item.key}
              type="button"
              className={`btn ${role === item.key ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => {
                setRole(item.key);
                setStatus('all');
              }}
              style={{ alignItems: 'flex-start', flexDirection: 'column', gap: 2, padding: '12px 14px' }}
            >
              <span>{item.label}</span>
              <span className="text-xs" style={{ opacity: 0.78, fontWeight: 500 }}>{item.hint}</span>
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
          <input
            id="search-accounts"
            name="search"
            className="form-input"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={`Search ${selectedRole.label.toLowerCase()} by name, email, ID, or mobile...`}
            style={{ maxWidth: 420 }}
          />
          <select id="select-role" name="role" className="form-select" value={role} onChange={e => setRole(e.target.value)} style={{ maxWidth: 220 }}>
            {roles.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}
          </select>
          <select id="select-status" name="status" className="form-select" value={status} onChange={e => setStatus(e.target.value)} style={{ maxWidth: 180 }}>
            <option value="all">All statuses</option>
            <option value="active">Active only</option>
            <option value="inactive">Inactive only</option>
          </select>
        </div>

        {loading ? <div className="loading-screen" style={{ height: 200 }}><div className="spinner" /></div> : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Role</th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Mobile</th>
                  <th>Details</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredAccounts.map(account => (
                  <tr key={`${account.entityType}-${account.id}`}>
                    <td><code style={{ fontSize: 12, color: 'var(--cyan-400)' }}>{account.unique_id || account.id}</code></td>
                    <td><span className="badge badge-muted">{roleLabel(account.entityType)}</span></td>
                    <td style={{ fontWeight: 500 }}>{account.display_name || account.full_name || account.name || '-'}</td>
                    <td className="text-sm text-muted">{account.email}</td>
                    <td className="text-sm">{account.mobile || '-'}</td>
                    <td className="text-sm">
                      {account.entityType === 'user'
                        ? `${account.vehicle_number || '-'} (${account.vehicle_type || '-'})`
                        : account.vehicle_number || account.station_code || account.badge_number || account.license_number || account.specialization || account.city || '-'}
                    </td>
                    <td>
                      <div 
                        className={`toggle-switch-container ${account.is_active ? 'active' : 'standby'}`} 
                        onClick={() => toggle(account)}
                        style={{ padding: '4px 8px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}
                        title={account.is_active ? 'Click to Deactivate' : 'Click to Activate'}
                      >
                        <div className="toggle-switch-track" style={{ width: 34, height: 18, borderRadius: 9, position: 'relative', transition: 'background 0.2s', display: 'block' }}>
                          <div 
                            className="toggle-switch-thumb" 
                            style={{ 
                              width: 14, 
                              height: 14, 
                              borderRadius: '50%', 
                              position: 'absolute', 
                              top: 2, 
                              left: account.is_active ? 18 : 2, 
                              transition: 'left 0.2s', 
                              background: '#fff',
                              display: 'block'
                            }} 
                          />
                        </div>
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button className="btn btn-danger btn-sm" onClick={() => deleteAccount(account)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredAccounts.length === 0 && <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>No {selectedRole.label.toLowerCase()} found</div>}
          </div>
        )}
      </div>
    </Layout>
  );
}
