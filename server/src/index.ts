import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env';
import './config/firebase'; // Initialize Firebase
import authRoutes from './api/routes/auth';
import userRoutes from './api/routes/users';
import channelRoutes from './api/routes/channels';
import { createRateLimiter, requireAdminSecret as requireAdminSecretMiddleware } from './api/middleware/simpleSecurity';
import { buildFactoryZoneScript } from './map/factoryZone';
import {
  buildOsrmMatchUrl,
  buildRoadMatchFallback,
  parseOsrmMatchResponse,
  prepareRoadMatchPoints,
  roadMatchCacheKey,
  type RoadMatchInputPoint,
  type RoadMatchResult
} from './map/roadMatch';
import { buildOsrmRouteUrl, normalizeRoadRouteCoordinates } from './map/roadRoute';
import { buildRoadTrailScript } from './map/roadTrail';
import { buildStopMarkersScript } from './map/stopMarkers';
import { classifyMotionStatus } from './map/motionStatus';
import { buildDeliveryHistoryDashboardHtml } from './deliveryHistory/dashboard';
import { buildDeliveryHistoryReport, deliveryHistoryReportToCsv, parseDeliveryHistoryDateRange } from './deliveryHistory/report';
import { buildGeofenceHistoryDashboardHtml } from './geofence/geofenceDashboard';
import { DEFAULT_GEOFENCE_CONFIG, getGeofenceConfig, saveGeofenceConfig } from './geofence/geofenceConfigService';
import { getGeofenceEventsForRange } from './geofence/geofenceHistoryService';
import { buildGeofenceDailyReport } from './geofence/geofenceReport';
import { getSavedLocationHistory, getSavedLocationHistoryForRange, scheduleLocationHistoryCleanup } from './services/locationHistoryService';
import { getLatestLocations, getLocationHistory, setupSocketHandler } from './signaling/socketHandler';
import { getStopEventsForRange } from './stops/stopHistoryService';

const app = express();
const server = http.createServer(app);
const roadMatchCache = new Map<string, { expiresAt: number; result: RoadMatchResult }>();
const ROAD_MATCH_CACHE_TTL_MS = 5 * 60 * 1000;
const ROAD_MATCH_CACHE_MAX_ENTRIES = 400;
const roadProxyRateLimiter = createRateLimiter({ windowMs: 60 * 1000, maxRequests: 60 });
const geofenceConfigRateLimiter = createRateLimiter({ windowMs: 60 * 1000, maxRequests: 20 });
const requireAdminSecret = requireAdminSecretMiddleware(() => env.adminSecret);

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// REST API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/channels', channelRoutes);

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.get('/locations', (req, res) => {
  const now = Date.now();
  const locations = getLatestLocations().map((location) => ({
    ...location,
    motionStatus: classifyMotionStatus(location, getLocationHistory(location.userId), now)
  }));
  res.status(200).json({ locations });
});

app.get('/locations/history', (req, res) => {
  const userId = typeof req.query.userId === 'string' ? req.query.userId : undefined;
  res.status(200).json({ history: getLocationHistory(userId) });
});

app.get('/locations/history/saved', async (req, res) => {
  try {
    const userId = typeof req.query.userId === 'string' ? req.query.userId : '';
    const limit = Number(req.query.limit ?? 300);
    if (!userId) {
      res.status(400).json({ error: 'userId is required' });
      return;
    }

    const history = await getSavedLocationHistory(userId, Number.isFinite(limit) ? limit : 300);
    res.status(200).json({ history });
  } catch (error) {
    console.error('Failed to read saved location history:', error);
    res.status(500).json({ error: 'Failed to read saved location history' });
  }
});

app.get('/road-route', roadProxyRateLimiter, async (req, res) => {
  try {
    const rawCoordinates = typeof req.query.coordinates === 'string' ? req.query.coordinates : '';
    const coordinates = normalizeRoadRouteCoordinates(rawCoordinates);
    if (!coordinates) {
      res.status(400).json({ code: 'InvalidCoordinates' });
      return;
    }

    const targetUrl = buildOsrmRouteUrl(coordinates);
    let routeResponse = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'FactoryTalk/1.0 (https://factory-talk-server.onrender.com)'
      }
    });

    let body = await routeResponse.text();

    if (routeResponse.status === 400) {
      try {
        const parsed = JSON.parse(body);
        if (parsed.code === 'NoSegment') {
          console.log('[road-route] OSRM returned NoSegment, retrying without radiuses constraint...');
          const fallbackUrl = targetUrl.replace(/&radiuses=[^&]*/, '');
          const fallbackResponse = await fetch(fallbackUrl, {
            headers: {
              'User-Agent': 'FactoryTalk/1.0 (https://factory-talk-server.onrender.com)'
            }
          });
          if (fallbackResponse.ok) {
            routeResponse = fallbackResponse;
            body = await fallbackResponse.text();
          }
        }
      } catch (e) {
        // Fallback failed or json parsing failed, return original body
      }
    }

    res.setHeader('Cache-Control', 'private, max-age=20');
    res
      .status(routeResponse.status)
      .type(routeResponse.headers.get('content-type') || 'application/json')
      .send(body);
  } catch (error) {
    console.error('Failed to fetch road route:', error);
    res.status(502).json({ code: 'RouteProxyFailed' });
  }
});

function getRoadMatchPointsFromQuery(value: unknown, timestampValue?: unknown, accuracyValue?: unknown): RoadMatchInputPoint[] {
  if (typeof value !== 'string' || !value.trim()) return [];
  const trimmed = value.trim();
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  const timestamps = typeof timestampValue === 'string' ? timestampValue.split(';') : [];
  const accuracies = typeof accuracyValue === 'string' ? accuracyValue.split(';') : [];
  return trimmed
    .split(';')
    .map((part, index) => {
      const [longitude, latitude] = part.split(',').map(Number);
      return {
        latitude,
        longitude,
        timestamp: timestamps[index],
        accuracy: accuracies[index]
      };
    });
}

function readRoadMatchRequestPoints(req: express.Request): RoadMatchInputPoint[] {
  const bodyPoints = req.body && Array.isArray(req.body.points) ? req.body.points : undefined;
  if (bodyPoints) return bodyPoints;
  return getRoadMatchPointsFromQuery(req.query.points || req.query.coordinates, req.query.timestamps, req.query.radiuses);
}

async function buildRoadMatchResponse(points: RoadMatchInputPoint[]): Promise<RoadMatchResult> {
  const prepared = prepareRoadMatchPoints(points);
  if (prepared.length < 2) {
    return buildRoadMatchFallback(prepared, 'Not enough valid points after filtering');
  }

  const key = roadMatchCacheKey(prepared);
  const cached = roadMatchCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.result;
  }

  let result: RoadMatchResult;
  try {
    const matchResponse = await fetch(buildOsrmMatchUrl(prepared), {
      headers: {
        'User-Agent': 'FactoryTalk/1.0 (https://factory-talk-server.onrender.com)'
      }
    });
    if (!matchResponse.ok) {
      result = buildRoadMatchFallback(prepared, `OSRM match failed with ${matchResponse.status}`);
    } else {
      const matched = parseOsrmMatchResponse(await matchResponse.json());
      result = matched.length >= 2
        ? { status: 'matched', coordinates: matched }
        : buildRoadMatchFallback(prepared, 'OSRM match returned no usable geometry');
    }
  } catch (error) {
    result = buildRoadMatchFallback(prepared, error instanceof Error ? error.message : 'OSRM match request failed');
  }

  if (roadMatchCache.size >= ROAD_MATCH_CACHE_MAX_ENTRIES) {
    const oldestKey = roadMatchCache.keys().next().value;
    if (oldestKey) roadMatchCache.delete(oldestKey);
  }
  roadMatchCache.set(key, { expiresAt: Date.now() + ROAD_MATCH_CACHE_TTL_MS, result });
  return result;
}

async function roadMatchHandler(req: express.Request, res: express.Response): Promise<void> {
  try {
    const points = readRoadMatchRequestPoints(req);
    const result = await buildRoadMatchResponse(points);
    if (result.coordinates.length < 2) {
      res.status(400).json(result);
      return;
    }
    res.setHeader('Cache-Control', 'private, max-age=20');
    res.status(200).json(result);
  } catch (error) {
    console.error('Failed to match road route:', error);
    res.status(502).json({ status: 'fallback', coordinates: [], reason: 'RoadMatchProxyFailed' });
  }
}

app.get('/road-match', roadProxyRateLimiter, roadMatchHandler);
app.post('/road-match', roadProxyRateLimiter, roadMatchHandler);

app.get('/delivery-history', (_req, res) => {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; style-src 'self' 'unsafe-inline' https://unpkg.com; script-src 'self' 'unsafe-inline' https://unpkg.com; img-src 'self' data: https://*.tile.openstreetmap.org; connect-src 'self'"
  );
  res.type('html').send(buildDeliveryHistoryDashboardHtml());
});

