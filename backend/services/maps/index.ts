import axios from 'axios';

export class MapService {
  static haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371.0; // Radius of the Earth in km
    const dlat = (lat2 - lat1) * (Math.PI / 180.0);
    const dlon = (lon2 - lon1) * (Math.PI / 180.0);
    const a =
      Math.sin(dlat / 2) ** 2 +
      Math.cos(lat1 * (Math.PI / 180.0)) *
        Math.cos(lat2 * (Math.PI / 180.0)) *
        Math.sin(dlon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  static estimateETA(distanceKm: number, avgSpeedKmh: number = 40): number {
    return Math.round((distanceKm / avgSpeedKmh) * 60);
  }

  static async getRoute(startLat: number, startLng: number, endLat: number, endLng: number) {
    try {
      const url = `http://router.project-osrm.org/route/v1/driving/${startLng},${startLat};${endLng},${endLat}?overview=full&geometries=geojson`;
      const response = await axios.get(url, { timeout: 3000 });
      if (response.data && response.data.routes && response.data.routes.length > 0) {
        const route = response.data.routes[0];
        const coordinates = route.geometry.coordinates; // Array of [lng, lat]
        const points = coordinates.map((coord: any) => ({
          lat: parseFloat(coord[1].toFixed(5)),
          lng: parseFloat(coord[0].toFixed(5)),
        }));
        const distanceKm = route.distance / 1000;
        const etaMinutes = Math.round(route.duration / 60);
        return {
          success: true,
          points,
          distanceKm: parseFloat(distanceKm.toFixed(2)),
          etaMinutes,
        };
      }
    } catch (error: any) {
      console.warn('OSRM routing failed, falling back to straight-line interpolation:', error.message);
    }

    // Fallback: straight-line path interpolation if OSRM is offline/slow
    const dist = this.haversineDistance(startLat, startLng, endLat, endLng);
    const eta = this.estimateETA(dist, 40);
    const steps = 10;
    const points = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const latPt = startLat + (endLat - startLat) * t + (Math.random() - 0.5) * 0.001;
      const lngPt = startLng + (endLng - startLng) * t + (Math.random() - 0.5) * 0.001;
      points.push({ lat: parseFloat(latPt.toFixed(5)), lng: parseFloat(lngPt.toFixed(5)) });
    }
    return {
      success: false,
      points,
      distanceKm: parseFloat(dist.toFixed(2)),
      etaMinutes: eta,
    };
  }
}
