import React, { useState, useEffect, useCallback } from 'react';
import Layout from '../../components/Layout';
import { useAuth } from '../../context/AuthContext';
import API from '../../api/axios';
import toast from 'react-hot-toast';
import { getSocket } from '../../api/socket';
import { useSocketEvent } from '../../hooks/useSocket';
import { useNavigate } from 'react-router-dom';
import MapView, { ICONS } from '../../components/MapView';
import { Html5QrcodeScanner } from 'html5-qrcode';

export default function UserDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  
  const [accidents, setAccidents] = useState([]);
  const [devices, setDevices] = useState([]);
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [stops, setStops] = useState([]);
  const [logs, setLogs] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [liveAlert, setLiveAlert] = useState(null);
  
  const [loading, setLoading] = useState(true);
  const [mapCenter, setMapCenter] = useState([16.5062, 80.6480]); // Vijayawada center
  const [mapZoom, setMapZoom] = useState(13);

  // Modals state
  const [showQRModal, setShowQRModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showRenameModal, setShowRenameModal] = useState(false);
  
  // Form fields
  const [qrCode, setQrCode] = useState('');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [vehicleType, setVehicleType] = useState('Car');
  const [vehicleModel, setVehicleModel] = useState('');
  const [manufacturer, setManufacturer] = useState('');
  const [year, setYear] = useState('');
  const [showScanner, setShowScanner] = useState(false);
  
  const [shareUserId, setShareUserId] = useState('');
  const [renameValue, setRenameValue] = useState('');

  useEffect(() => {
    if (!showQRModal) {
      setShowScanner(false);
    }
  }, [showQRModal]);

  useEffect(() => {
    let scanner = null;
    if (showScanner && showQRModal) {
      const timer = setTimeout(() => {
        try {
          // Initialize scanner on #qr-reader element
          scanner = new Html5QrcodeScanner('qr-reader', {
            fps: 10,
            qrbox: { width: 250, height: 250 },
            rememberLastUsedCamera: true
          }, false);

          scanner.render(
            (decodedText) => {
              setQrCode(decodedText);
              setShowScanner(false);
              toast.success('QR Code scanned successfully!');
            },
            (err) => {
              // Ignore scanning frame errors
            }
          );
        } catch (error) {
          console.error("Scanner initialization error:", error);
        }
      }, 100);

      return () => {
        clearTimeout(timer);
        if (scanner) {
          scanner.clear().catch(err => console.error("Failed to clear scanner:", err));
        }
      };
    }
  }, [showScanner, showQRModal]);

  const fetchData = useCallback(async () => {
    try {
      const [accRes, devRes, notifRes] = await Promise.all([
        API.get('/accidents/my'),
        API.get('/live-map/my-devices'),
        API.get('/notifications'),
      ]);
      
      setAccidents(accRes.data.accidents || []);
      
      const devList = devRes.data.devices || [];
      setDevices(devList);
      
      if (devList.length > 0) {
        // Automatically select the first device if none is selected
        if (!selectedDevice) {
          const first = devList[0];
          setSelectedDevice(first);
          if (first.latitude && first.longitude) {
            setMapCenter([first.latitude, first.longitude]);
          }
        } else {
          // Keep current selected device details updated
          const updated = devList.find(d => d.device_id === selectedDevice.device_id);
          if (updated) setSelectedDevice(updated);
        }
      } else {
        setSelectedDevice(null);
      }
      
      setNotifications(notifRes.data.notifications || []);
    } catch (e) {
      console.error(e);
    } finally { 
      setLoading(false); 
    }
  }, [selectedDevice]);

  useEffect(() => { 
    fetchData(); 
  }, [fetchData]);

  // Load stops and logs for selected device
  useEffect(() => {
    if (!selectedDevice) {
      setStops([]);
      setLogs([]);
      return;
    }

    const loadDeviceDetails = async () => {
      try {
        const [stopsRes, logsRes] = await Promise.all([
          API.get(`/devices/${selectedDevice.device_id}/stops`),
          API.get(`/devices/${selectedDevice.device_id}/logs`)
        ]);
        setStops(stopsRes.data.stops || []);
        setLogs(logsRes.data.logs || []);
      } catch (e) {
        console.error('Failed to load device stops/logs');
      }
    };

    loadDeviceDetails();
  }, [selectedDevice]);

  const onResponded = useCallback((data) => {
    setLiveAlert(data);
    toast.success(`🚑 Emergency responded! ${data.type} is en route. ETA: ${data.eta} min`);
  }, []);

  const onMovement = useCallback((data) => {
    toast(`🚗 Vehicle Movement: ${data.message}`, { duration: 6000, icon: '🔔' });
    fetchData();
  }, [fetchData]);

  // Bind Socket.IO events using custom hook
  useSocketEvent('accident:responded', onResponded);
  useSocketEvent('device:movement', onMovement);

  const selectDevice = (dev) => {
    setSelectedDevice(dev);
    if (dev.latitude && dev.longitude) {
      setMapCenter([dev.latitude, dev.longitude]);
      setMapZoom(15);
    }
  };

  // Onboard Device via QR Simulation
  const handleQROnboarding = async (e) => {
    e.preventDefault();
    if (!qrCode || !vehicleNumber) {
      return toast.error('QR Code and Vehicle Number are required');
    }
    
    setLoading(true);
    try {
      const res = await API.post('/devices/register-by-qr', {
        qrCode,
        vehicle_type: vehicleType,
        vehicle_number: vehicleNumber,
        vehicle_model: vehicleModel,
        manufacturer,
        year
      });
      
      if (res.data.success) {
        toast.success('Device onboarded successfully!');
        setShowQRModal(false);
        // Clear form
        setQrCode('');
        setVehicleNumber('');
        setVehicleModel('');
        setManufacturer('');
        setYear('');
        fetchData();
      }
    } catch (e) {
      toast.error(e.response?.data?.message || 'QR verification or binding failed');
    } finally {
      setLoading(false);
    }
  };

  // Device Sharing
  const handleShareDevice = async (e) => {
    e.preventDefault();
    if (!shareUserId) return toast.error('Please enter a User ID to share access with');
    
    try {
      await API.post(`/devices/${selectedDevice.id}/share`, { user_id: shareUserId });
      toast.success('Access shared successfully!');
      setShowShareModal(false);
      setShareUserId('');
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed to share device access');
    }
  };

  // Device Renaming
  const handleRenameDevice = async (e) => {
    e.preventDefault();
    if (!renameValue) return toast.error('Please enter a display name');
    
    try {
      await API.put(`/devices/${selectedDevice.device_id}/rename`, { name: renameValue });
      toast.success('Device renamed successfully!');
      setShowRenameModal(false);
      setRenameValue('');
      fetchData();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed to rename device');
    }
  };

  // Device Unbinding
  const handleUnbindDevice = async () => {
    if (!window.confirm('Are you sure you want to unbind this device? This will unlink it from your account.')) return;
    
    try {
      await API.post('/devices/unlink', { device_id: selectedDevice.device_id });
      toast.success('Device unlinked successfully');
      setSelectedDevice(null);
      fetchData();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed to unbind device');
    }
  };

  // Export GPSSpeedLog logs to CSV
  const exportLogsToCSV = () => {
    if (logs.length === 0) return toast.error('No log history available to export');
    
    let csvContent = 'data:text/csv;charset=utf-8,';
    csvContent += 'Log ID,Timestamp,Latitude,Longitude,Speed (km/h)\n';
    
    logs.forEach(l => {
      csvContent += `${l.id},${l.timestamp},${l.latitude},${l.longitude},${l.speed}\n`;
    });
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Device_${selectedDevice.device_id}_logs.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('CSV Log exported successfully!');
  };

  // Markers for MapView
  const mapMarkers = devices.map(d => ({
    lat: d.latitude || 16.5062,
    lng: d.longitude || 80.6480,
    icon: ICONS.device,
    popup: `
      <b>${d.vehicle?.vehicle_number || d.device_id}</b><br/>
      Speed: ${d.current_speed} km/h<br/>
      Battery: ${d.battery_level}%<br/>
      Role: ${d.role}
    `
  }));

  // Render Polylines for logs/path
  const polylinePositions = logs.map(l => [l.latitude, l.longitude]);
  const polylines = polylinePositions.length > 0 ? [{ positions: polylinePositions, color: 'var(--cyan-400)' }] : [];

  return (
    <Layout title="Citizen Console">
      {/* Live Alert Banner */}
      {liveAlert && (
        <div className="card card-red animate-slideup mb-20" style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <span style={{ fontSize: 32 }}>🚑</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, color: 'var(--green-400)' }}>Emergency Responder En Route!</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>A {liveAlert.type} has accepted your emergency • ETA: {liveAlert.eta} minutes</div>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={() => setLiveAlert(null)}>✕</button>
        </div>
      )}

      {/* Welcome Header */}
      <div className="flex-between mb-24">
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 800 }}>Welcome back, {user?.full_name?.split(' ')[0]} 👋</h1>
          <p className="text-muted text-sm">Citizen ID: <strong style={{ color: 'var(--text-primary)', fontFamily: 'monospace' }}>{user?.unique_id}</strong> • Blood Group: <strong style={{ color: 'var(--red-400)' }}>{user?.blood_group}</strong></p>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <button className="btn btn-secondary" onClick={() => setShowQRModal(true)}>📡 Bind Device (QR)</button>
          <button className="btn btn-primary" onClick={() => navigate('/accident')}>🚨 Report Emergency</button>
        </div>
      </div>

      {/* Fleet & Tracking Section */}
      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 24, marginBottom: 24 }}>
        {/* Left Side: Vehicle List Panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card" style={{ maxHeight: '550px', overflowY: 'auto' }}>
            <h3 style={{ marginBottom: 16, fontSize: 16 }}>My Vehicles ({devices.length})</h3>
            
            {devices.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-muted)' }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>📡</div>
                <div style={{ fontSize: 13, marginBottom: 12 }}>No vehicles linked yet.</div>
                <button className="btn btn-primary btn-sm" onClick={() => setShowQRModal(true)}>Add Device</button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {devices.map(d => (
                  <div
                    key={d.device_id}
                    onClick={() => selectDevice(d)}
                    style={{
                      padding: 16,
                      borderRadius: 12,
                      background: selectedDevice?.device_id === d.device_id ? 'rgba(6, 182, 212, 0.08)' : 'rgba(255, 255, 255, 0.02)',
                      border: selectedDevice?.device_id === d.device_id ? '1px solid var(--cyan-400)' : '1px solid rgba(255, 255, 255, 0.06)',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                  >
                    <div className="flex-between mb-8">
                      <span style={{ fontWeight: 700, color: '#f8fafc' }}>{d.vehicle?.vehicle_number || d.device_id}</span>
                      <span className={`badge ${d.status === 'active' ? 'badge-green' : 'badge-secondary'}`}>
                        {d.status.toUpperCase()}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      Model: {d.vehicle?.vehicle_model || 'Unknown'} • Type: {d.vehicle?.vehicle_type}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }} className="flex-between">
                      <span>🔋 Battery: {d.battery_level}%</span>
                      <span>⚡ Speed: {d.current_speed} km/h</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Telemetry and Controls for Selected Vehicle */}
          {selectedDevice && (
            <div className="card">
              <h3 style={{ fontSize: 15, marginBottom: 16 }}>Device Controls</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {selectedDevice.role === 'owner' ? (
                  <>
                    <button className="btn btn-secondary w-full" onClick={() => { setRenameValue(selectedDevice.device?.pass_name || ''); setShowRenameModal(true); }}>
                      ✏️ Rename Device
                    </button>
                    <button className="btn btn-secondary w-full" onClick={() => setShowShareModal(true)}>
                      🤝 Share Access
                    </button>
                    <button className="btn btn-secondary w-full" onClick={exportLogsToCSV}>
                      📥 Export Travel Logs
                    </button>
                    <button className="btn btn-danger w-full" onClick={handleUnbindDevice}>
                      ❌ Unbind / Unlink
                    </button>
                  </>
                ) : (
                  <>
                    <button className="btn btn-secondary w-full" onClick={exportLogsToCSV}>
                      📥 Export Travel Logs
                    </button>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', marginTop: 10 }}>
                      🔒 Restricted Shared View (Read-Only)
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right Side: Map & Stop Timeline */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Tracking Map */}
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <MapView
              height="350px"
              center={mapCenter}
              zoom={mapZoom}
              markers={mapMarkers}
              polylines={polylines}
              recenterLabel="Focus Vehicle"
            />
          </div>

          {/* Stop timelines */}
          {selectedDevice && (
            <div className="card">
              <h3 style={{ marginBottom: 16, fontSize: 16 }}>⏱️ Stop Timeline & Rest Intelligence</h3>
              
              {stops.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: 12 }}>
                  No rest/stop positions detected for this device yet.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {stops.map((s, index) => (
                    <div key={s.id} style={{ display: 'flex', gap: 16, position: 'relative' }}>
                      {index < stops.length - 1 && (
                        <div style={{ position: 'absolute', left: 15, top: 32, bottom: -16, width: 2, background: 'rgba(255,255,255,0.08)' }} />
                      )}
                      
                      {/* Stop Circle Icon */}
                      <div style={{
                        width: 32,
                        height: 32,
                        borderRadius: '50%',
                        background: 'rgba(6, 182, 212, 0.15)',
                        border: '2px solid var(--cyan-400)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 12,
                        color: 'var(--cyan-400)',
                        fontWeight: 700,
                        flexShrink: 0
                      }}>
                        P{s.stop_number}
                      </div>
                      
                      <div style={{ flex: 1, paddingBottom: 16 }}>
                        <div className="flex-between">
                          <span style={{ fontWeight: 700, color: '#f8fafc', fontSize: 14 }}>Rest Position {s.stop_number}</span>
                          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                            {new Date(s.start_time).toLocaleTimeString()}
                          </span>
                        </div>
                        <p style={{ margin: '4px 0 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>
                          📍 Lat: {s.latitude}, Lng: {s.longitude}
                        </p>
                        {s.stop_duration_seconds && (
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                            ⏱️ Stopped for: {Math.round(s.stop_duration_seconds / 60)} mins
                          </div>
                        )}
                        
                        {/* Trip from previous stop to this one */}
                        {s.travel_distance_km > 0 && (
                          <div style={{
                            marginTop: 10,
                            padding: 10,
                            background: 'rgba(255,255,255,0.02)',
                            border: '1px solid rgba(255,255,255,0.04)',
                            borderRadius: 8,
                            fontSize: 12,
                            color: 'var(--text-secondary)'
                          }}>
                            <b>🚗 Journey to this position:</b><br/>
                            Distance: {s.travel_distance_km} km • Duration: {Math.round(s.travel_duration_seconds / 60)} mins • Avg Speed: {s.avg_speed_kmh} km/h
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Accident History */}
      <div className="card" style={{ marginTop: 24 }}>
        <div className="flex-between mb-16">
          <h3>📋 Incident History</h3>
          <span className="badge badge-muted">{accidents.length} total</span>
        </div>
        {accidents.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>✅</div>
            <div>No accidents recorded. Stay safe!</div>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Code</th><th>Date</th><th>Location</th><th>Severity</th><th>Status</th></tr></thead>
              <tbody>
                {accidents.slice(0, 8).map(a => (
                  <tr key={a.id}>
                    <td><code style={{ fontSize: 12, color: 'var(--cyan-400)' }}>{a.accident_code}</code></td>
                    <td className="text-sm text-muted">{new Date(a.createdAt).toLocaleDateString('en-IN')}</td>
                    <td className="text-sm">{a.location_address || `${parseFloat(a.latitude).toFixed(4)}, ${parseFloat(a.longitude).toFixed(4)}`}</td>
                    <td><span className={`badge badge-${a.severity === 'critical' ? 'red' : a.severity === 'high' ? 'amber' : 'blue'}`}>{a.severity}</span></td>
                    <td><span className={`badge badge-${a.status === 'resolved' ? 'green' : a.status === 'active' ? 'red' : 'amber'}`}>{a.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Notifications */}
      {notifications.length > 0 && (
        <div className="card" style={{ marginTop: 24 }}>
          <h3 style={{ marginBottom: 16 }}>🔔 Recent Notifications</h3>
          {notifications.slice(0, 5).map(n => (
            <div key={n.id} className={`alert-item ${n.type === 'accident' ? 'critical' : 'active'}`}>
              <span style={{ fontSize: 20 }}>{n.type === 'accident' ? '🚨' : 'ℹ️'}</span>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{n.title}</div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{n.message}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{new Date(n.createdAt).toLocaleString('en-IN')}</div>
              </div>
              {!n.is_read && <span className="status-dot alert" style={{ marginLeft: 'auto', flexShrink: 0 }} />}
            </div>
          ))}
        </div>
      )}

      {/* QR Onboarding Modal */}
      {showQRModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.8)', display: 'flex',
          justifyContent: 'center', alignItems: 'center', zIndex: 1000,
          backdropFilter: 'blur(5px)'
        }}>
          <div className="card" style={{ maxWidth: 500, width: '90%', maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ marginBottom: 16 }}>📡 Bind New IoT Tracking Device</h3>
            <form onSubmit={handleQROnboarding}>
              <div className="form-group">
                <label className="form-label">Scan QR Code / Enter Device ID</label>
                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <input
                    className="form-input"
                    value={qrCode}
                    onChange={e => setQrCode(e.target.value)}
                    placeholder='e.g., {"deviceId": "DEV10001"} or DEV10001'
                    required
                    style={{ flex: 1 }}
                  />
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ padding: '0 16px', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}
                    onClick={() => setShowScanner(!showScanner)}
                  >
                    <span>📷</span> {showScanner ? 'Close' : 'Scan'}
                  </button>
                </div>

                {showScanner && (
                  <div 
                    id="qr-reader" 
                    style={{ 
                      width: '100%', 
                      border: '1px solid var(--border)', 
                      borderRadius: '8px',
                      overflow: 'hidden',
                      marginBottom: 16,
                      background: '#0a0a0c'
                    }} 
                  />
                )}
              </div>
              <div className="form-group">
                <label className="form-label">Vehicle Number</label>
                <input
                  className="form-input"
                  value={vehicleNumber}
                  onChange={e => setVehicleNumber(e.target.value)}
                  placeholder="e.g. AP-16-AX-1234"
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Vehicle Type</label>
                <select className="form-input" value={vehicleType} onChange={e => setVehicleType(e.target.value)}>
                  <option value="Car">Car</option>
                  <option value="Bike">Motorcycle</option>
                  <option value="Truck">Truck</option>
                  <option value="Ambulance">Ambulance</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Vehicle Model (Optional)</label>
                <input
                  className="form-input"
                  value={vehicleModel}
                  onChange={e => setVehicleModel(e.target.value)}
                  placeholder="e.g. Model S, Innova"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Manufacturer (Optional)</label>
                <input
                  className="form-input"
                  value={manufacturer}
                  onChange={e => setManufacturer(e.target.value)}
                  placeholder="e.g. Toyota, Tesla"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Model Year (Optional)</label>
                <input
                  className="form-input"
                  type="number"
                  value={year}
                  onChange={e => setYear(e.target.value)}
                  placeholder="e.g. 2024"
                />
              </div>
              
              <div className="flex justify-end gap-12" style={{ marginTop: 24 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowQRModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {loading ? 'Binding...' : 'Bind Device'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Share Device Modal */}
      {showShareModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.8)', display: 'flex',
          justifyContent: 'center', alignItems: 'center', zIndex: 1000,
          backdropFilter: 'blur(5px)'
        }}>
          <div className="card" style={{ maxWidth: 400, width: '90%' }}>
            <h3 style={{ marginBottom: 16 }}>🤝 Share Device Access</h3>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 }}>
              The shared user will be granted a restricted read-only view of maps, route logs, and timeline analytics.
            </p>
            <form onSubmit={handleShareDevice}>
              <div className="form-group">
                <label className="form-label">User ID or Mobile Number</label>
                <input
                  className="form-input"
                  value={shareUserId}
                  onChange={e => setShareUserId(e.target.value)}
                  placeholder="Enter recipient's ID"
                  required
                />
              </div>
              <div className="flex justify-end gap-12" style={{ marginTop: 24 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowShareModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Confirm Share</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Rename Device Modal */}
      {showRenameModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.8)', display: 'flex',
          justifyContent: 'center', alignItems: 'center', zIndex: 1000,
          backdropFilter: 'blur(5px)'
        }}>
          <div className="card" style={{ maxWidth: 400, width: '90%' }}>
            <h3 style={{ marginBottom: 16 }}>✏️ Rename Tracking Device</h3>
            <form onSubmit={handleRenameDevice}>
              <div className="form-group">
                <label className="form-label">New Custom Display Name</label>
                <input
                  className="form-input"
                  value={renameValue}
                  onChange={e => setRenameValue(e.target.value)}
                  placeholder="e.g. My Primary Car"
                  required
                />
              </div>
              <div className="flex justify-end gap-12" style={{ marginTop: 24 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowRenameModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save Rename</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Layout>
  );
}
