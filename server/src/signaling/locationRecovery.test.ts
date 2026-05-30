import fs from 'fs';
import path from 'path';

describe('location recovery after server restart', () => {
  const socketHandlerSource = fs.readFileSync(path.join(__dirname, 'socketHandler.ts'), 'utf8');
  const signalingClientSource = fs.readFileSync(
    path.join(__dirname, '..', '..', '..', 'android', 'app', 'src', 'main', 'java', 'com', 'factorytalk', 'app', 'data', 'remote', 'SignalingClient.kt'),
    'utf8'
  );
  const foregroundServiceSource = fs.readFileSync(
    path.join(__dirname, '..', '..', '..', 'android', 'app', 'src', 'main', 'java', 'com', 'factorytalk', 'app', 'service', 'TalkForegroundService.kt'),
    'utf8'
  );

  test('server asks connected phones to resend location snapshots', () => {
    expect(socketHandlerSource).toContain("socket.emit('request_location_update'");
    expect(socketHandlerSource).toContain("io.emit('request_location_update'");
    expect(socketHandlerSource).toContain('LOCATION_RECOVERY_REQUEST_INTERVAL_MS = 15_000');
    expect(socketHandlerSource).toContain('function requestLocationRecovery(io: Server)');
  });

  test('android service sends a location heartbeat when server requests recovery', () => {
    expect(signalingClientSource).toContain('on("request_location_update")');
    expect(signalingClientSource).toContain('SignalingEvent.LocationUpdateRequested');
    expect(foregroundServiceSource).toContain('SignalingEvent.LocationUpdateRequested');
    expect(foregroundServiceSource).toContain('sendLastKnownLocation(allowStaleHeartbeat = true)');
  });
});
