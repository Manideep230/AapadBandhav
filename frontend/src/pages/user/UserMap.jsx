import React, { useState, useEffect, useCallback } from 'react';
import Layout from '../../components/Layout';
import MapView, { ICONS } from '../../components/MapView';
import API from '../../api/axios';
import { getSocket } from '../../api/socket';
import { useSocketEvent } from '../../hooks/useSocket';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';
import useGeolocationPermission from '../../hooks/useGeolocation';

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

    // Determine availability badge
    const isAvail = item.isAvailable !== false; // default to true if undefined
    const statusBadge = isAvail
      ? `<span class="popup-badge badge-available">Available</span>`
      : `<span class="popup-badge badge-busy">Busy</span>`;

    // Construct body info rows dynamically
    let detailsHtml = '';
    
    if (item.mobile) {
      detailsHtml += `
        <div class="popup-info-row">
          <span class="info-label">Contact</span>
          <a href="tel:${item.mobile}" class="info-value contact-link">📞 ${item.mobile}</a>
        </div>
      `;
    }

    if (item.rating) {
      detailsHtml += `
        <div class="popup-info-row">
          <span class="info-label">Rating</span>
          <span class="info-value rating-value">★ ${parseFloat(item.rating).toFixed(1)}</span>
        </div>
      `;
    }

    if (item.vehicleNumber) {
      detailsHtml += `
        <div class="popup-info-row">
          <span class="info-label">Vehicle</span>
          <span class="info-value">${item.vehicleNumber}</span>
        </div>
      `;
    }

    if (item.organization) {
      detailsHtml += `
        <div class="popup-info-row">
          <span class="info-label">Org</span>
          <span class="info-value">${item.organization}</span>
        </div>
      `;
    }

    if (item.specialization) {
      detailsHtml += `
        <div class="popup-info-row">
          <span class="info-label">Specialty</span>
          <span class="info-value">${item.specialization}</span>
        </div>
      `;
    }

    if (item.stationCode) {
      detailsHtml += `
        <div class="popup-info-row">
          <span class="info-label">Code</span>
          <span class="info-value">${item.stationCode}</span>
        </div>
      `;
    }

    if (item.badgeNumber) {
      detailsHtml += `
        <div class="popup-info-row">
          <span class="info-label">Badge</span>
          <span class="info-value">${item.badgeNumber}</span>
        </div>
      `;
    }

    if (item.bedCapacity !== undefined && item.availableBeds !== undefined) {
      detailsHtml += `
        <div class="popup-info-row">
          <span class="info-label">Beds</span>
          <span class="info-value text-green">${item.availableBeds} / ${item.bedCapacity}</span>
        </div>
      `;
    }

    markers.push({
      lat: loc.lat,
      lng: loc.lng,
      icon,
      popup: `
        <div class="map-popup-card">
          <div class="popup-header">
            <h4 class="popup-title">${item.name || popupTitle}</h4>
            ${statusBadge}
          </div>
          <div class="popup-body">
            <div class="popup-info-row">
              <span class="info-label">Type</span>
              <span class="info-value">${popupTitle}</span>
            </div>
            ${detailsHtml}
          </div>
        </div>
      `
    });
  });
};

export default function UserMap() {
  const { user, entityType } = useAuth();
  useGeolocationPermission();
  const [responders, setResponders] = useState({
    hospitals: [],
    ambulances: [],
    policeStations: [],
    police: [],
    mechanics: [],
    insurance: [],
    volunteers: [],
    fire_departments: []
  });
  const [myDevices, setMyDevices] = useState([]);
  const [mapLocation, setMapLocation] = useState(null);

  const savedLocation = parseLocation(user);
  const usesSavedLocation = entityType === 'hospital' || entityType === 'police_station' || entityType === 'insurance';

  useEffect(() => {
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
        (err) => {
          setMapLocation(DEFAULT_LOCATION);
          console.warn('[Geolocation Error]', err);
          if (err.code === err.PERMISSION_DENIED) {
            toast.error('Location access denied. Map defaults to Mumbai. Enable location in settings to view your position.', { id: 'geo-denied-toast' });
          }
        },
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
      } else if (movingType === 'hospital') {
        updated.hospitals = (prev.hospitals || []).map(h => h.id === entityId ? { ...h, latitude, longitude } : h);
      } else if (movingType === 'police_station') {
        updated.policeStations = (prev.policeStations || []).map(ps => ps.id === entityId ? { ...ps, latitude, longitude } : ps);
      } else if (movingType === 'insurance') {
        updated.insurance = (prev.insurance || []).map(i => i.id === entityId ? { ...i, latitude, longitude } : i);
      } else if (movingType === 'volunteer') {
        updated.volunteers = (prev.volunteers || []).map(v => v.id === entityId ? { ...v, latitude, longitude } : v);
      } else if (movingType === 'fire_department') {
        updated.fire_departments = (prev.fire_departments || []).map(fd => fd.id === entityId ? { ...fd, latitude, longitude } : fd);
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
          <div style="font-family: var(--font-body); min-width: 140px;">
            <strong style="color: ${isOwner ? 'var(--blue-primary)' : 'var(--cyan-primary)'}">${title}</strong><br/>
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
  addServiceMarkers(markers, responders.volunteers, ICONS.volunteer, 'Volunteer');
  addServiceMarkers(markers, responders.fire_departments, ICONS.fire_department, 'Fire Department');

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
            'Hospitals',
            'Ambulances',
            'Police Stations',
            'Officers',
            'Mechanics',
            'Insurance'
          ].map(l => (
            <span key={l} className="badge badge-muted">{l}</span>
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
          { label: 'Hospitals', count: responders.hospitals?.length || 0, color: 'green' },
          { label: 'Ambulances', count: responders.ambulances?.length || 0, color: 'blue' },
          { label: 'Police Stations', count: responders.policeStations?.length || 0, color: 'purple' },
          { label: 'Police Officers', count: responders.police?.length || 0, color: 'purple' },
          { label: 'Mechanics', count: responders.mechanics?.length || 0, color: 'amber' },
          { label: 'Insurance', count: responders.insurance?.length || 0, color: 'cyan' },
          { label: 'Volunteers', count: responders.volunteers?.length || 0, color: 'pink' },
          { label: 'Fire Departments', count: responders.fire_departments?.length || 0, color: 'red' },
        ].map(s => (
          <div key={s.label} className={`stat-card ${s.color}`}>
            <div className="stat-header">
              <span>{s.label}</span>
            </div>
            <div className="stat-value">{s.count}</div>
            <div className="stat-label" style={{ fontSize: 10, marginTop: 4 }}>Active</div>
          </div>
        ))}
      </div>
    </Layout>
  );
}
