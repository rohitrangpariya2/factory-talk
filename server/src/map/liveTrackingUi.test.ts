import fs from 'fs';
import path from 'path';

describe('live tracking map presentation', () => {
  const indexSource = fs.readFileSync(path.join(__dirname, '..', 'index.ts'), 'utf8');

  test('uses a large vehicle marker with label and live pulse', () => {
    expect(indexSource).toContain('vehicle-marker');
    expect(indexSource).toContain('vehicle-pulse');
    expect(indexSource).toContain('driver-label');
    expect(indexSource).toContain('makeIcon(location, status)');
    expect(indexSource).toContain('iconSize: [72, 64]');
  });

  test('rotates vehicle marker with smoothed reliable bearing only', () => {
    expect(indexSource).toContain('markerBearings');
    expect(indexSource).toContain('markerPositions');
    expect(indexSource).toContain('function smoothBearing');
    expect(indexSource).toContain('function reliableBearing');
    expect(indexSource).toContain('function movementBearing');
    expect(indexSource).toContain('rotate(');
    expect(indexSource).toContain('vehicle-body hidden-bearing');
  });

  test('uses an arrow vehicle marker for direction', () => {
    expect(indexSource).toContain('vehicle-arrow');
    expect(indexSource).toContain('vehicle-cabin');
    expect(indexSource).toContain('vehicle-tail');
  });

  test('uses a delivery scooter marker body with high contrast state colors', () => {
    expect(indexSource).toContain('function markerVisualState');
    expect(indexSource).toContain('vehicle-cargo');
    expect(indexSource).toContain('vehicle-handlebar');
    expect(indexSource).toContain('vehicle-wheel back');
    expect(indexSource).toContain('vehicle-wheel front');
    expect(indexSource).toContain('--vehicle-accent');
    expect(indexSource).toContain('--vehicle-glow');
    expect(indexSource).toContain("live.className === 'moving'");
    expect(indexSource).toContain("live.className === 'stopped'");
    expect(indexSource).toContain("live.className === 'stale'");
    expect(indexSource).toContain("live.className === 'offline'");
  });

  test('adds follow live controls with manual map pause and resume', () => {
    expect(indexSource).toContain('id="followLiveButton"');
    expect(indexSource).toContain('function setFollowLive');
    expect(indexSource).toContain('function pauseFollowLive');
    expect(indexSource).toContain('function followSelectedDriver');
    expect(indexSource).toContain("map.on('dragstart'");
    expect(indexSource).toContain("map.on('zoomstart'");
  });

  test('renders live route as a thick cased professional line', () => {
    expect(indexSource).toContain('historyLineCasings');
    expect(indexSource).toContain('LIVE_TRAIL_OUTLINE_COLOR');
    expect(indexSource).toContain('weight: 8');
    expect(indexSource).toContain('weight: 5');
    expect(indexSource).not.toContain("dashArray: '2 8'");
  });

  test('forces 12-hour AM PM time formatting in the web map', () => {
    expect(indexSource).toContain('hour12: true');
    expect(indexSource).toContain("hourCycle: 'h12'");
  });
});
