import React, { useEffect, useState, useCallback, useRef } from 'react';
import Layout from '../../components/Layout';
import MapView, { ICONS } from '../../components/MapView';
import API from '../../api/axios';
import toast from 'react-hot-toast';
import { getSocket } from '../../api/socket';
import { useSocketEvent } from '../../hooks/useSocket';
import {
  SirenIcon,
  ShieldIcon,
  CpuIcon,
  FileTextIcon,
  ClockIcon,
  CarIcon,
  CheckIcon,
  AlertIcon,
  UserIcon,
  MapIcon
} from '../../components/Icons';

export default function AdminMap() {
  const [incidents, setIncidents] = useState([]);
  const [selectedIncident, setSelectedIncident] = useState(null);
  const [selectedIncidentDetails, setSelectedIncidentDetails] = useState(null);
  const [responders, setResponders] = useState({ hospitals: [], ambulances: [], policeStations: [], police: [], mechanics: [], insurance: [], volunteers: [], fire_departments: [] });
  const [filterStatus, setFilterStatus] = useState('active'); // active, resolved, all
  const [loading, setLoading] = useState(true);

  // Tab State
  const [rightTab, setRightTab] = useState('control'); // control, smartAssign, chat, resources, analytics

  // Performance metrics & resources list
  const [analytics, setAnalytics] = useState(null);
  const [resources, setResources] = useState([]);
  const [recResponders, setRecResponders] = useState([]);
  const [newResource, setNewResource] = useState({ name: '', type: 'ambulance', vehicle_number: '', latitude: '', longitude: '' });

  // Chat Room State
  const [chatMessages, setChatMessages] = useState([]);
  const [chatText, setChatText] = useState('');
  const chatEndRef = useRef(null);

  // Fetch incidents list
  const fetchIncidents = useCallback(async () => {
    try {
      const statusParam = filterStatus === 'all' ? '' : filterStatus === 'active' ? 'status=dispatched,responded,active,start_response,en_route,near_incident,arrived,victim_located,assistance_in_progress,victim_transported' : 'status=resolved,closed,cancelled,false_alarm';
      const res = await API.get(`/accidents?${statusParam}&limit=40`);
      if (res.data.success) {
        setIncidents(res.data.accidents || []);
      }
    } catch (e) {
      toast.error('Failed to load emergency incidents');
    } finally {
      setLoading(false);
    }
  }, [filterStatus]);

  // Fetch selected incident detail metrics
  const fetchIncidentDetails = useCallback(async (id) => {
    try {
      const res = await API.get(`/accidents/${id}/details`);
      if (res.data.success) {
        setSelectedIncidentDetails(res.data);
      }
    } catch (e) {
      console.error('Failed to fetch detailed incident metrics', e);
    }
  }, []);

  // Fetch general analytics
  const fetchAnalytics = useCallback(async () => {
    try {
      const res = await API.get('/admin/analytics');
      if (res.data.success) {
        setAnalytics(res.data.analytics);
      }
    } catch (e) {
      console.error('Failed to fetch general analytics', e);
    }
  }, []);

  // Fetch telemetry resources
  const fetchResources = useCallback(async () => {
    try {
      const res = await API.get('/admin/resources');
      if (res.data.success) {
        setResources(res.data.resources || []);
      }
    } catch (e) {
      console.error('Failed to fetch telemetry resources', e);
    }
  }, []);

  // Fetch smart dispatch recommendations
  const fetchRecommendations = useCallback(async (accId) => {
    try {
      const res = await API.get(`/accidents/${accId}/recommend-responders`);
      if (res.data.success) {
        setRecResponders(res.data.recommendations || []);
      }
    } catch (e) {
      console.error('Failed to fetch smart recommendations', e);
    }
  }, []);

  // Initial loads
  useEffect(() => {
    fetchIncidents();
    fetchAnalytics();
    fetchResources();
    
    // Load general active responder locations
    API.get('/locations/active-responders')
      .then(r => {
        const list = r.data.responders || [];
        const grouped = {
          hospitals: [],
          ambulances: [],
          policeStations: [],
          police: [],
          mechanics: [],
          insurance: [],
          volunteers: [],
          fire_departments: [],
        };
        list.forEach(item => {
          if (item.role === 'hospital') grouped.hospitals.push(item);
          else if (item.role === 'ambulance') grouped.ambulances.push(item);
          else if (item.role === 'police_station') grouped.policeStations.push(item);
          else if (item.role === 'policeman') grouped.police.push(item);
          else if (item.role === 'mechanic') grouped.mechanics.push(item);
          else if (item.role === 'insurance') grouped.insurance.push(item);
          else if (item.role === 'volunteer') grouped.volunteers.push(item);
          else if (item.role === 'fire_department') grouped.fire_departments.push(item);
        });
        setResponders(grouped);
      })
      .catch(err => console.error('Failed to load responders', err));
  }, [fetchIncidents, fetchAnalytics, fetchResources]);

  // Refetch details & recommendations if selection changes
  useEffect(() => {
    if (selectedIncident) {
      fetchIncidentDetails(selectedIncident.id);
      fetchRecommendations(selectedIncident.id);
      setRightTab('control'); // reset tab on new selection
      
      // Auto refresh incident details every 8s
      const detailInterval = setInterval(() => {
        fetchIncidentDetails(selectedIncident.id);
      }, 8000);
      return () => clearInterval(detailInterval);
    } else {
      setSelectedIncidentDetails(null);
      setRecResponders([]);
      setRightTab('resources'); // default tab when no incident selected
    }
  }, [selectedIncident, fetchIncidentDetails, fetchRecommendations]);

  // WebSocket Event: New Incident
  const handleNewAccident = useCallback((data) => {
    toast.error(`CRITICAL EMERGENCY SIGNAL RECEIVED: ${data.code}`, { duration: 8000 });
    fetchIncidents();
    fetchAnalytics();
  }, [fetchIncidents, fetchAnalytics]);

  // WebSocket Event: General Location Updates
  const handleLocationUpdate = useCallback(({ entityId, entityType, latitude, longitude }) => {
    setResponders(prev => {
      const updated = { ...prev };
      if (entityType === 'ambulance') {
        updated.ambulances = (prev.ambulances || []).map(a => a.id === entityId ? { ...a, latitude, longitude } : a);
      } else if (entityType === 'policeman') {
        updated.police = (prev.police || []).map(p => p.id === entityId ? { ...p, latitude, longitude } : p);
      } else if (entityType === 'mechanic') {
        updated.mechanics = (prev.mechanics || []).map(m => m.id === entityId ? { ...m, latitude, longitude } : m);
      } else if (entityType === 'hospital') {
        updated.hospitals = (prev.hospitals || []).map(h => h.id === entityId ? { ...h, latitude, longitude } : h);
      } else if (entityType === 'police_station') {
        updated.policeStations = (prev.policeStations || []).map(ps => ps.id === entityId ? { ...ps, latitude, longitude } : ps);
      } else if (entityType === 'insurance') {
        updated.insurance = (prev.insurance || []).map(i => i.id === entityId ? { ...i, latitude, longitude } : i);
      } else if (entityType === 'volunteer') {
        updated.volunteers = (prev.volunteers || []).map(v => v.id === entityId ? { ...v, latitude, longitude } : v);
      } else if (entityType === 'fire_department') {
        updated.fire_departments = (prev.fire_departments || []).map(fd => fd.id === entityId ? { ...fd, latitude, longitude } : fd);
      }
      return updated;
    });
  }, []);

  // WebSocket Event: Specific Incident Tracking Update
  const handleResponderRouteProgress = useCallback((data) => {
    if (selectedIncident && data.accidentId === selectedIncident.id) {
      setSelectedIncidentDetails(prev => {
        if (!prev) return null;
        return {
          ...prev,
          responders: prev.responders.map(r => 
            r.id === data.responderId 
              ? { 
                  ...r, 
                  distance_km: data.distanceToDestKm, 
                  eta_minutes: data.etaMinutes, 
                  latest_location: { latitude: data.latitude, longitude: data.longitude } 
                } 
              : r
          )
        };
      });
    }
  }, [selectedIncident]);

  // WebSocket Event: Workflow Status Transition
  const handleIncidentStatusChange = useCallback((data) => {
    // Update status in local list
    setIncidents(prev => prev.map(inc => inc.id === data.accidentId ? { ...inc, status: data.status } : inc));
    
    if (selectedIncident && data.accidentId === selectedIncident.id) {
      toast(`Workflow Update: Incident ${data.code || ''} transitioned to ${data.status.replace('_', ' ').toUpperCase()}`);
      fetchIncidentDetails(selectedIncident.id);
      fetchAnalytics();
    }
  }, [selectedIncident, fetchIncidentDetails, fetchAnalytics]);

  useSocketEvent('accident:new', handleNewAccident);
  useSocketEvent('entity:location', handleLocationUpdate);
  useSocketEvent('accident:status_change', handleIncidentStatusChange);
  
  // Custom tracking rooms binding for live path updates
  useEffect(() => {
    const socket = getSocket();
    if (socket && selectedIncident) {
      socket.on(`accident:${selectedIncident.id}:tracking`, handleResponderRouteProgress);
      return () => {
        socket.off(`accident:${selectedIncident.id}:tracking`, handleResponderRouteProgress);
      };
    }
  }, [selectedIncident, handleResponderRouteProgress]);

  // Chat Room fetch & socket bindings
  useEffect(() => {
    if (selectedIncident?.id) {
      API.get(`/accidents/${selectedIncident.id}/chat`)
        .then(res => {
          if (res.data.success) {
            setChatMessages(res.data.messages || []);
          }
        });

      const socket = getSocket();
      if (socket) {
        socket.emit('accident:watch', { accidentId: selectedIncident.id });

        const onChatMsg = (msg) => {
          setChatMessages(prev => {
            if (prev.some(m => m.id === msg.id)) return prev;
            return [...prev, msg];
          });
        };

        socket.on(`accident:${selectedIncident.id}:chat`, onChatMsg);
        return () => {
          socket.off(`accident:${selectedIncident.id}:chat`, onChatMsg);
        };
      }
    } else {
      setChatMessages([]);
    }
  }, [selectedIncident?.id]);

  // Chat scroll to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, rightTab]);

  // Send admin chat message
  const handleSendChat = async (e) => {
    e.preventDefault();
    if (!chatText.trim() || !selectedIncident) return;
    const txt = chatText;
    setChatText('');
    try {
      await API.post(`/accidents/${selectedIncident.id}/chat`, {
        content: txt,
        messageType: 'text'
      });
    } catch (err) {
      toast.error('Failed to send message');
    }
  };

  // Actions: Manual Status Override
  const handleStatusOverride = async (newStatus) => {
    if (!selectedIncident) return;
    try {
      await API.post(`/accidents/${selectedIncident.id}/status`, {
        status: newStatus,
        notes: `Control Room Override: Operator forced state to ${newStatus}.`
      });
      toast.success(`Forced incident status override: ${newStatus}`);
      fetchIncidents();
    } catch (e) {
      toast.error('Failed to update status');
    }
  };

  // Actions: Request/Trigger Manual Escalation
  const handleTriggerEscalation = async () => {
    if (!selectedIncident) return;
    try {
      toast.success('Broadcasting escalation signal to nearby service nodes...');
      await API.post(`/accidents/${selectedIncident.id}/status`, {
        status: 'alert_broadcasted',
        notes: 'Escalation dispatch triggered: notifying all agencies within 50km.'
      });
    } catch (e) {
      toast.error('Failed to trigger manual escalation');
    }
  };

  // Actions: Dispatches unit manually
  const handleAssignResponder = async (responderId, responderType) => {
    if (!selectedIncident) return;
    try {
      const res = await API.post(`/accidents/${selectedIncident.id}/assign`, {
        responderId,
        responderType
      });
      if (res.data.success) {
        toast.success('Unit manually dispatched from Control Room!');
        fetchIncidentDetails(selectedIncident.id);
        fetchRecommendations(selectedIncident.id);
      }
    } catch (err) {
      toast.error('Failed to assign responder');
    }
  };

  // Actions: Register Resource Telemetry
  const handleRegisterResource = async (e) => {
    e.preventDefault();
    try {
      const res = await API.post('/api/admin/resources', {
        name: newResource.name,
        type: newResource.type,
        vehicle_number: newResource.vehicle_number,
        latitude: parseFloat(newResource.latitude),
        longitude: parseFloat(newResource.longitude)
      });
      if (res.data.success) {
        toast.success('Emergency resource registered!');
        setNewResource({ name: '', type: 'ambulance', vehicle_number: '', latitude: '', longitude: '' });
        fetchResources();
      }
    } catch (err) {
      toast.error('Failed to register resource telemetry');
    }
  };

  // Compile Map Markers
  const markers = [];
  
  // Selected incident marker
  if (selectedIncident) {
    markers.push({
      lat: parseFloat(selectedIncident.latitude),
      lng: parseFloat(selectedIncident.longitude),
      icon: ICONS.accident,
      popup: `<b>Incident ${selectedIncident.accident_code} (SELECTED)</b>`
    });
  } else {
    // Show all active incidents if none selected
    incidents.forEach(a => {
      const lat = parseFloat(a.latitude);
      const lng = parseFloat(a.longitude);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        markers.push({
          lat,
          lng,
          icon: ICONS.accident,
          popup: `<b>Incident ${a.accident_code}</b><br/>Severity: ${a.severity}<br/>Status: ${a.status.replace('_', ' ')}`
        });
      }
    });
  }

  // Responders markers
  if (selectedIncidentDetails?.responders) {
    selectedIncidentDetails.responders.forEach(r => {
      if (r.latest_location) {
        markers.push({
          lat: parseFloat(r.latest_location.latitude),
          lng: parseFloat(r.latest_location.longitude),
          icon: ICONS[r.type] || ICONS.volunteer,
          popup: `<b>Responder: ${r.name} (${r.type.toUpperCase()})</b>`
        });
      }
    });
  }

  // Telemetry resources markers
  resources.forEach(r => {
    if (r.latitude !== null && r.longitude !== null && r.status === 'available') {
      markers.push({
        lat: parseFloat(r.latitude),
        lng: parseFloat(r.longitude),
        icon: ICONS[r.type] || ICONS.ambulance,
        popup: `<b>Resource: ${r.name}</b><br/>Type: ${r.type.toUpperCase()}<br/>Number: ${r.vehicle_number}`
      });
    }
  });

  // General active responders markers
  if (responders) {
    const addMarkers = (list, icon, title) => {
      (list || []).forEach(item => {
        const lat = parseFloat(item.latitude);
        const lng = parseFloat(item.longitude);
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          markers.push({
            lat,
            lng,
            icon,
            popup: `<b>${item.name || title}</b><br/>Type: ${title}<br/>Mobile: ${item.mobile || 'N/A'}`
          });
        }
      });
    };

    addMarkers(responders.hospitals, ICONS.hospital, 'Hospital');
    addMarkers(responders.ambulances, ICONS.ambulance, 'Ambulance');
    addMarkers(responders.policeStations, ICONS.police_station, 'Police Station');
    addMarkers(responders.police, ICONS.police, 'Police Officer');
    addMarkers(responders.mechanics, ICONS.mechanic, 'Mechanic');
    addMarkers(responders.insurance, ICONS.insurance, 'Insurance Company');
    addMarkers(responders.volunteers, ICONS.volunteer, 'Volunteer');
    addMarkers(responders.fire_departments, ICONS.fire_department, 'Fire Department');
  }

  // Center coordinates
  const center = selectedIncident
    ? [parseFloat(selectedIncident.latitude), parseFloat(selectedIncident.longitude)]
    : [16.5062, 80.6480];

  // Draw en-route responders' routes
  const polylines = [];
  if (selectedIncidentDetails?.responders) {
    selectedIncidentDetails.responders.forEach(r => {
      if (r.route_points && Array.isArray(r.route_points)) {
        polylines.push({
          positions: r.route_points.map(p => [p.lat, p.lng]),
          color: r.type === 'ambulance' ? 'var(--blue-400)' : r.type === 'policeman' ? 'var(--purple-400)' : 'var(--cyan-400)',
          weight: 4
        });
      }
    });
  }

  const activeIncidentCount = incidents.filter(i => !['resolved', 'closed', 'cancelled', 'false_alarm'].includes(i.status)).length;
  const currentStatusVal = selectedIncidentDetails?.accident?.status || selectedIncident?.status || 'accepted';

  return (
    <Layout title="Control Room - Emergency Dispatch Center">
      {/* Overview stats panel */}
      <div className="bento-grid" style={{ marginBottom: 24 }}>
        {[
          { l: 'Active Operations', v: activeIncidentCount, i: <SirenIcon size={18} />, c: 'red' },
          { l: 'Average Response Time', v: analytics ? `${analytics.averageResponseMins} Mins` : '-- Mins', i: <ClockIcon size={18} />, c: 'amber' },
          { l: 'SLA Compliance Rate', v: analytics ? `${analytics.slaComplianceRate}%` : '--%', i: <CheckIcon size={18} />, c: 'green' },
          { l: 'Active Resources Tracked', v: resources.length, i: <CarIcon size={18} />, c: 'blue' }
        ].map((s, idx) => (
          <div key={idx} className={`stat-card span-3 ${s.c}`}>
            <div className="stat-header">
              <span>{s.l}</span>
              <span className="stat-icon">{s.i}</span>
            </div>
            <div className="stat-value">{s.v}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr 400px', gap: 20, height: '70vh', alignItems: 'stretch' }}>
        {/* Left Column: Incidents List */}
        <div className="bento-card" style={{ display: 'flex', flexDirection: 'column', padding: 16 }}>
          <div className="flex-between mb-12" style={{ alignItems: 'center' }}>
            <h4 style={{ margin: 0, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6, fontSize: 14 }}>
              <SirenIcon size={16} className="text-red" /> Signal Feeds
            </h4>
            <select 
              className="form-input" 
              style={{ width: 'auto', padding: '4px 8px', fontSize: 11, height: 28 }} 
              value={filterStatus} 
              onChange={e => { setFilterStatus(e.target.value); setSelectedIncident(null); }}
            >
              <option value="active">Active Operations</option>
              <option value="resolved">Resolved Cases</option>
              <option value="all">All Logs</option>
            </select>
          </div>
          
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10, paddingRight: 4 }}>
            {loading ? (
              <div style={{ textAlign: 'center', marginTop: 32 }}><div className="spinner" /></div>
            ) : incidents.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)', fontSize: 13 }}>No incidents match this filter.</div>
            ) : (
              incidents.map((a) => (
                <div 
                  key={a.id} 
                  className={`bento-card hover-trigger ${selectedIncident?.id === a.id ? 'active' : ''}`}
                  onClick={() => setSelectedIncident(a)}
                  style={{
                    padding: 12,
                    cursor: 'pointer',
                    background: selectedIncident?.id === a.id ? 'var(--zinc-800)' : 'var(--zinc-900)',
                    borderLeft: selectedIncident?.id === a.id ? '4px solid var(--blue-primary)' : ['resolved', 'closed'].includes(a.status) ? '4px solid var(--green-primary)' : '4px solid var(--red-primary)',
                    transition: 'all 0.2s',
                    boxShadow: 'none',
                    borderRadius: 6
                  }}
                >
                  <div className="flex-between mb-4">
                    <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)' }}>{a.accident_code}</span>
                    <span className={`badge badge-${a.severity === 'critical' ? 'red' : a.severity === 'high' ? 'amber' : 'blue'}`} style={{ fontSize: 10 }}>{a.severity}</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>{a.location_address}</div>
                  <div className="flex-between" style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                    <span>{new Date(a.createdAt).toLocaleTimeString()}</span>
                    <span style={{ textTransform: 'uppercase', color: 'var(--cyan-primary)', fontWeight: 600 }}>{a.status.replace('_', ' ')}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Center Column: Live Map */}
        <div className="bento-card" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <MapView
            height="100%"
            center={center}
            zoom={selectedIncident ? 15 : 13}
            markers={markers}
            polylines={polylines}
            recenterLabel="Default View"
          />
        </div>

        {/* Right Column: Dynamic Workspaces and Commands Panel */}
        <div className="bento-card" style={{ display: 'flex', flexDirection: 'column', padding: 16, overflow: 'hidden' }}>
          {/* Tabs header */}
          <div style={{ display: 'flex', gap: 4, background: 'var(--zinc-800)', padding: 4, borderRadius: 6, marginBottom: 12 }}>
            {selectedIncident ? (
              <>
                <button 
                  className="btn" 
                  style={{ flex: 1, padding: '6px 4px', fontSize: 11, fontWeight: 600, background: rightTab === 'control' ? 'var(--blue-primary)' : 'transparent', color: rightTab === 'control' ? '#fff' : 'var(--text-secondary)', borderRadius: 4, height: 28 }} 
                  onClick={() => setRightTab('control')}
                >
                  Control
                </button>
                <button 
                  className="btn" 
                  style={{ flex: 1, padding: '6px 4px', fontSize: 11, fontWeight: 600, background: rightTab === 'smartAssign' ? 'var(--blue-primary)' : 'transparent', color: rightTab === 'smartAssign' ? '#fff' : 'var(--text-secondary)', borderRadius: 4, height: 28 }} 
                  onClick={() => setRightTab('smartAssign')}
                >
                  Assign
                </button>
                <button 
                  className="btn" 
                  style={{ flex: 1, padding: '6px 4px', fontSize: 11, fontWeight: 600, background: rightTab === 'chat' ? 'var(--blue-primary)' : 'transparent', color: rightTab === 'chat' ? '#fff' : 'var(--text-secondary)', borderRadius: 4, height: 28 }} 
                  onClick={() => setRightTab('chat')}
                >
                  Chat
                </button>
              </>
            ) : null}
            <button 
              className="btn" 
              style={{ flex: 1, padding: '6px 4px', fontSize: 11, fontWeight: 600, background: rightTab === 'resources' ? 'var(--blue-primary)' : 'transparent', color: rightTab === 'resources' ? '#fff' : 'var(--text-secondary)', borderRadius: 4, height: 28 }} 
              onClick={() => setRightTab('resources')}
            >
              Resources
            </button>
            <button 
              className="btn" 
              style={{ flex: 1, padding: '6px 4px', fontSize: 11, fontWeight: 600, background: rightTab === 'analytics' ? 'var(--blue-primary)' : 'transparent', color: rightTab === 'analytics' ? '#fff' : 'var(--text-secondary)', borderRadius: 4, height: 28 }} 
              onClick={() => setRightTab('analytics')}
            >
              SLA/KPIs
            </button>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', paddingRight: 4 }}>
            {/* Tab 1: Operations Control */}
            {rightTab === 'control' && selectedIncident && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <div className="flex-between align-center mb-6">
                    <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>Incident Details</h3>
                    <span className="badge badge-red">{currentStatusVal.replace('_', ' ').toUpperCase()}</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}><b>Address:</b> {selectedIncident.location_address}</div>
                  {selectedIncidentDetails?.victim && (
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                      <b>Victim:</b> {selectedIncidentDetails.victim.full_name} • {selectedIncidentDetails.victim.mobile}
                    </div>
                  )}
                </div>

                <div style={{ background: 'var(--zinc-800)', padding: 12, borderRadius: 6 }}>
                  <h5 style={{ margin: '0 0 8px 0', fontSize: 10, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <ShieldIcon size={12} /> Operator Override
                  </h5>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <select 
                      className="form-input" 
                      style={{ flex: 1, padding: '4px 6px', fontSize: 11, height: 32 }} 
                      value={currentStatusVal} 
                      onChange={e => handleStatusOverride(e.target.value)}
                    >
                      <option value="alert_created">Created</option>
                      <option value="alert_broadcasted">Broadcasted</option>
                      <option value="accepted">Accepted</option>
                      <option value="start_response">Initiated</option>
                      <option value="en_route">En Route</option>
                      <option value="near_incident">Near Scene</option>
                      <option value="arrived">Arrived</option>
                      <option value="victim_located">Victim Located</option>
                      <option value="assistance_in_progress">Assistance Active</option>
                      <option value="victim_transported">Transporting</option>
                      <option value="resolved">Resolved</option>
                      <option value="closed">Closed</option>
                    </select>
                    <button className="btn btn-secondary btn-sm" style={{ padding: '0 10px', height: 32, fontSize: 11 }} onClick={handleTriggerEscalation}>
                      Escalate
                    </button>
                  </div>
                </div>

                <div>
                  <h4 style={{ margin: '0 0 8px 0', fontSize: 12, color: 'var(--text-primary)', fontWeight: 600 }}>Assigned Responders</h4>
                  {selectedIncidentDetails?.responders?.length === 0 ? (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>No units assigned yet. Use Smart Dispatch to assign.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {selectedIncidentDetails?.responders?.map((r, idx) => (
                        <div key={idx} style={{ padding: 8, background: 'var(--zinc-800)', borderRadius: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--text-primary)' }}>{r.name}</div>
                            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{r.type.toUpperCase()} • {r.phone}</div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: 11, color: 'var(--green-primary)', fontWeight: 700 }}>ETA: {r.eta_minutes}m</div>
                            {r.distance_km !== null && <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>{r.distance_km.toFixed(2)} km</div>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {selectedIncidentDetails?.report && (
                  <div style={{ background: 'rgba(16, 185, 129, 0.05)', borderLeft: '3px solid var(--green-primary)', padding: 10, borderRadius: 6 }}>
                    <h5 style={{ margin: '0 0 6px 0', fontSize: 12, color: 'var(--green-primary)', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
                      <FileTextIcon size={12} /> Post-Arrival Field Report
                    </h5>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <div><b>Victim Status:</b> <span style={{ textTransform: 'capitalize' }}>{selectedIncidentDetails.report.victim_status}</span></div>
                      <div><b>Notes:</b> {selectedIncidentDetails.report.field_report}</div>
                      {selectedIncidentDetails.report.actions_taken && <div><b>Actions:</b> {selectedIncidentDetails.report.actions_taken}</div>}
                      {selectedIncidentDetails.report.additional_support_requested && (
                        <div style={{ color: 'var(--amber-primary)', fontWeight: 600 }}>
                          ⚠️ Support Requested: {selectedIncidentDetails.report.additional_support_requested}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div>
                  <h4 style={{ margin: '0 0 8px 0', fontSize: 12, color: 'var(--text-primary)', fontWeight: 600 }}>Status Log History</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 120, overflowY: 'auto', paddingLeft: 4 }}>
                    {selectedIncidentDetails?.timeline?.map((log, idx) => (
                      <div key={idx} style={{ display: 'flex', gap: 8 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                          <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--cyan-primary)', marginTop: 4 }} />
                          {idx < selectedIncidentDetails.timeline.length - 1 && <div style={{ width: 1, flex: 1, background: 'var(--border)' }} />}
                        </div>
                        <div style={{ flex: 1, fontSize: 11 }}>
                          <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{log.status.replace('_', ' ').toUpperCase()}</span>
                          <span style={{ color: 'var(--text-muted)', fontSize: 9, marginLeft: 6 }}>{new Date(log.createdAt).toLocaleTimeString()}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Tab 2: Smart Assign */}
            {rightTab === 'smartAssign' && selectedIncident && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <h4 style={{ margin: 0, fontSize: 13, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
                  <CpuIcon size={14} /> Smart Dispatch Recommendations
                </h4>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>Suitability score is auto-weighted by proximity, role specialization, and responder workload.</p>
                {recResponders.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)', fontSize: 12 }}>No recommended responders found within 15km.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {recResponders.map((r) => {
                      const isAssignedAlready = selectedIncidentDetails?.responders?.some(assigned => assigned.id === r.id);
                      return (
                        <div key={r.id} style={{ padding: 10, background: 'var(--zinc-800)', borderRadius: 6, border: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ fontWeight: 700, fontSize: 12, color: 'var(--text-primary)' }}>{r.name}</span>
                              <span className="badge badge-blue" style={{ fontSize: 8, padding: '2px 4px' }}>{r.role.toUpperCase()}</span>
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                              Score: <span style={{ color: 'var(--cyan-primary)', fontWeight: 700 }}>{r.score}</span> • Dist: {r.distance_km}km • ETA: ~{r.eta_minutes}m
                            </div>
                          </div>
                          
                          <button
                            className={`btn btn-sm ${isAssignedAlready ? 'btn-secondary' : 'btn-success'}`}
                            style={{ padding: '6px 12px', fontSize: 10, fontWeight: 700 }}
                            onClick={() => handleAssignResponder(r.id, r.role)}
                            disabled={isAssignedAlready}
                          >
                            {isAssignedAlready ? 'Dispatched' : 'Dispatch'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Tab 3: Unified Incident Chat */}
            {rightTab === 'chat' && selectedIncident && (
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: '350px' }}>
                <h4 style={{ margin: '0 0 10px 0', fontSize: 13, color: 'var(--text-primary)', fontWeight: 600 }}>Coordination Room ({selectedIncident.accident_code})</h4>
                
                {/* Scrollable messages container */}
                <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10, padding: 8, background: 'var(--zinc-950)', borderRadius: 6, maxHeight: '250px' }}>
                  {chatMessages.length === 0 ? (
                    <div style={{ margin: 'auto', textAlign: 'center', color: 'var(--text-muted)', fontSize: 11 }}>No coordinates reported. Type below to direct en-route personnel.</div>
                  ) : (
                    chatMessages.map(msg => (
                      <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', gap: 2, background: 'var(--zinc-900)', padding: 6, borderRadius: 4 }}>
                        <div className="flex-between" style={{ fontSize: 9, color: 'var(--cyan-primary)', fontWeight: 700 }}>
                          <span>{msg.sender_name} ({msg.sender_type.toUpperCase()})</span>
                          <span style={{ color: 'var(--text-muted)' }}>{new Date(msg.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                        </div>
                        {msg.messageType === 'text' && <div style={{ fontSize: 12, color: 'var(--text-primary)' }}>{msg.content}</div>}
                        {msg.messageType === 'photo' && <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Photo Evidence shared.</div>}
                        {msg.messageType === 'voice' && <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Voice Note shared.</div>}
                      </div>
                    ))
                  )}
                  <div ref={chatEndRef} />
                </div>

                {/* Input form */}
                <form onSubmit={handleSendChat} style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                  <input
                    className="form-input"
                    type="text"
                    placeholder="Broadcast coordinates..."
                    style={{ flex: 1, height: 32, fontSize: 11, padding: '4px 8px' }}
                    value={chatText}
                    onChange={e => setChatText(e.target.value)}
                    required
                  />
                  <button type="submit" className="btn btn-primary btn-sm" style={{ height: 32, padding: '0 12px', fontSize: 11 }}>Send</button>
                </form>
              </div>
            )}

            {/* Tab 4: Telemetry Resources */}
            {rightTab === 'resources' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <h4 style={{ margin: 0, fontSize: 13, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
                  <CarIcon size={14} /> Telemetry Resource Registry
                </h4>
                
                {/* List Table */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: '200px', overflowY: 'auto' }}>
                  {resources.length === 0 ? (
                    <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>No telemetry resources registered.</div>
                  ) : (
                    resources.map(r => (
                      <div key={r.id} style={{ padding: 8, background: 'var(--zinc-800)', borderRadius: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11 }}>
                        <div>
                          <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{r.name}</span>
                          <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>{r.vehicle_number}</span>
                        </div>
                        <span className={`badge badge-${r.status === 'available' ? 'green' : r.status === 'assigned' ? 'blue' : 'amber'}`} style={{ fontSize: 8, padding: '2px 4px' }}>
                          {r.status.toUpperCase()}
                        </span>
                      </div>
                    ))
                  )}
                </div>

                {/* Registration Form */}
                <form onSubmit={handleRegisterResource} style={{ display: 'flex', flexDirection: 'column', gap: 10, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                  <h5 style={{ margin: 0, fontSize: 11, color: 'var(--text-primary)', fontWeight: 600 }}>Register Telemetry Asset</h5>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <input className="form-input" style={{ padding: '4px 6px', fontSize: 11, height: 28 }} type="text" placeholder="Squad Name" value={newResource.name} onChange={e => setNewResource({...newResource, name: e.target.value})} required />
                    <select className="form-input" style={{ padding: '4px 6px', fontSize: 11, height: 28 }} value={newResource.type} onChange={e => setNewResource({...newResource, type: e.target.value})}>
                      <option value="ambulance">Ambulance</option>
                      <option value="police_car">Police Cruiser</option>
                      <option value="fire_truck">Fire Engine</option>
                      <option value="rescue_unit">Rescue Squad</option>
                    </select>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                    <input className="form-input" style={{ padding: '4px 6px', fontSize: 11, height: 28 }} type="text" placeholder="Vehicle No." value={newResource.vehicle_number} onChange={e => setNewResource({...newResource, vehicle_number: e.target.value})} required />
                    <input className="form-input" style={{ padding: '4px 6px', fontSize: 11, height: 28 }} type="number" step="0.0001" placeholder="Lat" value={newResource.latitude} onChange={e => setNewResource({...newResource, latitude: e.target.value})} required />
                    <input className="form-input" style={{ padding: '4px 6px', fontSize: 11, height: 28 }} type="number" step="0.0001" placeholder="Lng" value={newResource.longitude} onChange={e => setNewResource({...newResource, longitude: e.target.value})} required />
                  </div>
                  <button type="submit" className="btn btn-success btn-sm" style={{ alignSelf: 'flex-end', height: 28, fontSize: 10 }}>Register Unit</button>
                </form>
              </div>
            )}

            {/* Tab 5: SLA Analytics */}
            {rightTab === 'analytics' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <h4 style={{ margin: 0, fontSize: 13, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
                  <CpuIcon size={14} /> Dispatch KPI Analytics
                </h4>
                
                {analytics ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 6, borderBottom: '1px solid var(--border)' }}>
                      <span>SLA Compliance (&le;15 mins):</span>
                      <span style={{ fontWeight: 800, color: analytics.slaComplianceRate >= 80 ? 'var(--green-primary)' : 'var(--amber-primary)' }}>
                        {analytics.slaComplianceRate}%
                      </span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 6, borderBottom: '1px solid var(--border)' }}>
                      <span>Average Response:</span>
                      <span style={{ fontWeight: 800, color: 'var(--cyan-primary)' }}>{analytics.averageResponseMins} mins</span>
                    </div>

                    {/* Department table */}
                    <div>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Department Speeds</span>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
                        {analytics.departmentPerformance?.map((dp, idx) => (
                          <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                            <span>{dp.department}:</span>
                            <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{dp.avgResponseMins} mins ({dp.resolvedCount} resolved)</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Hotspots */}
                    <div>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Regional Hotspots</span>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
                        {analytics.hotspots?.length === 0 ? (
                          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>No hotspots clusters found yet.</div>
                        ) : (
                          analytics.hotspots?.map((hs, idx) => (
                            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, alignItems: 'center' }}>
                              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                <MapIcon size={12} /> Cluster [{hs.coordinates}]:
                              </span>
                              <span style={{ color: 'var(--red-primary)', fontWeight: 700 }}>{hs.count} Accidents</span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: 20 }}><div className="spinner-sm spinner" /></div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
