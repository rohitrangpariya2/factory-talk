import { buildStopMarkersScript } from './stopMarkers';

describe('stop marker script', () => {
  test('renders red markers for detected route stops', () => {
    const script = buildStopMarkersScript();

    expect(script).toContain('updateStopMarkers');
    expect(script).toContain('stopMarkers');
    expect(script).toContain("fillColor: '#ef4444'");
    expect(script).toContain('buildTripReport');
    expect(script).toContain('forceLiveMapMode');
    expect(script).toContain('splitFactoryTrips(reportPoints)');
    expect(script).toContain('1 min thi vadhu');
  });
});
