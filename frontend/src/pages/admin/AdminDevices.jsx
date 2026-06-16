import React, { useState, useEffect, useMemo } from 'react';
import Layout from '../../components/Layout';
import API from '../../api/axios';
import toast from 'react-hot-toast';
import QRCode from 'qrcode';
import { 
  CpuIcon, ShareIcon, ShieldIcon, WifiIcon, TrashIcon, 
  DownloadIcon, EditIcon, CheckIcon, AlertIcon, FileTextIcon 
} from '../../components/Icons';

export default function AdminDevices() {
  const [activeTab, setActiveTab] = useState('inventory'); // 'inventory', 'owners', 'shares', 'matrix', 'bulk'
  const [inventoryList, setInventoryList] = useState([]);
  const [assignedList, setAssignedList] = useState([]);
  const [sharesList, setSharesList] = useState([]);
  const [loading, setLoading] = useState(false);

  // Selection state
  const [selectedDeviceIds, setSelectedDeviceIds] = useState([]);

  // Bulk Form States
  const [bulkCount, setBulkCount] = useState(10);
  const [generatedDevices, setGeneratedDevices] = useState([]);

  // Search & Filter
  const [inventorySearch, setInventorySearch] = useState('');
  const [inventoryStatus, setInventoryStatus] = useState('all');
  const [assignedSearch, setAssignedSearch] = useState('');
  const [sharesSearch, setSharesSearch] = useState('');
  const [matrixSearch, setMatrixSearch] = useState('');

  // Modals & Action Targets
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [qrUrl, setQrUrl] = useState('');
  const [simpleQrUrl, setSimpleQrUrl] = useState('');
  const [confirmAction, setConfirmAction] = useState(null); // { type: 'activate'|'inactivate'|'delete'|'bulk-activate'|'bulk-deactivate'|'bulk-delete', device?: obj }
  
  // Matrix Add Share State
  const [sharingDevice, setSharingDevice] = useState(null); // Device object
  const [shareWithId, setShareWithId] = useState(''); // AapadBandhav ID

  // Fetch Inventory List
  const fetchInventory = async () => {
    setLoading(true);
    try {
      const res = await API.get(`/admin/devices/inventory?search=${encodeURIComponent(inventorySearch)}&status=${inventoryStatus}`);
      setInventoryList(res.data.devices || []);
    } catch (e) {
      toast.error('Failed to fetch inventory');
    } finally {
      setLoading(false);
    }
  };

  // Fetch Assigned List (Owners)
  const fetchAssigned = async () => {
    setLoading(true);
    try {
      const res = await API.get(`/admin/devices/assigned?search=${encodeURIComponent(assignedSearch)}`);
      setAssignedList(res.data.devices || []);
    } catch (e) {
      toast.error('Failed to fetch assigned devices');
    } finally {
      setLoading(false);
    }
  };

  // Fetch All Shared Devices
  const fetchShares = async () => {
    setLoading(true);
    try {
      const res = await API.get('/admin/devices/shares');
      setSharesList(res.data.shares || []);
    } catch (e) {
      toast.error('Failed to fetch device shares');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setSelectedDeviceIds([]); // Reset selection when switching tabs
    if (activeTab === 'inventory') {
      fetchInventory();
    } else if (activeTab === 'owners' || activeTab === 'matrix') {
      fetchAssigned();
      if (activeTab === 'matrix') {
        fetchShares();
      }
    } else if (activeTab === 'shares') {
      fetchShares();
    }
  }, [activeTab, inventorySearch, inventoryStatus, assignedSearch, sharesSearch]);

  // Generate QR Code URL from selected device
  useEffect(() => {
    if (selectedDevice) {
      const dCode = selectedDevice.device_id || selectedDevice.deviceCode;
      
      const payload = JSON.stringify({
        deviceId: dCode,
        type: 'device_registration'
      });
      
      QRCode.toDataURL(payload, { width: 250, margin: 2, color: { dark: '#09090b', light: '#ffffff' } }, (err, url) => {
        if (!err) setQrUrl(url);
      });
      
      QRCode.toDataURL(dCode, { width: 250, margin: 2, color: { dark: '#09090b', light: '#ffffff' } }, (err, url) => {
        if (!err) setSimpleQrUrl(url);
      });
    } else {
      setQrUrl('');
      setSimpleQrUrl('');
    }
  }, [selectedDevice]);

  // Copy helper
  const copyToClipboard = (text, label) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied!`);
  };

  // Selection handlers
  const handleSelectRow = (id) => {
    if (selectedDeviceIds.includes(id)) {
      setSelectedDeviceIds(prev => prev.filter(x => x !== id));
    } else {
      setSelectedDeviceIds(prev => [...prev, id]);
    }
  };

  const handleSelectAll = (visibleItems) => {
    const visibleIds = visibleItems.map(item => item.id);
    const allSelected = visibleIds.every(id => selectedDeviceIds.includes(id));
    if (allSelected) {
      setSelectedDeviceIds(prev => prev.filter(id => !visibleIds.includes(id)));
    } else {
      setSelectedDeviceIds(prev => [...new Set([...prev, ...visibleIds])]);
    }
  };

  const handleSelectFiltered = (type, visibleItems) => {
    if (type === 'all') {
      setSelectedDeviceIds(visibleItems.map(item => item.id));
    } else if (type === 'active') {
      const activeIds = visibleItems.filter(item => item.status === 'active' || item.is_active === true).map(item => item.id);
      setSelectedDeviceIds(activeIds);
    } else if (type === 'inactive') {
      const inactiveIds = visibleItems.filter(item => item.status === 'inactive' || item.is_active === false).map(item => item.id);
      setSelectedDeviceIds(inactiveIds);
    } else if (type === 'none') {
      setSelectedDeviceIds([]);
    }
  };

  // Bulk Actions
  const handleBulkActivate = async () => {
    if (selectedDeviceIds.length === 0) return;
    setLoading(true);
    try {
      const res = await API.post('/admin/devices/bulk-activate', { deviceIds: selectedDeviceIds });
      toast.success(res.data.message || 'Devices activated successfully');
      setSelectedDeviceIds([]);
      if (activeTab === 'inventory') fetchInventory();
      else fetchAssigned();
    } catch (e) {
      toast.error('Bulk activation failed');
    } finally {
      setLoading(false);
      setConfirmAction(null);
    }
  };

  const handleBulkDeactivate = async () => {
    if (selectedDeviceIds.length === 0) return;
    setLoading(true);
    try {
      const res = await API.post('/admin/devices/bulk-deactivate', { deviceIds: selectedDeviceIds });
      toast.success(res.data.message || 'Devices deactivated successfully');
      setSelectedDeviceIds([]);
      if (activeTab === 'inventory') fetchInventory();
      else fetchAssigned();
    } catch (e) {
      toast.error('Bulk deactivation failed');
    } finally {
      setLoading(false);
      setConfirmAction(null);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedDeviceIds.length === 0) return;
    setLoading(true);
    try {
      const res = await API.post('/admin/devices/bulk-delete', { deviceIds: selectedDeviceIds });
      toast.success(res.data.message || 'Devices deleted successfully');
      setSelectedDeviceIds([]);
      if (activeTab === 'inventory') fetchInventory();
      else fetchAssigned();
    } catch (e) {
      toast.error('Bulk delete failed');
    } finally {
      setLoading(false);
      setConfirmAction(null);
    }
  };

  const handleBulkExport = async () => {
    if (selectedDeviceIds.length === 0) return;
    try {
      const res = await API.post('/admin/devices/bulk-export', { deviceIds: selectedDeviceIds });
      if (res.data && res.data.devices) {
        exportToCSV(res.data.devices, `exported_devices_${Date.now()}.csv`);
      }
    } catch (e) {
      toast.error('Failed to export selected devices');
    }
  };

  const handleBulkQRDownload = async () => {
    if (selectedDeviceIds.length === 0) return;
    try {
      const res = await API.post('/admin/devices/bulk-qr-download', { deviceIds: selectedDeviceIds });
      if (res.data && res.data.qrs) {
        // Download a JSON of the QR payloads
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(res.data.qrs, null, 2));
        const link = document.createElement('a');
        link.setAttribute('href', dataStr);
        link.setAttribute('download', `qr_payloads_${Date.now()}.json`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast.success('QR Code configurations downloaded successfully!');
      }
    } catch (e) {
      toast.error('Failed to download QR configurations');
    }
  };

  // CSV Export utility
  const exportToCSV = (list, filename) => {
    if (!list || list.length === 0) return toast.error('No data to export');
    const headers = Object.keys(list[0]).join(',');
    const rows = list.map(item => {
      return Object.values(item).map(val => {
        if (typeof val === 'object' && val !== null) {
          return `"${JSON.stringify(val).replace(/"/g, '""')}"`;
        }
        return `"${String(val ?? '').replace(/"/g, '""')}"`;
      }).join(',');
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + encodeURIComponent([headers, ...rows].join('\n'));
    const link = document.createElement('a');
    link.setAttribute('href', csvContent);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Export completed successfully!');
  };

  // Perform bulk provision request
  const handleBulkGenerate = async (e) => {
    e.preventDefault();
    if (bulkCount <= 0 || bulkCount > 500) {
      return toast.error('Please enter a number between 1 and 500');
    }
    setLoading(true);
    try {
      const res = await API.post('/admin/devices/bulk', { count: Number(bulkCount) });
      setGeneratedDevices(res.data.devices || []);
      toast.success(res.data.message || 'Devices provisioned successfully');
      setBulkCount(10);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Provisioning failed');
    } finally {
      setLoading(false);
    }
  };

  // Confirm and run individual action
  const handleConfirmedAction = async () => {
    if (!confirmAction) return;
    const { type, device } = confirmAction;

    // Route bulk actions
    if (type === 'bulk-activate') return handleBulkActivate();
    if (type === 'bulk-deactivate') return handleBulkDeactivate();
    if (type === 'bulk-delete') return handleBulkDelete();

    try {
      if (type === 'delete') {
        const res = await API.delete(`/admin/devices/${device.id}`);
        toast.success(res.data.message || 'Device deleted');
        setInventoryList(list => list.filter(item => item.id !== device.id));
      } else {
        const newStatus = type === 'activate' ? 'active' : 'inactive';
        const res = await API.put(`/admin/devices/${device.id}/status`, { status: newStatus });
        toast.success(res.data.message || 'Device status updated');
        setInventoryList(list => list.map(item => item.id === device.id ? { ...item, status: newStatus, is_active: newStatus === 'active' } : item));
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Action failed');
    } finally {
      setConfirmAction(null);
    }
  };

  // Revoke share relationship
  const handleRevokeShare = async (shareId) => {
    try {
      const res = await API.delete(`/admin/devices/shares/${shareId}`);
      toast.success(res.data.message || 'Device access share revoked');
      fetchShares();
    } catch (e) {
      toast.error('Failed to revoke device access share');
    }
  };

  // Add Share (Access Matrix)
  const handleAddShareMatrix = async (e) => {
    e.preventDefault();
    if (!shareWithId.trim()) return toast.error('AapadBandhav ID is required');
    try {
      const res = await API.post(`/devices/${sharingDevice.id}/share`, { share_with_id: shareWithId.trim() });
      toast.success(res.data.message || 'Device share access created successfully');
      setSharingDevice(null);
      setShareWithId('');
      fetchShares();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create share access');
    }
  };

  // Print Ticket Window
  const handlePrintQR = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return toast.error('Popup blocked. Please allow popups.');
    
    const dCode = selectedDevice.device_id || selectedDevice.deviceCode;
    const pName = selectedDevice.pass_name || selectedDevice.passName;
    const pCode = selectedDevice.pass_code || selectedDevice.passcode;
    const sCode = selectedDevice.sim_code || selectedDevice.simCode;

    printWindow.document.write(`
      <html>
        <head>
          <title>Print QR Ticket - ${dCode}</title>
          <style>
            body { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; font-family: 'Plus Jakarta Sans', sans-serif; color: #09090b; margin: 0; background: #fff; }
            .ticket { border: 2.5px dashed #09090b; padding: 32px; border-radius: 16px; text-align: center; max-width: 480px; width: 100%; box-sizing: border-box; }
            .logo { font-size: 24px; font-weight: 800; margin-bottom: 5px; color: #ef4444; letter-spacing: -0.5px; }
            .sub { font-size: 13px; color: #71717a; margin-bottom: 24px; }
            .qr-wrapper { text-align: center; margin-bottom: 24px; }
            .qr-label { font-size: 12px; font-weight: 700; margin-bottom: 8px; color: #52525b; }
            img { width: 180px; height: 180px; border: 1px solid #e4e4e7; padding: 4px; border-radius: 8px; }
            .fields { text-align: left; font-family: monospace; font-size: 14px; background: #fafafa; padding: 16px; border: 1px solid #e4e4e7; border-radius: 10px; }
            .field-row { margin-bottom: 8px; display: flex; justify-content: space-between; border-bottom: 1px dotted #d4d4d8; padding-bottom: 6px; }
            .field-row:last-child { margin-bottom: 0; border-bottom: none; }
          </style>
        </head>
        <body>
          <div class="ticket">
            <div class="logo">AapadBandhav System</div>
            <div class="sub">IoT Device Registration QR Ticket</div>
            <div class="qr-wrapper">
              <div class="qr-label">Scan QR Code from User Dashboard</div>
              <img src="${qrUrl}" />
            </div>
            <div class="fields">
              <div class="field-row"><span>Device ID:</span> <strong>${dCode}</strong></div>
              <div class="field-row"><span>Pass Name:</span> <strong>${pName}</strong></div>
              <div class="field-row"><span>Passcode:</span> <strong>${pCode}</strong></div>
              <div class="field-row"><span>SIM Code:</span> <strong>${sCode}</strong></div>
            </div>
          </div>
          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() { window.close(); }, 500);
            }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  // Download QR Code PNG
  const handleDownloadQR = () => {
    const link = document.createElement('a');
    link.href = qrUrl;
    link.download = `Registration_QR_${selectedDevice.device_id || selectedDevice.deviceCode}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Filtering views locally
  const filteredInventory = useMemo(() => {
    return inventoryList.filter(item => {
      const searchLower = inventorySearch.toLowerCase();
      const matchSearch = (item.device_id?.toLowerCase() || '').includes(searchLower) ||
                          (item.pass_name?.toLowerCase() || '').includes(searchLower) ||
                          (item.sim_code?.toLowerCase() || '').includes(searchLower);
      return matchSearch;
    });
  }, [inventoryList, inventorySearch]);

  const filteredAssigned = useMemo(() => {
    return assignedList.filter(item => {
      const searchLower = assignedSearch.toLowerCase();
      const matchSearch = (item.deviceCode?.toLowerCase() || '').includes(searchLower) ||
                          (item.userName?.toLowerCase() || '').includes(searchLower) ||
                          (item.mobile || '').includes(assignedSearch);
      return matchSearch;
    });
  }, [assignedList, assignedSearch]);

  const filteredShares = useMemo(() => {
    return sharesList.filter(item => {
      const searchLower = sharesSearch.toLowerCase();
      return (item.device_code?.toLowerCase() || '').includes(searchLower) ||
             (item.owner_name?.toLowerCase() || '').includes(searchLower) ||
             (item.shared_with_name?.toLowerCase() || '').includes(searchLower) ||
             (item.shared_with_unique_id?.toLowerCase() || '').includes(searchLower);
    });
  }, [sharesList, sharesSearch]);

  const filteredMatrix = useMemo(() => {
    return assignedList.filter(item => {
      const searchLower = matrixSearch.toLowerCase();
      return (item.deviceCode?.toLowerCase() || '').includes(searchLower) ||
             (item.userName?.toLowerCase() || '').includes(searchLower);
    });
  }, [assignedList, matrixSearch]);

  return (
    <Layout title="Admin - Device Management">
      {/* Title section */}
      <div className="flex-between mb-24 animate-fade">
        <div>
          <h1 className="section-title">Device & Access Management</h1>
          <p className="section-subtitle">Manage device registrations, credentials, bulk provisions, and sharing metrics</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {selectedDeviceIds.length > 0 && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: 'var(--blue-bg)',
                border: '1px solid var(--blue-border)',
                borderRadius: '8px',
                padding: '4px 12px',
                marginRight: '8px',
              }}
            >
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--blue-primary)' }}>
                {selectedDeviceIds.length} Selected
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Navigation tabs */}
      <div className="flex" style={{ gap: 8, marginBottom: 20, borderBottom: '1px solid var(--border)', paddingBottom: 12, overflowX: 'auto' }}>
        {[
          { key: 'inventory', label: 'Inventory', count: filteredInventory.length, icon: <CpuIcon size={14} /> },
          { key: 'owners', label: 'Device Owners', count: filteredAssigned.length, icon: <CpuIcon size={14} /> },
          { key: 'shares', label: 'Shared Devices', count: filteredShares.length, icon: <ShareIcon size={14} /> },
          { key: 'matrix', label: 'Access Matrix', count: filteredMatrix.length, icon: <ShieldIcon size={14} /> },
          { key: 'bulk', label: 'Provision Devices', count: 0, icon: <WifiIcon size={14} /> }
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`btn btn-sm ${activeTab === tab.key ? 'btn-primary' : 'btn-secondary'}`}
            style={{ borderRadius: '8px', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 8 }}
          >
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
            {tab.count > 0 && <span className="badge badge-muted" style={{ background: activeTab === tab.key ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.05)', color: 'inherit' }}>{tab.count}</span>}
          </button>
        ))}
      </div>

      {/* Bulk Operations Toolbar */}
      {selectedDeviceIds.length > 0 && (activeTab === 'inventory' || activeTab === 'owners') && (
        <div
          className="bento-card animate-fade"
          style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--blue-border)',
            padding: '16px 20px',
            marginBottom: '20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <CpuIcon size={20} style={{ color: 'var(--blue-primary)' }} />
            <div>
              <strong style={{ fontSize: '15px' }}>Bulk Device Actions</strong>
              <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Perform action on {selectedDeviceIds.length} selected devices</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              onClick={() => setConfirmAction({ type: 'bulk-activate' })}
              className="btn btn-success btn-xs"
            >
              Activate
            </button>
            <button
              onClick={() => setConfirmAction({ type: 'bulk-deactivate' })}
              className="btn btn-warning btn-xs"
            >
              Deactivate
            </button>
            <button
              onClick={() => setConfirmAction({ type: 'bulk-delete' })}
              className="btn btn-danger btn-xs"
            >
              Delete
            </button>
            <button
              onClick={handleBulkExport}
              className="btn btn-secondary btn-xs"
            >
              Export CSV
            </button>
            {activeTab === 'inventory' && (
              <button
                onClick={handleBulkQRDownload}
                className="btn btn-secondary btn-xs"
              >
                QR configs
              </button>
            )}
            <button
              onClick={() => setSelectedDeviceIds([])}
              className="btn btn-ghost btn-xs"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Main Container */}
      <div className="bento-card animate-fade">
        
        {/* Tab 1: Unassigned Inventory */}
        {activeTab === 'inventory' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
              <div style={{ display: 'flex', gap: 12, flex: 1, maxWidth: '500px' }}>
                <input
                  className="form-input"
                  value={inventorySearch}
                  onChange={e => setInventorySearch(e.target.value)}
                  placeholder="Search inventory by ID, SIM or Pass Name..."
                />
                <select 
                  className="form-select" 
                  value={inventoryStatus} 
                  onChange={e => setInventoryStatus(e.target.value)}
                  style={{ width: '180px' }}
                >
                  <option value="all">All statuses</option>
                  <option value="active">Active only</option>
                  <option value="inactive">Inactive only</option>
                </select>
              </div>

              {/* Selection helper tags */}
              <div style={{ display: 'flex', gap: '6px' }}>
                <button onClick={() => handleSelectFiltered('all', filteredInventory)} className="btn btn-ghost btn-xs" style={{ fontSize: '11px', color: 'var(--blue-primary)' }}>All</button>
                <button onClick={() => handleSelectFiltered('active', filteredInventory)} className="btn btn-ghost btn-xs" style={{ fontSize: '11px', color: 'var(--green-primary)' }}>Active</button>
                <button onClick={() => handleSelectFiltered('inactive', filteredInventory)} className="btn btn-ghost btn-xs" style={{ fontSize: '11px', color: 'var(--red-primary)' }}>Inactive</button>
                <button onClick={() => handleSelectFiltered('none', filteredInventory)} className="btn btn-ghost btn-xs" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>None</button>
              </div>
            </div>

            {loading && inventoryList.length === 0 ? (
              <div className="loading-screen" style={{ height: 200 }}><div className="spinner" /></div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: '40px', textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={filteredInventory.length > 0 && filteredInventory.every(x => selectedDeviceIds.includes(x.id))}
                          onChange={() => handleSelectAll(filteredInventory)}
                        />
                      </th>
                      <th>Device Code</th>
                      <th>Pass Name</th>
                      <th>Passcode</th>
                      <th>SIM Code</th>
                      <th>Status</th>
                      <th>QR Code</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredInventory.map(row => (
                      <tr key={row.id}>
                        <td style={{ textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={selectedDeviceIds.includes(row.id)}
                            onChange={() => handleSelectRow(row.id)}
                          />
                        </td>
                        <td>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <code style={{ fontSize: '13px', color: 'var(--cyan-primary)', fontFamily: 'var(--font-mono)' }}>{row.device_id}</code>
                            <button onClick={() => copyToClipboard(row.device_id, 'Device ID')} style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: 0.5, display: 'inline-flex', alignItems: 'center' }}>
                              <FileTextIcon size={12} />
                            </button>
                          </div>
                        </td>
                        <td>{row.pass_name}</td>
                        <td><code>{row.pass_code}</code></td>
                        <td>{row.sim_code}</td>
                        <td>
                          <span className={`badge badge-${row.status === 'active' ? 'green' : 'red'}`}>
                            {row.status?.toUpperCase()}
                          </span>
                        </td>
                        <td>
                          <button 
                            className="btn btn-secondary btn-xs"
                            onClick={() => setSelectedDevice(row)}
                          >
                            View QR
                          </button>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button 
                              className={`btn btn-xs ${row.status === 'active' ? 'btn-warning' : 'btn-success'}`}
                              onClick={() => setConfirmAction({ type: row.status === 'active' ? 'inactivate' : 'activate', device: row })}
                            >
                              {row.status === 'active' ? 'Deactivate' : 'Activate'}
                            </button>
                            <button 
                              className="btn btn-danger btn-xs"
                              onClick={() => setConfirmAction({ type: 'delete', device: row })}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {filteredInventory.length === 0 && (
                      <tr>
                        <td colSpan="8" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
                          No unassigned devices found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Device Owners */}
        {activeTab === 'owners' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
              <div style={{ display: 'flex', gap: 12, flex: 1, maxWidth: '420px' }}>
                <input
                  className="form-input"
                  value={assignedSearch}
                  onChange={e => setAssignedSearch(e.target.value)}
                  placeholder="Search by ID, Owner Name, SIM, Mobile..."
                />
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button onClick={() => handleSelectFiltered('all', filteredAssigned)} className="btn btn-ghost btn-xs" style={{ fontSize: '11px', color: 'var(--blue-primary)' }}>Select All</button>
                <button onClick={() => handleSelectFiltered('none', filteredAssigned)} className="btn btn-ghost btn-xs" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Deselect All</button>
              </div>
            </div>

            {loading && assignedList.length === 0 ? (
              <div className="loading-screen" style={{ height: 200 }}><div className="spinner" /></div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: '40px', textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={filteredAssigned.length > 0 && filteredAssigned.every(x => selectedDeviceIds.includes(x.id))}
                          onChange={() => handleSelectAll(filteredAssigned)}
                        />
                      </th>
                      <th>Device Code</th>
                      <th>Owner Name</th>
                      <th>Owner Mobile</th>
                      <th>Vehicle Details</th>
                      <th>Linked On</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAssigned.map(row => (
                      <tr key={row.id}>
                        <td style={{ textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={selectedDeviceIds.includes(row.id)}
                            onChange={() => handleSelectRow(row.id)}
                          />
                        </td>
                        <td><code style={{ color: 'var(--cyan-primary)' }}>{row.deviceCode}</code></td>
                        <td><strong>{row.userName}</strong></td>
                        <td>{row.mobile}</td>
                        <td>
                          {row.vehicle ? (
                            <div>
                              <strong style={{ color: 'var(--blue-primary)' }}>{row.vehicle.vehicle_number}</strong>
                              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                {row.vehicle.vehicle_type} - {row.vehicle.manufacturer} {row.vehicle.vehicle_model}
                              </div>
                            </div>
                          ) : '—'}
                        </td>
                        <td>{row.registrationDate ? new Date(row.registrationDate).toLocaleDateString('en-IN') : '—'}</td>
                        <td>
                          <span className={`badge badge-${row.is_active ? 'green' : 'red'}`}>
                            {row.is_active ? 'ACTIVE' : 'INACTIVE'}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {filteredAssigned.length === 0 && (
                      <tr>
                        <td colSpan="7" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
                          No linked devices found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Shared Devices */}
        {activeTab === 'shares' && (
          <div>
            <div style={{ marginBottom: 16 }}>
              <input
                className="form-input"
                value={sharesSearch}
                onChange={e => setSharesSearch(e.target.value)}
                placeholder="Search shares by Device Code, Owner, Shared User..."
                style={{ maxWidth: '420px' }}
              />
            </div>

            {loading && sharesList.length === 0 ? (
              <div className="loading-screen" style={{ height: 200 }}><div className="spinner" /></div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Device Code</th>
                      <th>Primary Owner</th>
                      <th>Shared With User</th>
                      <th>Shared User ID</th>
                      <th>Shared Mobile</th>
                      <th>Shared On</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredShares.map(row => (
                      <tr key={row.share_id}>
                        <td><code style={{ color: 'var(--cyan-primary)' }}>{row.device_code}</code></td>
                        <td><strong>{row.owner_name}</strong></td>
                        <td><strong>{row.shared_with_name}</strong></td>
                        <td><code>{row.shared_with_unique_id}</code></td>
                        <td>{row.shared_with_mobile}</td>
                        <td>{row.created_at ? new Date(row.created_at).toLocaleDateString('en-IN') : '—'}</td>
                        <td>
                          <button
                            onClick={() => handleRevokeShare(row.share_id)}
                            className="btn btn-danger btn-xs"
                          >
                            Revoke Access
                          </button>
                        </td>
                      </tr>
                    ))}
                    {filteredShares.length === 0 && (
                      <tr>
                        <td colSpan="7" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
                          No active device sharing relationships found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Tab 4: Access Matrix */}
        {activeTab === 'matrix' && (
          <div>
            <div style={{ marginBottom: 16 }}>
              <input
                className="form-input"
                value={matrixSearch}
                onChange={e => setMatrixSearch(e.target.value)}
                placeholder="Search Device Matrix by Device Code or Owner Name..."
                style={{ maxWidth: '420px' }}
              />
            </div>

            {loading ? (
              <div className="loading-screen" style={{ height: 200 }}><div className="spinner" /></div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Device Code</th>
                      <th>Primary Owner</th>
                      <th>Shared Access Viewers</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMatrix.map(device => {
                      const deviceShares = sharesList.filter(s => s.device_code === device.deviceCode);
                      return (
                        <tr key={device.id}>
                          <td><code style={{ color: 'var(--cyan-primary)' }}>{device.deviceCode}</code></td>
                          <td>
                            <div><strong>{device.userName}</strong></div>
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Owner Mobile: {device.mobile}</div>
                          </td>
                          <td>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                              {deviceShares.map(s => (
                                <span
                                  key={s.share_id}
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    background: 'var(--blue-bg)',
                                    border: '1px solid var(--blue-border)',
                                    borderRadius: '6px',
                                    padding: '2px 8px',
                                    fontSize: '11px',
                                    color: 'var(--blue-primary)',
                                  }}
                                >
                                  {s.shared_with_name} ({s.shared_with_unique_id})
                                  <button
                                    onClick={() => handleRevokeShare(s.share_id)}
                                    style={{
                                      background: 'transparent',
                                      border: 'none',
                                      color: 'var(--red-primary)',
                                      cursor: 'pointer',
                                      fontWeight: 'bold',
                                      padding: '0 2px',
                                    }}
                                    title="Revoke Share"
                                    aria-label="Revoke share"
                                  >
                                    X
                                  </button>
                                </span>
                              ))}
                              {deviceShares.length === 0 && (
                                <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                                  No shared viewers
                                </span>
                              )}
                            </div>
                          </td>
                          <td>
                            <button
                              onClick={() => setSharingDevice(device)}
                              className="btn btn-primary btn-xs"
                            >
                              Add Shared User
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    {filteredMatrix.length === 0 && (
                      <tr>
                        <td colSpan="4" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
                          No linked devices found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Tab 5: Bulk Provisioning */}
        {activeTab === 'bulk' && (
          <div>
            <div style={{ maxWidth: 450, margin: '20px auto 40px auto' }}>
              <h3 style={{ marginBottom: 8, textAlign: 'center' }}>Bulk Provision New IoT Devices</h3>
              <p className="text-muted text-sm" style={{ marginBottom: 24, textAlign: 'center' }}>
                Automatically generate unique device codes, secure passnames, random passcodes, and simulated SIM codes in bulk.
              </p>
              
              <form onSubmit={handleBulkGenerate} className="flex" style={{ flexDirection: 'column', gap: 16 }}>
                <div className="form-group">
                  <label className="form-label">Number of Devices to Generate *</label>
                  <input
                    type="number"
                    className="form-input"
                    value={bulkCount}
                    onChange={e => setBulkCount(e.target.value)}
                    placeholder="Enter count (e.g. 100)"
                    min="1"
                    max="500"
                    required
                  />
                  <small className="text-muted" style={{ display: 'block', marginTop: 4 }}>
                    Max 500 devices per batch. Generates unique codes and QR records instantly.
                  </small>
                </div>
                
                <button type="submit" className="btn btn-primary w-full" disabled={loading}>
                  {loading ? <><span className="spinner" /> Provisioning...</> : 'Provision Devices'}
                </button>
              </form>
            </div>

            {generatedDevices.length > 0 && (
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 24 }} className="animate-fade">
                <div className="flex-between mb-16">
                  <div>
                    <h4 style={{ margin: 0 }}>Successfully Generated Devices ({generatedDevices.length})</h4>
                    <p className="text-muted text-xs">Copy individual parameters or export the entire batch to CSV below</p>
                  </div>
                  <button 
                    className="btn btn-secondary btn-sm"
                    onClick={() => exportToCSV(generatedDevices, `bulk_provision_${Date.now()}.csv`)}
                  >
                    Export Batch to CSV
                  </button>
                </div>

                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Device Code</th>
                        <th>Pass Name</th>
                        <th>Passcode</th>
                        <th>SIM Code</th>
                        <th>Status</th>
                        <th>QR Code Payload</th>
                      </tr>
                    </thead>
                    <tbody>
                      {generatedDevices.map((d, index) => (
                        <tr key={d.id || index}>
                          <td>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                              <code style={{ fontSize: '13px', color: 'var(--cyan-primary)', fontFamily: 'var(--font-mono)' }}>{d.device_id}</code>
                              <button onClick={() => copyToClipboard(d.device_id, 'Device ID')} style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: 0.5, display: 'inline-flex', alignItems: 'center' }}>
                                <FileTextIcon size={12} />
                              </button>
                            </div>
                          </td>
                          <td>{d.pass_name}</td>
                          <td><code>{d.pass_code}</code></td>
                          <td>{d.sim_code}</td>
                          <td><span className="badge badge-red">{d.status}</span></td>
                          <td><code style={{ fontSize: 11, opacity: 0.7 }}>{d.qr_code}</code></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add Share Modal (Access Matrix) */}
      {sharingDevice && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: '400px' }}>
            <h3 className="modal-title">Share Device Access</h3>
            <p className="text-muted text-xs" style={{ marginBottom: 20 }}>
              Device Code: <strong>{sharingDevice.deviceCode}</strong>
            </p>

            <form onSubmit={handleAddShareMatrix} style={{ display: 'grid', gap: 16 }}>
              <div className="form-group">
                <label className="form-label">Recipient AapadBandhav ID (e.g. AB123456)</label>
                <input
                  type="text"
                  className="form-input"
                  value={shareWithId}
                  onChange={e => setShareWithId(e.target.value)}
                  placeholder="Enter user Unique ID"
                  required
                />
              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
                  Create Share
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ flex: 1 }}
                  onClick={() => {
                    setSharingDevice(null);
                    setShareWithId('');
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* QR Modal */}
      {selectedDevice && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: '420px', textAlign: 'center' }}>
            <h3 className="modal-title">Device QR Code</h3>
            <p className="text-muted text-xs" style={{ marginBottom: 20 }}>
              Device: <strong>{selectedDevice.device_id || selectedDevice.deviceCode}</strong>
            </p>
            
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
              <div style={{ background: '#fff', padding: '16px', borderRadius: '12px', display: 'inline-block', border: '1px solid var(--border)' }}>
                {qrUrl ? (
                  <img src={qrUrl} alt="Registration QR" style={{ display: 'block', width: '200px', height: '200px' }} />
                ) : (
                  <div style={{ width: 200, height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#09090b', fontSize: 13 }}>
                    Generating QR Code...
                  </div>
                )}
              </div>
            </div>

            <div className="bento-card" style={{ textAlign: 'left', background: 'var(--bg-secondary)', border: '1px solid var(--border)', padding: '12px', fontSize: '13px', marginBottom: 20, display: 'grid', gap: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Code:</span> <strong>{selectedDevice.device_id || selectedDevice.deviceCode}</strong></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Pass Name:</span> <strong>{selectedDevice.pass_name || selectedDevice.passName}</strong></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Passcode:</span> <strong>{selectedDevice.pass_code || selectedDevice.passcode}</strong></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>SIM Code:</span> <strong>{selectedDevice.sim_code || selectedDevice.simCode}</strong></div>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleDownloadQR}>
                Download PNG
              </button>
              <button className="btn btn-secondary" style={{ flex: 1 }} onClick={handlePrintQR}>
                Print Ticket
              </button>
            </div>
            
            <button 
              className="btn btn-ghost btn-sm w-full" 
              style={{ marginTop: 12, color: 'var(--text-muted)' }} 
              onClick={() => setSelectedDevice(null)}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmAction && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: '380px' }}>
            <h3 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              Confirm Action
            </h3>
            <p className="text-sm text-primary" style={{ margin: '14px 0', lineHeight: '1.5' }}>
              Are you sure you want to <strong>{confirmAction.type.replace('-', ' ')}</strong> {confirmAction.device ? `device ${confirmAction.device.device_id}` : `${selectedDeviceIds.length} selected devices`}?
              {confirmAction.type.includes('delete') && ' This will permanently remove the device(s) and any owner/sharing history from the database.'}
            </p>
            
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button 
                className={`btn ${confirmAction.type.includes('delete') ? 'btn-danger' : 'btn-primary'}`} 
                style={{ flex: 1 }} 
                onClick={handleConfirmedAction}
              >
                Yes, Confirm
              </button>
              <button 
                className="btn btn-secondary" 
                style={{ flex: 1 }} 
                onClick={() => setConfirmAction(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
