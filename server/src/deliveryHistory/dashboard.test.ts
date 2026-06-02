import { buildDeliveryHistoryDashboardHtml } from './dashboard';
import fs from 'fs';
import path from 'path';

describe('delivery history dashboard route', () => {
  const indexSource = fs.readFileSync(path.join(__dirname, '..', 'index.ts'), 'utf8');

  test('registers dashboard report and export routes', () => {
    expect(indexSource).toContain("app.get('/delivery-history'");
    expect(indexSource).toContain("app.get('/delivery-history/report'");
    expect(indexSource).toContain("app.get('/delivery-history/export'");
  });

  test('renders user/date filters replay map export controls and cleanup warning', () => {
    const html = buildDeliveryHistoryDashboardHtml();

    expect(html).toContain('Delivery History Dashboard');
    expect(html).toContain('id="userFilter"');
    expect(html).toContain('id="dateFilter"');
    expect(html).toContain('id="replayButton"');
    expect(html).toContain('Export CSV');
    expect(html).toContain('Old reports may be unavailable if location history was cleaned.');
    expect(html).toContain('No history available for selected user/date.');
    expect(html).toContain('getTimezoneOffset');
    expect(html).toContain('/delivery-history/report');
    expect(html).toContain('/delivery-history/export');
    expect(html).toContain('loadReport();');
  });

  test('uses shared road matching for route display and replay fallback', () => {
    const html = buildDeliveryHistoryDashboardHtml();

    expect(html).toContain('/road-match');
    expect(html).toContain('async function matchHistoryRoute(points)');
    expect(html).toContain('matchedRouteReplay');
    expect(html).toContain("method: 'POST'");
    expect(html).toContain('drawRoute(report.routeReplay || []);');
    expect(html).toContain('const points = currentReport.matchedRouteReplay || currentReport.routeReplay;');
  });
});
