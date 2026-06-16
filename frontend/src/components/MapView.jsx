import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix Leaflet default icon
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const createIcon = (label, color = '#dc2626') => L.divIcon({
  html: `<div class="map-marker-glyph" style="background:${color}">${label}</div>`,
  className: '',
  iconSize: [36, 36],
  iconAnchor: [18, 18],
  popupAnchor: [0, -20],
});

export const ICONS = {
  user: createIcon('USR', '#3b82f6'),
  device: createIcon('IOT', '#06b6d4'),
  accident: createIcon('SOS', '#dc2626'),
  hospital: createIcon('HSP', '#10b981'),
  ambulance: createIcon('AMB', '#3b82f6'),
  police: createIcon('POL', '#8b5cf6'),
  police_station: createIcon('POL', '#6366f1'),
  mechanic: createIcon('MEC', '#f59e0b'),
  insurance: createIcon('INS', '#14b8a6'),
  volunteer: createIcon('VOL', '#ec4899'),
  fire_department: createIcon('FIR', '#f43f5e'),
};

const clusterMarkers = (rawMarkers) => {
  const clustered = [];
  const used = new Set();
  
  for (let i = 0; i < rawMarkers.length; i++) {
    if (used.has(i)) continue;
    const current = rawMarkers[i];
    const group = [current];
    
    for (let j = i + 1; j < rawMarkers.length; j++) {
      if (used.has(j)) continue;
      const other = rawMarkers[j];
      const dist = Math.sqrt(Math.pow(current.lat - other.lat, 2) + Math.pow(current.lng - other.lng, 2));
      if (dist < 0.001) { // roughly 100 meters
        group.push(other);
        used.add(j);
      }
    }
    
    if (group.length > 1) {
      const avgLat = group.reduce((sum, m) => sum + m.lat, 0) / group.length;
      const avgLng = group.reduce((sum, m) => sum + m.lng, 0) / group.length;
      const labels = group.map(m => m.popup || m.title || 'Entity').join('<hr style="margin:5px 0;border-color:rgba(255,255,255,0.1)"/>');
      
      clustered.push({
        lat: avgLat,
        lng: avgLng,
        icon: L.divIcon({
          html: `<div style="background:linear-gradient(135deg, #1e293b 0%, #0f172a 100%);width:42px;height:42px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;color:#38bdf8;font-weight:800;border:3px solid #38bdf8;box-shadow:0 4px 12px rgba(0,0,0,0.6)">${group.length}</div>`,
          className: '',
          iconSize: [42, 42],
          iconAnchor: [21, 21],
          popupAnchor: [0, -22],
        }),
        popup: `<div style="max-height:200px;overflow-y:auto;font-family:sans-serif;color:#f8fafc">${labels}</div>`
      });
    } else {
      clustered.push(current);
    }
    used.add(i);
  }
  return clustered;
};

export default function MapView({ height = '500px', center = [19.076, 72.8777], zoom = 12, markers = [], circles = [], polylines = [], onMapClick, recenterLabel = 'Locate me' }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const tileLayerRef = useRef(null);
  const markersRef = useRef([]);
  const circlesRef = useRef([]);
  const polylinesRef = useRef([]);
  const [theme, setTheme] = useState(() => document.documentElement.getAttribute('data-theme') || 'dark');

  // Observe theme changes on HTML tag
  useEffect(() => {
    const observer = new MutationObserver(() => {
      const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
      setTheme(currentTheme);
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  // Initialize Map
  useEffect(() => {
    if (mapInstanceRef.current) return;
    const map = L.map(mapRef.current, { center, zoom, zoomControl: true });
    if (onMapClick) map.on('click', (e) => onMapClick(e.latlng));
    mapInstanceRef.current = map;
    return () => { map.remove(); mapInstanceRef.current = null; };
  }, []);

  const hasPannedRef = useRef(false);
  const prevCenterRef = useRef(null);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !Array.isArray(center) || center.length !== 2) return;
    const [lat, lng] = center;
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      const isNewLocation = !prevCenterRef.current || 
        Math.abs(prevCenterRef.current[0] - lat) > 0.005 || 
        Math.abs(prevCenterRef.current[1] - lng) > 0.005;

      if (!hasPannedRef.current || isNewLocation) {
        map.setView(center, zoom);
        hasPannedRef.current = true;
        prevCenterRef.current = center;
      }
    }
  }, [center, zoom]);

  const returnToCurrentLocation = (event) => {
    event.stopPropagation();
    const map = mapInstanceRef.current;
    if (!map || !Array.isArray(center) || center.length !== 2) return;

    const [lat, lng] = center;
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      map.setView(center, zoom);
    }
  };

  // Sync Tiles to Theme
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (tileLayerRef.current) {
      tileLayerRef.current.remove();
    }

    const tileUrl = theme === 'light'
      ? 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png'
      : 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';

    tileLayerRef.current = L.tileLayer(tileUrl, {
      attribution: '(c) OpenStreetMap (c) CARTO',
      maxZoom: 19,
    }).addTo(map);
  }, [theme]);

  // Update markers (with clustering)
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    markersRef.current.forEach(m => m.remove());
    
    const finalMarkers = clusterMarkers(markers);
    
    markersRef.current = finalMarkers.map(({ lat, lng, icon, popup, draggable }) => {
      const m = L.marker([lat, lng], { icon: icon || L.Icon.Default, draggable: !!draggable }).addTo(map);
      if (popup) m.bindPopup(popup);
      return m;
    });
  }, [markers]);

  // Update circles (radius visualization)
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    circlesRef.current.forEach(c => c.remove());
    circlesRef.current = circles.map(({ lat, lng, radius, color, label }) => {
      const c = L.circle([lat, lng], {
        radius: radius * 1000, // km to meters
        color: color || '#ef4444',
        fillColor: color || '#ef4444',
        fillOpacity: 0.05,
        weight: 1.5,
        dashArray: '6,4',
      }).addTo(map);
      if (label) c.bindTooltip(label, { permanent: true, direction: 'top', className: 'leaflet-tooltip-dark' });
      return c;
    });
  }, [circles]);

  // Update polylines (routes)
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    polylinesRef.current.forEach(p => p.remove());
    if (polylines && Array.isArray(polylines)) {
      polylinesRef.current = polylines.map(({ positions, color, weight }) => {
        return L.polyline(positions, {
          color: color || 'var(--cyan-400)',
          weight: weight || 5,
          opacity: 0.85,
        }).addTo(map);
      });
    }
  }, [polylines]);

  return (
    <div className="map-container" style={{ height }}>
      <div ref={mapRef} style={{ height: '100%', width: '100%' }} />
      <button
        type="button"
        className="map-current-location-btn"
        onClick={returnToCurrentLocation}
        title={`Return to ${recenterLabel.toLowerCase()}`}
        aria-label={`Return to ${recenterLabel.toLowerCase()}`}
      >
        {recenterLabel}
      </button>
    </div>
  );
}
