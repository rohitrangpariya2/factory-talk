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
    expect(indexSource).toContain('function smoothBearing');
    expect(indexSource).toContain('function reliableBearing');
    expect(indexSource).toContain('rotate(');
    expect(indexSource).toContain('vehicle-body hidden-bearing');
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
