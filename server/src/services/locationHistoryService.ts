import { db } from '../config/firebase';
import { UserRole } from '../types';

type PersistableLocation = {
  userId: string;
  name: string;
  role: UserRole;
  latitude: number;
  longitude: number;
  accuracy?: number;
  isBusy?: boolean;
  receivedAt?: number;
  locationUpdatedAt: number;
};

type PersistedLocation = PersistableLocation & {
  createdAt: number;
};

const MIN_SAVE_INTERVAL_MS = 30_000;
const MIN_SAVE_DISTANCE_METERS = 50;
const lastPersistedByUser = new Map<string, PersistableLocation>();

export async function persistLocationHistory(location: PersistableLocation): Promise<void> {
  const previous = lastPersistedByUser.get(location.userId);
  if (previous && !shouldPersistLocation(previous, location)) return;

  lastPersistedByUser.set(location.userId, location);

  const point: PersistedLocation = {
    ...location,
    createdAt: Date.now()
  };

  await db
    .collection('locationHistory')
    .doc(location.userId)
    .collection('points')
    .doc(`${location.locationUpdatedAt}-${point.createdAt}`)
    .set(point);
}

export async function getSavedLocationHistory(userId: string, limit = 300): Promise<PersistedLocation[]> {
  const cleanLimit = Math.max(1, Math.min(limit, 500));
  const snapshot = await db
    .collection('locationHistory')
    .doc(userId)
    .collection('points')
    .orderBy('locationUpdatedAt', 'desc')
    .limit(cleanLimit)
    .get();

  return snapshot.docs
    .map((doc) => doc.data() as PersistedLocation)
    .reverse();
}

function shouldPersistLocation(previous: PersistableLocation, next: PersistableLocation): boolean {
  const elapsedMs = next.locationUpdatedAt - previous.locationUpdatedAt;
  if (elapsedMs >= MIN_SAVE_INTERVAL_MS) return true;
  return distanceMeters(previous.latitude, previous.longitude, next.latitude, next.longitude) >= MIN_SAVE_DISTANCE_METERS;
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
