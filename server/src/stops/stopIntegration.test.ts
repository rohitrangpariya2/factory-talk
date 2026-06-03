import fs from 'fs';
import path from 'path';
import { buildDeliveryHistoryReport, deliveryHistoryReportToCsv } from '../deliveryHistory/report';
import { UserRole } from '../types';

describe('stop integration with delivery history', () => {
  const dashboardSource = fs.readFileSync(path.join(__dirname, '..', 'deliveryHistory', 'dashboard.ts'), 'utf8');
  const indexSource = fs.readFileSync(path.join(__dirname, '..', 'index.ts'), 'utf8');
  const socketSource = fs.readFileSync(path.join(__dirname, '..', 'signaling', 'socketHandler.ts'), 'utf8');

  test('delivery report includes stops and stop summary', () => {
    const report = buildDeliveryHistoryReport([], '2026-06-02', undefined, [
      {
        userId: 'driver-1',
        name: 'Mayur',
        startTime: 1_700_000_000_000,
        endTime: 1_700_000_360_000,
        durationMs: 360_000,
        latitude: 21,
        longitude: 72
      }
    ]);

    expect(report.stops).toHaveLength(1);
    expect(report.stopSummary.totalStops).toBe(1);
    expect(report.stopSummary.totalStoppedTimeMs).toBe(360_000);
  });

  test('csv export includes stop summary columns', () => {
    const csv = deliveryHistoryReportToCsv({
      date: '2026-06-02',
      userId: 'driver-1',
      name: 'Mayur',
      pointCount: 0,
      rejectedPointCount: 0,
      dailyDistanceMeters: 0,
      rawGpsDistanceMeters: 0,
      distanceSource: 'raw_gps',
      movingTimeMs: 0,
      stoppedTimeMs: 0,
      routeReplay: [],
      stops: [],
      stopSummary: {
        totalStops: 2,
        totalStoppedTimeMs: 900_000,
        longestStopMs: 600_000
      },
      distanceDiagnostics: {
        totalReceivedPoints: 0,
        acceptedPoints: 0,
        rejectedPointCount: 0,
        rejectedByReason: {
          invalidCoordinate: 0,
          poorAccuracy: 0,
          badTimestamp: 0,
          impossibleJump: 0
        },
        rawGpsDistanceMeters: 0,
        pointTimeGapsMs: [],
        accuracyMeters: {}
      }
    });

    expect(csv).toContain('totalStops,totalStoppedTime,longestStop');
    expect(csv).toContain('2,00:15:00,00:10:00');
  });

  test('dashboard renders stop summary cards and replay markers', () => {
    expect(dashboardSource).toContain('stopSummary');
    expect(dashboardSource).toContain('Total stops');
    expect(dashboardSource).toContain('Longest stop');
    expect(dashboardSource).toContain('drawStopMarkers');
    expect(dashboardSource).toContain('stop-marker');
  });

  test('report API reads stop events and passes them into delivery report', () => {
    expect(indexSource).toContain('getStopEventsForRange');
    expect(indexSource).toContain('const factoryZone = await getGeofenceConfig()');
    expect(indexSource).toContain('buildDeliveryReportWithRoadDistance(history, range.date, factoryZone, stops)');
  });

  test('stop detection runs only after accepted GPS stream succeeds', () => {
    expect(socketSource).toContain('evaluateStopTransition(trackedLocation');
    expect(socketSource).toContain('persistStopEvent');
    expect(socketSource.indexOf('buildAcceptedLocation')).toBeLessThan(socketSource.indexOf('evaluateStopTransition(trackedLocation'));
  });

  test('restores stop detection state from saved accepted GPS before live processing', () => {
    expect(socketSource).toContain('recoverStopDetectionStateFromHistory');
    expect(socketSource).toContain('recoverTrackingStateForUser');
    expect(socketSource.indexOf('await recoverTrackingStateForUser')).toBeLessThan(socketSource.indexOf('evaluateStopTransition(trackedLocation'));
  });
});
