import fs from 'fs';
import path from 'path';
import { buildGeofenceHistoryDashboardHtml } from './geofenceDashboard';

describe('geofence routes and live alert UI', () => {
  const indexSource = fs.readFileSync(path.join(__dirname, '..', 'index.ts'), 'utf8');
  const socketSource = fs.readFileSync(path.join(__dirname, '..', 'signaling', 'socketHandler.ts'), 'utf8');

  test('registers geofence history and config APIs', () => {
    expect(indexSource).toContain("app.get('/geofence-history'");
    expect(indexSource).toContain("app.get('/geofence-history/events'");
    expect(indexSource).toContain("app.get('/geofence-config'");
    expect(indexSource).toContain("app.post('/geofence-config'");
  });

  test('renders geofence history dashboard with daily summary fields', () => {
    const html = buildGeofenceHistoryDashboardHtml();

    expect(html).toContain('Geofence History');
    expect(html).toContain('First exit');
    expect(html).toContain('Last return');
    expect(html).toContain('Total trips');
    expect(html).toContain('Total time outside');
    expect(html).toContain('/geofence-history/events');
  });

  test('emits geofence_event after accepted live location succeeds', () => {
    expect(socketSource).toContain('evaluateGeofenceTransition(trackedLocation');
    expect(socketSource).toContain("io.emit('geofence_event'");
    expect(socketSource.indexOf('buildAcceptedLocation')).toBeLessThan(socketSource.indexOf('evaluateGeofenceTransition(trackedLocation'));
  });

  test('live map displays geofence event notifications', () => {
    expect(indexSource).toContain("socket.on('geofence_event'");
    expect(indexSource).toContain('function showGeofenceEvent');
    expect(indexSource).toContain('returned to factory');
    expect(indexSource).toContain('exited factory');
  });
});
