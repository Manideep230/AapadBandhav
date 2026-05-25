import React, { useEffect, useState } from 'react';
import Layout from '../../components/Layout';
import MapView, { ICONS } from '../../components/MapView';
import API from '../../api/axios';
import { getSocket } from '../../api/socket';

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

export default function AdminMap() {
  const [accidents, setAccidents] = useState([]);
  const [responders, setResponders] = useState({ hospitals: [], ambulances: [], policeStations: [], police: [], mechanics: [], insurance: [] });
  const [currentLocation, setCurrentLocation] = useState(null);

  useEffect(() => {
    let watchId = null;
    if (navigator.geolocation) {
      watchId = navigator.geolocation.watchPosition(
        p => setCurrentLocation({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => setCurrentLocation({ lat: 19.076, lng: 72.8777 }),
        { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
      );
    } else {
      setCurrentLocation({ lat: 19.076, lng: 72.8777 });
    }

    API.get('/accidents?status=active&limit=20')
      .then(r => setAccidents(r.data.accidents || []))
      .catch(err => console.error('Failed to load active accidents', err));

    API.get('/locations/active-responders')
      .then(r => setResponders(r.data.responders || {}))
      .catch(err => console.error('Failed to load responders', err));

    const socket = getSocket();
    socket.join?.('type:admin');
    socket.on('accident:new', (data) => {
      setAccidents(prev => [{
        id: data.accidentId,
        accident_code: data.code,
        latitude: data.lat,
        longitude: data.lng,
        severity: data.severity,
        status: 'active',
        createdAt: data.timestamp
      }, ...prev]);
    });
    socket.on('entity:location', ({ entityId, entityType, latitude, longitude }) => {
      setResponders(prev => {
        const updated = { ...prev };
        if (entityType === 'ambulance') {
          updated.ambulances = (prev.ambulances || []).map(a => a.id === entityId ? { ...a, latitude, longitude } : a);
        } else if (entityType === 'policeman') {
          updated.police = (prev.police || []).map(p => p.id === entityId ? { ...p, latitude, longitude } : p);
        } else if (entityType === 'mechanic') {
          updated.mechanics = (prev.mechanics || []).map(m => m.id === entityId ? { ...m, latitude, longitude } : m);
        }
        return updated;
      });
    });

    return () => {
      socket.off('accident:new');
      socket.off('entity:location');
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    };
  }, []);

  const markers = [];
  if (currentLocation) {
    markers.push({
      lat: currentLocation.lat,
      lng: currentLocation.lng,
      icon: ICONS.user,
      popup: '<b>Your current location</b>'
    });
  }

  accidents.forEach(a => {
    const lat = parseFloat(a.latitude);
    const lng = parseFloat(a.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      markers.push({
        lat,
        lng,
        icon: ICONS.accident,
        popup: `<b>${a.accident_code}</b><br/>Severity: ${a.severity}<br/>Status: ${a.status}`
      });
    }
  });

  addServiceMarkers(markers, responders.hospitals, ICONS.hospital, 'Hospital');
  addServiceMarkers(markers, responders.ambulances, ICONS.ambulance, 'Ambulance');
  addServiceMarkers(markers, responders.policeStations, ICONS.police, 'Police Station');
  addServiceMarkers(markers, responders.police, ICONS.police, 'Police Officer');
  addServiceMarkers(markers, responders.mechanics, ICONS.mechanic, 'Mechanic');
  addServiceMarkers(markers, responders.insurance, ICONS.insurance, 'Insurance Company');

  const circles = accidents.flatMap(a => {
    const lat = parseFloat(a.latitude);
    const lng = parseFloat(a.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];
    return [
      { lat, lng, radius: 8, color: '#ef4444', label: '8km' },
      { lat, lng, radius: 25, color: '#f59e0b', label: '25km' },
    ];
  });

  const center = currentLocation
    ? [currentLocation.lat, currentLocation.lng]
    : [19.076, 72.8777];

  return (
    <Layout title="Admin - Live Map">
      <div className="flex-between mb-16">
        <div>
          <h1 className="section-title">Live Emergency Map</h1>
          <p className="section-subtitle">{accidents.length} active incidents and service locations</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <span className="badge badge-blue">You</span>
          <span className="badge badge-red">Accidents</span>
          <span className="badge badge-green">Hospitals</span>
          <span className="badge badge-purple">Police Stations</span>
          <span className="badge badge-blue">Insurance</span>
        </div>
      </div>
      <MapView height="70vh" center={center} zoom={13} markers={markers} circles={circles} />
    </Layout>
  );
}