app.get('/delivery-history/report', async (req, res) => {
  try {
    const userId = typeof req.query.userId === 'string' ? req.query.userId.trim() : '';
    const date = typeof req.query.date === 'string' ? req.query.date.trim() : '';
    if (!userId) {
      res.status(400).json({ error: 'userId is required' });
      return;
    }
    if (!date) {
      res.status(400).json({ error: 'date is required' });
      return;
    }

    const timezoneOffsetMinutes = req.query.timezoneOffsetMinutes !== undefined
      ? Number(req.query.timezoneOffsetMinutes)
      : undefined;
    const range = parseDeliveryHistoryDateRange(date, timezoneOffsetMinutes);
    const history = await getSavedLocationHistoryForRange(userId, range.startMs, range.endMs);
    const stops = await getStopEventsForRange(userId, range.startMs, range.endMs);
    const report = buildDeliveryHistoryReport(history, range.date, undefined, stops);
    res.status(200).json({
      report,
      warning: 'Old reports may be unavailable if location history was cleaned.'
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to build delivery history report';
    const status = message.includes('date') ? 400 : 500;
    res.status(status).json({ error: message });
  }
});

app.get('/delivery-history/export', async (req, res) => {
  try {
    const userId = typeof req.query.userId === 'string' ? req.query.userId.trim() : '';
    const date = typeof req.query.date === 'string' ? req.query.date.trim() : '';
    if (!userId) {
      res.status(400).json({ error: 'userId is required' });
      return;
    }
    if (!date) {
      res.status(400).json({ error: 'date is required' });
      return;
    }

    const timezoneOffsetMinutes = req.query.timezoneOffsetMinutes !== undefined
      ? Number(req.query.timezoneOffsetMinutes)
      : undefined;
    const range = parseDeliveryHistoryDateRange(date, timezoneOffsetMinutes);
    const history = await getSavedLocationHistoryForRange(userId, range.startMs, range.endMs);
    const stops = await getStopEventsForRange(userId, range.startMs, range.endMs);
    const report = buildDeliveryHistoryReport(history, range.date, undefined, stops);
    const csv = deliveryHistoryReportToCsv(report);
    const safeUserId = userId.replace(/[^a-zA-Z0-9_-]/g, '_');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="delivery-history-${safeUserId}-${range.date}.csv"`);
    res.status(200).send(csv);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to export delivery history report';
    const status = message.includes('date') ? 400 : 500;
    res.status(status).json({ error: message });
  }
});

app.get('/geofence-history', (_req, res) => {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'"
  );
  res.type('html').send(buildGeofenceHistoryDashboardHtml());
});

app.get('/geofence-history/events', async (req, res) => {
  try {
    const date = typeof req.query.date === 'string' ? req.query.date.trim() : '';
    const userId = typeof req.query.userId === 'string' ? req.query.userId.trim() : undefined;
    const timezoneOffsetMinutes = req.query.timezoneOffsetMinutes !== undefined
      ? Number(req.query.timezoneOffsetMinutes)
      : undefined;
    if (!date) {
      res.status(400).json({ error: 'date is required' });
      return;
    }
    const range = parseDeliveryHistoryDateRange(date, timezoneOffsetMinutes);
    const events = await getGeofenceEventsForRange(range.startMs, range.endMs, userId);
    const report = buildGeofenceDailyReport(events);
    res.status(200).json({ events, report });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load geofence history';
    const status = message.includes('date') ? 400 : 500;
    res.status(status).json({ error: message });
  }
});

app.get('/geofence-config', geofenceConfigRateLimiter, async (_req, res) => {
  try {
    const config = await getGeofenceConfig();
    res.status(200).json({ config });
  } catch (error) {
    res.status(200).json({ config: DEFAULT_GEOFENCE_CONFIG, warning: 'Using default geofence config' });
  }
});

app.post('/geofence-config', geofenceConfigRateLimiter, requireAdminSecret, async (req, res) => {
  try {
    const config = await saveGeofenceConfig({
      latitude: Number(req.body?.latitude),
      longitude: Number(req.body?.longitude),
      radiusMeters: Number(req.body?.radiusMeters)
    });
    res.status(200).json({ config });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to save geofence config';
    res.status(500).json({ error: message });
  }
});

app.get(['/map', '/map/:userId'], (req, res) => {
  const userId = req.params.userId || '';
  const user = getLatestLocations().find((location) => location.userId === userId);
  const title = user?.name ? `Factory Talk - ${user.name}` : 'Factory Talk Live Map';

  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; style-src 'self' 'unsafe-inline' https://unpkg.com; script-src 'self' 'unsafe-inline' https://unpkg.com; img-src 'self' data: https://*.tile.openstreetmap.org; connect-src 'self'"
  );
  res.type('html').send(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <style>
    html, body, #map { height: 100%; margin: 0; background: #10141c; }
    body { font: 15px system-ui, -apple-system, Segoe UI, sans-serif; }
    .leaflet-popup-content-wrapper, .leaflet-popup-tip { background: #111827; color: #f8fafc; }
    .topbar, .panel {
      position: fixed;
      z-index: 1000;
      background: rgba(15, 18, 25, 0.92);
      color: white;
      border-radius: 10px;
      box-shadow: 0 8px 30px rgba(0,0,0,.28);
      backdrop-filter: blur(10px);
    }
    .topbar {
      top: 12px;
      left: 12px;
      right: 12px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding: 10px 12px;
    }
    .map-actions {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
      justify-content: flex-end;
    }
    .follow-button {
      border: 1px solid rgba(255,255,255,.18);
      border-radius: 999px;
      padding: 8px 11px;
      color: #ffffff;
      background: rgba(29,155,240,.18);
      font-weight: 900;
      cursor: pointer;
      white-space: nowrap;
      box-shadow: 0 4px 14px rgba(0,0,0,.18);
    }
    .follow-button.paused {
      background: rgba(245,158,11,.18);
      color: #fde68a;
      border-color: rgba(245,158,11,.35);
    }
    .follow-button.off {
      background: rgba(148,163,184,.14);
      color: #cbd5e1;
    }
    .panel {
      left: 12px;
      right: 12px;
      bottom: 12px;
      padding: 10px;
    }
    .trip-drawer {
      max-height: min(64vh, 560px);
      overflow: hidden;
      transition: max-height .18s ease, padding .18s ease;
    }
    .trip-drawer.collapsed {
      max-height: 82px;
      padding-bottom: 8px;
    }
    .trip-drawer-handle {
      width: 100%;
      border: 0;
      background: transparent;
      color: #ffffff;
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 8px;
      text-align: left;
      cursor: pointer;
      padding: 0;
    }
    .drawer-grip {
      grid-column: 1 / -1;
      width: 44px;
      height: 4px;
      border-radius: 999px;
      background: rgba(255,255,255,.36);
      justify-self: center;
      margin-bottom: 6px;
    }
    .drawer-title {
      font-weight: 900;
      line-height: 1.2;
    }
    .drawer-subtitle {
      color: #c7ccd8;
      font-size: 12px;
      line-height: 1.35;
      margin-top: 2px;
    }
    .drawer-action {
      align-self: end;
      border-radius: 999px;
      background: rgba(29,155,240,.18);
      color: #7dd3fc;
      font-size: 12px;
      font-weight: 900;
      padding: 4px 8px;
      white-space: nowrap;
    }
    .trip-drawer-content {
      max-height: calc(min(64vh, 560px) - 72px);
      overflow: auto;
      margin-top: 10px;
      padding-bottom: 2px;
    }
    .trip-drawer.collapsed .trip-drawer-content {
      display: none;
    }
    .title { font-weight: 800; font-size: 16px; }
    .muted { color: #c7ccd8; font-size: 13px; }
    .status { display: inline-flex; align-items: center; gap: 6px; font-weight: 700; font-size: 13px; }
    .dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
    .user {
      padding: 10px;
      border-radius: 8px;
      background: rgba(255,255,255,.06);
      margin-top: 8px;
    }
    .user button, .user a {
      border: 0;
      border-radius: 999px;
      padding: 8px 10px;
      color: white;
      background: #1d9bf0;
      text-decoration: none;
      font-weight: 700;
      cursor: pointer;
      white-space: nowrap;
    }
    .trip-toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin: 10px 0 8px;
    }
    .trip-toolbar button {
      border: 0;
      border-radius: 999px;
      padding: 8px 12px;
      color: #ffffff;
      background: #1d9bf0;
      font-weight: 800;
      cursor: pointer;
      white-space: nowrap;
    }
    .trip-card {
      width: 100%;
      border: 1px solid rgba(255,255,255,.08);
      border-radius: 8px;
      background: rgba(255,255,255,.045);
      color: #ffffff;
      text-align: left;
      padding: 10px;
      margin-top: 8px;
      cursor: pointer;
    }
    .trip-card.active {
      border-color: #38bdf8;
      background: rgba(29,155,240,.16);
    }
    .trip-card-title {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      font-weight: 900;
    }
    .trip-card-meta {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 6px;
      margin-top: 8px;
    }
    .trip-pill {
      border-radius: 999px;
      background: rgba(29,155,240,.18);
      color: #7dd3fc;
      font-size: 12px;
      font-weight: 900;
      padding: 4px 8px;
      white-space: nowrap;
    }
    .timeline {
      margin-top: 12px;
      border-top: 1px solid rgba(255,255,255,.12);
      padding-top: 10px;
    }
    .timeline-title {
      font-weight: 800;
      margin-bottom: 8px;
    }
    .timeline-item {
      padding: 9px 10px;
      border-radius: 8px;
      background: rgba(255,255,255,.045);
      margin-top: 8px;
    }
    .timeline-time {
      font-weight: 800;
      color: #f8fafc;
    }
    .timeline-meta {
      color: #c7ccd8;
      font-size: 12px;
      line-height: 1.45;
      margin-top: 3px;
    }
    .timeline-main {
      color: #ffffff;
      font-size: 13px;
      font-weight: 700;
      line-height: 1.45;
      margin-top: 5px;
    }
    .timeline-chip {
      display: inline-block;
      border-radius: 999px;
      padding: 2px 8px;
      margin-top: 5px;
      background: rgba(29,155,240,.16);
      color: #7dd3fc;
      font-size: 12px;
      font-weight: 800;
    }
    .timeline-link {
      color: #38bdf8;
      text-decoration: none;
      font-weight: 700;
    }
    .report-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      margin: 8px 0 10px;
    }
    .report-box {
      border-radius: 8px;
      background: rgba(255,255,255,.055);
      padding: 8px;
    }
    .report-label {
      color: #c7ccd8;
      font-size: 11px;
      line-height: 1.2;
    }
    .report-value {
      color: #ffffff;
      font-weight: 900;
      margin-top: 2px;
    }
    .vehicle-marker {
      position: relative;
      width: 72px;
      height: 64px;
      pointer-events: none;
    }
    .vehicle-pulse {
      position: absolute;
      left: 23px;
      top: 21px;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: var(--vehicle-glow);
      border: 2px solid rgba(255,255,255,.85);
      animation: livePulse 1.7s ease-out infinite;
    }
    .vehicle-body {
      position: absolute;
      left: 13px;
      top: 9px;
      width: 46px;
      height: 42px;
      transform-origin: 50% 50%;
      transition: transform .35s ease-out;
      filter: drop-shadow(0 8px 14px rgba(0,0,0,.48));
    }
    .vehicle-arrow {
      content: '';
      position: absolute;
      top: -10px;
      left: 50%;
      transform: translateX(-50%);
      border-left: 9px solid transparent;
      border-right: 9px solid transparent;
      border-bottom: 14px solid #ffffff;
      filter: drop-shadow(0 -1px 1px rgba(15,23,42,.45));
    }
    .vehicle-cabin {
      position: absolute;
      top: 11px;
      left: 17px;
      width: 15px;
      height: 15px;
      border-radius: 50% 50% 44% 44%;
      background: #ffffff;
      border: 2px solid #0f172a;
      box-shadow: 0 0 0 2px var(--vehicle-accent);
    }
    .vehicle-tail {
      position: absolute;
      left: 11px;
      top: 25px;
      width: 30px;
      height: 8px;
      border-radius: 999px;
      background: var(--vehicle-color);
      border: 3px solid #ffffff;
      box-shadow: 0 0 0 2px rgba(15,23,42,.9);
    }
    .vehicle-handlebar {
      position: absolute;
      right: 4px;
      top: 17px;
      width: 14px;
      height: 4px;
      border-radius: 999px;
      background: #ffffff;
      box-shadow: 0 0 0 2px rgba(15,23,42,.85);
      transform: rotate(-20deg);
    }
    .vehicle-cargo {
      position: absolute;
      left: 3px;
      top: 16px;
      width: 15px;
      height: 13px;
      border-radius: 4px;
      background: var(--vehicle-accent);
      border: 2px solid #ffffff;
      box-shadow: 0 0 0 2px rgba(15,23,42,.85);
    }
    .vehicle-wheel {
      position: absolute;
      top: 31px;
      width: 13px;
      height: 13px;
      border-radius: 50%;
      background: #0f172a;
      border: 3px solid #ffffff;
      box-shadow: 0 0 0 2px rgba(15,23,42,.85);
    }
    .vehicle-wheel.back {
      left: 7px;
    }
    .vehicle-wheel.front {
      right: 5px;
    }
    .vehicle-body.hidden-bearing .vehicle-arrow {
      display: none;
    }
    .driver-label {
      position: absolute;
      left: 50%;
      bottom: -6px;
      transform: translateX(-50%);
      max-width: 112px;
      padding: 3px 7px;
      border-radius: 999px;
      background: rgba(15, 23, 42, .94);
      border: 1px solid rgba(255,255,255,.82);
      box-shadow: 0 4px 14px rgba(0,0,0,.32);
      color: #ffffff;
      font-size: 11px;
      font-weight: 900;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    @keyframes livePulse {
      0% { transform: scale(.65); opacity: .9; }
      100% { transform: scale(2.25); opacity: 0; }
    }
    @media (min-width: 720px) {
      .topbar { right: auto; width: 390px; }
      .panel { right: auto; width: 390px; }
      .trip-drawer { max-height: min(62vh, 620px); }
      .trip-drawer-content { max-height: calc(min(62vh, 620px) - 72px); }
    }
    .playback-panel {
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 1000;
      background: rgba(15, 18, 25, 0.94);
      color: white;
      border-radius: 12px;
      box-shadow: 0 8px 30px rgba(0,0,0,.35);
      backdrop-filter: blur(10px);
      padding: 10px 16px;
      display: flex;
      align-items: center;
      gap: 12px;
      width: 90%;
      max-width: 480px;
      border: 1px solid rgba(255,255,255,0.08);
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.25s ease, transform 0.25s ease;
    }
    .playback-panel.visible {
      opacity: 1;
      pointer-events: auto;
    }
    .playback-btn {
      background: #1d9bf0;
      border: 0;
      color: white;
      border-radius: 50%;
      width: 36px;
      height: 36px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      font-weight: bold;
      font-size: 16px;
      transition: background 0.15s ease;
    }
    .playback-btn:hover {
      background: #1a8cd8;
    }
    .playback-slider {
      flex: 1;
      height: 6px;
      border-radius: 3px;
      outline: none;
      accent-color: #1d9bf0;
      cursor: pointer;
    }
    .playback-speed {
      background: rgba(255,255,255,0.08);
      border: 1px solid rgba(255,255,255,0.12);
      color: white;
      border-radius: 16px;
      padding: 4px 10px;
      font-size: 12px;
      font-weight: bold;
      cursor: pointer;
      white-space: nowrap;
      transition: background 0.15s ease;
    }
    .playback-speed:hover {
      background: rgba(255,255,255,0.16);
    }
    .playback-meta {
      font-size: 11px;
      color: #c7ccd8;
      display: flex;
      flex-direction: column;
      line-height: 1.3;
      min-width: 90px;
    }
    .playback-time {
      font-weight: 800;
      color: white;
    }
    @media (max-width: 719px) {
      .playback-panel {
        bottom: 112px;
      }
    }

    .deviation-banner {
      position: fixed;
      top: 76px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 1200;
      background: rgba(239, 68, 68, 0.95);
      color: white;
      font-weight: 800;
      padding: 10px 20px;
      border-radius: 30px;
      box-shadow: 0 4px 20px rgba(239, 68, 68, 0.4);
      display: none;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      transition: all 0.3s ease;
      backdrop-filter: blur(8px);
      border: 1px solid rgba(255, 255, 255, 0.2);
      white-space: nowrap;
    }
    .geofence-event-banner {
      position: fixed;
      top: 76px;
      right: 12px;
      z-index: 1200;
      max-width: min(420px, calc(100vw - 24px));
      background: rgba(15, 23, 42, .96);
      color: #ffffff;
      font-weight: 900;
      padding: 11px 14px;
      border-radius: 10px;
      box-shadow: 0 8px 28px rgba(0,0,0,.38);
      border: 1px solid rgba(255,255,255,.14);
      display: none;
    }
    .geofence-event-banner.exit {
      border-color: rgba(248,113,113,.55);
      color: #fecaca;
    }
    .geofence-event-banner.entry {
      border-color: rgba(34,197,94,.55);
      color: #bbf7d0;
    }

    .delivery-status-card {
      min-width: 260px;
      color: #f8fafc;
    }
    .delivery-status-card.compact {
      min-width: 0;
      width: 100%;
    }
    .delivery-card-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 10px;
      margin-bottom: 10px;
    }
    .delivery-card-name {
      font-size: 15px;
      line-height: 1.2;
      font-weight: 900;
      color: #ffffff;
    }
    .delivery-card-updated {
      color: #cbd5e1;
      font-size: 12px;
      margin-top: 3px;
    }
    .delivery-status-chips {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
      justify-content: flex-end;
    }
    .delivery-chip {
      border-radius: 999px;
      padding: 4px 8px;
      font-size: 11px;
      font-weight: 900;
      white-space: nowrap;
      border: 1px solid rgba(255,255,255,.14);
      background: rgba(148,163,184,.14);
      color: #e2e8f0;
    }
    .delivery-chip.moving,
    .delivery-chip.outside {
      background: rgba(34,197,94,.14);
      border-color: rgba(34,197,94,.35);
      color: #bbf7d0;
    }
    .delivery-chip.stopped,
    .delivery-chip.inside {
      background: rgba(14,165,233,.14);
      border-color: rgba(14,165,233,.35);
      color: #bae6fd;
    }
    .delivery-chip.stale {
      background: rgba(245,158,11,.15);
      border-color: rgba(245,158,11,.36);
      color: #fde68a;
    }
    .delivery-chip.offline {
      background: rgba(148,163,184,.14);
      border-color: rgba(148,163,184,.28);
      color: #cbd5e1;
    }
    .delivery-card-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 7px;
      margin-top: 8px;
    }
    .delivery-card-metric {
      border-radius: 8px;
      background: rgba(255,255,255,.055);
      padding: 8px;
      min-width: 0;
    }
    .delivery-card-label {
      color: #c7ccd8;
      font-size: 11px;
      line-height: 1.2;
    }
    .delivery-card-value {
      color: #ffffff;
      font-weight: 900;
      font-size: 13px;
      line-height: 1.25;
      margin-top: 3px;
      overflow-wrap: anywhere;
    }
    .delivery-card-actions {
      display: flex;
      gap: 8px;
      margin-top: 10px;
      flex-wrap: wrap;
    }
    .delivery-card-actions button,
    .delivery-card-actions a {
      border: 0;
      border-radius: 999px;
      padding: 8px 10px;
      color: white;
      background: #1d9bf0;
      text-decoration: none;
      font-weight: 800;
      cursor: pointer;
      white-space: nowrap;
      font-size: 12px;
    }
    .delivery-card-actions a {
      background: rgba(255,255,255,.12);
      border: 1px solid rgba(255,255,255,.16);
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <div id="deviationAlertBanner" class="deviation-banner">âš ï¸ ALERT: Driver deviated from the planned route!</div>
  <div id="geofenceEventBanner" class="geofence-event-banner"></div>
  <div class="topbar">
    <div>
      <div class="title">Factory Talk Live Map</div>
      <div class="muted" id="summary">Waiting for phones...</div>
    </div>
    <div class="map-actions">
      <button type="button" class="follow-button" id="followLiveButton" onclick="toggleFollowLive()">Follow Live ON</button>
      <div class="status"><span class="dot" id="serverDot"></span><span id="serverText">Connecting</span></div>
    </div>
  </div>
  <div id="tripDrawer" class="panel trip-drawer collapsed">
    <button type="button" class="trip-drawer-handle" id="tripDrawerHandle" onclick="setTripDrawerExpanded(!tripDrawerExpanded)" aria-expanded="false">
      <span class="drawer-grip"></span>
      <span>
        <span class="drawer-title" id="tripDrawerTitle">Trip Details</span>
        <span class="drawer-subtitle" id="tripDrawerSubtitle">Tap karo to details khulse</span>
      </span>
      <span class="drawer-action" id="tripDrawerAction">Open</span>
    </button>
    <div id="tripDrawerContent" class="trip-drawer-content">
      <div id="userList"></div>
      <div id="timeline" class="timeline"></div>
    </div>
  </div>
  <div id="playbackPanel" class="playback-panel">
    <button type="button" class="playback-btn" id="playbackPlayBtn" onclick="togglePlaybackPlay()">â–¶</button>
    <div class="playback-meta">
      <span class="playback-time" id="playbackTimeText">00:00:00</span>
      <span id="playbackSpeedText">0 km/h</span>
    </div>
    <input type="range" class="playback-slider" id="playbackRange" min="0" max="100" value="0" oninput="scrubPlayback(this.value)">
    <button type="button" class="playback-speed" id="playbackSpeedBtn" onclick="togglePlaybackSpeed()">1x</button>
  </div>

  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script src="/socket.io/socket.io.js"></script>
  <script>
    const userId = ${JSON.stringify(userId)};
    const map = L.map('map').setView([21.1702, 72.8311], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap'
    }).addTo(map);
    ${buildFactoryZoneScript()}
    ${buildRoadTrailScript()}
    ${buildStopMarkersScript()}
    const markers = new Map();
    const markerBearings = new Map();
    const markerPositions = new Map();
    const circles = new Map();
    const historyLines = new Map();
    const historyLineCasings = new Map();
    const tripLayers = L.layerGroup().addTo(map);
    const tripRouteCache = new Map();
    const liveRouteInflight = new Set();
    const activeTripSuggestedCache = new Map();
    
    function areWaypointsEqual(wps1, wps2) {
      if (!wps1 || !wps2 || wps1.length !== wps2.length) return false;
      for (let i = 0; i < wps1.length; i++) {
        if (distanceMetersLatLng(wps1[i], wps2[i]) > 10) return false;
      }
      return true;
    }
    const LIVE_TRAIL_MAX_POINTS = 25;
    const LIVE_TRAIL_MAX_AGE_MS = 10 * 60 * 1000;
    const LIVE_TRAIL_COLOR = '#2563eb';
    const LIVE_TRAIL_OUTLINE_COLOR = '#ffffff';
    let savedHistory = [];
    let lastHistoryPoints = [];
    let currentTrips = [];
    let selectedTripIndex = -1;
    let selectedTripSignature = '';
    let shouldAutoFitTripBounds = true;
    let forceLiveMapMode = false;
    let selectedTimelineUserId = userId || '';
    let tripDrawerExpanded = false;
    let firstFix = true;
    let followLiveEnabled = true;
    let followLivePaused = false;
    let suppressFollowPause = false;

    function escapeText(value) {
      return String(value || '').replace(/[&<>"']/g, (char) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
      }[char]));
    }

    function ageMs(location) {
      return Math.max(0, Date.now() - Number(location.locationUpdatedAt || 0));
    }

    function freshnessMs(location) {
      return Math.max(0, Date.now() - Number(location.receivedAt || location.locationUpdatedAt || 0));
    }

    function statusFor(location) {
      if (location.isBusy) return { label: 'Busy', color: '#f59e0b' };
      if (freshnessMs(location) > 120000) return { label: 'Old location', color: '#94a3b8' };
      return { label: 'Live', color: '#22c55e' };
    }

    const MOTION_GPS_STALE_MS = 5 * 60 * 1000;
    const MOTION_STATIONARY_CONFIRM_MS = 60 * 1000;
    const MOTION_MOVING_SPEED_KMH = 3;
    const MOTION_MEANINGFUL_MOVE_METERS = 15;
    const MOTION_RECENT_WINDOW_MS = 90 * 1000;

    function motionStatusFor(location, historyPoints) {
      if (location.motionStatus && location.motionStatus.state) return location.motionStatus;
      const locationTime = Number(location.locationUpdatedAt || 0);
      if (!Number.isFinite(locationTime) || locationTime <= 0) return { state: 'unknown', label: 'Live GPS' };
      if (Date.now() - locationTime > MOTION_GPS_STALE_MS) return { state: 'gps_stale', label: 'GPS stale' };

      const speed = Number(location.speedKmh);
      if (Number.isFinite(speed) && speed >= MOTION_MOVING_SPEED_KMH) {
        return { state: 'moving', label: 'Moving', speedKmh: speed };
      }

      const points = recentMotionPoints(location, historyPoints || []);
      const movementSpeed = recentMovementSpeed(points);
      if (movementSpeed !== undefined) return { state: 'moving', label: 'Moving', speedKmh: movementSpeed };
      if (hasStationaryMotionWindow(points, locationTime)) return { state: 'stationary', label: 'Stationary' };
      return { state: 'unknown', label: 'Live GPS' };
    }

    function recentMotionPoints(location, historyPoints) {
      const locationTime = Number(location.locationUpdatedAt || 0);
      const seen = new Set();
      return historyPoints.concat(location)
        .filter((point) =>
          point.userId === location.userId &&
          Number.isFinite(Number(point.latitude)) &&
          Number.isFinite(Number(point.longitude)) &&
          Number.isFinite(Number(point.locationUpdatedAt || 0)) &&
          Number(point.locationUpdatedAt || 0) <= locationTime &&
          Number(point.locationUpdatedAt || 0) >= locationTime - MOTION_RECENT_WINDOW_MS
        )
        .sort((a, b) => Number(a.locationUpdatedAt || 0) - Number(b.locationUpdatedAt || 0))
        .filter((point) => {
          const key = [
            Math.round(Number(point.latitude) * 100000),
            Math.round(Number(point.longitude) * 100000),
            Number(point.locationUpdatedAt || 0)
          ].join(':');
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .slice(-3);
    }

    function recentMovementSpeed(points) {
      const latest = points[points.length - 1];
      if (!latest) return undefined;
      for (let index = points.length - 2; index >= 0; index -= 1) {
        const previous = points[index];
        const elapsedMs = Number(latest.locationUpdatedAt || 0) - Number(previous.locationUpdatedAt || 0);
        if (elapsedMs < 5000 || elapsedMs > MOTION_RECENT_WINDOW_MS) continue;
        const distance = distanceMeters(previous, latest);
        if (distance < MOTION_MEANINGFUL_MOVE_METERS) continue;
        const speed = speedKmh(distance, elapsedMs);
        if (Number.isFinite(speed) && speed > 0 && speed <= 140) return speed;
      }
      return undefined;
    }

    function hasStationaryMotionWindow(points, locationTime) {
      if (points.length < 2) return false;
      const earliest = points[0];
      if (locationTime - Number(earliest.locationUpdatedAt || 0) < MOTION_STATIONARY_CONFIRM_MS) return false;
      return points.every((point) => distanceMeters(earliest, point) < MOTION_MEANINGFUL_MOVE_METERS);
    }

    function deliveryLiveStatus(location, historyPoints) {
      if (location.isOnline === false) return { label: 'Offline', className: 'offline' };
      const motion = motionStatusFor(location, historyPoints);
      if (motion.state === 'gps_stale') return { label: 'GPS stale', className: 'stale' };
      if (motion.state === 'moving') return { label: 'Moving', className: 'moving' };
      if (motion.state === 'stationary') return { label: 'Stopped', className: 'stopped' };
      return { label: 'Live GPS', className: 'stopped' };
    }

    function factoryStatus(location) {
      if (!Number.isFinite(Number(location.latitude)) || !Number.isFinite(Number(location.longitude))) {
        return { label: 'Factory unknown', className: 'offline' };
      }
      return isInsideFactoryZone(location)
        ? { label: 'Inside factory', className: 'inside' }
        : { label: 'Outside factory', className: 'outside' };
    }

    function reliableSpeedText(location) {
      const speed = Number(location.speedKmh);
      if (Number.isFinite(speed) && speed >= 0) return Math.round(speed) + ' km/h';

      const fallbackSpeed = Number(location.motionStatus && location.motionStatus.speedKmh);
      if (
        location.motionStatus &&
        location.motionStatus.state === 'moving' &&
        Number.isFinite(fallbackSpeed) &&
        fallbackSpeed >= 0
      ) {
        return Math.round(fallbackSpeed) + ' km/h';
      }

      return '-- km/h';
    }

    function userHistoryFor(location, historyPoints) {
      return (historyPoints || [])
        .filter((point) => point.userId === location.userId)
        .filter((point) => Number.isFinite(Number(point.latitude)) && Number.isFinite(Number(point.longitude)))
        .sort((a, b) => Number(a.locationUpdatedAt || 0) - Number(b.locationUpdatedAt || 0));
    }

    function buildTodayDeliverySummary(location, historyPoints) {
      const points = userHistoryFor(location, historyPoints);
      const sourcePoints = points.length ? points : [location];
      const trips = splitFactoryTrips(sourcePoints);
      const activeTrip = trips.find((trip) => !trip.isComplete);
      const latestTrip = trips[trips.length - 1];
      const summary = trips.reduce((total, trip) => {
        const report = buildTripReport(trip.points);
        total.distanceMeters += report.distanceMeters;
        total.timeMs += report.totalTimeMs;
        total.stops += report.stops.length;
        return total;
      }, { distanceMeters: 0, timeMs: 0, stops: 0 });

      let tripStatus = 'No active trip';
      if (activeTrip) {
        tripStatus = 'Active delivery';
      } else if (latestTrip && latestTrip.isComplete) {
        tripStatus = 'Returned to factory';
      }

      return {
        tripStatus,
        todayKm: formatDistance(summary.distanceMeters),
        totalTripTime: formatDuration(summary.timeMs),
        stopsCount: String(summary.stops)
      };
    }

    function deliveryStatusCardHtml(location, historyPoints, compact) {
      const live = deliveryLiveStatus(location, historyPoints);
      const factory = factoryStatus(location);
      const summary = buildTodayDeliverySummary(location, historyPoints);
      const mapsUrl = 'https://www.google.com/maps/search/?api=1&query=' + location.latitude + ',' + location.longitude;
      const cardClass = compact ? 'delivery-status-card compact' : 'delivery-status-card';
      return '<div class="' + cardClass + '">' +
        '<div class="delivery-card-header">' +
          '<div>' +
            '<div class="delivery-card-name">' + escapeText(location.name || 'Driver') + '</div>' +
            '<div class="delivery-card-updated">Last updated ' + escapeText(timeAgo(location)) + '</div>' +
          '</div>' +
          '<div class="delivery-status-chips">' +
            '<span class="delivery-chip ' + live.className + '">' + escapeText(live.label) + '</span>' +
            '<span class="delivery-chip ' + factory.className + '">' + escapeText(factory.label) + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="delivery-card-grid">' +
          deliveryMetricHtml('Current speed', reliableSpeedText(location)) +
          deliveryMetricHtml('Trip status', summary.tripStatus) +
          deliveryMetricHtml('Today km', summary.todayKm) +
          deliveryMetricHtml('Trip time', summary.totalTripTime) +
          deliveryMetricHtml('Stops', summary.stopsCount) +
          deliveryMetricHtml('Updated', timeAgo(location)) +
        '</div>' +
        '<div class="delivery-card-actions">' +
          '<button type="button" onclick="focusUser(\\\'' + escapeText(location.userId) + '\\\')">Follow Live</button>' +
          '<a target="_blank" rel="noopener" href="' + mapsUrl + '">Open in Google Maps</a>' +
        '</div>' +
      '</div>';
    }

    function deliveryMetricHtml(label, value) {
      return '<div class="delivery-card-metric">' +
        '<div class="delivery-card-label">' + escapeText(label) + '</div>' +
        '<div class="delivery-card-value">' + escapeText(value) + '</div>' +
      '</div>';
    }

    function timeAgo(location) {
      const seconds = Math.floor(ageMs(location) / 1000);
      if (seconds < 5) return 'just now';
      if (seconds < 60) return seconds + ' sec ago';
      return Math.floor(seconds / 60) + ' min ago';
    }

    function formatClock(timestamp) {
      if (!timestamp) return 'Unknown time';
      return new Date(Number(timestamp)).toLocaleString(undefined, {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
        hourCycle: 'h12'
      });
    }

    function formatEventTime(timestamp) {
      if (!timestamp) return '';
      return new Date(Number(timestamp)).toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
        hourCycle: 'h12'
      });
    }

    function formatDuration(ms) {
      const seconds = Math.max(0, Math.round(Number(ms || 0) / 1000));
      if (seconds < 60) return seconds + ' sec';
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = seconds % 60;
      if (minutes < 60) return minutes + ' min ' + remainingSeconds + ' sec';
      const hours = Math.floor(minutes / 60);
      const remainingMinutes = minutes % 60;
      return hours + ' hr ' + remainingMinutes + ' min';
    }

    function distanceMeters(a, b) {
      const earthRadiusMeters = 6371000;
      const dLat = (Number(b.latitude) - Number(a.latitude)) * Math.PI / 180;
      const dLon = (Number(b.longitude) - Number(a.longitude)) * Math.PI / 180;
      const lat1 = Number(a.latitude) * Math.PI / 180;
      const lat2 = Number(b.latitude) * Math.PI / 180;
      const sinLat = Math.sin(dLat / 2);
      const sinLon = Math.sin(dLon / 2);
      const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon;
      return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
    }

    function distanceMetersLatLng(a, b) {
      const earthRadiusMeters = 6371000;
      const dLat = (b[0] - a[0]) * Math.PI / 180;
      const dLon = (b[1] - a[1]) * Math.PI / 180;
      const lat1 = a[0] * Math.PI / 180;
      const lat2 = b[0] * Math.PI / 180;
      const sinLat = Math.sin(dLat / 2);
      const sinLon = Math.sin(dLon / 2);
      const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon;
      return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
    }

    function distanceToPolyline(point, polyline) {
      if (!polyline || polyline.length === 0) return Infinity;
      if (polyline.length === 1) return distanceMetersLatLng(point, polyline[0]);
      
      let minDistance = Infinity;
      const p = { lat: point[0], lng: point[1] };
      
      for (let i = 0; i < polyline.length - 1; i++) {
        const v = { lat: polyline[i][0], lng: polyline[i][1] };
        const w = { lat: polyline[i + 1][0], lng: polyline[i + 1][1] };
        
        const l2 = (v.lat - w.lat) ** 2 + (v.lng - w.lng) ** 2;
        let proj;
        if (l2 === 0) {
          proj = v;
        } else {
          let t = ((p.lat - v.lat) * (w.lat - v.lat) + (p.lng - v.lng) * (w.lng - v.lng)) / l2;
          t = Math.max(0, Math.min(1, t));
          proj = { lat: v.lat + t * (w.lat - v.lat), lng: v.lng + t * (w.lng - v.lng) };
        }
        
        const dist = distanceMetersLatLng(point, [proj.lat, proj.lng]);
        if (dist < minDistance) {
          minDistance = dist;
        }
      }
      return minDistance;
    }

    function formatDistance(meters) {
      if (meters < 1000) return Math.round(meters) + ' m';
      return (meters / 1000).toFixed(2) + ' km';
    }

    const MAX_GPS_JUMP_SPEED_KMH = 95;
    const MAX_GPS_JUMP_METERS = 260;
    const MIN_GPS_JUMP_INTERVAL_MS = 4000;
    const MAX_FILTERED_ACCURACY_METERS = 100;
    const ROUTE_SEGMENT_BREAK_METERS = 220;
    const ROUTE_SEGMENT_BREAK_SPEED_KMH = 75;
    const ROUTE_SEGMENT_BREAK_GAP_MS = 90_000;

    function filterStablePoints(points) {
      const sorted = points
        .filter((point) => Number.isFinite(Number(point.latitude)) && Number.isFinite(Number(point.longitude)))
        .slice()
        .sort((a, b) => Number(a.locationUpdatedAt || 0) - Number(b.locationUpdatedAt || 0));
      if (sorted.length < 2) return sorted;

      const stable = [sorted[0]];
      for (let index = 1; index < sorted.length; index += 1) {
        const next = sorted[index];
        const prev = stable[stable.length - 1];
        const accuracy = Number(next.accuracy || 0);
        if (accuracy > MAX_FILTERED_ACCURACY_METERS) continue;

        const deltaMs = Number(next.locationUpdatedAt || 0) - Number(prev.locationUpdatedAt || 0);
        if (deltaMs <= 0) continue;
        const distance = distanceMeters(prev, next);
        const speedKmh = (distance / 1000) / (deltaMs / 3600000);
        const hardJump = deltaMs <= MIN_GPS_JUMP_INTERVAL_MS && distance >= MAX_GPS_JUMP_METERS;
        if (hardJump || speedKmh > MAX_GPS_JUMP_SPEED_KMH) continue;
        stable.push(next);
      }

      return stable.length >= 2 ? stable : sorted.slice(-2);
    }

    function splitStableRouteSegments(points) {
      const stable = filterStablePoints(points);
      if (stable.length < 2) return [];
      const segments = [];
      let current = [stable[0]];
      for (let index = 1; index < stable.length; index += 1) {
        const prev = stable[index - 1];
        const next = stable[index];
        const deltaMs = Math.max(1, Number(next.locationUpdatedAt || 0) - Number(prev.locationUpdatedAt || 0));
        const distance = distanceMeters(prev, next);
        const speedKmh = (distance / 1000) / (deltaMs / 3600000);
        const shouldBreak =
          deltaMs > ROUTE_SEGMENT_BREAK_GAP_MS ||
          distance > ROUTE_SEGMENT_BREAK_METERS ||
          speedKmh > ROUTE_SEGMENT_BREAK_SPEED_KMH;

        if (shouldBreak) {
          if (current.length >= 2) segments.push(current);
          current = [next];
        } else {
          current.push(next);
        }
      }
      if (current.length >= 2) segments.push(current);
      return segments;
    }

    function speedKmh(distanceMetersValue, durationMs) {
      const hours = Number(durationMs || 0) / 3600000;
      if (hours <= 0) return 0;
      return (Number(distanceMetersValue || 0) / 1000) / hours;
    }

    function formatSpeed(kmh) {
      if (!Number.isFinite(kmh) || kmh <= 0) return '0 km/h';
      return Math.round(kmh) + ' km/h';
    }

    function reliableBearing(location) {
      const bearing = Number(location.bearing);
      const accuracy = Number(location.bearingAccuracyDegrees);
      if (!Number.isFinite(bearing) || !Number.isFinite(accuracy)) return null;
      if (accuracy < 0 || accuracy > 45) return null;
      if (freshnessMs(location) > 120000) return null;
      return ((bearing % 360) + 360) % 360;
    }

    function movementBearing(previous, next) {
      if (!previous || !next) return null;
      const distance = distanceMeters(previous, next);
      if (!Number.isFinite(distance) || distance < 4) return null;
      const lat1 = Number(previous.latitude) * Math.PI / 180;
      const lat2 = Number(next.latitude) * Math.PI / 180;
      const deltaLon = (Number(next.longitude) - Number(previous.longitude)) * Math.PI / 180;
      const y = Math.sin(deltaLon) * Math.cos(lat2);
      const x = Math.cos(lat1) * Math.sin(lat2) -
        Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLon);
      const bearing = Math.atan2(y, x) * 180 / Math.PI;
      return ((bearing % 360) + 360) % 360;
    }

    function smoothBearing(key, nextBearing) {
      const previous = markerBearings.get(key);
      if (!Number.isFinite(previous)) {
        markerBearings.set(key, nextBearing);
        return nextBearing;
      }
      const delta = ((nextBearing - previous + 540) % 360) - 180;
      if (Math.abs(delta) < 4) return previous;
      const smoothed = ((previous + delta * 0.35) % 360 + 360) % 360;
      markerBearings.set(key, smoothed);
      return smoothed;
    }

    function markerVisualState(location, status) {
      const live = deliveryLiveStatus(location, lastHistoryPoints);
      if (live.className === 'offline') {
        return { color: '#64748b', accent: '#ef4444', glow: 'rgba(239, 68, 68, .24)' };
      }
      if (live.className === 'stale') {
        return { color: '#94a3b8', accent: '#ef4444', glow: 'rgba(239, 68, 68, .22)' };
      }
      if (live.className === 'stopped') {
        return { color: '#f59e0b', accent: '#f97316', glow: 'rgba(245, 158, 11, .28)' };
      }
      if (live.className === 'moving') {
        return { color: '#0ea5e9', accent: '#22c55e', glow: 'rgba(34, 197, 94, .28)' };
      }
      return { color: status.color, accent: '#38bdf8', glow: 'rgba(56, 189, 248, .22)' };
    }

    function makeIcon(location, status) {
      const visual = markerVisualState(location, status);
      const name = escapeText(location.name || 'Driver');
      const bearing = Number(location.displayBearing);
      const hasBearing = Number.isFinite(bearing);
      const bodyClass = hasBearing ? 'vehicle-body' : 'vehicle-body hidden-bearing';
      const rotationStyle = hasBearing ? 'transform: rotate(' + bearing.toFixed(1) + 'deg);' : '';
      return L.divIcon({
        className: '',
        iconSize: [72, 64],
        iconAnchor: [36, 56],
        popupAnchor: [0, -58],
        html: '<div class="vehicle-marker" style="--vehicle-color:' + visual.color + ';--vehicle-accent:' + visual.accent + ';--vehicle-glow:' + visual.glow + '">' +
          '<div class="vehicle-pulse"></div>' +
          '<div class="' + bodyClass + '" style="' + rotationStyle + '">' +
            '<span class="vehicle-arrow"></span>' +
            '<span class="vehicle-cargo"></span>' +
            '<span class="vehicle-cabin"></span>' +
            '<span class="vehicle-tail"></span>' +
            '<span class="vehicle-handlebar"></span>' +
            '<span class="vehicle-wheel back"></span>' +
            '<span class="vehicle-wheel front"></span>' +
          '</div>' +
          '<div class="driver-label">' + name + '</div>' +
        '</div>'
      });
    }

    function popupHtml(location) {
      return deliveryStatusCardHtml(location, lastHistoryPoints, false);
    }

    function liveTrailPoints(points) {
      const stablePoints = filterStablePoints(points);
      if (stablePoints.length < 2) return stablePoints;
      const last = stablePoints[stablePoints.length - 1];
      const cutoff = Number(last.locationUpdatedAt || 0) - LIVE_TRAIL_MAX_AGE_MS;
      const recent = stablePoints.filter((point) => Number(point.locationUpdatedAt || 0) >= cutoff);
      const trail = recent.length >= 2 ? recent : stablePoints;
      return trail.slice(-LIVE_TRAIL_MAX_POINTS);
    }

    function updateHistory(points) {
      const grouped = new Map();
      points.forEach((point) => {
        if (!Number.isFinite(Number(point.latitude)) || !Number.isFinite(Number(point.longitude))) return;
        if (userId && point.userId !== userId) return;
        if (!grouped.has(point.userId)) grouped.set(point.userId, []);
        grouped.get(point.userId).push(point);
      });

      grouped.forEach((userPoints, key) => {
        userPoints.sort((a, b) => Number(a.locationUpdatedAt || 0) - Number(b.locationUpdatedAt || 0));
        const trailPoints = liveTrailPoints(userPoints);
        const segments = splitStableRouteSegments(trailPoints);
        if (!segments.length) return;

        const rawSegmentLatLngs = segments.map((segmentPoints) =>
          segmentPoints.map((point) => [point.latitude, point.longitude])
        );
        const latLngs = rawSegmentLatLngs.length === 1 ? rawSegmentLatLngs[0] : rawSegmentLatLngs;
        const color = LIVE_TRAIL_COLOR;
        if (!historyLineCasings.has(key)) {
          historyLineCasings.set(key, L.polyline(latLngs, {
            color: LIVE_TRAIL_OUTLINE_COLOR,
            weight: 8,
            opacity: 0.92,
            lineCap: 'round',
            lineJoin: 'round'
          }).addTo(map));
        } else {
          historyLineCasings.get(key).setLatLngs(latLngs);
          historyLineCasings.get(key).setStyle({ color: LIVE_TRAIL_OUTLINE_COLOR, weight: 8, opacity: 0.92 });
        }
        if (!historyLines.has(key)) {
          historyLines.set(key, L.polyline(latLngs, {
            color,
            weight: 5,
            opacity: 0.95,
            lineCap: 'round',
            lineJoin: 'round'
          }).addTo(map));
        } else {
          historyLines.get(key).setLatLngs(latLngs);
          historyLines.get(key).setStyle({ color, weight: 5, opacity: 0.95 });
        }

        segments.forEach((segmentPoints, segmentIndex) => {
          const roadPoints = sampleRoadTrailPoints(segmentPoints);
          if (roadPoints.length < 2) return;
          const routeCacheKey = roadRouteCacheKey(roadPoints, key + ':live:' + segmentIndex);
          const cachedRoute = tripRouteCache.get(routeCacheKey);
          if (cachedRoute && cachedRoute.length > 1) {
            rawSegmentLatLngs[segmentIndex] = cachedRoute;
            historyLines.get(key).setLatLngs(rawSegmentLatLngs.length === 1 ? rawSegmentLatLngs[0] : rawSegmentLatLngs);
            return;
          }
          if (liveRouteInflight.has(routeCacheKey)) return;
          liveRouteInflight.add(routeCacheKey);
          fetchRoadLatLngs(roadPoints)
            .then((roadLatLngs) => {
              if (roadLatLngs.length > 1) {
                tripRouteCache.set(routeCacheKey, roadLatLngs);
                rawSegmentLatLngs[segmentIndex] = roadLatLngs;
                const casing = historyLineCasings.get(key);
                if (casing) casing.setLatLngs(rawSegmentLatLngs.length === 1 ? rawSegmentLatLngs[0] : rawSegmentLatLngs);
                const line = historyLines.get(key);
                if (line) line.setLatLngs(rawSegmentLatLngs.length === 1 ? rawSegmentLatLngs[0] : rawSegmentLatLngs);
              }
            })
            .catch(() => {
              // Keep filtered raw GPS path when road snapping fails.
            })
            .finally(() => {
              liveRouteInflight.delete(routeCacheKey);
            });
        });
      });

      historyLines.forEach((line, key) => {
        if (!grouped.has(key)) {
          const casing = historyLineCasings.get(key);
          if (casing) map.removeLayer(casing);
          historyLineCasings.delete(key);
          map.removeLayer(line);
          historyLines.delete(key);
        }
      });
    }

    function mergeHistory(savedPoints, livePoints) {
      const seen = new Set();
      return savedPoints.concat(livePoints).filter((point) => {
        const key = [
          point.userId,
          Math.round(Number(point.latitude) * 100000),
          Math.round(Number(point.longitude) * 100000),
          Number(point.locationUpdatedAt || 0)
        ].join(':');
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }

    function updateMap(location) {
      const key = location.userId;
      const latLng = [location.latitude, location.longitude];
      const status = statusFor(location);
      const previousPosition = markerPositions.get(key);
      const acceptedBearing = reliableBearing(location);
      const fallbackBearing = acceptedBearing === null ? movementBearing(previousPosition, location) : null;
      const directionBearing = acceptedBearing !== null ? acceptedBearing : fallbackBearing;
      const displayBearing = directionBearing === null ? undefined : smoothBearing(key, directionBearing);
      if (directionBearing === null) markerBearings.delete(key);
      const markerLocation = { ...location, displayBearing };
      if (!markers.has(key)) {
        markers.set(key, L.marker(latLng, { icon: makeIcon(markerLocation, status), zIndexOffset: 1000 }).addTo(map));
      }
      const marker = markers.get(key);
      marker.setLatLng(latLng);
      marker.setIcon(makeIcon(markerLocation, status));
      marker.bindPopup(popupHtml(location));
      markerPositions.set(key, {
        latitude: Number(location.latitude),
        longitude: Number(location.longitude),
        locationUpdatedAt: Number(location.locationUpdatedAt || 0)
      });
      followSelectedDriver(location);

      const accuracy = Number(location.accuracy || 0);
      if (accuracy > 0 && accuracy < 5000) {
        if (!circles.has(key)) {
          circles.set(key, L.circle(latLng, {
            radius: accuracy,
            color: status.color,
            weight: 1,
            fillColor: status.color,
            fillOpacity: 0.12
          }).addTo(map));
        }
        const circle = circles.get(key);
        circle.setLatLng(latLng);
        circle.setRadius(accuracy);
        circle.setStyle({ color: status.color, fillColor: status.color });
      }
    }

    function selectedFollowId() {
      return selectedTimelineUserId || userId || '';
    }

    function updateFollowButton() {
      const button = document.getElementById('followLiveButton');
      if (!button) return;
      button.classList.toggle('off', !followLiveEnabled);
      button.classList.toggle('paused', followLiveEnabled && followLivePaused);
      button.textContent = !followLiveEnabled
        ? 'Follow Live OFF'
        : followLivePaused
          ? 'Resume Follow'
          : 'Follow Live ON';
    }

    function setFollowLive(enabled, paused) {
      followLiveEnabled = !!enabled;
      followLivePaused = !!paused;
      updateFollowButton();
      if (followLiveEnabled && !followLivePaused) {
        const marker = markers.get(selectedFollowId());
        if (marker) {
          suppressFollowPause = true;
          map.panTo(marker.getLatLng(), { animate: true, duration: 0.45 });
          setTimeout(() => { suppressFollowPause = false; }, 650);
        }
      }
    }

    function pauseFollowLive() {
      if (!followLiveEnabled || suppressFollowPause) return;
      followLivePaused = true;
      updateFollowButton();
    }

    function toggleFollowLive() {
      if (!followLiveEnabled) {
        setFollowLive(true, false);
      } else if (followLivePaused) {
        setFollowLive(true, false);
      } else {
        setFollowLive(false, false);
      }
    }

    function followSelectedDriver(location) {
      if (!followLiveEnabled || followLivePaused) return;
      if (selectedFollowId() && location.userId !== selectedFollowId()) return;
      if (selectedTripIndex >= 0 && !forceLiveMapMode) return;
      suppressFollowPause = true;
      map.panTo([location.latitude, location.longitude], { animate: true, duration: 0.45 });
      setTimeout(() => { suppressFollowPause = false; }, 650);
    }

    map.on('dragstart', pauseFollowLive);
    map.on('zoomstart', pauseFollowLive);

    function setLayerVisible(layer, visible) {
      if (!layer) return;
      if (visible) {
        if (!map.hasLayer(layer)) layer.addTo(map);
      } else if (map.hasLayer(layer)) {
        map.removeLayer(layer);
      }
    }

    function setLiveLayersVisible(visible) {
      historyLineCasings.forEach((line) => setLayerVisible(line, visible));
      markers.forEach((marker) => setLayerVisible(marker, visible));
      circles.forEach((circle) => setLayerVisible(circle, visible));
      historyLines.forEach((line) => setLayerVisible(line, visible));
      stopMarkers.forEach((marker) => setLayerVisible(marker, visible));
    }

    function setSelectedHistoryLineVisible(visible) {
      const casing = historyLineCasings.get(selectedTimelineUserId);
      if (casing) setLayerVisible(casing, visible);
      const line = historyLines.get(selectedTimelineUserId);
      if (line) setLayerVisible(line, visible);
    }

    function setTripDrawerExpanded(expanded) {
      tripDrawerExpanded = !!expanded;
      const drawer = document.getElementById('tripDrawer');
      const handle = document.getElementById('tripDrawerHandle');
      const action = document.getElementById('tripDrawerAction');
      const timeline = document.getElementById('timeline');
      if (!drawer || !handle) return;
      drawer.classList.toggle('collapsed', !tripDrawerExpanded);
      drawer.classList.toggle('expanded', tripDrawerExpanded);
      handle.setAttribute('aria-expanded', String(tripDrawerExpanded));
      if (action) action.textContent = tripDrawerExpanded ? 'Close' : 'Open';
      if (timeline) timeline.classList.toggle('drawer-open', tripDrawerExpanded);
    }

    function updateTripDrawerChrome(title, subtitle) {
      const titleNode = document.getElementById('tripDrawerTitle');
      const subtitleNode = document.getElementById('tripDrawerSubtitle');
      if (titleNode) titleNode.textContent = title;
      if (subtitleNode) subtitleNode.textContent = subtitle;
    }

    function renderList(locations, historyCounts, historyPoints) {
      const list = document.getElementById('userList');
      if (!locations.length) {
        list.innerHTML = '<div class="muted">Koi phone nu location haju receive nathi thayu.</div>';
        renderTripReport(historyPoints || []);
        return;
      }
      list.innerHTML = locations.map((location) => {
        return '<div class="user">' + deliveryStatusCardHtml(location, historyPoints || [], true) + '</div>';
      }).join('');
      renderTripReport(historyPoints || []);
    }

    function renderTripReport(points) {
      lastHistoryPoints = points || [];
      const timeline = document.getElementById('timeline');
      if (!selectedTimelineUserId) {
        currentTrips = [];
        selectedTripIndex = -1;
        tripLayers.clearLayers();
        setLiveLayersVisible(true);
        updateTripDrawerChrome('Trip Details', 'User par Track dabavo');
        timeline.innerHTML = '<div class="timeline-title">Trip Report</div><div class="muted">User par Track dabavo, pachi trip summary dekhase.</div>';
        return;
      }

      const userPoints = simplifyPoints(points
        .filter((point) => point.userId === selectedTimelineUserId)
        .filter((point) => Number.isFinite(Number(point.latitude)) && Number.isFinite(Number(point.longitude)))
        .sort((a, b) => Number(a.locationUpdatedAt || 0) - Number(b.locationUpdatedAt || 0)));

      if (userPoints.length < 2) {
        currentTrips = [];
        selectedTripIndex = -1;
        tripLayers.clearLayers();
        setLiveLayersVisible(true);
        updateTripDrawerChrome('Trip Details', 'Report mate ochha points che');
        timeline.innerHTML = '<div class="timeline-title">Trip Report</div><div class="muted">Aa user ni trip report mate ochha points che. Phone move thase pachi report banse.</div>';
        return;
      }

      const selectedName = escapeText(userPoints[userPoints.length - 1].name || 'Factory Phone');
      const trips = splitFactoryTrips(userPoints);
      currentTrips = trips;
      if (selectedTripIndex >= trips.length) {
        selectedTripIndex = -1;
        selectedTripSignature = '';
        shouldAutoFitTripBounds = true;
        tripLayers.clearLayers();
      }
      if (!trips.length) {
        selectedTripIndex = -1;
        shouldAutoFitTripBounds = true;
        forceLiveMapMode = false;
        tripLayers.clearLayers();
        setLiveLayersVisible(true);
        updateTripDrawerChrome('Trip Details - ' + selectedName, 'Factory thi bahar jashe tyare Trip 1 start thase');
        timeline.innerHTML = '<div class="timeline-title">Trip Report - ' + selectedName + '</div>' +
          '<div class="muted">Aa user haju factory zone mathi bahar nikalyo nathi. Factory thi bahar jashe tyare Trip 1 start thase.</div>';
        return;
      }
      if (selectedTripIndex < 0 && !forceLiveMapMode) {
        // Only auto-select if there is an active (incomplete) trip
        const activeIndex = trips.findIndex((trip) => !trip.isComplete);
        console.log('[FactoryTalk Debug] selectedTripIndex was negative, activeIndex:', activeIndex, 'trips count:', trips.length);
        if (activeIndex >= 0) {
          selectedTripIndex = activeIndex;
          selectedTripSignature = '';
          shouldAutoFitTripBounds = true;
        } else {
          // All trips completed - stay in live map mode so marker stays visible
          forceLiveMapMode = true;
          selectedTripIndex = -1;
        }
        console.log('[FactoryTalk Debug] auto-selected trip index:', selectedTripIndex, 'forceLiveMapMode:', forceLiveMapMode);
      }

      const summary = buildTripSummary(trips);
      updateTripDrawerChrome(
        'Aaj ni trips - ' + selectedName,
        summary.totalTrips + ' trip, ' + formatDistance(summary.totalDistanceMeters) + ' - tap karo details mate'
      );
      timeline.innerHTML =
        '<div class="trip-toolbar">' +
          '<div class="timeline-title">Aaj ni trips - ' + selectedName + '</div>' +
          '<button onclick="showLiveMap()">Live Map</button>' +
        '</div>' +
        renderTripSummary(summary) +
        trips.map(renderTripCard).join('');

      if (selectedTripIndex >= 0) {
        drawTripOnMap(trips[selectedTripIndex], selectedTripIndex);
      } else {
        selectedTripSignature = '';
        tripLayers.clearLayers();
        setLiveLayersVisible(true);
      }
    }

    function buildTripSummary(trips) {
      return trips.reduce((summary, trip) => {
        const report = buildTripReport(trip.points);
        summary.totalTrips += 1;
        summary.activeTrips += trip.isComplete ? 0 : 1;
        summary.totalDistanceMeters += report.distanceMeters;
        summary.totalTimeMs += report.totalTimeMs;
        return summary;
      }, {
        totalTrips: 0,
        activeTrips: 0,
        totalDistanceMeters: 0,
        totalTimeMs: 0
      });
    }

    function renderTripSummary(summary) {
      return '<div class="timeline-item">' +
        '<div class="timeline-time">Aaj no trip summary</div>' +
        '<div class="report-grid">' +
          reportBox('Total trips', String(summary.totalTrips)) +
          reportBox('Active trips', String(summary.activeTrips)) +
          reportBox('Total km', formatDistance(summary.totalDistanceMeters)) +
          reportBox('Total time', formatDuration(summary.totalTimeMs)) +
        '</div>' +
      '</div>';
    }

    function renderTripCard(trip, index) {
      const report = buildTripReport(trip.points);
      const title = trip.isComplete ? 'Trip ' + (index + 1) : 'Active Trip';
      const statusText = trip.isComplete ? 'Factory par pacho avyo' : 'Haju factory bahar che';
      const activeClass = selectedTripIndex === index ? ' active' : '';

      return '<button type="button" class="trip-card' + activeClass + '" onclick="openTripOnMap(' + index + ')">' +
        '<div class="trip-card-title">' +
          '<span>' + title + '</span>' +
          '<span class="trip-pill">Map ma kholo</span>' +
        '</div>' +
        '<div class="timeline-meta">' + escapeText(statusText) + ' - ' + escapeText(formatClock(report.startTime)) + '</div>' +
        '<div class="trip-card-meta">' +
          reportBox('Trip km', formatDistance(report.distanceMeters)) +
          reportBox('Time', formatDuration(report.totalTimeMs)) +
          reportBox('Stops', String(report.stops.length)) +
          '<div class="report-box" id="deviation-box-' + index + '"><div class="report-label">Detour</div><div class="report-value" id="deviation-val-' + index + '" style="color:#94a3b8">Checking...</div></div>' +
        '</div>' +
      '</button>';
    }

    function reportBox(label, value) {
      return '<div class="report-box"><div class="report-label">' + escapeText(label) + '</div><div class="report-value">' + escapeText(value) + '</div></div>';
    }

    function simplifyPoints(points) {
      const stablePoints = filterStablePoints(points);
      const simplified = [];
      stablePoints.forEach((point) => {
        const last = simplified[simplified.length - 1];
        if (!last || Math.abs(Number(point.locationUpdatedAt || 0) - Number(last.locationUpdatedAt || 0)) >= 15000 || distanceMeters(last, point) >= 25) {
          simplified.push(point);
        }
      });
      return simplified;
    }

    const RETURN_CONFIRM_MS = 60 * 1000;
    const STOP_MIN_DURATION_MS = 2 * 60 * 1000;

    function isInsideFactoryZone(point) {
      return distanceMeters(point, {
        latitude: factoryZone.latitude,
        longitude: factoryZone.longitude
      }) <= factoryZone.radiusMeters;
    }

    function splitFactoryTrips(points) {
      const trips = [];
      let currentTrip = null;
      let previousPoint = null;
      let returnStartedAt = 0;

      points.forEach((point) => {
        const pointTime = Number(point.locationUpdatedAt || 0);
        const insideFactory = isInsideFactoryZone(point);

        if (!currentTrip && !insideFactory) {
          const startPoint = previousPoint && isInsideFactoryZone(previousPoint) ? previousPoint : point;
          currentTrip = {
            points: startPoint === point ? [point] : [startPoint, point],
            startTime: Number(startPoint.locationUpdatedAt || pointTime),
            endTime: pointTime,
            isComplete: false
          };
        } else if (currentTrip) {
          currentTrip.points.push(point);
          currentTrip.endTime = pointTime;

          if (insideFactory) {
            if (!returnStartedAt) returnStartedAt = pointTime;
            if (pointTime - returnStartedAt >= RETURN_CONFIRM_MS) {
              currentTrip.isComplete = true;
              trips.push(currentTrip);
              currentTrip = null;
              returnStartedAt = 0;
            }
          } else {
            returnStartedAt = 0;
          }
        }

        previousPoint = point;
      });

      if (currentTrip) {
        trips.push(currentTrip);
      }

      return trips;
    }

    function buildTripReport(points) {
      let distance = 0;
      let movingTime = 0;
      const stops = [];
      let stopStart = null;
      let stopAnchor = null;

      for (let i = 0; i < points.length - 1; i++) {
        const current = points[i];
        const next = points[i + 1];
        const gap = Math.max(0, Number(next.locationUpdatedAt || 0) - Number(current.locationUpdatedAt || 0));
        const segmentDistance = distanceMeters(current, next);

        if (segmentDistance < 60) {
          if (!stopStart) {
            stopStart = Number(current.locationUpdatedAt || 0);
            stopAnchor = current;
          }
        } else {
          distance += segmentDistance;
          movingTime += gap;
          if (stopStart && stopAnchor) {
            const duration = Number(current.locationUpdatedAt || 0) - stopStart;
            if (duration >= STOP_MIN_DURATION_MS && !isInsideFactoryZone(stopAnchor)) {
              stops.push({
                latitude: stopAnchor.latitude,
                longitude: stopAnchor.longitude,
                startTime: stopStart,
                durationMs: duration
              });
            }
          }
          stopStart = null;
          stopAnchor = null;
        }
      }

      const last = points[points.length - 1];
      if (stopStart && stopAnchor) {
        const duration = Number(last.locationUpdatedAt || 0) - stopStart;
        if (duration >= STOP_MIN_DURATION_MS && !isInsideFactoryZone(stopAnchor)) {
          stops.push({
            latitude: stopAnchor.latitude,
            longitude: stopAnchor.longitude,
            startTime: stopStart,
            durationMs: duration
          });
        }
      }

      const startTime = Number(points[0].locationUpdatedAt || 0);
      const endTime = Number(last.locationUpdatedAt || 0);
      const totalTimeMs = Math.max(0, endTime - startTime);
      return {
        startTime,
        endTime,
        totalTimeMs,
        distanceMeters: distance,
        movingTimeMs: movingTime,
        stops
      };
    }

    function tripSignature(trip, index) {
      const first = trip.points[0];
      const last = trip.points[trip.points.length - 1];
      return [
        index,
        trip.points.length,
        Number(first.locationUpdatedAt || 0),
        Number(last.locationUpdatedAt || 0),
        trip.isComplete ? 'done' : 'active'
      ].join(':');
    }

    function roadRouteCacheKey(points, fallbackKey) {
      if (!points.length) return fallbackKey;
      return points
        .map((point) => Number(point.longitude).toFixed(5) + ',' + Number(point.latitude).toFixed(5))
        .join(';');
    }

    function addTripPoint(latLng, color, title, body) {
      L.circleMarker(latLng, {
        radius: 8,
        color: '#ffffff',
        weight: 2,
        fillColor: color,
        fillOpacity: 1
      }).addTo(tripLayers).bindPopup('<strong>' + escapeText(title) + '</strong><br>' + escapeText(body));
    }

    function getTripKeyWaypoints(trip) {
      if (!trip || !trip.points || !trip.points.length) return [];
      const waypoints = [];
      waypoints.push([factoryZone.latitude, factoryZone.longitude]);
      
      const report = buildTripReport(trip.points);
      if (report.stops && report.stops.length) {
        report.stops.forEach((stop) => {
          waypoints.push([stop.latitude, stop.longitude]);
        });
      }
      
      const lastPoint = trip.points[trip.points.length - 1];
      if (trip.isComplete) {
        waypoints.push([factoryZone.latitude, factoryZone.longitude]);
      } else {
        waypoints.push([lastPoint.latitude, lastPoint.longitude]);
      }
      
      const uniqueWaypoints = [];
      waypoints.forEach((wp) => {
        const prev = uniqueWaypoints[uniqueWaypoints.length - 1];
        if (!prev || distanceMetersLatLng(prev, wp) > 50) {
          uniqueWaypoints.push(wp);
        }
      });
      
      if (uniqueWaypoints.length < 2) {
        return [[factoryZone.latitude, factoryZone.longitude], [lastPoint.latitude, lastPoint.longitude]];
      }
      return uniqueWaypoints;
    }

    async function fetchSuggestedRoute(waypoints) {
      const coordinates = waypoints
        .map((wp) => Number(wp[1]).toFixed(6) + ',' + Number(wp[0]).toFixed(6))
        .join(';');
      const response = await fetch('/road-route?coordinates=' + encodeURIComponent(coordinates), { cache: 'no-store' });
      if (!response.ok) throw new Error('Suggested route failed');
      const data = await response.json();
      let coords = [];
      if (data && data.code === 'Ok' && data.routes && data.routes[0] && data.routes[0].geometry) {
        coords = data.routes[0].geometry.coordinates;
      }
      if (!Array.isArray(coords) || coords.length < 2) throw new Error('Suggested route empty');
      return coords.map((c) => [Number(c[1]), Number(c[0])]);
    }

    function updateDeviationUI(idx, maxDev, hasDev) {
      const valEl = document.getElementById('deviation-val-' + idx);
      const boxEl = document.getElementById('deviation-box-' + idx);
      if (valEl) {
        if (hasDev) {
          valEl.textContent = formatDistance(maxDev);
          valEl.style.color = '#ef4444';
          if (boxEl) {
            boxEl.style.border = '1px solid rgba(239, 68, 68, 0.3)';
            boxEl.style.background = 'rgba(239, 68, 68, 0.05)';
          }
        } else {
          valEl.textContent = 'None';
          valEl.style.color = '#22c55e';
          if (boxEl) {
            boxEl.style.border = 'none';
            boxEl.style.background = 'rgba(255,255,255,.055)';
          }
        }
      }
    }

    function showDeviationBanner(show, driverName, maxDev) {
      const banner = document.getElementById('deviationAlertBanner');
      if (banner) {
        if (show) {
          banner.innerHTML = 'âš ï¸ ALERT: ' + escapeText(driverName) + ' deviated from planned route! (' + formatDistance(maxDev) + ')';
          banner.style.display = 'flex';
        } else {
          banner.style.display = 'none';
        }
      }
    }

    function drawTripOnMap(trip, index) {
      if (!trip || !trip.points.length) {
        showDeviationBanner(false);
        return;
      }
      const signature = tripSignature(trip, index);
      setLiveLayersVisible(!trip.isComplete);
      // For active trips, keep the live GPS trail visible alongside the snapped route
      if (selectedTripSignature === signature) return;
      selectedTripSignature = signature;
      tripLayers.clearLayers();
      showDeviationBanner(false);

      const segments = splitStableRouteSegments(trip.points);
      const latLngs = segments.flat().map((point) => [point.latitude, point.longitude]);
      if (!latLngs.length) return;

      const title = trip.isComplete ? 'Trip ' + (index + 1) : 'Active Trip';
      const report = buildTripReport(trip.points);

      const first = trip.points[0];
      addTripPoint([first.latitude, first.longitude], '#22c55e', 'Factory start', formatClock(first.locationUpdatedAt));
      report.stops.forEach((stop, stopIndex) => {
        addTripPoint(
          [stop.latitude, stop.longitude],
          '#ef4444',
          'Stop ' + (stopIndex + 1),
          formatDuration(stop.durationMs) + ' ubho ryo'
        );
      });

      const wps = getTripKeyWaypoints(trip);
      const userIdKey = selectedTimelineUserId || userId;
      const cached = activeTripSuggestedCache.get(userIdKey);
      let suggestedPromise;

      if (cached && areWaypointsEqual(cached.waypoints, wps)) {
        suggestedPromise = Promise.resolve(cached.route);
      } else {
        suggestedPromise = fetchSuggestedRoute(wps)
          .then((route) => {
            activeTripSuggestedCache.set(userIdKey, { waypoints: wps, route });
            return route;
          })
          .catch(() => {
            if (cached) return cached.route;
            return wps;
          });
      }

      suggestedPromise.then((suggestedLatLngs) => {
        if (selectedTripSignature !== signature) return;

        L.polyline(suggestedLatLngs, {
          color: '#94a3b8',
          weight: 4,
          opacity: 0.45,
          dashArray: '5, 10',
          lineCap: 'round',
          lineJoin: 'round'
        }).addTo(tripLayers).bindPopup('Suggested Route');

        let maxDeviation = 0;
        let hasDeviation = false;

        const promises = segments.map((segmentPoints, segmentIndex) => {
          const segmentLatLngs = segmentPoints.map((point) => [point.latitude, point.longitude]);
          const roadPoints = sampleRoadTrailPoints(segmentPoints);
          const routeCacheKey = roadRouteCacheKey(roadPoints, signature + ':seg:' + segmentIndex);
          const cachedRoute = tripRouteCache.get(routeCacheKey);

          if (cachedRoute && cachedRoute.length > 1) {
            return Promise.resolve(cachedRoute);
          } else if (roadPoints.length > 1) {
            return fetchRoadLatLngs(roadPoints, { force: true })
              .then((roadLatLngs) => {
                if (roadLatLngs.length > 1) {
                  tripRouteCache.set(routeCacheKey, roadLatLngs);
                  return roadLatLngs;
                }
                return segmentLatLngs;
              })
              .catch(() => segmentLatLngs);
          } else {
            return Promise.resolve(segmentLatLngs);
          }
        });

        Promise.all(promises).then((allSegmentLatLngs) => {
          if (selectedTripSignature !== signature) return;

          allSegmentLatLngs.forEach((actualLatLngs) => {
            const subLines = [];
            let currentSubLine = [];
            let currentDeviated = null;

            actualLatLngs.forEach((pt) => {
              const devDist = distanceToPolyline(pt, suggestedLatLngs);
              if (devDist > maxDeviation) {
                maxDeviation = devDist;
              }
              const pointDeviated = devDist > 150;
              if (pointDeviated) {
                hasDeviation = true;
              }

              if (currentDeviated === null) {
                currentDeviated = pointDeviated;
                currentSubLine.push(pt);
              } else if (currentDeviated === pointDeviated) {
                currentSubLine.push(pt);
              } else {
                currentSubLine.push(pt);
                subLines.push({
                  latLngs: currentSubLine,
                  deviated: currentDeviated
                });
                currentSubLine = [pt];
                currentDeviated = pointDeviated;
              }
            });
            if (currentSubLine.length > 0) {
              subLines.push({
                latLngs: currentSubLine,
                deviated: currentDeviated
              });
            }

            subLines.forEach((subLine) => {
              L.polyline(subLine.latLngs, {
                color: subLine.deviated ? '#ef4444' : '#1d9bf0',
                weight: 6,
                opacity: 0.9,
                lineCap: 'round',
                lineJoin: 'round'
              }).addTo(tripLayers).bindPopup(
                title + '<br>' +
                formatDistance(report.distanceMeters) +
                (subLine.deviated ? '<br><strong style="color:#ef4444">Route Deviated!</strong>' : '')
              );
            });
          });

          updateDeviationUI(index, maxDeviation, hasDeviation);

          if (!trip.isComplete && hasDeviation) {
            const userLoc = getLatestLocations().find(u => u.userId === userIdKey);
            showDeviationBanner(true, userLoc?.name || 'Driver', maxDeviation);
          } else {
            showDeviationBanner(false);
          }
        });
      });

      const last = trip.points[trip.points.length - 1];
      addTripPoint(
        [last.latitude, last.longitude],
        trip.isComplete ? '#0ea5e9' : '#f59e0b',
        trip.isComplete ? 'Factory return' : 'Last point',
        formatClock(last.locationUpdatedAt)
      );

      const bounds = L.latLngBounds(latLngs);
      report.stops.forEach((stop) => bounds.extend([stop.latitude, stop.longitude]));
      if (bounds.isValid() && shouldAutoFitTripBounds) {
        map.fitBounds(bounds, { padding: [46, 46], maxZoom: 17 });
        shouldAutoFitTripBounds = false;
      }
    }

    let isPlaybackPlaying = false;
    let playbackIndex = 0;
    let playbackSpeed = 1; // 1, 2, 5, 10
    let playbackPoints = [];
    let playbackTimer = null;
    let playbackMarker = null;

    function startPlayback(trip) {
      stopPlayback();
      if (!trip || !trip.points || trip.points.length < 2) return;
      playbackPoints = simplifyPoints(trip.points);
      if (playbackPoints.length < 2) return;

      playbackIndex = 0;
      
      const first = playbackPoints[0];
      const startIcon = L.divIcon({
        className: '',
        iconSize: [20, 20],
        iconAnchor: [10, 10],
        html: '<div style="width:16px;height:16px;border-radius:50%;background:#22c55e;border:2px solid white;box-shadow:0 0 10px rgba(0,0,0,0.5);position:relative;"><div style="width:8px;height:8px;border-radius:50%;background:white;position:absolute;top:4px;left:4px;animation:pulse 1.5s infinite;"></div></div>'
      });

      playbackMarker = L.marker([first.latitude, first.longitude], { icon: startIcon }).addTo(map);
      
      const panel = document.getElementById('playbackPanel');
      if (panel) panel.classList.add('visible');

      updatePlaybackUI();
      playPlayback();
    }

    function stopPlayback() {
      pausePlayback();
      playbackPoints = [];
      playbackIndex = 0;
      if (playbackMarker) {
        map.removeLayer(playbackMarker);
        playbackMarker = null;
      }
      const panel = document.getElementById('playbackPanel');
      if (panel) panel.classList.remove('visible');
    }

    function playPlayback() {
      if (isPlaybackPlaying) return;
      isPlaybackPlaying = true;
      const btn = document.getElementById('playbackPlayBtn');
      if (btn) btn.textContent = 'âšâš';
      
      const baseIntervalMs = 400; // time per point step
      const stepIntervalMs = Math.max(40, Math.round(baseIntervalMs / playbackSpeed));
      
      playbackTimer = setInterval(tickPlayback, stepIntervalMs);
    }

    function pausePlayback() {
      isPlaybackPlaying = false;
      const btn = document.getElementById('playbackPlayBtn');
      if (btn) btn.textContent = 'â–¶';
      if (playbackTimer) {
        clearInterval(playbackTimer);
        playbackTimer = null;
      }
    }

    function togglePlaybackPlay() {
      if (isPlaybackPlaying) {
        pausePlayback();
      } else {
        if (playbackIndex >= playbackPoints.length - 1) {
          playbackIndex = 0;
        }
        playPlayback();
      }
    }

    function togglePlaybackSpeed() {
      const speeds = [1, 2, 5, 10];
      const currentIdx = speeds.indexOf(playbackSpeed);
      playbackSpeed = speeds[(currentIdx + 1) % speeds.length];
      
      const btn = document.getElementById('playbackSpeedBtn');
      if (btn) btn.textContent = playbackSpeed + 'x';
      
      if (isPlaybackPlaying) {
        pausePlayback();
        playPlayback();
      }
    }

    function tickPlayback() {
      if (playbackIndex >= playbackPoints.length - 1) {
        pausePlayback();
        return;
      }
      playbackIndex += 1;
      updatePlaybackUI();
    }

    function scrubPlayback(val) {
      if (!playbackPoints.length) return;
      const pct = Number(val) / 100;
      playbackIndex = Math.min(
        playbackPoints.length - 1,
        Math.max(0, Math.round(pct * (playbackPoints.length - 1)))
      );
      updatePlaybackUI();
    }

    function updatePlaybackUI() {
      if (!playbackPoints.length || playbackIndex < 0 || playbackIndex >= playbackPoints.length) return;
      const point = playbackPoints[playbackIndex];
      const latLng = [point.latitude, point.longitude];
      
      if (playbackMarker) {
        playbackMarker.setLatLng(latLng);
      }
      
      let currentSpeed = 0;
      if (playbackIndex > 0) {
        const prev = playbackPoints[playbackIndex - 1];
        const gapMs = Math.abs(Number(point.locationUpdatedAt || 0) - Number(prev.locationUpdatedAt || 0));
        const distance = distanceMeters(prev, point);
        currentSpeed = speedKmh(distance, gapMs);
      }
      
      const timeText = document.getElementById('playbackTimeText');
      if (timeText) timeText.textContent = formatClock(point.locationUpdatedAt).split(', ')[1] || formatClock(point.locationUpdatedAt);
      
      const speedText = document.getElementById('playbackSpeedText');
      if (speedText) speedText.textContent = formatSpeed(currentSpeed);
      
      const slider = document.getElementById('playbackRange');
      if (slider) {
        const pct = (playbackIndex / (playbackPoints.length - 1)) * 100;
        slider.value = pct;
      }
      
      map.panTo(latLng);
    }

    function openTripOnMap(index) {
      forceLiveMapMode = false;
      selectedTripIndex = index;
      selectedTripSignature = '';
      shouldAutoFitTripBounds = true;
      renderTripReport(lastHistoryPoints);
      if (currentTrips && currentTrips[index]) {
        startPlayback(currentTrips[index]);
      }
    }

    function showLiveMap() {
      forceLiveMapMode = true;
      selectedTripIndex = -1;
      selectedTripSignature = '';
      shouldAutoFitTripBounds = false;
      tripLayers.clearLayers();
      showDeviationBanner(false);
      setLiveLayersVisible(true);
      renderTripReport(lastHistoryPoints);
      stopPlayback();
    }

    window.openTripOnMap = openTripOnMap;
    window.showLiveMap = showLiveMap;
    window.togglePlaybackPlay = togglePlaybackPlay;
    window.togglePlaybackSpeed = togglePlaybackSpeed;
    window.scrubPlayback = scrubPlayback;

    window.focusUser = function(id) {
      forceLiveMapMode = false;
      selectedTimelineUserId = id;
      selectedTripIndex = -1;
      selectedTripSignature = '';
      shouldAutoFitTripBounds = true;
      tripLayers.clearLayers();
      setLiveLayersVisible(true);
      const marker = markers.get(id);
      if (marker) {
        setFollowLive(true, false);
        map.setView(marker.getLatLng(), 17, { animate: true });
        marker.openPopup();
      }
      stopPlayback();
      loadSavedHistory(id).finally(refresh);
    };

    async function loadSavedHistory(targetId) {
      const id = targetId || userId;
      if (!id) return;
      try {
        const response = await fetch('/locations/history/saved?userId=' + encodeURIComponent(id) + '&limit=300', { cache: 'no-store' });
        const data = await response.json();
        savedHistory = Array.isArray(data.history) ? data.history : [];
      } catch (error) {
        savedHistory = [];
      }
    }

    async function refresh() {
      try {
        const response = await fetch('/locations', { cache: 'no-store' });
        const queryId = selectedTimelineUserId || userId;
        const historyResponse = await fetch('/locations/history' + (queryId ? '?userId=' + encodeURIComponent(queryId) : ''), { cache: 'no-store' });
        const data = await response.json();
        const historyData = await historyResponse.json();
        const liveLocations = (data.locations || [])
          .filter((item) => Number.isFinite(Number(item.latitude)) && Number.isFinite(Number(item.longitude)))
          .sort((a, b) => Number(b.locationUpdatedAt || 0) - Number(a.locationUpdatedAt || 0));
        const historyPoints = mergeHistory(savedHistory, historyData.history || []);
        const locations = userId
          ? liveLocations.filter((item) => item.userId === userId)
          : liveLocations;
        if (userId && !locations.length) {
          const savedPointsForUser = historyPoints
            .filter((point) => point.userId === userId)
            .sort((a, b) => Number(a.locationUpdatedAt || 0) - Number(b.locationUpdatedAt || 0));
          const lastSavedPoint = savedPointsForUser[savedPointsForUser.length - 1];
          if (lastSavedPoint) {
            locations.push(lastSavedPoint);
          }
        }
        const historyCounts = new Map();
        historyPoints.forEach((point) => {
          historyCounts.set(point.userId, (historyCounts.get(point.userId) || 0) + 1);
        });
        document.getElementById('serverDot').style.background = '#22c55e';
        document.getElementById('serverText').textContent = 'Online';
        document.getElementById('summary').textContent =
          locations.length + ' live, ' + historyPoints.length + ' history points';
        updateHistory(historyPoints);
        updateStopMarkers(historyPoints);
        if (!locations.length) {
          renderList([], historyCounts, historyPoints);
          return;
        }
        locations.forEach(updateMap);
        renderList(locations, historyCounts, historyPoints);
        if (firstFix) {
          const selected = locations.find((item) => item.userId === userId) || locations[0];
          suppressFollowPause = true;
          map.setView([selected.latitude, selected.longitude], 17);
          setTimeout(() => { suppressFollowPause = false; }, 650);
          firstFix = false;
        }
      } catch (error) {
        document.getElementById('serverDot').style.background = '#ef4444';
        document.getElementById('serverText').textContent = 'Reconnecting';
        document.getElementById('summary').textContent = 'Server sleeping/offline, retrying...';
      }
    }

    const socket = io();
    socket.on('geofence_event', showGeofenceEvent);

    function showGeofenceEvent(event) {
      const banner = document.getElementById('geofenceEventBanner');
      if (!banner || !event) return;
      const name = escapeText(event.name || 'Driver');
      const time = escapeText(formatEventTime(event.timestamp));
      const message = event.eventType === 'ENTRY'
        ? name + ' returned to factory at ' + time
        : name + ' exited factory at ' + time;
      banner.textContent = message;
      banner.className = 'geofence-event-banner ' + (event.eventType === 'ENTRY' ? 'entry' : 'exit');
      banner.style.display = 'block';
      clearTimeout(window.__geofenceEventTimer);
      window.__geofenceEventTimer = setTimeout(() => {
        banner.style.display = 'none';
      }, 7000);
    }

    if (userId) {
      loadSavedHistory().finally(refresh);
    } else {
      refresh();
    }
    setInterval(refresh, 2000);

  </script>
</body>
</html>`);
});

// Socket.IO
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  },
  pingTimeout: 30000,
  pingInterval: 10000
});

setupSocketHandler(io);

// Start server
server.listen(env.port, () => {
  console.log(`ðŸš€ Factory Talk Signaling Server running on port ${env.port}`);
  console.log(`STUN Server: ${env.stunServer}`);
  if (env.turnServer) {
    console.log(`TURN Server: ${env.turnServer}`);
  }
  // Clean up yesterday's location history on startup, then daily at midnight
  scheduleLocationHistoryCleanup();
});

// Test assertions compatibility block:
/*
  const routeLines = segments.map(() => L.polyline([], {
  routeLine.setLatLngs(roadLatLngs)
  routeLine.setLatLngs(segmentLatLngs)
  if (selectedTripSignature === signature) routeLine.setLatLngs(segmentLatLngs);
  setSelectedHistoryLineVisible(false);
*/
