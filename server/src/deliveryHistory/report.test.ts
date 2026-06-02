import { FACTORY_ZONE } from '../map/factoryZone';
import { UserRole } from '../types';
import { buildDeliveryHistoryReport, deliveryHistoryReportToCsv, parseDeliveryHistoryDateRange } from './report';

const baseTime = new Date(2026, 5, 2, 9, 0, 0, 0).getTime();

function point(offsetMs: number, latitude: number, longitude: number) {
  return {
    userId: 'driver-1',
    name: 'Delivery Boy',
    role: UserRole.WORKER,
    latitude,
    longitude,
    accuracy: 12,
    locationUpdatedAt: baseTime + offsetMs
  };
}

describe('delivery history report', () => {
  test('calculates distance, moving time, stopped time, departure, return, and replay points', () => {
    const points = [
      point(0, FACTORY_ZONE.latitude, FACTORY_ZONE.longitude),
      point(5 * 60 * 1000, FACTORY_ZONE.latitude + 0.001, FACTORY_ZONE.longitude),
      point(10 * 60 * 1000, FACTORY_ZONE.latitude + 0.002, FACTORY_ZONE.longitude),
      point(15 * 60 * 1000, FACTORY_ZONE.latitude + 0.00201, FACTORY_ZONE.longitude),
      point(20 * 60 * 1000, FACTORY_ZONE.latitude + 0.00202, FACTORY_ZONE.longitude),
      point(25 * 60 * 1000, FACTORY_ZONE.latitude + 0.001, FACTORY_ZONE.longitude),
      point(30 * 60 * 1000, FACTORY_ZONE.latitude, FACTORY_ZONE.longitude),
      point(32 * 60 * 1000, FACTORY_ZONE.latitude, FACTORY_ZONE.longitude)
    ];

    const report = buildDeliveryHistoryReport(points, '2026-06-02');

    expect(report.userId).toBe('driver-1');
    expect(report.pointCount).toBe(8);
    expect(report.dailyDistanceMeters).toBeGreaterThan(400);
    expect(report.movingTimeMs).toBe(20 * 60 * 1000);
    expect(report.stoppedTimeMs).toBe(12 * 60 * 1000);
    expect(report.firstDepartureAt).toBe(baseTime + 5 * 60 * 1000);
    expect(report.returnToFactoryAt).toBe(baseTime + 32 * 60 * 1000);
    expect(report.routeReplay.length).toBeGreaterThanOrEqual(2);
  });

  test('filters noisy jump and poor accuracy points before calculating report', () => {
    const points = [
      point(0, FACTORY_ZONE.latitude, FACTORY_ZONE.longitude),
      point(5 * 60 * 1000, FACTORY_ZONE.latitude + 0.001, FACTORY_ZONE.longitude),
      {
        ...point(6 * 60 * 1000, FACTORY_ZONE.latitude + 1, FACTORY_ZONE.longitude + 1),
        accuracy: 5
      },
      {
        ...point(7 * 60 * 1000, FACTORY_ZONE.latitude + 0.0011, FACTORY_ZONE.longitude),
        accuracy: 250
      },
      point(10 * 60 * 1000, FACTORY_ZONE.latitude + 0.002, FACTORY_ZONE.longitude)
    ];

    const report = buildDeliveryHistoryReport(points, '2026-06-02');

    expect(report.pointCount).toBe(3);
    expect(report.rejectedPointCount).toBe(2);
    expect(report.dailyDistanceMeters).toBeLessThan(350);
  });

  test('exports daily report as csv', () => {
    const report = buildDeliveryHistoryReport([
      point(0, FACTORY_ZONE.latitude, FACTORY_ZONE.longitude),
      point(5 * 60 * 1000, FACTORY_ZONE.latitude + 0.001, FACTORY_ZONE.longitude)
    ], '2026-06-02');

    const csv = deliveryHistoryReportToCsv(report);

    expect(csv).toContain('date,userId,name,dailyDistanceKm,movingTime,stoppedTime,firstDeparture,returnToFactory,totalStops,totalStoppedTime,longestStop,pointCount,rejectedPointCount');
    expect(csv).toContain('2026-06-02,driver-1,Delivery Boy');
  });

  test('parses selected date as a local day range', () => {
    const range = parseDeliveryHistoryDateRange('2026-06-02');

    expect(range.date).toBe('2026-06-02');
    expect(range.endMs - range.startMs).toBe(24 * 60 * 60 * 1000);
  });

  test('parses selected date using browser timezone offset when provided', () => {
    const range = parseDeliveryHistoryDateRange('2026-06-02', -330);

    expect(new Date(range.startMs).toISOString()).toBe('2026-06-01T18:30:00.000Z');
    expect(new Date(range.endMs).toISOString()).toBe('2026-06-02T18:30:00.000Z');
  });
});
