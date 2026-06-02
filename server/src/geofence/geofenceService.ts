import { UserRole } from '../types';
import { GeofenceConfig } from './geofenceConfigService';

export type GeofenceEventType = 'ENTRY' | 'EXIT';

export type GeofenceLocation = {
  userId: string;
  name: string;
  role: UserRole;
  latitude: number;
  longitude: number;
  accuracy?: number;
  locationUpdatedAt: number;
};

export type GeofenceEvent = {
  id?: string;
  userId: string;
  name: string;
  eventType: GeofenceEventType;
  timestamp: number;
  distanceFromFactoryMeters: number;
};

type GeofencePresence = 'inside' | 'outside';

type UserGeofenceState = {
  presence: GeofencePresence;
  pending?: {
    eventType: GeofenceEventType;
    startedAt: number;
  };
};

const states = new Map<string, UserGeofenceState>();

export function evaluateGeofenceTransition(
  location: GeofenceLocation,
  config: GeofenceConfig
): GeofenceEvent | null {
  if (!isTrustedFix(location, config)) return null;

  const distanceFromFactoryMeters = distanceMeters(
    location.latitude,
    location.longitude,
    config.latitude,
    config.longitude
  );
  const previous = states.get(location.userId);
  const currentPresence = previous?.presence || (
    distanceFromFactoryMeters <= config.radiusMeters ? 'inside' : 'outside'
  );
  const nextPresence = classifiedPresence(distanceFromFactoryMeters, currentPresence, config);

  if (!previous) {
    states.set(location.userId, { presence: nextPresence });
    return null;
  }

  if (currentPresence === 'inside' && nextPresence === 'outside') {
    return confirmTransition(location, config, previous, 'EXIT', distanceFromFactoryMeters);
  }

  if (currentPresence === 'outside' && nextPresence === 'inside') {
    return confirmTransition(location, config, previous, 'ENTRY', distanceFromFactoryMeters);
  }

  previous.pending = undefined;
  previous.presence = currentPresence;
  return null;
}

export function resetGeofenceState(): void {
  states.clear();
}

function confirmTransition(
  location: GeofenceLocation,
  config: GeofenceConfig,
  state: UserGeofenceState,
  eventType: GeofenceEventType,
  distanceFromFactoryMeters: number
): GeofenceEvent | null {
  const timestamp = Number(location.locationUpdatedAt || 0);
  if (!state.pending || state.pending.eventType !== eventType) {
    state.pending = { eventType, startedAt: timestamp };
    return null;
  }

  if (timestamp - state.pending.startedAt < config.confirmationMs) return null;

  state.presence = eventType === 'EXIT' ? 'outside' : 'inside';
  state.pending = undefined;
  return {
    userId: location.userId,
    name: location.name,
    eventType,
    timestamp,
    distanceFromFactoryMeters
  };
}

function classifiedPresence(
  distanceFromFactoryMeters: number,
  currentPresence: GeofencePresence,
  config: GeofenceConfig
): GeofencePresence {
  if (currentPresence === 'inside' && distanceFromFactoryMeters > config.radiusMeters + config.bufferMeters) {
    return 'outside';
  }
  if (currentPresence === 'outside' && distanceFromFactoryMeters < config.radiusMeters - config.bufferMeters) {
    return 'inside';
  }
  return currentPresence;
}

function isTrustedFix(location: GeofenceLocation, config: GeofenceConfig): boolean {
  const accuracy = Number(location.accuracy || 0);
  if (accuracy && accuracy > config.maxAccuracyMeters) return false;
  return Number.isFinite(Number(location.latitude)) &&
    Number.isFinite(Number(location.longitude)) &&
    Number.isFinite(Number(location.locationUpdatedAt));
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
