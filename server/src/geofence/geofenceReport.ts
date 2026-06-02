import { GeofenceEvent } from './geofenceService';

export type GeofenceTrip = {
  userId: string;
  name: string;
  exitAt: number;
  entryAt?: number;
  durationOutsideMs: number;
  exitDistanceFromFactoryMeters: number;
  entryDistanceFromFactoryMeters?: number;
};

export type GeofenceDailyReport = {
  firstExitAt?: number;
  lastReturnAt?: number;
  totalTrips: number;
  totalTimeOutsideMs: number;
  trips: GeofenceTrip[];
};

export function buildGeofenceDailyReport(
  events: GeofenceEvent[],
  now = Date.now()
): GeofenceDailyReport {
  const sorted = events
    .slice()
    .sort((a, b) => Number(a.timestamp || 0) - Number(b.timestamp || 0));
  const trips: GeofenceTrip[] = [];
  let openTrip: GeofenceTrip | undefined;

  for (const event of sorted) {
    if (event.eventType === 'EXIT') {
      if (!openTrip) {
        openTrip = {
          userId: event.userId,
          name: event.name,
          exitAt: event.timestamp,
          durationOutsideMs: 0,
          exitDistanceFromFactoryMeters: event.distanceFromFactoryMeters
        };
      }
      continue;
    }

    if (event.eventType === 'ENTRY' && openTrip) {
      openTrip.entryAt = event.timestamp;
      openTrip.entryDistanceFromFactoryMeters = event.distanceFromFactoryMeters;
      openTrip.durationOutsideMs = Math.max(0, event.timestamp - openTrip.exitAt);
      trips.push(openTrip);
      openTrip = undefined;
    }
  }

  if (openTrip) {
    openTrip.durationOutsideMs = Math.max(0, now - openTrip.exitAt);
    trips.push(openTrip);
  }

  return {
    firstExitAt: trips[0]?.exitAt,
    lastReturnAt: [...trips].reverse().find((trip) => trip.entryAt)?.entryAt,
    totalTrips: trips.length,
    totalTimeOutsideMs: trips.reduce((sum, trip) => sum + trip.durationOutsideMs, 0),
    trips
  };
}
