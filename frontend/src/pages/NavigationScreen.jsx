import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import MapView, { ICONS } from '../components/MapView';
import API from '../api/axios';
import toast from 'react-hot-toast';
import { connectSocket, getSocket } from '../api/socket';
import { useSocketEvent } from '../hooks/useSocket';
import { useAuth } from '../context/AuthContext';
import {
  SirenIcon,
  ClockIcon,
  CheckIcon,
  AlertIcon,
  ShieldIcon,
  FileTextIcon,
  UserIcon,
  MapIcon,
  HeartIcon,
  HospitalIcon,
  CameraIcon,
  InfoIcon,
  UsersIcon,
  FlameIcon
} from '../components/Icons';

export default function NavigationScreen() {
  const { routeId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const [activeTab, setActiveTab] = useState('guidance');
  const [route, setRoute] = useState(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [currentPos, setCurrentPos] = useState(null);
  const [accident, setAccident] = useState(null);
  const [loading, setLoading] = useState(true);
  const [simulating, setSimulating] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [speed, setSpeed] = useState(0);
  const [useLiveGps, setUseLiveGps] = useState(false);
  
  // Custom Dashboard State
  const [details, setDetails] = useState(null);
  const [status, setStatus] = useState('accepted');
  const [timerActive, setTimerActive] = useState(false);
  const [secondsElapsed, setSecondsElapsed] = useState(0);
  
  // Post-Arrival Form State
  const [evidenceUrls, setEvidenceUrls] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [fieldReport, setFieldReport] = useState('');
  const [victimStatus, setVictimStatus] = useState('located');
  const [actionsTaken, setActionsTaken] = useState('');
  const [severityUpdate, setSeverityUpdate] = useState('medium');
  const [additionalSupport, setAdditionalSupport] = useState('');
  
  // Chat Room State
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [chatUploading, setChatUploading] = useState(false);
  
  const simIntervalRef = useRef(null);
  const timerIntervalRef = useRef(null);
  const chatEndRef = useRef(null);

  // Fetch all accident details (victim, responders, resources, timeline)
  const fetchAccidentDetails = useCallback(async (accId) => {
    try {
      const res = await API.get(`/accidents/${accId}/details`);
      if (res.data.success) {
        setDetails(res.data);
        setStatus(res.data.accident.status);
        setSeverityUpdate(res.data.accident.severity);
        if (res.data.report) {
          setFieldReport(res.data.report.field_report || '');
          setVictimStatus(res.data.report.victim_status || 'located');
          setActionsTaken(res.data.report.actions_taken || '');
          setAdditionalSupport(res.data.report.additional_support_requested || '');
          setEvidenceUrls(res.data.report.evidence_urls || []);
        }
      }
    } catch (e) {
      console.error('Failed to load incident details', e);
    }
  }, []);

  // Fetch route and accident details
  useEffect(() => {
    const fetchDetails = async () => {
      try {
        const res = await API.get(`/routes/${routeId}`);
        const rData = res.data.route;
        setRoute(rData);
        
        if (rData.route_points && rData.route_points.length > 0) {
          setCurrentPos(rData.route_points[0]);
        }
        
        if (rData.accident_id) {
          const accRes = await API.get(`/accidents/${rData.accident_id}`);
          setAccident(accRes.data.accident);
          setStatus(accRes.data.accident.status);
          
          // Fetch full dispatch dashboard details
          await fetchAccidentDetails(rData.accident_id);
          
          // Re-establish simulation / timer state if en-route
          if (['start_response', 'en_route', 'near_incident'].includes(accRes.data.accident.status)) {
            setSimulating(true);
            setTimerActive(true);
          }
        }
      } catch (e) {
        toast.error('Failed to load navigation route');
      } finally {
        setLoading(false);
      }
    };
    
    fetchDetails();
  }, [routeId, fetchAccidentDetails]);

  // Ensure socket is connected and registered for navigation viewer
  useEffect(() => {
    if (user?.id) {
      connectSocket(user.id, 'volunteer');
    }
  }, [user?.id]);

  // Handle route recalculation via socket
  const handleRecalculated = useCallback((data) => {
    if (data?.route_points) {
      toast.success('Optimal route recalculated successfully!');
      setRoute(prev => ({
        ...prev,
        route_points: data.route_points
      }));
      setCurrentStep(0);
      setRecalculating(false);
    }
  }, []);

  // Handle live status change updates via socket
  const handleStatusChange = useCallback((data) => {
    if (accident && data.accidentId === accident.id) {
      setStatus(data.status);
      toast(`Workflow state updated: ${data.status.replace('_', ' ').toUpperCase()}`);
      fetchAccidentDetails(accident.id);
      
      if (data.status === 'arrived') {
        setSimulating(false);
        setSpeed(0);
        toast.success('You have arrived at the incident scene!');
      }
    }
  }, [accident, fetchAccidentDetails]);

  useSocketEvent(routeId ? `route:${routeId}:recalculated` : null, handleRecalculated);
  useSocketEvent(accident ? `accident:${accident.id}:status_change` : null, handleStatusChange);

  // Response duration timer
  useEffect(() => {
    if (timerActive) {
      timerIntervalRef.current = setInterval(() => {
        setSecondsElapsed(prev => prev + 1);
      }, 1000);
    } else {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    }
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [timerActive]);

  // GPS Simulation Loop
  useEffect(() => {
    if (!route || !simulating || recalculating || useLiveGps) {
      if (simIntervalRef.current) clearInterval(simIntervalRef.current);
      return;
    }

    const pts = route.route_points || [];
    if (pts.length === 0) return;

    simIntervalRef.current = setInterval(async () => {
      const nextStep = currentStep + 1;
      if (nextStep < pts.length) {
        const nextPos = pts[nextStep];
        setCurrentStep(nextStep);
        setCurrentPos(nextPos);
        setSpeed(Math.floor(35 + Math.random() * 20)); // simulated speed

        try {
          const uRes = await API.put(`/routes/${routeId}/location`, {
            latitude: nextPos.lat,
            longitude: nextPos.lng
          });
          
          if (uRes.data.recalculated) {
            toast.warn('Off-route deviation! Recalculating...');
            setRecalculating(true);
          } else {
            setRoute(prev => ({
              ...prev,
              distance_km: uRes.data.distanceToDestKm,
              eta_minutes: uRes.data.etaMinutes
            }));
          }
        } catch (e) {
          console.error('Failed to report live GPS coordinate');
        }
      } else {
        // Arrived at destination
        setSimulating(false);
        setSpeed(0);
        setRoute(prev => ({ ...prev, distance_km: 0, eta_minutes: 0 }));
      }
    }, 4000);

    return () => {
      if (simIntervalRef.current) clearInterval(simIntervalRef.current);
    };
  }, [route, currentStep, simulating, recalculating, routeId, useLiveGps]);

  // Live GPS Tracking
  useEffect(() => {
    if (!useLiveGps || !routeId) return;

    let watchId = null;
    
    const successCallback = async (position) => {
      const { latitude, longitude, speed: gpsSpeed } = position.coords;
      
      setCurrentPos({ lat: latitude, lng: longitude });
      setSpeed(gpsSpeed ? Math.round(gpsSpeed * 3.6) : 0);
      
      try {
        const uRes = await API.put(`/routes/${routeId}/location`, {
          latitude: latitude,
          longitude: longitude
        });
        
        if (uRes.data.recalculated && uRes.data.route) {
          toast.warn('Off-route deviation! Recalculating...');
          setRoute(uRes.data.route);
          setCurrentStep(0);
        } else {
          setRoute(prev => ({
            ...prev,
            distance_km: uRes.data.distanceToDestKm,
            eta_minutes: uRes.data.etaMinutes
          }));
        }
      } catch (err) {
        console.error('Failed to update live GPS location', err);
      }
    };

    const errorCallback = (error) => {
      console.error('GPS Watch Error:', error);
      toast.error('Failed to get GPS location. Please check browser permissions.');
    };

    if (navigator.geolocation) {
      watchId = navigator.geolocation.watchPosition(successCallback, errorCallback, {
        enableHighAccuracy: true,
        maximumAge: 1000,
        timeout: 5000
      });
    } else {
      toast.error('Geolocation is not supported by this browser.');
    }

    return () => {
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, [useLiveGps, routeId]);

  // Trigger manual route deviation
  const triggerDeviation = async () => {
    if (!currentPos) return;
    toast.warn('Simulating route deviation (300m offset)...');
    
    const offsetLat = currentPos.lat + 0.003;
    const offsetLng = currentPos.lng + 0.003;
    
    setRecalculating(true);
    setCurrentPos({ lat: offsetLat, lng: offsetLng });
    
    try {
      const uRes = await API.put(`/routes/${routeId}/location`, {
        latitude: offsetLat,
        longitude: offsetLng
      });
      if (uRes.data.recalculated) {
        if (uRes.data.route?.route_points) {
          setRoute(prev => ({
            ...prev,
            route_points: uRes.data.route.route_points,
            distance_km: uRes.data.distanceToDestKm,
            eta_minutes: uRes.data.etaMinutes
          }));
          setCurrentStep(0);
          setRecalculating(false);
        }
      }
    } catch (e) {
      toast.error('Deviation report failed');
      setRecalculating(false);
    }
  };

  // Start Response Workflow Trigger
  const handleStartResponse = async () => {
    try {
      // Transition to start_response
      await API.post(`/accidents/${accident.id}/status`, {
        status: 'start_response',
        notes: `${user?.full_name || 'Responder'} started rescue run.`
      });
      
      // Auto transition to en_route
      await API.post(`/accidents/${accident.id}/status`, {
        status: 'en_route',
        notes: `Rescue unit en-route to emergency coordinates.`
      });
      
      setSimulating(true);
      setTimerActive(true);
      toast.success('Response started! Navigation active.');
    } catch (e) {
      toast.error('Failed to initialize response workflow');
    }
  };

  // Upload Evidence File (Scene Report Tab)
  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    
    try {
      const res = await API.post(`/accidents/${accident.id}/upload-evidence`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      if (res.data.success) {
        setEvidenceUrls(prev => [...prev, res.data.url]);
        toast.success('Evidence file uploaded successfully');
      }
    } catch (err) {
      toast.error('Failed to upload evidence file');
    } finally {
      setUploading(false);
    }
  };

  // Submit Post-Arrival Field Report
  const handleSubmitReport = async (e) => {
    e.preventDefault();
    try {
      await API.post(`/accidents/${accident.id}/report`, {
        field_report: fieldReport,
        victim_status: victimStatus,
        severity: severityUpdate,
        evidence_urls: evidenceUrls,
        actions_taken: actionsTaken,
        additional_support_requested: additionalSupport
      });
      toast.success('Field report submitted successfully');
      fetchAccidentDetails(accident.id);
    } catch (err) {
      toast.error('Failed to submit field report');
    }
  };

  // Close Incident Run
  const handleCloseIncident = async () => {
    try {
      await API.post(`/accidents/${accident.id}/status`, {
        status: 'closed',
        notes: `Rescue completed. Incident closed by ${user?.full_name || 'Responder'}.`
      });
      toast.success('Rescue operation successfully completed!');
      navigate('/');
    } catch (err) {
      toast.error('Failed to close incident');
    }
  };

  // Chat Room Socket Handler & fetch messages
  useEffect(() => {
    if (accident?.id) {
      API.get(`/accidents/${accident.id}/chat`)
        .then(res => {
          if (res.data.success) {
            setMessages(res.data.messages || []);
          }
        })
        .catch(err => console.error('Failed to load chat history', err));
        
      const socket = getSocket();
      if (socket) {
        socket.emit('accident:watch', { accidentId: accident.id });
        
        const chatHandler = (newMsg) => {
          setMessages(prev => {
            if (prev.some(m => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });
        };
        
        socket.on(`accident:${accident.id}:chat`, chatHandler);
        return () => {
          socket.off(`accident:${accident.id}:chat`, chatHandler);
        };
      }
    }
  }, [accident?.id]);

  // Scroll to bottom on new message
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, activeTab]);

  // Chat message send
  const handleSendChatMessage = async (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    const txt = chatInput;
    setChatInput('');
    try {
      await API.post(`/accidents/${accident.id}/chat`, {
        content: txt,
        messageType: 'text'
      });
    } catch (err) {
      toast.error('Failed to send chat message');
    }
  };

  // Chat file upload (Photos / Voice Evidence)
  const handleChatFileUpload = async (e, type) => {
    const file = e.target.files[0];
    if (!file) return;
    
    setChatUploading(true);
    toast.loading(`Uploading ${type}...`);
    const formData = new FormData();
    formData.append('file', file);
    
    try {
      const res = await API.post(`/accidents/${accident.id}/upload-evidence`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      toast.dismiss();
      if (res.data.success) {
        await API.post(`/accidents/${accident.id}/chat`, {
          content: res.data.url,
          messageType: type
        });
        toast.success(`${type.toUpperCase()} shared successfully`);
      }
    } catch (err) {
      toast.dismiss();
      toast.error(`Failed to share ${type}`);
    } finally {
      toast.dismiss();
      setChatUploading(false);
    }
  };

  // Calculate Turn-by-Turn Text
  const getTurnByTurn = () => {
    if (status === 'accepted') return 'Ready. Click "Start Response" to begin guidance.';
    if (recalculating) return 'Deviation detected! Recalculating path...';
    if (status === 'arrived' || ['victim_located', 'assistance_in_progress', 'victim_transported', 'resolved', 'closed'].includes(status)) {
      return 'Arrived at incident location. Initiate post-arrival operations.';
    }
    const pts = route?.route_points || [];
    const remainingSteps = pts.length - currentStep;
    if (remainingSteps <= 2) return 'Arriving at emergency destination in 50m.';
    if (currentStep % 4 === 0) return 'Continue straight on emergency lane.';
    if (currentStep % 4 === 1) return 'In 200m, turn right onto service bridge.';
    if (currentStep % 4 === 2) return 'In 100m, turn left toward coordinates.';
    return 'Head north-east toward emergency signal.';
  };

  const formatTimer = (secs) => {
    const mins = Math.floor(secs / 60);
    const rs = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${rs.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <Layout title="Rescue Center">
        <div className="bento-card flex-center" style={{ height: '70vh' }}>
          <div className="spinner" />
        </div>
      </Layout>
    );
  }

  // Map markers config
  const mapMarkers = [];
  if (currentPos) {
    mapMarkers.push({
      lat: currentPos.lat,
      lng: currentPos.lng,
      icon: ICONS[route?.from_entity_type] || ICONS.ambulance,
      title: 'Your Location'
    });
  }
  if (accident) {
    mapMarkers.push({
      lat: parseFloat(accident.latitude),
      lng: parseFloat(accident.longitude),
      icon: ICONS.accident,
      popup: `<b>Incident ${accident.accident_code}</b><br/>${accident.location_address}`
    });
  }

  // Other responders en-route
  if (details?.responders) {
    details.responders.forEach(r => {
      if (r.id !== user?.id && r.latest_location) {
        mapMarkers.push({
          lat: parseFloat(r.latest_location.latitude),
          lng: parseFloat(r.latest_location.longitude),
          icon: ICONS[r.type] || ICONS.volunteer,
          popup: `<b>Responder: ${r.name} (${r.type.toUpperCase()})</b>`
        });
      }
    });
  }

  const polylinePositions = (route?.route_points || []).map(p => [p.lat, p.lng]);
  const polylines = polylinePositions.length > 0 ? [{ positions: polylinePositions, color: 'var(--cyan-primary)' }] : [];

  const showPostArrivalForm = ['arrived', 'victim_located', 'assistance_in_progress', 'victim_transported', 'resolved', 'closed'].includes(status);

  return (
    <Layout title="Live Rescue Navigation">
      <div className="flex-between mb-24">
        <div>
          <h1 className="section-title">Rescue Operation Console</h1>
          <p className="section-subtitle">Real-time turn-by-turn routing and emergency updates</p>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 14px', background: 'var(--zinc-800)', borderRadius: 8, border: '1px solid var(--border)' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: useLiveGps ? 'var(--cyan-primary)' : 'var(--text-secondary)' }}>
              {useLiveGps ? '🛰️ Live GPS Active' : '🤖 Simulator Mode'}
            </span>
            <button
              onClick={() => {
                const nextVal = !useLiveGps;
                setUseLiveGps(nextVal);
                if (nextVal) {
                  setSimulating(false);
                  toast.success('Live GPS navigation activated.');
                } else {
                  if (['start_response', 'en_route', 'near_incident', 'responded'].includes(status)) {
                    setSimulating(true);
                  }
                  toast('Switched to route simulator.');
                }
              }}
              className={`btn btn-sm ${useLiveGps ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '4px 10px', fontSize: 11, fontWeight: 700 }}
            >
              Toggle
            </button>
          </div>
          {status === 'accepted' && (
            <button className="btn btn-success" onClick={handleStartResponse} style={{ padding: '12px 28px', fontSize: 16, fontWeight: 700 }}>
              Start Response
            </button>
          )}
          {simulating && (
            <button className="btn btn-secondary btn-sm" onClick={triggerDeviation}>
              Test Deviation
            </button>
          )}
          {accident && (
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${accident.latitude},${accident.longitude}&travelmode=driving`}
              target="_blank"
              rel="noreferrer"
              className="btn btn-success"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none', height: '36px', padding: '0 16px', fontSize: 13, fontWeight: 700 }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/>
                <line x1="9" y1="3" x2="9" y2="18"/>
                <line x1="15" y1="6" x2="15" y2="21"/>
              </svg>
              Google Maps
            </a>
          )}
        </div>
      </div>

      {/* Tabs navigation bar */}
      <div className="bento-card mb-24" style={{ padding: 6, display: 'flex', gap: 10, background: 'var(--zinc-900)', borderRadius: 6, boxShadow: 'none' }}>
        {[
          { id: 'guidance', label: 'Guidance', icon: <MapIcon size={14} /> },
          { id: 'details', label: 'Incident Details', icon: <InfoIcon size={14} /> },
          { id: 'chat', label: `Operational Chat (${messages.length})`, icon: <SirenIcon size={14} /> },
          { id: 'reporting', label: 'Scene Report', icon: <FileTextIcon size={14} /> }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="btn"
            style={{
              flex: 1,
              padding: '10px 16px',
              borderRadius: 4,
              background: activeTab === tab.id ? 'var(--blue-primary)' : 'transparent',
              color: activeTab === tab.id ? '#fff' : 'var(--text-secondary)',
              fontWeight: 600,
              border: 'none',
              height: 38,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8
            }}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Panels */}
      <div>
        {/* Tab 1: Guidance */}
        {activeTab === 'guidance' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 24, alignItems: 'start' }}>
            <div className="bento-card" style={{ padding: 0, overflow: 'hidden' }}>
              <MapView
                height="500px"
                center={currentPos ? [currentPos.lat, currentPos.lng] : [16.5062, 80.6480]}
                zoom={15}
                markers={mapMarkers}
                polylines={polylines}
                recenterLabel="Responder GPS"
              />
            </div>
            
            <div className="bento-card" style={{ background: 'var(--zinc-900)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--cyan-primary)', fontWeight: 700, letterSpacing: 1 }}>
                  Live Guidance
                </span>
                <span className="badge badge-blue">{status.replace('_', ' ').toUpperCase()}</span>
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', minHeight: 48, display: 'flex', alignItems: 'center' }}>
                {getTurnByTurn()}
              </div>
              {accident && (
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${accident.latitude},${accident.longitude}&travelmode=driving`}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-success"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    width: '100%',
                    textDecoration: 'none',
                    marginTop: 16,
                    padding: '12px',
                    fontWeight: 700,
                    boxShadow: '0 4px 12px rgba(16, 185, 129, 0.2)'
                  }}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/>
                    <line x1="9" y1="3" x2="9" y2="18"/>
                    <line x1="15" y1="6" x2="15" y2="21"/>
                  </svg>
                  Open in Google Maps
                </a>
              )}
              <div style={{ borderTop: '1px solid var(--border)', marginTop: 16, paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div className="flex-between">
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>REMAINING DISTANCE</span>
                  <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)' }}>
                    {route ? `${parseFloat(route.distance_km).toFixed(2)} km` : '--'}
                  </span>
                </div>
                <div className="flex-between">
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>ETA</span>
                  <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--green-primary)' }}>
                    {route ? `${route.eta_minutes} mins` : '--'}
                  </span>
                </div>
                <div className="flex-between">
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>SPEED</span>
                  <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--amber-primary)' }}>
                    {speed} km/h
                  </span>
                </div>
                <div className="flex-between">
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>RESPONSE DURATION</span>
                  <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--cyan-primary)' }}>
                    {formatTimer(secondsElapsed)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Incident Details */}
        {activeTab === 'details' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
            {/* Left Col */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              {accident && (
                <div className="bento-card" style={{ borderLeft: '4px solid var(--red-primary)' }}>
                  <h3 style={{ margin: '0 0 16px 0', fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <SirenIcon size={16} className="text-red" /> Accident Profile
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 14 }}>
                    <div className="flex-between"><b>Code:</b> <span>{accident.accident_code}</span></div>
                    <div className="flex-between"><b>Severity:</b> <span className={`badge badge-${accident.severity === 'critical' ? 'red' : 'amber'}`}>{accident.severity.toUpperCase()}</span></div>
                    <div><b>Location:</b> <div style={{ color: 'var(--text-secondary)', marginTop: 4 }}>{accident.location_address}</div></div>
                    {details?.victim && (
                      <>
                        <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '8px 0' }} />
                        <div className="flex-between"><b>Victim:</b> <span>{details.victim.full_name}</span></div>
                        <div className="flex-between"><b>Mobile:</b> <span>{details.victim.mobile}</span></div>
                        <div className="flex-between"><b>Blood Group:</b> <span>{details.victim.blood_group}</span></div>
                        <div className="flex-between"><b>Vehicle:</b> <span>{accident.vehicle_number} ({accident.vehicle_type})</span></div>
                      </>
                    )}
                  </div>
                </div>
              )}

              <div className="bento-card">
                <h3 style={{ margin: '0 0 16px 0', fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <UsersIcon size={16} className="text-blue" /> Coordinating Units
                </h3>
                {details?.responders?.length === 0 ? (
                  <div style={{ color: 'var(--text-muted)' }}>No other responders assigned.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {details?.responders?.map((r, idx) => (
                      <div key={idx} style={{ padding: 12, background: 'var(--zinc-800)', borderRadius: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)' }}>{r.name}</div>
                          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{r.type.toUpperCase()} • {r.phone}</div>
                        </div>
                        <span className="badge badge-green">ETA ~{r.eta_minutes}m</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Right Col */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              <div className="bento-card">
                <h3 style={{ margin: '0 0 16px 0', fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <ClockIcon size={16} className="text-cyan" /> Incident Timeline
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxHeight: 280, overflowY: 'auto', paddingLeft: 4 }}>
                  {details?.timeline?.map((log, idx) => (
                    <div key={idx} style={{ display: 'flex', gap: 12, position: 'relative' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--cyan-primary)', marginTop: 5 }} />
                        {idx < details.timeline.length - 1 && <div style={{ width: 2, flex: 1, background: 'var(--border)', margin: '6px 0' }} />}
                      </div>
                      <div style={{ flex: 1, fontSize: 13 }}>
                        <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                          {log.status.replace('_', ' ').toUpperCase()}
                        </div>
                        <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                          {new Date(log.createdAt).toLocaleTimeString()} • {log.responder_type?.toUpperCase() || 'SYSTEM'}
                        </div>
                        {log.notes && <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 4, fontStyle: 'italic' }}>{log.notes}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bento-card">
                <h3 style={{ margin: '0 0 16px 0', fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <HospitalIcon size={16} className="text-red" /> Nearby Emergency Resources
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: 250, overflowY: 'auto' }}>
                  {details?.resources?.hospitals?.slice(0, 3).map((h, idx) => (
                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                      <span style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <HospitalIcon size={12} /> {h.name}
                      </span>
                      <span style={{ color: 'var(--cyan-primary)', fontWeight: 600 }}>{h.distance_km}km (Beds: {h.available_beds})</span>
                    </div>
                  ))}
                  {details?.resources?.police_stations?.slice(0, 2).map((p, idx) => (
                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                      <span style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <ShieldIcon size={12} /> {p.name}
                      </span>
                      <span style={{ color: 'var(--cyan-primary)', fontWeight: 600 }}>{p.distance_km}km</span>
                    </div>
                  ))}
                  {details?.resources?.fire_departments?.slice(0, 2).map((f, idx) => (
                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                      <span style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <FlameIcon size={12} /> {f.name}
                      </span>
                      <span style={{ color: 'var(--cyan-primary)', fontWeight: 600 }}>{f.distance_km}km</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Operational Chat */}
        {activeTab === 'chat' && (
          <div className="bento-card" style={{ display: 'flex', flexDirection: 'column', height: '600px', padding: 0, overflow: 'hidden' }}>
            {/* Header info */}
            <div style={{ padding: '16px 24px', background: 'var(--zinc-900)', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>Operational Coordination Channel</h3>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Room: accident:{accident?.accident_code}</span>
              </div>
              <span className="badge badge-green">Online</span>
            </div>

            {/* Chat Box */}
            <div style={{ flex: 1, padding: '24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16, background: 'var(--zinc-950)' }}>
              {messages.length === 0 ? (
                <div style={{ margin: 'auto', textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
                  No coordinates reported. Start discussion to coordinate response.
                </div>
              ) : (
                messages.map((m) => {
                  const isMe = m.sender_id === user?.id;
                  return (
                    <div
                      key={m.id}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: isMe ? 'flex-end' : 'flex-start',
                        maxWidth: '75%',
                        alignSelf: isMe ? 'flex-end' : 'flex-start'
                      }}
                    >
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
                        {m.sender_name} ({m.sender_type.toUpperCase()})
                      </span>
                      <div
                        style={{
                          padding: '12px 16px',
                          borderRadius: '16px',
                          borderTopRightRadius: isMe ? '4px' : '16px',
                          borderTopLeftRadius: isMe ? '16px' : '4px',
                          background: isMe ? 'var(--blue-primary)' : 'var(--zinc-900)',
                          border: isMe ? 'none' : '1px solid var(--border)',
                          color: '#fff',
                          fontSize: 14,
                        }}
                      >
                        {m.messageType === 'text' && <div>{m.content}</div>}
                        {m.messageType === 'photo' && (
                          <img
                            src={`http://localhost:5000${m.content}`}
                            alt="Evidence upload"
                            style={{ maxWidth: '100%', maxHeight: '200px', borderRadius: 8, marginTop: 4, cursor: 'pointer' }}
                            onClick={() => window.open(`http://localhost:5000${m.content}`)}
                          />
                        )}
                        {m.messageType === 'voice' && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <span style={{ fontSize: 11 }}>Voice Note Audio</span>
                            <audio src={`http://localhost:5000${m.content}`} controls style={{ maxWidth: '240px' }} />
                          </div>
                        )}
                      </div>
                      <span style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                        {new Date(m.createdAt).toLocaleTimeString()}
                      </span>
                    </div>
                  );
                })
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Chat Send Input */}
            <form onSubmit={handleSendChatMessage} style={{ padding: 16, borderTop: '1px solid var(--border)', background: 'var(--zinc-900)', display: 'flex', gap: 12, alignItems: 'center' }}>
              {/* Media Buttons */}
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="file"
                  accept="image/*"
                  id="chat-photo-upload"
                  style={{ display: 'none' }}
                  disabled={chatUploading}
                  onChange={(e) => handleChatFileUpload(e, 'photo')}
                />
                <label htmlFor="chat-photo-upload" className="btn btn-secondary btn-sm" style={{ cursor: 'pointer', margin: 0, padding: '10px 14px', display: 'flex', alignItems: 'center', height: 42 }}>
                  <CameraIcon size={16} />
                </label>

                <input
                  type="file"
                  accept="audio/*"
                  id="chat-audio-upload"
                  style={{ display: 'none' }}
                  disabled={chatUploading}
                  onChange={(e) => handleChatFileUpload(e, 'voice')}
                />
                <label htmlFor="chat-audio-upload" className="btn btn-secondary btn-sm" style={{ cursor: 'pointer', margin: 0, padding: '10px 14px', display: 'flex', alignItems: 'center', height: 42 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8" />
                  </svg>
                </label>
              </div>

              <input
                className="form-input"
                type="text"
                placeholder="Type message here..."
                style={{ flex: 1, height: 42, background: 'var(--zinc-950)' }}
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                required
              />
              <button type="submit" className="btn btn-primary" style={{ padding: '0 20px', height: 42 }}>
                Send
              </button>
            </form>
          </div>
        )}

        {/* Tab 4: Scene Report */}
        {activeTab === 'reporting' && (
          <div>
            {!showPostArrivalForm ? (
              <div className="bento-card" style={{ padding: 40, textAlign: 'center' }}>
                <AlertIcon size={48} className="text-red" style={{ margin: '0 auto 16px auto' }} />
                <h3>Form Locked</h3>
                <p style={{ color: 'var(--text-secondary)', marginTop: 8 }}>
                  Post-Arrival operations checklist is locked. You must arrive at the incident location (Arrived state active) to unlock scene reporting.
                </p>
              </div>
            ) : (
              <div className="bento-card" style={{ borderLeft: '4px solid var(--green-primary)' }}>
                <h3 style={{ marginBottom: 16, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 600 }}>
                  <FileTextIcon size={16} className="text-green" /> Post-Arrival Operations Report
                </h3>
                <form onSubmit={handleSubmitReport} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <div className="form-group">
                      <label className="form-label">Victim Status</label>
                      <select className="form-input" value={victimStatus} onChange={e => setVictimStatus(e.target.value)}>
                        <option value="located">Located</option>
                        <option value="stabilizing">Assistance In Progress</option>
                        <option value="transporting">Victim Transporting</option>
                        <option value="resolved">Resolved</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Incident Severity</label>
                      <select className="form-input" value={severityUpdate} onChange={e => setSeverityUpdate(e.target.value)}>
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                        <option value="critical">Critical</option>
                      </select>
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Field Report Notes</label>
                    <textarea className="form-input" rows="3" placeholder="Describe the scene and details of injuries..." value={fieldReport} onChange={e => setFieldReport(e.target.value)} required />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Actions Taken</label>
                    <input className="form-input" type="text" placeholder="First-aid, CPR, crowd control..." value={actionsTaken} onChange={e => setActionsTaken(e.target.value)} />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Additional Support Needed?</label>
                    <input className="form-input" type="text" placeholder="e.g. Need extra fire-truck / Police reinforcement..." value={additionalSupport} onChange={e => setAdditionalSupport(e.target.value)} />
                  </div>

                  {/* File Upload component */}
                  <div className="form-group">
                    <label className="form-label">Evidence / Photos ({evidenceUrls.length})</label>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                      <input type="file" accept="image/*" onChange={handleFileUpload} disabled={uploading} style={{ display: 'none' }} id="evidence-upload-file" />
                      <label htmlFor="evidence-upload-file" className="btn btn-secondary btn-sm" style={{ cursor: 'pointer', margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <CameraIcon size={14} /> Select Photo
                      </label>
                      {uploading && <div className="spinner-sm spinner" />}
                    </div>
                    {evidenceUrls.length > 0 && (
                      <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                        {evidenceUrls.map((url, idx) => (
                          <a key={idx} href={`http://localhost:5000${url}`} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: 'var(--cyan-primary)', fontWeight: 600 }}>
                            File_{idx + 1}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 8 }}>
                    <button type="submit" className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                        <polyline points="17 21 17 13 7 13 7 21" />
                        <polyline points="7 3 7 8 15 8" />
                      </svg>
                      Save Progress
                    </button>
                    <button type="button" className="btn btn-success" onClick={handleCloseIncident} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <CheckIcon size={14} /> Resolve & Close Case
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}
