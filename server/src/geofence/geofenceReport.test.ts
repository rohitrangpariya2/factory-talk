import { buildGeofenceDailyReport } from './geofenceReport';

describe('geofence daily report', () => {
  test('pairs EXIT to ENTRY events and calculates daily summary', () => {
    const base = new Date(2026, 5, 2, 9, 0, 0).getTime();
    const report = buildGeofenceDailyReport([
      {
        id: '1',
        userId: 'driver-1',
        name: 'Mayur',
        eventType: 'EXIT',
        timestamp: base,
        distanceFromFactoryMeters: 130
      },
      {
        id: '2',
        userId: 'driver-1',
        name: 'Mayur',
        eventType: 'ENTRY',
        timestamp: base + 60 * 60 * 1000,
        distanceFromFactoryMeters: 40
      },
      {
        id: '3',
        userId: 'driver-1',
        name: 'Mayur',
        eventType: 'EXIT',
        timestamp: base + 2 * 60 * 60 * 1000,
        distanceFromFactoryMeters: 150
      },
      {
        id: '4',
        userId: 'driver-1',
        name: 'Mayur',
        eventType: 'ENTRY',
        timestamp: base + 3 * 60 * 60 * 1000,
        distanceFromFactoryMeters: 35
      }
    ]);

    expect(report.totalTrips).toBe(2);
    expect(report.totalTimeOutsideMs).toBe(2 * 60 * 60 * 1000);
    expect(report.firstExitAt).toBe(base);
    expect(report.lastReturnAt).toBe(base + 3 * 60 * 60 * 1000);
    expect(report.trips[0].durationOutsideMs).toBe(60 * 60 * 1000);
  });

  test('keeps open outside trip when no return event exists yet', () => {
    const base = new Date(2026, 5, 2, 9, 0, 0).getTime();
    const report = buildGeofenceDailyReport([
      {
        id: '1',
        userId: 'driver-1',
        name: 'Mayur',
        eventType: 'EXIT',
        timestamp: base,
        distanceFromFactoryMeters: 130
      }
    ], base + 30 * 60 * 1000);

    expect(report.totalTrips).toBe(1);
    expect(report.trips[0].entryAt).toBeUndefined();
    expect(report.trips[0].durationOutsideMs).toBe(30 * 60 * 1000);
  });
});
