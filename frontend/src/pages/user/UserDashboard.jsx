import React, { useState, useEffect, useCallback, useRef } from 'react';
import Layout from '../../components/Layout';
import { useAuth } from '../../context/AuthContext';
import API from '../../api/axios';
import toast from 'react-hot-toast';
import { getSocket } from '../../api/socket';
import { useSocketEvent } from '../../hooks/useSocket';
import { useNavigate } from 'react-router-dom';
import MapView, { ICONS } from '../../components/MapView';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { 
  SirenIcon, CpuIcon, MapIcon, BriefcaseIcon, UserIcon, EditIcon, 
  ShareIcon, DownloadIcon, TrashIcon, CheckIcon, InfoIcon, CameraIcon, 
  ClockIcon, WifiIcon, XIcon, PlayIcon, PauseIcon, RotateCcwIcon 
} from '../../components/Icons';

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
  const [selectedRideModal, setSelectedRideModal] = useState(null);

  // Animated Ride Playback state
  const [isPlayingPath, setIsPlayingPath] = useState(false);
  const [playbackPathIdx, setPlaybackPathIdx] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);

  useEffect(() => {
    setIsPlayingPath(false);
    setPlaybackPathIdx(0);
  }, [selectedRideModal]);

  useEffect(() => {
    if (!isPlayingPath || !selectedRideModal) return;
    const path = selectedRideModal.travelPath || selectedRideModal.travel_path || [];
    if (path.length === 0) {
      setIsPlayingPath(false);
      return;
    }

    const timer = setInterval(() => {
      setPlaybackPathIdx(prev => {
        if (prev >= path.length - 1) {
          setIsPlayingPath(false);
          return prev;
        }
        return prev + 1;
      });
    }, 800 / playbackSpeed);

    return () => clearInterval(timer);
  }, [isPlayingPath, playbackSpeed, selectedRideModal]);
  
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
              toast.success('QR Code scanned successfully.');
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

  const selectedDeviceRef = useRef(selectedDevice);
  useEffect(() => {
    selectedDeviceRef.current = selectedDevice;
  }, [selectedDevice]);

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
      
      const currentSelected = selectedDeviceRef.current;
      if (devList.length > 0 && currentSelected) {
        // Keep current selected device details updated if a device is already selected by user
        const updated = devList.find(d => d.device_id === currentSelected.device_id);
        if (updated) setSelectedDevice(updated);
      } else if (devList.length === 0) {
        setSelectedDevice(null);
      }
      
      setNotifications(notifRes.data.notifications || []);
    } catch (e) {
      console.error(e);
    } finally { 
      setLoading(false); 
    }
  }, []);

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
    toast.success(`Emergency responded. ${data.type} is en route. ETA: ${data.eta} min`);
  }, []);

  const onMovement = useCallback((data) => {
    toast(`Vehicle Movement: ${data.message}`, { duration: 6000 });
    // Rest position identified / new ride started: clear existing route travelled!
    setLogs([]);
    fetchData();
  }, [fetchData]);

  const handleLocationUpdate = useCallback(({ entityId, latitude, longitude, speed }) => {
    const latNum = parseFloat(latitude);
    const lngNum = parseFloat(longitude);
    if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) return;

    setDevices(prev => prev.map(d => {
      if (d.device_id === entityId) {
        return {
          ...d,
          latitude: latNum,
          longitude: lngNum,
          current_speed: speed !== undefined ? parseFloat(speed) : d.current_speed,
          last_seen: new Date().toISOString()
        };
      }
      return d;
    }));

    setSelectedDevice(curr => {
      if (curr && curr.device_id === entityId) {
        setMapCenter([latNum, lngNum]);
        // Append point to active ride path
        setLogs(prev => [...prev, { latitude: latNum, longitude: lngNum, speed: parseFloat(speed || 0) }]);
        return {
          ...curr,
          latitude: latNum,
          longitude: lngNum,
          current_speed: speed !== undefined ? parseFloat(speed) : curr.current_speed,
          last_seen: new Date().toISOString()
        };
      }
      return curr;
    });
  }, []);

  // Bind Socket.IO / MQTT events using custom hook
  useSocketEvent('accident:responded', onResponded);
  useSocketEvent('device:movement', onMovement);
  useSocketEvent('entity:location', handleLocationUpdate);

  const selectDevice = (dev) => {
    setSelectedDevice(dev);
    const lat = parseFloat(dev.latitude);
    const lng = parseFloat(dev.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      setMapCenter([lat, lng]);
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
        toast.success('Device onboarded successfully.');
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

  // End active ride manually
  const handleEndRide = async () => {
    if (!selectedDevice) return;
    try {
      const res = await API.post(`/devices/${selectedDevice.device_id}/end-ride`);
      if (res.data.success) {
        toast.success('Ride ended successfully. Current route cleared.');
        setLogs([]);
        fetchData();
      }
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed to end ride');
    }
  };

  // Device Sharing
  const handleShareDevice = async (e) => {
    e.preventDefault();
    if (!shareUserId) return toast.error('Please enter a User ID to share access with');
    
    try {
      await API.post(`/devices/${selectedDevice.id}/share`, { user_id: shareUserId });
      toast.success('Access shared successfully.');
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
      toast.success('Device renamed successfully.');
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
      toast.success('Device unlinked successfully.');
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
    toast.success('CSV Log exported successfully.');
  };

  // Markers for MapView
  const mapMarkers = devices.map(d => {
    const lat = parseFloat(d.latitude);
    const lng = parseFloat(d.longitude);
    const vehicleName = d.vehicle?.vehicle_number || d.device_id;
    const vehicleType = d.vehicle?.vehicle_type || 'Vehicle';
    const vehicleModel = d.vehicle?.vehicle_model || '';
    const speed = d.current_speed || 0;
    const battery = d.battery_level ?? 100;
    const isOwner = d.role === 'owner';

    return {
      lat: Number.isFinite(lat) ? lat : 16.5062,
      lng: Number.isFinite(lng) ? lng : 80.6480,
      icon: ICONS.device,
      onClick: () => selectDevice(d),
      popup: `
        <div style="font-family: sans-serif; min-width: 170px; padding: 4px;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; border-bottom: 1px solid rgba(255,255,255,0.15); padding-bottom: 4px;">
            <strong style="font-size: 13.5px; color: #06b6d4;">🚘 ${vehicleName}</strong>
            <span style="font-size: 10px; padding: 2px 6px; border-radius: 4px; background: ${d.status === 'active' ? 'rgba(16,185,129,0.2)' : 'rgba(148,163,184,0.2)'}; color: ${d.status === 'active' ? '#10b981' : '#94a3b8'}; font-weight: 700;">
              ${(d.status || 'Active').toUpperCase()}
            </span>
          </div>
          <div style="font-size: 12px; color: #e2e8f0; margin-bottom: 3px;">
            <strong>Type:</strong> ${vehicleType} ${vehicleModel ? `(${vehicleModel})` : ''}
          </div>
          <div style="font-size: 12px; color: #e2e8f0; margin-bottom: 3px;">
            <strong>Speed:</strong> <span style="color: #38bdf8; font-weight: 700;">${speed} km/h</span>
          </div>
          <div style="font-size: 12px; color: #e2e8f0; margin-bottom: 3px;">
            <strong>Battery:</strong> <span style="color: ${battery > 20 ? '#10b981' : '#ef4444'}; font-weight: 700;">${battery}%</span>
          </div>
          <div style="font-size: 11px; color: #94a3b8; margin-bottom: 6px;">
            <strong>Role:</strong> ${isOwner ? 'Owner' : 'Shared User'}
          </div>
          <div style="font-size: 10.5px; color: #38bdf8; text-align: center; background: rgba(6,182,212,0.12); padding: 4px; border-radius: 4px; font-weight: 600;">
            👇 Click marker to view Device Controls
          </div>
        </div>
      `
    };
  });

  // Include emergency alert markers if present (only if created within last 24h & not expired)
  const cutoff24hMs = Date.now() - 24 * 60 * 60 * 1000;
  accidents.forEach(acc => {
    if (['expired', 'cancelled', 'resolved', 'closed'].includes(acc.status)) return;
    const createdAtMs = acc.createdAt || acc.created_at || acc.timestamp ? new Date(acc.createdAt || acc.created_at || acc.timestamp).getTime() : Date.now();
    if (createdAtMs < cutoff24hMs) return;

    const lat = parseFloat(acc.latitude);
    const lng = parseFloat(acc.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      mapMarkers.push({
        lat,
        lng,
        icon: ICONS.accident,
        popup: `
          <div style="font-family: sans-serif; min-width: 170px; padding: 4px;">
            <div style="font-weight: 700; font-size: 13.5px; color: #ef4444; margin-bottom: 6px; border-bottom: 1px solid rgba(239,68,68,0.3); padding-bottom: 4px;">
              🚨 Emergency Alert
            </div>
            <div style="font-size: 12px; color: #e2e8f0; margin-bottom: 3px;">
              <strong>Type:</strong> ${acc.accident_type || 'Vehicle Crash'}
            </div>
            <div style="font-size: 12px; color: #e2e8f0; margin-bottom: 3px;">
              <strong>Severity:</strong> <span style="color: #f59e0b; font-weight: 700;">${acc.severity || 'High'}</span>
            </div>
            <div style="font-size: 12px; color: #e2e8f0; margin-bottom: 3px;">
              <strong>Status:</strong> ${acc.status || 'Reported'}
            </div>
          </div>
        `
      });
    }
  });

  // Effective map center: always points to vehicle's CURRENT location if selected
  const currentVehicleLat = parseFloat(selectedDevice?.latitude);
  const currentVehicleLng = parseFloat(selectedDevice?.longitude);
  const effectiveMapCenter = (Number.isFinite(currentVehicleLat) && Number.isFinite(currentVehicleLng))
    ? [currentVehicleLat, currentVehicleLng]
    : mapCenter;

  // Render Polylines for logs/path
  const polylinePositions = logs.map(l => [l.latitude, l.longitude]);
  const polylines = polylinePositions.length > 0 ? [{ positions: polylinePositions, color: 'var(--cyan-primary)' }] : [];

  if (loading) return <Layout title="Citizen Console"><div className="loading-screen"><div className="spinner spinner-lg" /></div></Layout>;

  return (
    <Layout title="Citizen Console">
      {/* Live Alert Banner */}
      {liveAlert && (
        <div className="bento-card" style={{ borderLeft: '4px solid var(--green-primary)', background: 'var(--green-bg)', display: 'flex', flexDirection: 'row', gap: 16, alignItems: 'center', marginBottom: 20 }}>
          <div style={{ color: 'var(--green-primary)' }}>
            <SirenIcon size={24} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, color: 'var(--green-primary)' }}>Emergency Responder En Route</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>A {liveAlert.type} has accepted your emergency • ETA: {liveAlert.eta} minutes</div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => setLiveAlert(null)}>Cancel</button>
        </div>
      )}

      {/* Welcome Header */}
      <div className="flex-between mb-24">
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em' }}>Welcome back, {user?.full_name?.split(' ')[0]}</h1>
          <p className="text-muted text-sm" style={{ marginTop: 4 }}>
            Citizen ID: <strong style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{user?.unique_id}</strong> • Blood Group: <strong style={{ color: 'var(--red-primary)' }}>{user?.blood_group}</strong>
          </p>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <button className="btn btn-secondary" onClick={() => setShowQRModal(true)}>
            <WifiIcon size={16} /> Bind Device
          </button>
          <button className="btn btn-primary" onClick={() => navigate('/accident')}>
            <SirenIcon size={16} /> Report Emergency
          </button>
        </div>
      </div>

      {/* Fleet & Tracking Bento Grid */}
      <div className="bento-grid">
        
        {/* Left Side: Vehicle List & Device Controls */}
        <div className="span-4 flex" style={{ flexDirection: 'column', gap: 16 }}>
          
          <div className="bento-card" style={{ height: 'auto', maxHeight: devices.length > 3 ? '380px' : 'none', overflowY: devices.length > 3 ? 'auto' : 'visible' }}>
            <h3 style={{ marginBottom: 16, fontSize: 15, fontWeight: 600 }}>My Vehicles ({devices.length})</h3>
            
            {devices.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-muted)' }}>
                <div style={{ color: 'var(--text-muted)', marginBottom: 12 }}>
                  <CpuIcon size={32} />
                </div>
                <div style={{ fontSize: 13, marginBottom: 12 }}>No vehicles linked yet.</div>
                <button className="btn btn-primary btn-sm" onClick={() => setShowQRModal(true)}>Add Device</button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {devices.map(d => {
                  const dCode = d.device_id || d.deviceId;
                  const vehNum = d.vehicle?.vehicle_number || d.vehicle?.vehicleNumber || dCode;
                  const vehModel = d.vehicle?.vehicle_model || d.vehicle?.vehicleModel || 'Unknown';
                  const vehType = d.vehicle?.vehicle_type || d.vehicle?.vehicleType || 'Car';
                  const battery = d.battery_level ?? d.batteryLevel ?? 100;
                  const speed = d.current_speed ?? d.currentSpeed ?? 0;
                  const isSelected = (selectedDevice?.device_id || selectedDevice?.deviceId) === dCode;

                  return (
                    <div
                      key={dCode || d.id}
                      onClick={() => selectDevice(d)}
                      style={{
                        padding: 14,
                        borderRadius: 'var(--radius-md)',
                        background: isSelected ? 'var(--cyan-bg)' : 'var(--bg-secondary)',
                        border: isSelected ? '1px solid var(--cyan-primary)' : '1px solid var(--border)',
                        cursor: 'pointer',
                        transition: 'var(--transition)'
                      }}
                    >
                      <div className="flex-between mb-8">
                        <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{vehNum}</span>
                        <span className={`badge ${d.status === 'active' ? 'badge-green' : 'badge-muted'}`}>
                          {d.status || 'active'}
                        </span>
                      </div>
                      <div style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>
                        Model: {vehModel} • Type: {vehType}
                      </div>
                      <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 8 }} className="flex-between">
                        <span>Battery: {battery}%</span>
                        <span>Speed: {speed} km/h</span>
                      </div>
                    </div>
                  );
                })}

              </div>
            )}
          </div>

          {/* Telemetry and Controls for Selected Vehicle (Appears ONLY when clicked) */}
          {selectedDevice && (
            <div className="bento-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3 style={{ fontSize: 14, margin: 0, fontWeight: 600 }}>Device Controls</h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11, color: 'var(--cyan-primary)', fontWeight: 600 }}>
                    {selectedDevice.vehicle?.vehicle_number || selectedDevice.device_id}
                  </span>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm icon-btn"
                    onClick={() => setSelectedDevice(null)}
                    style={{ padding: 4, color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                    title="Close Device Controls"
                  >
                    <XIcon size={15} />
                  </button>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {selectedDevice.role === 'owner' ? (
                  <>
                    <button className="btn btn-warning w-full" onClick={handleEndRide} style={{ background: 'rgba(245, 158, 11, 0.15)', color: 'var(--amber-primary)', border: '1px solid var(--amber-primary)', fontWeight: 600 }}>
                      <CheckIcon size={14} /> End Current Ride
                    </button>
                    <button className="btn btn-secondary w-full" onClick={() => { setRenameValue(selectedDevice.device?.pass_name || ''); setShowRenameModal(true); }}>
                      <EditIcon size={14} /> Rename Device
                    </button>
                    <button className="btn btn-secondary w-full" onClick={() => setShowShareModal(true)}>
                      <ShareIcon size={14} /> Share Access
                    </button>
                    <button className="btn btn-secondary w-full" onClick={exportLogsToCSV}>
                      <DownloadIcon size={14} /> Export Travel Logs
                    </button>
                    <button className="btn btn-danger w-full" onClick={handleUnbindDevice}>
                      <TrashIcon size={14} /> Unbind / Unlink
                    </button>
                  </>
                ) : (
                  <>
                    <button className="btn btn-secondary w-full" onClick={exportLogsToCSV}>
                      <DownloadIcon size={14} /> Export Travel Logs
                    </button>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', marginTop: 6 }}>
                      Restricted Shared View (Read-Only)
                    </div>
                  </>
                )}
                <button className="btn btn-ghost w-full" onClick={() => setSelectedDevice(null)} style={{ marginTop: 4, color: 'var(--text-muted)', fontSize: 12 }}>
                  <XIcon size={14} /> Close Controls
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right Side: Map & Stop Timeline */}
        <div className="span-8 flex" style={{ flexDirection: 'column', gap: 16 }}>
          {/* Tracking Map */}
          <div className="bento-card" style={{ padding: 0, overflow: 'hidden' }}>
            <MapView
              height="350px"
              center={effectiveMapCenter}
              zoom={mapZoom}
              markers={mapMarkers}
              polylines={polylines}
              recenterLabel="Focus Vehicle"
            />
          </div>

          {/* Stop timelines */}
          {selectedDevice && (
            <div className="bento-card">
              <div className="flex-between mb-16" style={{ alignItems: 'center' }}>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Stop Timeline & Rest Intelligence</h3>
                <button
                  className="btn btn-warning btn-sm"
                  onClick={handleEndRide}
                  style={{ background: 'rgba(245, 158, 11, 0.15)', color: 'var(--amber-primary)', border: '1px solid var(--amber-primary)', fontWeight: 600, padding: '6px 14px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  <CheckIcon size={14} /> End Current Ride
                </button>
              </div>
              
              {stops.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: '12px 0' }}>
                  No rest/stop positions detected for this device yet.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {stops.map((s, index) => {
                    const stopNum = s.stopNumber ?? s.stop_number ?? (stops.length - index);
                    const timeVal = s.startTime || s.start_time || s.createdAt || s.created_at;
                    const parsedDate = timeVal ? new Date(timeVal) : null;
                    const formattedTime = (parsedDate && !Number.isNaN(parsedDate.getTime())) 
                      ? parsedDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) 
                      : 'Just now';

                    const durationSec = s.stopDurationSeconds ?? s.stop_duration_seconds;
                    const distKm = s.travelDistanceKm ?? s.travel_distance_km;
                    const durSec = s.travelDurationSeconds ?? s.travel_duration_seconds;
                    const avgSp = s.avgSpeedKmh ?? s.avg_speed_kmh;

                    return (
                      <div
                        key={s.id || index}
                        onClick={() => setSelectedRideModal(s)}
                        title="Click to view full ride travel path on map"
                        style={{
                          display: 'flex',
                          gap: 16,
                          position: 'relative',
                          cursor: 'pointer',
                          padding: '8px 10px',
                          borderRadius: 'var(--radius-md)',
                          transition: 'background 0.2s ease'
                        }}
                        className="stop-timeline-item"
                      >
                        {index < stops.length - 1 && (
                          <div style={{ position: 'absolute', left: 25, top: 40, bottom: -16, width: 2, background: 'var(--border)' }} />
                        )}
                        
                        {/* Stop Circle Icon */}
                        <div style={{
                          width: 32,
                          height: 32,
                          borderRadius: '50%',
                          background: 'var(--cyan-bg)',
                          border: '2px solid var(--cyan-primary)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 11,
                          color: 'var(--cyan-primary)',
                          fontWeight: 700,
                          flexShrink: 0
                        }}>
                          P{stopNum}
                        </div>
                        
                        <div style={{ flex: 1, paddingBottom: 8 }}>
                          <div className="flex-between">
                            <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: 13.5 }}>
                              Rest Position {stopNum}
                            </span>
                            <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                              {formattedTime}
                            </span>
                          </div>
                          
                          <div className="flex-between" style={{ marginTop: 6, alignItems: 'center' }}>
                            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)' }}>
                              Lat: {s.latitude}, Lng: {s.longitude}
                            </p>
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedRideModal(s);
                              }}
                              style={{
                                fontSize: 11,
                                padding: '4px 10px',
                                background: 'var(--cyan-bg)',
                                color: 'var(--cyan-primary)',
                                border: '1px solid var(--cyan-primary)',
                                fontWeight: 600,
                                cursor: 'pointer'
                              }}
                            >
                              Inspect Path 🗺️
                            </button>
                          </div>
                          {durationSec !== undefined && durationSec !== null && (
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                              Stopped for: {durationSec >= 60 ? `${Math.round(durationSec / 60)} mins` : `${durationSec} secs`}
                            </div>
                          )}
                          
                          {/* Trip from previous stop to this one */}
                          {distKm > 0 && (
                            <div style={{
                              marginTop: 10,
                              padding: 10,
                              background: 'var(--bg-secondary)',
                              border: '1px solid var(--border)',
                              borderRadius: 'var(--radius-sm)',
                              fontSize: 12,
                              color: 'var(--text-secondary)'
                            }}>
                              <strong>Journey to this position:</strong><br/>
                              Distance: {distKm} km • Duration: {Math.round((durSec || 0) / 60)} mins • Avg Speed: {avgSp} km/h
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Incident & Notification grid */}
      <div className="bento-grid">
        
        {/* Incident History */}
        <div className="bento-card span-6">
          <div className="flex-between mb-16">
            <h3 style={{ fontSize: 15, fontWeight: 600 }}>Incident History</h3>
            <span className="badge badge-muted">{accidents.length} total</span>
          </div>
          {accidents.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-muted)' }}>
              <CheckIcon size={24} style={{ color: 'var(--green-primary)', marginBottom: 8 }} />
              <div>No accidents recorded. Stay safe.</div>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Date</th>
                    <th>Location</th>
                    <th>Severity</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {accidents.slice(0, 8).map(a => (
                    <tr key={a.id}>
                      <td><code style={{ fontSize: 11, color: 'var(--cyan-primary)' }}>{a.accident_code}</code></td>
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
        <div className="bento-card span-6">
          <h3 style={{ marginBottom: 16, fontSize: 15, fontWeight: 600 }}>Recent Notifications</h3>
          {notifications.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-muted)' }}>
              <InfoIcon size={24} style={{ marginBottom: 8 }} />
              <div>No new notifications.</div>
            </div>
          ) : (
            <div style={{ maxHeight: '250px', overflowY: 'auto' }}>
              {notifications.slice(0, 5).map(n => (
                <div key={n.id} className={`alert-item ${n.type === 'accident' ? 'critical' : 'active'}`} style={{ padding: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 13.5 }}>{n.title}</div>
                    <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 2 }}>{n.message}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{new Date(n.createdAt).toLocaleString('en-IN')}</div>
                  </div>
                  {!n.is_read && <span className="status-dot alert" style={{ marginLeft: 'auto', flexShrink: 0 }} />}
                </div>
              ))}
            </div>
          )}
        </div>

      </div>

      {/* QR Onboarding Modal */}
      {showQRModal && (
        <div className="modal-overlay">
          <div className="modal">
            <h3 className="modal-title">Bind New Tracking Device</h3>
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
                    style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}
                    onClick={() => setShowScanner(!showScanner)}
                  >
                    <CameraIcon size={14} /> {showScanner ? 'Close' : 'Scan'}
                  </button>
                </div>

                {showScanner && (
                  <div 
                    id="qr-reader" 
                    style={{ 
                      width: '100%', 
                      border: '1px solid var(--border)', 
                      borderRadius: 'var(--radius-sm)',
                      overflow: 'hidden',
                      marginBottom: 16,
                      background: '#09090b'
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
                <select className="form-select" value={vehicleType} onChange={e => setVehicleType(e.target.value)}>
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
        <div className="modal-overlay">
          <div className="modal">
            <h3 className="modal-title">Share Device Access</h3>
            <p className="text-secondary text-sm" style={{ marginBottom: 20 }}>
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
        <div className="modal-overlay">
          <div className="modal">
            <h3 className="modal-title">Rename Tracking Device</h3>
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

      {/* Ride Details & Travel Path Inspection Popup Modal */}
      {selectedRideModal && (() => {
        const path = selectedRideModal.travelPath || selectedRideModal.travel_path || [];
        const validPath = path.map(p => [parseFloat(p.lat || p.latitude), parseFloat(p.lng || p.longitude)])
                              .filter(pt => Number.isFinite(pt[0]) && Number.isFinite(pt[1]));

        const hasPath = validPath.length > 0;
        const currentPt = hasPath ? (validPath[playbackPathIdx] || validPath[0]) : [selectedRideModal.latitude, selectedRideModal.longitude];
        const currentPointSpeed = (hasPath && path[playbackPathIdx]?.speed !== undefined) 
          ? path[playbackPathIdx].speed 
          : (selectedRideModal.avgSpeedKmh ?? selectedRideModal.avg_speed_kmh ?? 0);

        const activePathSlice = hasPath ? validPath.slice(0, playbackPathIdx + 1) : [];
        const isCompleted = hasPath && playbackPathIdx >= validPath.length - 1;

        const togglePlay = () => {
          if (isCompleted) {
            setPlaybackPathIdx(0);
            setIsPlayingPath(true);
          } else {
            setIsPlayingPath(!isPlayingPath);
          }
        };

        const handleReset = () => {
          setIsPlayingPath(false);
          setPlaybackPathIdx(0);
        };

        return (
          <div className="modal-backdrop" onClick={() => setSelectedRideModal(null)} style={{ zIndex: 9999 }}>
            <div className="modal-card" style={{ maxWidth: '720px', width: '92%', overflow: 'hidden' }} onClick={(e) => e.stopPropagation()}>
              
              {/* Modal Header */}
              <div className="flex-between mb-12" style={{ alignItems: 'center' }}>
                <div>
                  <h3 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                    Ride Path & Rest Intelligence (P{selectedRideModal.stopNumber ?? selectedRideModal.stop_number ?? ''})
                  </h3>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                    Vehicle: {selectedDevice?.vehicle?.vehicle_number || selectedDevice?.device_id}
                  </div>
                </div>
                <button
                  className="btn btn-ghost btn-sm icon-btn"
                  onClick={() => setSelectedRideModal(null)}
                  style={{ fontSize: 18, color: 'var(--text-muted)', cursor: 'pointer' }}
                  title="Close modal"
                >
                  <XIcon size={18} />
                </button>
              </div>

              {/* Playback Control Bar */}
              <div style={{
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                padding: '10px 14px',
                marginBottom: 14,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={togglePlay}
                    disabled={!hasPath}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', fontWeight: 600 }}
                  >
                    {isPlayingPath ? (
                      <><PauseIcon size={14} /> Pause</>
                    ) : isCompleted ? (
                      <><RotateCcwIcon size={14} /> Replay Ride</>
                    ) : (
                      <><PlayIcon size={14} /> Play Ride Movement</>
                    )}
                  </button>
                  
                  <button
                    className="btn btn-secondary btn-sm icon-btn"
                    onClick={handleReset}
                    disabled={!hasPath || (playbackPathIdx === 0 && !isPlayingPath)}
                    title="Reset to start of ride"
                  >
                    <RotateCcwIcon size={14} />
                  </button>
                </div>

                {/* Animated Speed Indicator */}
                <div style={{ fontSize: 12, color: 'var(--cyan-primary)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>Speed: <strong style={{ fontSize: 14, fontFamily: 'var(--font-mono)' }}>{currentPointSpeed} km/h</strong></span>
                  {hasPath && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>({playbackPathIdx + 1}/{validPath.length} pts)</span>}
                </div>

                {/* Speed Multiplier buttons */}
                <div style={{ display: 'flex', gap: 4 }}>
                  {[1, 2, 4].map(spd => (
                    <button
                      key={spd}
                      className={`btn btn-sm ${playbackSpeed === spd ? 'btn-primary' : 'btn-ghost'}`}
                      onClick={() => setPlaybackSpeed(spd)}
                      style={{ padding: '2px 8px', fontSize: 11, fontWeight: 700 }}
                    >
                      {spd}x
                    </button>
                  ))}
                </div>
              </div>

              {/* Path Map Preview with Animated Moving Vehicle Marker */}
              <div style={{ height: '320px', borderRadius: 'var(--radius-md)', overflow: 'hidden', marginBottom: 16, border: '1px solid var(--border)' }}>
                <MapView
                  height="320px"
                  center={currentPt}
                  zoom={14}
                  markers={[
                    {
                      lat: currentPt[0],
                      lng: currentPt[1],
                      icon: ICONS.device,
                      popup: `🚗 Vehicle position • Speed: ${currentPointSpeed} km/h`
                    },
                    {
                      lat: selectedRideModal.latitude,
                      lng: selectedRideModal.longitude,
                      icon: ICONS.user,
                      popup: `Rest Position P${selectedRideModal.stopNumber ?? selectedRideModal.stop_number ?? ''}`
                    }
                  ]}
                  polylines={[
                    // Full route outline
                    { positions: validPath, color: '#475569', weight: 4 },
                    // Active route animated slice
                    { positions: activePathSlice, color: '#06b6d4', weight: 6 }
                  ]}
                  recenterLabel="Focus Vehicle"
                />
              </div>

              {/* Travel Path Metrics */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
                <div style={{ background: 'var(--bg-secondary)', padding: 10, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>TRAVEL DISTANCE</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginTop: 2 }}>
                    {selectedRideModal.travelDistanceKm ?? selectedRideModal.travel_distance_km ?? 0} km
                  </div>
                </div>
                <div style={{ background: 'var(--bg-secondary)', padding: 10, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>TRAVEL DURATION</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginTop: 2 }}>
                    {Math.round(((selectedRideModal.travelDurationSeconds ?? selectedRideModal.travel_duration_seconds) || 0) / 60)} mins
                  </div>
                </div>
                <div style={{ background: 'var(--bg-secondary)', padding: 10, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>AVG SPEED</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginTop: 2 }}>
                    {selectedRideModal.avgSpeedKmh ?? selectedRideModal.avg_speed_kmh ?? 0} km/h
                  </div>
                </div>
                <div style={{ background: 'var(--bg-secondary)', padding: 10, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>REST DURATION</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--cyan-primary)', marginTop: 2 }}>
                    {(selectedRideModal.stopDurationSeconds ?? selectedRideModal.stop_duration_seconds)
                      ? `${Math.round((selectedRideModal.stopDurationSeconds ?? selectedRideModal.stop_duration_seconds) / 60)} mins`
                      : 'Active'}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button className="btn btn-secondary" onClick={() => setSelectedRideModal(null)}>
                  Close Preview
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </Layout>
  );
}
