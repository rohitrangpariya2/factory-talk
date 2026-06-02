import { db } from '../config/firebase';
import { StopEvent } from './stopDetectionService';

export type PersistedStopEvent = Required<Pick<StopEvent, 'id'>> & StopEvent & {
  createdAt: number;
};

export async function persistStopEvent(stop: StopEvent): Promise<PersistedStopEvent> {
  const createdAt = Date.now();
  const ref = db
    .collection('stopEvents')
    .doc(stop.userId)
    .collection('events')
    .doc(`${stop.startTime}-${stop.endTime}`);
  const persisted: PersistedStopEvent = {
    ...stop,
    id: ref.id,
    createdAt
  };
  await ref.set(persisted);
  return persisted;
}

export async function getStopEventsForRange(
  userId: string,
  startMs: number,
  endMs: number
): Promise<PersistedStopEvent[]> {
  const snapshot = await db
    .collection('stopEvents')
    .doc(userId)
    .collection('events')
    .where('startTime', '>=', startMs)
    .where('startTime', '<', endMs)
    .orderBy('startTime', 'asc')
    .get();

  return snapshot.docs.map((doc) => doc.data() as PersistedStopEvent);
}
