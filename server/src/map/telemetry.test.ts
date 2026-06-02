import fs from 'fs';
import path from 'path';

describe('factory telemetry map script', () => {
  const indexSource = fs.readFileSync(path.join(__dirname, '..', 'index.ts'), 'utf8');
  const handlerSource = fs.readFileSync(path.join(__dirname, '..', 'signaling', 'socketHandler.ts'), 'utf8');

  test('parses call status and speed payload in websocket events', () => {
    expect(handlerSource).toContain('speedKmh = payload?.speedKmh');
    expect(handlerSource).toContain('bearing = payload?.bearing');
    expect(handlerSource).toContain('bearingAccuracyDegrees = payload?.bearingAccuracyDegrees');
    expect(handlerSource).toContain('isCallActive = payload?.isCallActive');
    expect(handlerSource).toContain('buildAcceptedLocation');
    expect(handlerSource).toContain('classifyMotionStatus(trackedLocation');
    expect(handlerSource).toContain('isCallActive');
  });

  test('renders the delivery status card instead of the old motion badge design', () => {
    expect(indexSource).toContain('.delivery-status-card');
    expect(indexSource).toContain('function deliveryStatusCardHtml');
    expect(indexSource).toContain('function deliveryLiveStatus');
    expect(indexSource).toContain('function buildTodayDeliverySummary');
    expect(indexSource).toContain('deliveryStatusCardHtml(location, lastHistoryPoints, false)');
    expect(indexSource).toContain('deliveryStatusCardHtml(location, historyPoints || [], true)');
    expect(indexSource).not.toContain('.motion-badge {');
    expect(indexSource).not.toContain('function motionBadgeHtml');
    expect(indexSource).not.toContain('class="call-blink"');
  });

  test('contains delivery card states and summary fields', () => {
    expect(indexSource).toContain('function motionStatusFor');
    expect(indexSource).toContain('function recentMovementSpeed');
    expect(indexSource).toContain('MOTION_STATIONARY_CONFIRM_MS = 60 * 1000');
    expect(indexSource).toContain('Stopped');
    expect(indexSource).toContain('GPS stale');
    expect(indexSource).toContain('Moving');
    expect(indexSource).toContain('Offline');
    expect(indexSource).toContain('Inside factory');
    expect(indexSource).toContain('Outside factory');
    expect(indexSource).toContain('Current speed');
    expect(indexSource).toContain('const fallbackSpeed = Number(location.motionStatus && location.motionStatus.speedKmh)');
    expect(indexSource).toContain("location.motionStatus.state === 'moving'");
    expect(indexSource).toContain('Trip status');
    expect(indexSource).toContain('Today km');
    expect(indexSource).toContain('Trip time');
    expect(indexSource).toContain('Stops');
    expect(indexSource).toContain('-- km/h');
    expect(indexSource).toContain('km/h');
  });

  test('current speed prefers validated speed then moving fallback speed', () => {
    expect(indexSource).toContain("if (Number.isFinite(speed) && speed >= 0) return Math.round(speed) + ' km/h';");
    expect(indexSource).toContain("return Math.round(fallbackSpeed) + ' km/h';");
    expect(indexSource).toContain("return '-- km/h';");
  });

  test('factory badge uses the shared dynamic factory zone config', () => {
    expect(indexSource).toContain('function factoryStatus(location)');
    expect(indexSource).toContain('return isInsideFactoryZone(location)');
    expect(indexSource).toContain('function isInsideFactoryZone(point)');
    expect(indexSource).toContain('factoryZone.radiusMeters');
    expect(indexSource).toContain('${buildFactoryZoneScript()}');
  });
});
