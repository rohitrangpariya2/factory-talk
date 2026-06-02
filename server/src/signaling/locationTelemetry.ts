import { UserRole } from '../types';

export type AcceptedLocation = {
  userId: string;
  name: string;
  role: UserRole;
  latitude: number;
  longitude: number;
  accuracy?: number;
  isBusy?: boolean;
  receivedAt?: number;
  locationUpdatedAt: number;
  speedKmh?: number;
  bearing?: number;
  bearingAccuracyDegrees?: number;
  isCallActive?: boolean;
  isOnline?: boolean;
};

const MAX_TRUSTED_CLIENT_SPEED_KMH = 130;
const MAX_FALLBACK_SPEED_KMH = 140;
const MAX_SPEED_FIX_AGE_MS = 120_000;
const MIN_FALLBACK_INTERVAL_MS = 5_000;
const MAX_FALLBACK_INTERVAL_MS = 5 * 60 * 1000;
const MIN_FALLBACK_DISTANCE_METERS = 3;
const MAX_SPEED_ACCURACY_METERS = 100;
const MAX_BEARING_FIX_AGE_MS = 120_000;
const MAX_BEARING_ACCURACY_DEGREES = 45;

export function buildAcceptedLocation(
  location: AcceptedLocation,
  previous?: AcceptedLocation,
  clientSpeedKmh?: number,
  clientBearing?: number,
  clientBearingAccuracyDegrees?: number
): AcceptedLocation {
  const isStale = Number(location.receivedAt || 0) - Number(location.locationUpdatedAt || 0) > MAX_SPEED_FIX_AGE_MS;
  const speedKmh = isStale
    ? undefined
    : normalizeSpeed(location, previous, clientSpeedKmh);
  const bearing = normalizeBearing(location, clientBearing, clientBearingAccuracyDegrees);
  const bearingAccuracyDegrees = bearing === undefined ? undefined : Number(clientBearingAccuracyDegrees);

  return {
    ...location,
    speedKmh,
    bearing,
    bearingAccuracyDegrees
  };
}

function normalizeSpeed(
  location: AcceptedLocation,
  previous?: AcceptedLocation,
  clientSpeedKmh?: number
): number | undefined {
  if (isPlausibleClientSpeed(clientSpeedKmh)) {
    return Number(clientSpeedKmh);
  }
  return fallbackSpeedKmh(previous, location);
}

function isPlausibleClientSpeed(speedKmh?: number): boolean {
  return Number.isFinite(speedKmh) &&
    Number(speedKmh) >= 0 &&
    Number(speedKmh) <= MAX_TRUSTED_CLIENT_SPEED_KMH;
}

function normalizeBearing(
  location: AcceptedLocation,
  bearing?: number,
  bearingAccuracyDegrees?: number
): number | undefined {
  const fixAgeMs = Number(location.receivedAt || 0) - Number(location.locationUpdatedAt || 0);
  if (fixAgeMs > MAX_BEARING_FIX_AGE_MS) return undefined;
  if (!Number.isFinite(bearing)) return undefined;
  if (!Number.isFinite(bearingAccuracyDegrees)) return undefined;
  if (Number(bearingAccuracyDegrees) < 0 || Number(bearingAccuracyDegrees) > MAX_BEARING_ACCURACY_DEGREES) return undefined;

  const normalized = Number(bearing) % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

function fallbackSpeedKmh(previous: AcceptedLocation | undefined, next: AcceptedLocation): number | undefined {
  if (!previous) return undefined;
  const accuracy = Number(next.accuracy || 0);
  if (accuracy > MAX_SPEED_ACCURACY_METERS) return undefined;

  const elapsedMs = Number(next.locationUpdatedAt || 0) - Number(previous.locationUpdatedAt || 0);
  if (elapsedMs < MIN_FALLBACK_INTERVAL_MS || elapsedMs > MAX_FALLBACK_INTERVAL_MS) return undefined;

  const distance = distanceMeters(previous.latitude, previous.longitude, next.latitude, next.longitude);
  if (distance < MIN_FALLBACK_DISTANCE_METERS) return 0;

  const speed = (distance / 1000) / (elapsedMs / 3600000);
  if (!Number.isFinite(speed) || speed < 0 || speed > MAX_FALLBACK_SPEED_KMH) return undefined;
  return speed;
}

function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const earthRadiusMeters = 6_371_000;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}
