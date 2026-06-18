import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import MapView, { ICONS } from '../components/MapView';
import API from '../api/axios';
import toast from 'react-hot-toast';
import { connectSocket, getSocket } from '../api/socket';
import { useSocketEvent } from '../hooks/useSocket';
import { useAuth } from '../context/AuthContext';
import useGeolocationPermission from '../hooks/useGeolocation';

export default function NavigationScreen() {
  const { routeId } = useParams();
  const navigate = useNavigate();
  const { user, entityType } = useAuth();
  useGeolocationPermission();
  
  const [route, setRoute] = useState(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [currentPos, setCurrentPos] = useState(null);
  const [accident, setAccident] = useState(null);
  const [loading, setLoading] = useState(true);
  const [simulating, setSimulating] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [speed, setSpeed] = useState(0);
  const [useLiveGps, setUseLiveGps] = useState(false);
  
  const [status, setStatus] = useState('accepted');
  const [timerActive, setTimerActive] = useState(false);
  
  const simIntervalRef = useRef(null);

  // Fetch route and accident details
  useEffect(() => {
    const fetchDetails = async () => {
      try {
        const res = await API.get(`/routes/${routeId}`);
        const rData = res.data.route;
        setRoute(rData);
        
        const points = rData.routePoints || rData.route_points;
        if (points && points.length > 0) {
          setCurrentPos(points[0]);
        }
        
        const accId = rData.accidentId || rData.accident_id;
        if (accId) {
          const accRes = await API.get(`/accidents/${accId}`);
          setAccident(accRes.data.accident);
          setStatus(accRes.data.accident.status);
          
          // Re-establish simulation / timer state if en-route
          if (['start_response', 'en_route', 'near_incident'].includes(accRes.data.accident.status)) {
            setSimulating(true);
            setTimerActive(true);
          }
        }
      } catch (e) {
        toast.error('Failed to load navigation route');
        navigate('/');
      } finally {
        setLoading(false);
      }
    };
    
    fetchDetails();
  }, [routeId]);

  // Ensure socket is connected and registered for navigation viewer
  useEffect(() => {
    if (user?.id) {
      connectSocket(user.id, entityType || 'volunteer');
    }
  }, [user?.id, entityType]);

  // Handle route recalculation via socket
  const handleRecalculated = useCallback((data) => {
    const points = data?.routePoints || data?.route_points;
    if (points) {
      toast.success('Optimal route recalculated successfully!');
      setRoute(prev => ({
        ...prev,
        routePoints: points,
        route_points: points
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
      
      if (data.status === 'arrived') {
        setSimulating(false);
        setSpeed(0);
        toast.success('You have arrived at the incident scene!');
      }
    }
  }, [accident]);

  useSocketEvent(routeId ? `route:${routeId}:recalculated` : null, handleRecalculated);
  useSocketEvent(accident ? `accident:${accident.id}:status_change` : null, handleStatusChange);

  // GPS Simulation Loop
  useEffect(() => {
    if (!route || !simulating || recalculating || useLiveGps) {
      if (simIntervalRef.current) clearInterval(simIntervalRef.current);
      return;
    }

    const pts = route.routePoints || route.route_points || [];
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
              distanceKm: uRes.data.distanceToDestKm,
              distance_km: uRes.data.distanceToDestKm,
              etaMinutes: uRes.data.etaMinutes,
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
        setRoute(prev => ({
          ...prev,
          distanceKm: 0,
          distance_km: 0,
          etaMinutes: 0,
          eta_minutes: 0
        }));
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
            distanceKm: uRes.data.distanceToDestKm,
            distance_km: uRes.data.distanceToDestKm,
            etaMinutes: uRes.data.etaMinutes,
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
        const newRoute = uRes.data.route;
        const points = newRoute?.routePoints || newRoute?.route_points;
        if (points) {
          setRoute(prev => ({
            ...prev,
            routePoints: points,
            route_points: points,
            distanceKm: uRes.data.distanceToDestKm,
            distance_km: uRes.data.distanceToDestKm,
            etaMinutes: uRes.data.etaMinutes,
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
    const fromType = route?.fromEntityType || route?.from_entity_type;
    mapMarkers.push({
      lat: currentPos.lat,
      lng: currentPos.lng,
      icon: ICONS[fromType] || ICONS.ambulance,
      title: 'Your Location'
    });
  }
  if (accident) {
    const accCode = accident.accidentCode || accident.accident_code;
    const locAddress = accident.locationAddress || accident.location_address;
    mapMarkers.push({
      lat: parseFloat(accident.latitude),
      lng: parseFloat(accident.longitude),
      icon: ICONS.accident,
      popup: `<b>Incident ${accCode}</b><br/>${locAddress}`
    });
  }

  const polylinePositions = (route?.routePoints || route?.route_points || []).map(p => [p.lat, p.lng]);
  const polylines = polylinePositions.length > 0 ? [{ positions: polylinePositions, color: 'var(--cyan-primary)' }] : [];

  const isArrived = ['arrived', 'victim_located', 'assistance_in_progress', 'victim_transported'].includes(status);

  return (
    <Layout title="Live Rescue Navigation">
      <div className="flex-between mb-24">
        <div>
          <h1 className="section-title">Rescue Operation Console</h1>
          <p className="section-subtitle">Real-time emergency routing and navigation</p>
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
          {simulating && (
            <button className="btn btn-secondary btn-sm" onClick={triggerDeviation}>
              Test Deviation
            </button>
          )}
        </div>
      </div>

      <div className="bento-card" style={{ padding: 0, overflow: 'hidden', position: 'relative', height: '600px' }}>
        <MapView
          height="100%"
          center={currentPos ? [currentPos.lat, currentPos.lng] : [16.5062, 80.6480]}
          zoom={15}
          markers={mapMarkers}
          polylines={polylines}
          recenterLabel="Responder GPS"
        />

        {status === 'accepted' && (
          <div style={{
            position: 'absolute',
            bottom: '24px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 1000,
            background: 'rgba(24, 24, 27, 0.9)',
            padding: '16px 24px',
            borderRadius: '12px',
            border: '1px solid var(--border)',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '8px'
          }}>
            <button
              className="btn btn-success"
              onClick={handleStartResponse}
              style={{ padding: '16px 36px', fontSize: '18px', fontWeight: 800, borderRadius: '8px', boxShadow: '0 4px 14px rgba(16, 185, 129, 0.4)' }}
            >
              Start Navigation
            </button>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 500 }}>
              Click to begin live routing to emergency site
            </span>
          </div>
        )}

        {isArrived && (
          <div style={{
            position: 'absolute',
            bottom: '24px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 1000,
            background: 'rgba(24, 24, 27, 0.9)',
            padding: '16px 24px',
            borderRadius: '12px',
            border: '1px solid var(--border)',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '8px'
          }}>
            <button
              className="btn btn-success"
              onClick={handleCloseIncident}
              style={{ padding: '16px 36px', fontSize: '18px', fontWeight: 800, borderRadius: '8px', boxShadow: '0 4px 14px rgba(16, 185, 129, 0.4)' }}
            >
              Resolve & Close Case
            </button>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 500 }}>
              You have arrived at the scene. Click to finish rescue.
            </span>
          </div>
        )}
      </div>
    </Layout>
  );
}
