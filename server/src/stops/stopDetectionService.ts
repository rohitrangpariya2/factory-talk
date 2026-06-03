import { UserRole } from '../types';

export type StopLocation = {
  userId: string;
  name: string;
  role: UserRole;
  latitude: number;
  longitude: number;
  accuracy?: number;
  locationUpdatedAt: number;
};

export type StopEvent = {
  id?: string;
  userId: string;
  name: string;
  startTime: number;
  endTime: number;
  durationMs: number;
  latitude: number;
  longitude: number;
  address?: string;
};

type StopState = {
  anchor: StopLocation;
  lastInside: StopLocation;
  active: boolean;
  pendingEndStartedAt?: number;
};

const STOP_RADIUS_METERS = 30;
const STOP_MIN_DURATION_MS = 5 * 60 * 1000;
const STOP_END_RADIUS_METERS = 45;
const STOP_END_CONFIRMATION_MS = 30_000;
const MAX_ACCURACY_METERS = 100;
const states = new Map<string, StopState>();

export function evaluateStopTransition(location: StopLocation): StopEvent | null {
  if (!isTrustedFix(location)) return null;

  const state = states.get(location.userId);
  if (!state) {
    states.set(location.userId, {
      anchor: location,
      lastInside: location,
      active: false
    });
    return null;
  }

  const distanceFromAnchor = distanceMeters(
    state.anchor.latitude,
    state.anchor.longitude,
    location.latitude,
    location.longitude
  );

  if (distanceFromAnchor <= STOP_RADIUS_METERS) {
    state.lastInside = location;
    state.pendingEndStartedAt = undefined;
    if (!state.active && location.locationUpdatedAt - state.anchor.locationUpdatedAt > STOP_MIN_DURATION_MS) {
      state.active = true;
    }
    return null;
  }

  if (!state.active) {
    states.set(location.userId, {
      anchor: location,
      lastInside: location,
      active: false
    });
    return null;
  }

  if (distanceFromAnchor <= STOP_END_RADIUS_METERS) {
    state.pendingEndStartedAt = undefined;
    return null;
  }

  if (!state.pendingEndStartedAt) {
    state.pendingEndStartedAt = location.locationUpdatedAt;
    return null;
  }

  if (location.locationUpdatedAt - state.pendingEndStartedAt < STOP_END_CONFIRMATION_MS) return null;

  const stop = buildStopEvent(state);
  states.set(location.userId, {
    anchor: location,
    lastInside: location,
    active: false
  });
  return stop;
}

export function resetStopDetectionState(): void {
  states.clear();
}

export function recoverStopDetectionStateFromHistory(history: StopLocation[]): void {
  history
    .filter(isTrustedFix)
    .slice()
    .sort((left, right) => left.locationUpdatedAt - right.locationUpdatedAt)
    .forEach((location) => {
      evaluateStopTransition(location);
    });
}

function buildStopEvent(state: StopState): StopEvent {
  const startTime = state.anchor.locationUpdatedAt;
  const endTime = state.lastInside.locationUpdatedAt;
  return {
    userId: state.anchor.userId,
    name: state.anchor.name,
    startTime,
    endTime,
    durationMs: Math.max(0, endTime - startTime),
    latitude: state.anchor.latitude,
    longitude: state.anchor.longitude
  };
}

function isTrustedFix(location: StopLocation): boolean {
  const accuracy = Number(location.accuracy || 0);
  if (accuracy && accuracy > MAX_ACCURACY_METERS) return false;
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
