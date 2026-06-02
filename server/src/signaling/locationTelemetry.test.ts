import { buildAcceptedLocation } from './locationTelemetry';
import { UserRole } from '../types';

const basePayload = {
  userId: 'driver-1',
  name: 'Delivery Boy',
  role: UserRole.WORKER,
  latitude: 21.1702,
  longitude: 72.8311,
  accuracy: 12,
  isBusy: false,
  receivedAt: 1_700_000_000_000,
  locationUpdatedAt: 1_700_000_000_000
};

describe('location telemetry normalization', () => {
  test('rejects impossible client speed and falls back to recent accepted points', () => {
    const previous = {
      ...basePayload,
      longitude: 72.8311,
      locationUpdatedAt: 1_700_000_000_000
    };

    const accepted = buildAcceptedLocation(
      {
        ...basePayload,
        longitude: 72.83155,
        locationUpdatedAt: 1_700_000_018_000
      },
      previous,
      320
    );

    expect(accepted.speedKmh).toBeGreaterThan(8);
    expect(accepted.speedKmh).toBeLessThan(14);
  });

  test('clears speed when the GPS fix is stale', () => {
    const accepted = buildAcceptedLocation(
      {
        ...basePayload,
        receivedAt: 1_700_000_180_000,
        locationUpdatedAt: 1_700_000_000_000
      },
      undefined,
      30
    );

    expect(accepted.speedKmh).toBeUndefined();
  });

  test('keeps plausible fresh GPS speed when no fallback point exists', () => {
    const accepted = buildAcceptedLocation(basePayload, undefined, 18.4);

    expect(accepted.speedKmh).toBeCloseTo(18.4, 1);
  });

  test('keeps normalized bearing when confidence is good', () => {
    const accepted = buildAcceptedLocation(basePayload, undefined, 18.4, 361.5, 12);

    expect(accepted.bearing).toBeCloseTo(1.5, 1);
    expect(accepted.bearingAccuracyDegrees).toBe(12);
  });

  test('hides bearing when confidence is low', () => {
    const accepted = buildAcceptedLocation(basePayload, undefined, 18.4, 92, 75);

    expect(accepted.bearing).toBeUndefined();
    expect(accepted.bearingAccuracyDegrees).toBeUndefined();
  });

  test('hides bearing when fix is stale', () => {
    const accepted = buildAcceptedLocation(
      {
        ...basePayload,
        receivedAt: 1_700_000_180_000,
        locationUpdatedAt: 1_700_000_000_000
      },
      undefined,
      18.4,
      92,
      12
    );

    expect(accepted.bearing).toBeUndefined();
    expect(accepted.bearingAccuracyDegrees).toBeUndefined();
  });

  test('hides bearing when bearing or accuracy is invalid', () => {
    const nanBearing = buildAcceptedLocation(basePayload, undefined, 18.4, Number.NaN, 12);
    const negativeAccuracy = buildAcceptedLocation(basePayload, undefined, 18.4, 92, -1);

    expect(nanBearing.bearing).toBeUndefined();
    expect(nanBearing.bearingAccuracyDegrees).toBeUndefined();
    expect(negativeAccuracy.bearing).toBeUndefined();
    expect(negativeAccuracy.bearingAccuracyDegrees).toBeUndefined();
  });
});
