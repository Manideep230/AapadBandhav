import React, { useState, useEffect, useCallback } from 'react';
import Layout from '../../components/Layout';
import MapView, { ICONS } from '../../components/MapView';
import API from '../../api/axios';
import { getSocket } from '../../api/socket';
import { useSocketEvent } from '../../hooks/useSocket';
import { useAuth } from '../../context/AuthContext';

const DEFAULT_LOCATION = { lat: 19.076, lng: 72.8777 };

const parseLocation = (item) => {
  const lat = parseFloat(item?.latitude ?? item?.lat);
  const lng = parseFloat(item?.longitude ?? item?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
};

const addServiceMarkers = (markers, items = [], icon, popupTitle) => {
  items.forEach((item) => {
    const loc = parseLocation(item);
    if (!loc) return;
    markers.push({
      lat: loc.lat,
      lng: loc.lng,
      icon,
      popup: `<b>${item.name || popupTitle}</b><br/>${popupTitle}`
    });
  });
};

export default function UserMap() {
  const { user, entityType } = useAuth();
  const [responders, setResponders] = useState({
    hospitals: [],
    ambulances: [],
    policeStations: [],
    police: [],
    mechanics: [],
    insurance: []
  });
  const [myDevices, setMyDevices] = useState([]);
  const [mapLocation, setMapLocation] = useState(null);

  const savedLocation = parseLocation(user);
  const usesSavedLocation = entityType === 'hospital' || entityType === 'police_station' || entityType === 'insurance';

  useEffect(() => {
    API.get('/locations/active-responders')
      .then(r => setResponders(r.data.responders || {}))
      .catch(() => {});

    if (entityType === 'user') {
      API.get('/live-map/my-devices')
        .then(res => setMyDevices(res.data.devices || []))
        .catch(() => {});
    }

    if (usesSavedLocation) {
      setMapLocation(savedLocation || DEFAULT_LOCATION);
      return undefined;
    }

    let watchId = null;
    if (navigator.geolocation) {
      watchId = navigator.geolocation.watchPosition(
        p => setMapLocation({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => setMapLocation(DEFAULT_LOCATION),
        { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
      );
    } else {
      setMapLocation(DEFAULT_LOCATION);
    }

    return () => {
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    };
  }, [usesSavedLocation, savedLocation?.lat, savedLocation?.lng, entityType]);

  const handleLocationUpdate = useCallback(({ entityId, entityType: movingType, latitude, longitude, speed }) => {
    // Update Responders
    setResponders(prev => {
      const updated = { ...prev };
      if (movingType === 'ambulance') {
        updated.ambulances = (prev.ambulances || []).map(a => a.id === entityId ? { ...a, latitude, longitude } : a);
      } else if (movingType === 'policeman') {
        updated.police = (prev.police || []).map(p => p.id === entityId ? { ...p, latitude, longitude } : p);
      } else if (movingType === 'mechanic') {
        updated.mechanics = (prev.mechanics || []).map(m => m.id === entityId ? { ...m, latitude, longitude } : m);
      }
      return updated;
    });

    // Update Owned/Shared Devices
    setMyDevices(prev => {
      return prev.map(d => {
        const matchesDevice = d.device_id === entityId;
        const matchesOwner = movingType === 'user' && d.owner?.id === entityId;
        if (matchesDevice || matchesOwner) {
          return {
            ...d,
            latitude: parseFloat(latitude),
            longitude: parseFloat(longitude),
            current_speed: speed !== undefined ? speed : d.current_speed,
            last_seen: new Date().toISOString()
          };
        }
        return d;
      });
    });
  }, []);

  // Bind Socket.IO events using custom hook
  useSocketEvent('entity:location', handleLocationUpdate);

  const markers = [];
  if (mapLocation) {
    const selfIcon = entityType === 'hospital'
      ? ICONS.hospital
      : entityType === 'police_station'
        ? ICONS.police
        : entityType === 'insurance'
          ? ICONS.insurance
        : ICONS.user;
    const selfLabel = usesSavedLocation ? 'Saved location' : 'Current location';
    markers.push({ lat: mapLocation.lat, lng: mapLocation.lng, icon: selfIcon, popup: `<b>${selfLabel}</b>` });
  }

  // Render owned & shared devices
  myDevices.forEach((d) => {
    if (d.latitude && d.longitude) {
      const isOwner = d.role === 'owner';
      const title = isOwner ? 'My Device' : 'Shared Device';
      markers.push({
        lat: d.latitude,
        lng: d.longitude,
        icon: ICONS.device,
        popup: `
          <div style="font-family: 'Outfit', sans-serif; min-width: 140px;">
            <strong style="color: ${isOwner ? '#3b82f6' : '#06b6d4'}">${title}</strong><br/>
            Code: <b>${d.device_id}</b><br/>
            Owner: ${d.owner?.full_name || 'Unknown'}<br/>
            Vehicle: ${d.vehicle ? `${d.vehicle.vehicle_number} (${d.vehicle.vehicle_type})` : '—'}<br/>
            Speed: <b>${d.current_speed || 0} km/h</b><br/>
            Battery: ${d.battery_level ?? 100}%
          </div>
        `
      });
    }
  });

  addServiceMarkers(markers, responders.hospitals, ICONS.hospital, 'Hospital');
  addServiceMarkers(markers, responders.ambulances, ICONS.ambulance, 'Ambulance');
  addServiceMarkers(markers, responders.policeStations, ICONS.police, 'Police Station');
  addServiceMarkers(markers, responders.police, ICONS.police, 'Police Officer');
  addServiceMarkers(markers, responders.mechanics, ICONS.mechanic, 'Mechanic');
  addServiceMarkers(markers, responders.insurance, ICONS.insurance, 'Insurance Company');

  const center = mapLocation ? [mapLocation.lat, mapLocation.lng] : [DEFAULT_LOCATION.lat, DEFAULT_LOCATION.lng];

  return (
    <Layout title="Live Map">
      <div className="flex-between mb-16">
        <div>
          <h2 className="section-title" style={{ marginBottom: 4 }}>Live Responder Map</h2>
          <p className="text-muted text-sm">
            {usesSavedLocation ? 'Saved service location and nearby emergency services' : 'Real-time location of emergency services near you'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {[
            ['H', 'Hospitals'],
            ['A', 'Ambulances'],
            ['P', 'Police Stations'],
            ['O', 'Officers'],
            ['M', 'Mechanics'],
            ['I', 'Insurance']
          ].map(([i, l]) => (
            <span key={l} className="badge badge-muted">{i} {l}</span>
          ))}
        </div>
      </div>
      <MapView
        height="60vh"
        center={center}
        zoom={13}
        markers={markers}
        recenterLabel={usesSavedLocation ? 'Saved location' : 'Locate me'}
      />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, marginTop: 20 }}>
        {[
          { label: 'Hospitals', count: responders.hospitals?.length || 0, icon: 'H', color: 'green' },
          { label: 'Ambulances', count: responders.ambulances?.length || 0, icon: 'A', color: 'blue' },
          { label: 'Police Stations', count: responders.policeStations?.length || 0, icon: 'P', color: 'purple' },
          { label: 'Police Officers', count: responders.police?.length || 0, icon: 'O', color: 'purple' },
          { label: 'Mechanics', count: responders.mechanics?.length || 0, icon: 'M', color: 'amber' },
          { label: 'Insurance', count: responders.insurance?.length || 0, icon: 'I', color: 'cyan' },
        ].map(s => (
          <div key={s.label} className={`stat-card ${s.color}`}>
            <div className="stat-icon">{s.icon}</div>
            <div className="stat-value">{s.count}</div>
            <div className="stat-label">{s.label} Active</div>
          </div>
        ))}
      </div>
    </Layout>
  );
}
