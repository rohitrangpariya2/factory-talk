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
  speedKmh?: number;
  isCallActive?: boolean;
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

  // Only fetch today's points (from midnight onwards)
  const todayMidnightMs = getTodayMidnightMs();

  const snapshot = await db
    .collection('locationHistory')
    .doc(userId)
    .collection('points')
    .where('locationUpdatedAt', '>=', todayMidnightMs)
    .orderBy('locationUpdatedAt', 'desc')
    .limit(cleanLimit)
    .get();

  return snapshot.docs
    .map((doc) => doc.data() as PersistedLocation)
    .reverse();
}

/**
 * Deletes all persisted location history older than today's local midnight.
 * Uses Firestore collectionGroup to scan all users' points in one query.
 * Runs in batches of 400 to stay under Firestore's 500-write-per-batch limit.
 */
export async function cleanupOldLocationHistory(): Promise<void> {
  const todayMidnightMs = getTodayMidnightMs();
  console.log(`[LocationCleanup] Deleting history older than ${new Date(todayMidnightMs).toISOString()} ...`);

  try {
    let totalDeleted = 0;

    // Keep deleting in pages until none remain
    while (true) {
      const snapshot = await db
        .collectionGroup('points')
        .where('locationUpdatedAt', '<', todayMidnightMs)
        .limit(400)
        .get();

      if (snapshot.empty) break;

      const batch = db.batch();
      snapshot.docs.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();

      totalDeleted += snapshot.docs.length;
      console.log(`[LocationCleanup] Deleted ${snapshot.docs.length} old points (total: ${totalDeleted})`);

      if (snapshot.docs.length < 400) break;
    }

    console.log(`[LocationCleanup] Done. Total deleted: ${totalDeleted} old location points.`);
  } catch (error) {
    console.error('[LocationCleanup] Failed to clean up old history:', error);
  }
}

/**
 * Schedules a daily automatic cleanup at midnight every day.
 * Also fires once immediately on server startup to clear any leftover old data.
 */
export function scheduleLocationHistoryCleanup(): void {
  // Run once on startup
  cleanupOldLocationHistory().catch((err) =>
    console.error('[LocationCleanup] Startup cleanup error:', err)
  );

  // Schedule nightly at midnight
  function scheduleNextMidnight() {
    const msUntilMidnight = getTodayMidnightMs() + 24 * 60 * 60 * 1000 - Date.now();
    setTimeout(() => {
      cleanupOldLocationHistory().catch((err) =>
        console.error('[LocationCleanup] Midnight cleanup error:', err)
      );
      scheduleNextMidnight();
    }, msUntilMidnight);
    console.log(`[LocationCleanup] Next cleanup in ${Math.round(msUntilMidnight / 3600000)} hr.`);
  }

  scheduleNextMidnight();
}

function getTodayMidnightMs(): number {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).getTime();
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
