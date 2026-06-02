import { buildStopSummary } from './stopReport';

describe('stop report summary', () => {
  test('calculates total stops, total stopped time, and longest stop', () => {
    const summary = buildStopSummary([
      {
        userId: 'driver-1',
        name: 'Mayur',
        startTime: 1_700_000_000_000,
        endTime: 1_700_000_360_000,
        durationMs: 360_000,
        latitude: 21,
        longitude: 72
      },
      {
        userId: 'driver-1',
        name: 'Mayur',
        startTime: 1_700_001_000_000,
        endTime: 1_700_001_900_000,
        durationMs: 900_000,
        latitude: 21.001,
        longitude: 72
      }
    ]);

    expect(summary.totalStops).toBe(2);
    expect(summary.totalStoppedTimeMs).toBe(1_260_000);
    expect(summary.longestStopMs).toBe(900_000);
  });
});
