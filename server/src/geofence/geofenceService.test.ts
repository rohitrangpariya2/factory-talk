import { evaluateGeofenceTransition, recoverGeofenceStateFromHistory, resetGeofenceState } from './geofenceService';
import { GeofenceConfig } from './geofenceConfigService';
import { UserRole } from '../types';

const config: GeofenceConfig = {
  latitude: 21,
  longitude: 72,
  radiusMeters: 100,
  bufferMeters: 20,
  confirmationMs: 30_000,
  maxAccuracyMeters: 100
};

function location(distanceNorthMeters: number, locationUpdatedAt: number, accuracy = 12) {
  return {
    userId: 'driver-1',
    name: 'Mayur',
    role: UserRole.WORKER,
    latitude: 21 + distanceNorthMeters / 111_320,
    longitude: 72,
    accuracy,
    locationUpdatedAt
  };
}

describe('geofence state machine', () => {
  beforeEach(() => resetGeofenceState());

  test('confirms exit only after user remains outside radius plus buffer', () => {
    expect(evaluateGeofenceTransition(location(0, 1_000), config)).toBeNull();
    expect(evaluateGeofenceTransition(location(140, 10_000), config)).toBeNull();

    const event = evaluateGeofenceTransition(location(145, 41_000), config);

    expect(event?.eventType).toBe('EXIT');
    expect(event?.userId).toBe('driver-1');
    expect(event?.name).toBe('Mayur');
    expect(event?.distanceFromFactoryMeters).toBeGreaterThan(120);
  });

  test('confirms entry only after user remains inside radius minus buffer', () => {
    evaluateGeofenceTransition(location(0, 1_000), config);
    evaluateGeofenceTransition(location(140, 10_000), config);
    evaluateGeofenceTransition(location(145, 41_000), config);

    expect(evaluateGeofenceTransition(location(60, 50_000), config)).toBeNull();
    const event = evaluateGeofenceTransition(location(55, 82_000), config);

    expect(event?.eventType).toBe('ENTRY');
    expect(event?.distanceFromFactoryMeters).toBeLessThan(80);
  });

  test('prevents duplicate alerts while user remains outside', () => {
    evaluateGeofenceTransition(location(0, 1_000), config);
    evaluateGeofenceTransition(location(140, 10_000), config);
    const exit = evaluateGeofenceTransition(location(145, 41_000), config);
    const duplicate = evaluateGeofenceTransition(location(150, 80_000), config);

    expect(exit?.eventType).toBe('EXIT');
    expect(duplicate).toBeNull();
  });

  test('ignores low accuracy fixes to prevent drift alerts', () => {
    evaluateGeofenceTransition(location(0, 1_000), config);
    evaluateGeofenceTransition(location(160, 10_000, 180), config);
    const event = evaluateGeofenceTransition(location(170, 50_000, 180), config);

    expect(event).toBeNull();
  });

  test('recovers pending exit confirmation after restart from recent accepted history', () => {
    recoverGeofenceStateFromHistory([
      location(0, 1_000),
      location(140, 10_000)
    ], config);

    const event = evaluateGeofenceTransition(location(145, 41_000), config);

    expect(event?.eventType).toBe('EXIT');
    expect(event?.timestamp).toBe(41_000);
  });

  test('recovers outside presence after restart without duplicate exit alerts', () => {
    recoverGeofenceStateFromHistory([
      location(0, 1_000),
      location(140, 10_000),
      location(145, 41_000)
    ], config);

    const duplicate = evaluateGeofenceTransition(location(150, 80_000), config);
    const pendingEntry = evaluateGeofenceTransition(location(55, 112_000), config);
    const entry = evaluateGeofenceTransition(location(55, 143_000), config);

    expect(duplicate).toBeNull();
    expect(pendingEntry).toBeNull();
    expect(entry?.eventType).toBe('ENTRY');
  });
});
