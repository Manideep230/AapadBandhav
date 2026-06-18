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

const createPremiumIcon = (svgPath, color = '#dc2626', shadowColor = 'rgba(220, 38, 38, 0.35)') => L.divIcon({
  html: `
    <div class="premium-map-marker" style="--marker-color: ${color}; --marker-shadow: ${shadowColor};">
      <div class="marker-glowing-ring"></div>
      <div class="marker-body">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          ${svgPath}
        </svg>
      </div>
    </div>
  `,
  className: '',
  iconSize: [42, 42],
  iconAnchor: [21, 21],
  popupAnchor: [0, -22],
});

export const ICONS = {
  user: createPremiumIcon(
    '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle>',
    '#3b82f6',
    'rgba(59, 130, 246, 0.4)'
  ),
  device: createPremiumIcon(
    '<rect x="4" y="4" width="16" height="16" rx="2"></rect><rect x="9" y="9" width="6" height="6"></rect><path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 15h3M1 9h3M1 15h3"></path>',
    '#06b6d4',
    'rgba(6, 182, 212, 0.4)'
  ),
  accident: createPremiumIcon(
    '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line>',
    '#dc2626',
    'rgba(220, 38, 38, 0.4)'
  ),
  hospital: createPremiumIcon(
    '<path d="M12 5v14M5 12h14" stroke-width="3.5"></path>',
    '#10b981',
    'rgba(16, 185, 129, 0.4)'
  ),
  ambulance: createPremiumIcon(
    '<path d="M19 18H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h10l4 4v5a2 2 0 0 1-2 2z"></path><circle cx="7.5" cy="18" r="2.5"></circle><circle cx="16.5" cy="18" r="2.5"></circle><path d="M7 9V7h2"></path><path d="M13 9V7h2"></path>',
    '#3b82f6',
    'rgba(59, 130, 246, 0.4)'
  ),
  police: createPremiumIcon(
    '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>',
    '#8b5cf6',
    'rgba(139, 92, 246, 0.4)'
  ),
  police_station: createPremiumIcon(
    '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path><path d="M12 8v8M8 12h8"></path>',
    '#6366f1',
    'rgba(99, 102, 241, 0.4)'
  ),
  mechanic: createPremiumIcon(
    '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path>',
    '#f59e0b',
    'rgba(245, 158, 11, 0.4)'
  ),
  insurance: createPremiumIcon(
    '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path><path d="m9 12 2 2 4-4"></path>',
    '#14b8a6',
    'rgba(20, 184, 166, 0.4)'
  ),
  volunteer: createPremiumIcon(
    '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"></path>',
    '#ec4899',
    'rgba(236, 72, 153, 0.4)'
  ),
  fire_department: createPremiumIcon(
    '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"></path>',
    '#f43f5e',
    'rgba(244, 63, 94, 0.4)'
  ),
};

const clusterMarkers = (rawMarkers, zoom) => {
  const clustered = [];
  const used = new Set();
  
  // Calculate threshold dynamically based on zoom (visual distance on screen stays constant)
  const threshold = 0.0008 * Math.pow(2, 15 - zoom);
  
  for (let i = 0; i < rawMarkers.length; i++) {
    if (used.has(i)) continue;
    const current = rawMarkers[i];
    const group = [current];
    
    for (let j = i + 1; j < rawMarkers.length; j++) {
      if (used.has(j)) continue;
      const other = rawMarkers[j];
      const dist = Math.sqrt(Math.pow(current.lat - other.lat, 2) + Math.pow(current.lng - other.lng, 2));
      if (dist < threshold) {
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
          html: `<div style="background:linear-gradient(135deg, #7c3aed 0%, #3b82f6 100%);width:42px;height:42px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;color:#ffffff;font-weight:800;border:3px solid #ffffff;box-shadow:0 4px 15px rgba(124,58,237,0.5)">${group.length}</div>`,
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
  const [currentZoom, setCurrentZoom] = useState(zoom);

  // Sync zoom prop changes to currentZoom state
  useEffect(() => {
    setCurrentZoom(zoom);
  }, [zoom]);

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
    const map = L.map(mapRef.current, { 
      center, 
      zoom, 
      zoomControl: true,
      attributionControl: false
    });
    
    map.on('zoomend', () => {
      setCurrentZoom(map.getZoom());
    });
    
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
      maxZoom: 19,
    }).addTo(map);
  }, [theme]);

  // Update markers (with clustering)
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    markersRef.current.forEach(m => m.remove());
    
    const finalMarkers = clusterMarkers(markers, currentZoom);
    
    markersRef.current = finalMarkers.map(({ lat, lng, icon, popup, draggable }) => {
      const m = L.marker([lat, lng], { icon: icon || L.Icon.Default, draggable: !!draggable }).addTo(map);
      if (popup) m.bindPopup(popup);
      return m;
    });
  }, [markers, currentZoom]);

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
        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '5px' }}>
          <circle cx="12" cy="12" r="10"/>
          <circle cx="12" cy="12" r="3"/>
          <line x1="12" y1="1" x2="12" y2="3"/>
          <line x1="12" y1="21" x2="12" y2="23"/>
          <line x1="1" y1="12" x2="3" y2="12"/>
          <line x1="21" y1="12" x2="23" y2="12"/>
        </svg>
        {recenterLabel}
      </button>
    </div>
  );
}
