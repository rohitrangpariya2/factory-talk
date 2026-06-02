import { UserRole } from '../types';
import { evaluateStopTransition, resetStopDetectionState } from './stopDetectionService';

function point(offsetMs: number, northMeters: number, accuracy = 12) {
  return {
    userId: 'driver-1',
    name: 'Mayur',
    role: UserRole.WORKER,
    latitude: 21 + northMeters / 111_320,
    longitude: 72,
    accuracy,
    locationUpdatedAt: 1_700_000_000_000 + offsetMs
  };
}

describe('stop detection state machine', () => {
  beforeEach(() => resetStopDetectionState());

  test('persists completed stop after user remains within 30 meters for more than 5 minutes', () => {
    expect(evaluateStopTransition(point(0, 0))).toBeNull();
    expect(evaluateStopTransition(point(2 * 60 * 1000, 8))).toBeNull();
    expect(evaluateStopTransition(point(6 * 60 * 1000, 12))).toBeNull();
    expect(evaluateStopTransition(point(7 * 60 * 1000, 50))).toBeNull();

    const stop = evaluateStopTransition(point(8 * 60 * 1000, 55));

    expect(stop?.userId).toBe('driver-1');
    expect(stop?.name).toBe('Mayur');
    expect(stop?.startTime).toBe(1_700_000_000_000);
    expect(stop?.endTime).toBe(1_700_000_000_000 + 6 * 60 * 1000);
    expect(stop?.durationMs).toBe(6 * 60 * 1000);
    expect(stop?.latitude).toBeCloseTo(21, 5);
    expect(stop?.longitude).toBe(72);
  });

  test('ignores low accuracy points', () => {
    expect(evaluateStopTransition(point(0, 0, 150))).toBeNull();
    expect(evaluateStopTransition(point(6 * 60 * 1000, 5, 150))).toBeNull();
    expect(evaluateStopTransition(point(8 * 60 * 1000, 60))).toBeNull();
  });

  test('prevents GPS drift false stop when points jump away from anchor', () => {
    expect(evaluateStopTransition(point(0, 0))).toBeNull();
    expect(evaluateStopTransition(point(2 * 60 * 1000, 8))).toBeNull();
    expect(evaluateStopTransition(point(4 * 60 * 1000, 140))).toBeNull();
    expect(evaluateStopTransition(point(8 * 60 * 1000, 145))).toBeNull();

    const stop = evaluateStopTransition(point(10 * 60 * 1000, 200));

    expect(stop).toBeNull();
  });

  test('does not end stop until movement beyond 45 meters is confirmed', () => {
    evaluateStopTransition(point(0, 0));
    evaluateStopTransition(point(6 * 60 * 1000, 10));

    expect(evaluateStopTransition(point(7 * 60 * 1000, 50))).toBeNull();
    const stop = evaluateStopTransition(point(7 * 60 * 1000 + 31_000, 52));

    expect(stop?.durationMs).toBe(6 * 60 * 1000);
  });
});
