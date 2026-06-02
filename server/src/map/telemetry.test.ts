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

  test('contains call blink style rules and UI indicators', () => {
    expect(indexSource).toContain('.call-blink {');
    expect(indexSource).toContain('class="call-blink"');
    expect(indexSource).toContain('On Call');
  });

  test('contains motion speed indicators for stationary, moving, driving, and stale states', () => {
    expect(indexSource).toContain('.motion-badge {');
    expect(indexSource).toContain('function motionStatusFor');
    expect(indexSource).toContain('function recentMovementSpeed');
    expect(indexSource).toContain('MOTION_STATIONARY_CONFIRM_MS = 60 * 1000');
    expect(indexSource).toContain('Stationary');
    expect(indexSource).toContain('GPS stale');
    expect(indexSource).toContain('Moving');
    expect(indexSource).toContain('Driving');
    expect(indexSource).toContain('km/h');
  });
});
