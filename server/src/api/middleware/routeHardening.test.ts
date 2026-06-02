import fs from 'fs';
import path from 'path';
import { buildGeofenceHistoryDashboardHtml } from '../../geofence/geofenceDashboard';

describe('minimal production route hardening', () => {
  const indexSource = fs.readFileSync(path.join(__dirname, '..', '..', 'index.ts'), 'utf8');

  test('adds rate limiting to road and geofence config endpoints only', () => {
    expect(indexSource).toContain("app.get('/road-route', roadProxyRateLimiter,");
    expect(indexSource).toContain("app.get('/road-match', roadProxyRateLimiter, roadMatchHandler)");
    expect(indexSource).toContain("app.post('/road-match', roadProxyRateLimiter, roadMatchHandler)");
    expect(indexSource).toContain("app.get('/geofence-config', geofenceConfigRateLimiter,");
    expect(indexSource).toContain("app.post('/geofence-config', geofenceConfigRateLimiter,");
  });

  test('requires admin secret only for geofence config writes', () => {
    expect(indexSource).toContain('requireAdminSecretMiddleware(() => env.adminSecret)');
    expect(indexSource).toContain("app.post('/geofence-config', geofenceConfigRateLimiter, requireAdminSecret");
    expect(indexSource).not.toContain("app.get('/geofence-config', geofenceConfigRateLimiter, requireAdminSecret");
  });

  test('geofence dashboard sends x-admin-secret header for config saves', () => {
    const html = buildGeofenceHistoryDashboardHtml();

    expect(html).toContain('id="adminSecretInput"');
    expect(html).toContain("'x-admin-secret': adminSecret");
    expect(html).toContain('ADMIN_SECRET');
  });
});
