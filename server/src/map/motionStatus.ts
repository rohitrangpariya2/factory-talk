export type MotionPoint = {
  latitude: number;
  longitude: number;
  locationUpdatedAt: number;
  speedKmh?: number;
};

export type MotionStatus = {
  state: 'moving' | 'stationary' | 'gps_stale' | 'unknown';
  label: string;
  speedKmh?: number;
};

const GPS_STALE_MS = 5 * 60 * 1000;
const STATIONARY_CONFIRM_MS = 60 * 1000;
const MOVING_SPEED_KMH = 3;
const MEANINGFUL_MOVE_METERS = 15;
const RECENT_MOVEMENT_WINDOW_MS = 90 * 1000;
const MIN_MOVEMENT_INTERVAL_MS = 5 * 1000;
const MAX_REASONABLE_MOVEMENT_SPEED_KMH = 140;

export function classifyMotionStatus(
  location: MotionPoint,
  historyPoints: MotionPoint[] = [],
  now = Date.now()
): MotionStatus {
  const locationTime = Number(location.locationUpdatedAt || 0);
  if (!Number.isFinite(locationTime) || locationTime <= 0) {
    return { state: 'unknown', label: 'Live GPS' };
  }

  if (now - locationTime > GPS_STALE_MS) {
    return { state: 'gps_stale', label: 'GPS stale' };
  }

  const speed = Number(location.speedKmh);
  if (Number.isFinite(speed) && speed >= MOVING_SPEED_KMH) {
    return { state: 'moving', label: 'Moving', speedKmh: speed };
  }

  const points = recentAcceptedPoints(location, historyPoints);
  const movementSpeed = movementSpeedFromRecentPoints(points);
  if (movementSpeed !== undefined) {
    return { state: 'moving', label: 'Moving', speedKmh: movementSpeed };
  }

  if (hasStationaryConfirmation(points, locationTime)) {
    return { state: 'stationary', label: 'Stationary' };
  }

  return { state: 'unknown', label: 'Live GPS' };
}

function recentAcceptedPoints(location: MotionPoint, historyPoints: MotionPoint[]): MotionPoint[] {
  const locationTime = Number(location.locationUpdatedAt || 0);
  const seen = new Set<string>();
  return historyPoints
    .concat(location)
    .filter((point) => {
      const timestamp = Number(point.locationUpdatedAt || 0);
      const latitude = Number(point.latitude);
      const longitude = Number(point.longitude);
      return Number.isFinite(timestamp) &&
        Number.isFinite(latitude) &&
        Number.isFinite(longitude) &&
        timestamp <= locationTime &&
        timestamp >= locationTime - RECENT_MOVEMENT_WINDOW_MS;
    })
    .sort((a, b) => Number(a.locationUpdatedAt || 0) - Number(b.locationUpdatedAt || 0))
    .filter((point) => {
      const key = [
        Math.round(Number(point.latitude) * 100000),
        Math.round(Number(point.longitude) * 100000),
        Number(point.locationUpdatedAt || 0)
      ].join(':');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(-3);
}

function movementSpeedFromRecentPoints(points: MotionPoint[]): number | undefined {
  const latest = points[points.length - 1];
  if (!latest) return undefined;

  for (let index = points.length - 2; index >= 0; index -= 1) {
    const previous = points[index];
    const elapsedMs = Number(latest.locationUpdatedAt || 0) - Number(previous.locationUpdatedAt || 0);
    if (elapsedMs < MIN_MOVEMENT_INTERVAL_MS || elapsedMs > RECENT_MOVEMENT_WINDOW_MS) continue;

    const distance = distanceMeters(previous, latest);
    if (distance < MEANINGFUL_MOVE_METERS) continue;

    const speed = (distance / 1000) / (elapsedMs / 3600000);
    if (!Number.isFinite(speed) || speed <= 0 || speed > MAX_REASONABLE_MOVEMENT_SPEED_KMH) continue;
    return speed;
  }

  return undefined;
}

function hasStationaryConfirmation(points: MotionPoint[], locationTime: number): boolean {
  if (points.length < 2) return false;
  const earliest = points[0];
  const earliestTime = Number(earliest.locationUpdatedAt || 0);
  if (locationTime - earliestTime < STATIONARY_CONFIRM_MS) return false;

  return points.every((point) => distanceMeters(earliest, point) < MEANINGFUL_MOVE_METERS);
}

function distanceMeters(a: MotionPoint, b: MotionPoint): number {
  const earthRadiusMeters = 6_371_000;
  const dLat = toRadians(Number(b.latitude) - Number(a.latitude));
  const dLon = toRadians(Number(b.longitude) - Number(a.longitude));
  const lat1 = toRadians(Number(a.latitude));
  const lat2 = toRadians(Number(b.latitude));
  const value =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function toRadians(degrees: number): number {
  return degrees * Math.PI / 180;
}
