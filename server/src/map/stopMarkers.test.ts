import { buildStopMarkersScript } from './stopMarkers';

describe('stop marker script', () => {
  test('renders only meaningful live map stops and never raw GPS breadcrumbs', () => {
    const script = buildStopMarkersScript();

    expect(script).toContain('updateStopMarkers');
    expect(script).toContain('stopMarkers');
    expect(script).toContain('LIVE_STOP_MARKER_MIN_DURATION_MS = 5 * 60 * 1000');
    expect(script).toContain('meaningfulStops = report.stops.filter');
    expect(script).toContain('Number(stop.durationMs || 0) >= LIVE_STOP_MARKER_MIN_DURATION_MS');
    expect(script).not.toContain('rawGpsMarkers');
    expect(script).not.toContain('historyPointMarkers');
  });

  test('renders numbered stop badges with clear popup labels', () => {
    const script = buildStopMarkersScript();

    expect(script).toContain('L.divIcon');
    expect(script).toContain('live-stop-marker');
    expect(script).toContain("'<strong>Stop ' + (displayIndex + 1) + '</strong>'");
    expect(script).toContain("'<br>Duration: ' + escapeText(formatDuration(stop.durationMs))");
    expect(script).toContain("'<br>Start: ' + escapeText(formatClock(stop.startTime))");
    expect(script).toContain("'<br>End: ' + escapeText(stop.endTime ? formatClock(stop.endTime) : 'Still stopped')");
  });

  test('supports show stops toggle without changing route rendering', () => {
    const script = buildStopMarkersScript();

    expect(script).toContain('let showStopMarkers = true');
    expect(script).toContain('function toggleStopMarkers()');
    expect(script).toContain('function updateStopToggleButton()');
    expect(script).toContain('window.toggleStopMarkers = toggleStopMarkers');
    expect(script).toContain('buildTripReport');
    expect(script).toContain('forceLiveMapMode');
    expect(script).toContain('splitFactoryTrips(reportPoints)');
    expect(script).not.toContain('historyLines');
    expect(script).not.toContain('historyLineCasings');
  });
});
