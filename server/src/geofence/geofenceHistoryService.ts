import { db } from '../config/firebase';
import { GeofenceEvent } from './geofenceService';

export type PersistedGeofenceEvent = Required<Pick<GeofenceEvent, 'id'>> & GeofenceEvent & {
  createdAt: number;
};

export async function persistGeofenceEvent(event: GeofenceEvent): Promise<PersistedGeofenceEvent> {
  const createdAt = Date.now();
  const ref = db
    .collection('geofenceEvents')
    .doc(event.userId)
    .collection('events')
    .doc(`${event.timestamp}-${event.eventType}`);
  const persisted: PersistedGeofenceEvent = {
    ...event,
    id: ref.id,
    createdAt
  };
  await ref.set(persisted);
  return persisted;
}

export async function getGeofenceEventsForRange(
  startMs: number,
  endMs: number,
  userId?: string
): Promise<PersistedGeofenceEvent[]> {
  if (userId) {
    const snapshot = await db
      .collection('geofenceEvents')
      .doc(userId)
      .collection('events')
      .where('timestamp', '>=', startMs)
      .where('timestamp', '<', endMs)
      .orderBy('timestamp', 'asc')
      .get();
    return snapshot.docs.map((doc) => doc.data() as PersistedGeofenceEvent);
  }

  const snapshot = await db
    .collectionGroup('events')
    .where('timestamp', '>=', startMs)
    .where('timestamp', '<', endMs)
    .orderBy('timestamp', 'asc')
    .get();
  return snapshot.docs.map((doc) => doc.data() as PersistedGeofenceEvent);
}
