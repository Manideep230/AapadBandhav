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
}
