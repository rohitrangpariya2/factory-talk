const OSRM_MATCH_BASE_URL = 'https://router.project-osrm.org/match/v1/driving/';
export const MAX_ROAD_MATCH_POINTS = 60;
const MAX_ROAD_MATCH_ACCURACY_METERS = 50;
const MIN_ROAD_MATCH_DISTANCE_METERS = 10;
const MAX_ROAD_MATCH_SPEED_KMH = 95;
const MAX_OSRM_RADIUS_METERS = 50;
const MIN_OSRM_RADIUS_METERS = 5;

export type RoadMatchInputPoint = {
  latitude?: number;
  longitude?: number;
  timestamp?: number | string;
  locationUpdatedAt?: number | string;
  accuracy?: number | string;
};

export type PreparedRoadMatchPoint = {
  latitude: number;
  longitude: number;
  timestamp: number | undefined;
  accuracy: number | undefined;
};

export type RoadMatchCoordinate = {
  latitude: number;
  longitude: number;
};

export type RoadMatchResult = {
  status: 'matched' | 'fallback';
  coordinates: RoadMatchCoordinate[];
  distanceMeters: number;
  reason?: string;
};

export function distanceMeters(a: RoadMatchCoordinate, b: RoadMatchCoordinate): number {
  const earthRadiusMeters = 6371000;
  const dLat = (b.latitude - a.latitude) * Math.PI / 180;
  const dLng = (b.longitude - a.longitude) * Math.PI / 180;
  const lat1 = a.latitude * Math.PI / 180;
  const lat2 = b.latitude * Math.PI / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function coordinateDistanceMeters(points: RoadMatchCoordinate[]): number {
  let distance = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    distance += distanceMeters(points[index], points[index + 1]);
  }
  return distance;
}

function normalizeTimestamp(value: number | string | undefined): number | undefined {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return undefined;
  return numeric < 100000000000 ? Math.round(numeric * 1000) : Math.round(numeric);
}

function normalizeAccuracy(value: number | string | undefined): number | undefined {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return undefined;
  return Math.round(Math.max(MIN_OSRM_RADIUS_METERS, Math.min(MAX_OSRM_RADIUS_METERS, numeric)));
}

export function prepareRoadMatchPoints(points: RoadMatchInputPoint[]): PreparedRoadMatchPoint[] {
  const sorted = points
    .map((point) => {
      const latitude = Number(point.latitude);
      const longitude = Number(point.longitude);
      const accuracy = normalizeAccuracy(point.accuracy);
      const timestamp = normalizeTimestamp(point.timestamp ?? point.locationUpdatedAt);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
      if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
      if (accuracy !== undefined && accuracy > MAX_ROAD_MATCH_ACCURACY_METERS) return null;
      return { latitude, longitude, timestamp, accuracy };
    })
    .filter((point): point is PreparedRoadMatchPoint => point !== null)
    .sort((a, b) => Number(a.timestamp || 0) - Number(b.timestamp || 0));

  const distinct: PreparedRoadMatchPoint[] = [];
  sorted.forEach((point) => {
    const last = distinct[distinct.length - 1];
    if (!last) {
      distinct.push(point);
      return;
    }

    const distance = distanceMeters(last, point);
    if (distance < MIN_ROAD_MATCH_DISTANCE_METERS) return;

    if (last.timestamp && point.timestamp) {
      const deltaMs = point.timestamp - last.timestamp;
      if (deltaMs <= 0) return;
      const speedKmh = (distance / 1000) / (deltaMs / 3600000);
      if (speedKmh > MAX_ROAD_MATCH_SPEED_KMH) return;
    }

    distinct.push(point);
  });

  if (distinct.length <= MAX_ROAD_MATCH_POINTS) return distinct;

  const sampled: PreparedRoadMatchPoint[] = [];
  for (let index = 0; index < MAX_ROAD_MATCH_POINTS; index += 1) {
    const sourceIndex = Math.round(index * (distinct.length - 1) / (MAX_ROAD_MATCH_POINTS - 1));
    const point = distinct[sourceIndex];
    if (sampled[sampled.length - 1] !== point) sampled.push(point);
  }
  return sampled;
}

export function buildOsrmMatchUrl(points: PreparedRoadMatchPoint[]): string {
  const coordinates = points
    .map((point) => `${point.longitude.toFixed(6)},${point.latitude.toFixed(6)}`)
    .join(';');
  const params = new URLSearchParams({
    overview: 'full',
    geometries: 'geojson',
    steps: 'false',
    annotations: 'false',
    gaps: 'split'
  });
  if (points.every((point) => point.timestamp)) {
    params.set('timestamps', points.map((point) => Math.round(Number(point.timestamp) / 1000)).join(';'));
  }
  if (points.some((point) => point.accuracy)) {
    params.set('radiuses', points.map((point) => String(point.accuracy || 25)).join(';'));
  }
  return `${OSRM_MATCH_BASE_URL}${coordinates}?${params.toString()}`;
}

export function parseOsrmMatchResponse(data: unknown): RoadMatchCoordinate[] {
  const body = data as {
    code?: string;
    matchings?: Array<{ geometry?: { coordinates?: unknown } }>;
  };
  if (!body || body.code !== 'Ok' || !Array.isArray(body.matchings)) return [];

  return body.matchings
    .flatMap((matching) => Array.isArray(matching.geometry?.coordinates) ? matching.geometry.coordinates : [])
    .map((coordinate) => {
      const pair = coordinate as unknown[];
      return {
        latitude: Number(pair[1]),
        longitude: Number(pair[0])
      };
    })
    .filter((coordinate) => Number.isFinite(coordinate.latitude) && Number.isFinite(coordinate.longitude));
}

export function buildRoadMatchFallback(points: PreparedRoadMatchPoint[], reason: string): RoadMatchResult {
  const coordinates = points.map((point) => ({
    latitude: point.latitude,
    longitude: point.longitude
  }));
  return {
    status: 'fallback',
    reason,
    distanceMeters: coordinateDistanceMeters(coordinates),
    coordinates
  };
}

export function roadMatchCacheKey(points: PreparedRoadMatchPoint[]): string {
  return points
    .map((point) => [
      point.longitude.toFixed(5),
      point.latitude.toFixed(5),
      point.timestamp ? Math.round(point.timestamp / 10000) : '',
      point.accuracy || ''
    ].join(','))
    .join(';');
}
