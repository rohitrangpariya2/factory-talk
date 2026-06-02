import { classifyMotionStatus, MotionPoint } from './motionStatus';

const baseTime = 1_700_000_000_000;

function point(offsetMs: number, latitudeOffsetMeters: number, speedKmh?: number): MotionPoint {
  return {
    latitude: latitudeOffsetMeters / 111_320,
    longitude: 0,
    locationUpdatedAt: baseTime + offsetMs,
    speedKmh
  };
}

describe('motion status classification', () => {
  test('uses reliable speed to show moving', () => {
    const status = classifyMotionStatus(point(0, 0, 24), [], baseTime);

    expect(status.state).toBe('moving');
    expect(status.speedKmh).toBe(24);
  });

  test('falls back to recent accepted point movement when speed is missing', () => {
    const history = [
      point(0, 0),
      point(30_000, 30)
    ];

    const status = classifyMotionStatus(point(45_000, 48), history, baseTime + 45_000);

    expect(status.state).toBe('moving');
    expect(status.speedKmh).toBeGreaterThan(3);
  });

  test('does not show stationary until user has not moved meaningfully for 60 seconds', () => {
    const earlyStatus = classifyMotionStatus(point(45_000, 2), [point(0, 0)], baseTime + 45_000);
    const confirmedStatus = classifyMotionStatus(
      point(75_000, 4),
      [point(0, 0), point(30_000, 3)],
      baseTime + 75_000
    );

    expect(earlyStatus.state).toBe('unknown');
    expect(confirmedStatus.state).toBe('stationary');
  });

  test('shows GPS stale after five minutes without a fresh accepted update', () => {
    const status = classifyMotionStatus(point(0, 0, 25), [], baseTime + 5 * 60 * 1000 + 1);

    expect(status.state).toBe('gps_stale');
    expect(status.label).toBe('GPS stale');
  });

  test('ignores impossible movement fallback jumps', () => {
    const status = classifyMotionStatus(
      point(10_000, 2_000),
      [point(0, 0)],
      baseTime + 10_000
    );

    expect(status.state).not.toBe('moving');
  });
});
