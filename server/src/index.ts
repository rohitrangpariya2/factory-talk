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
import { buildFactoryZoneScript } from './map/factoryZone';
import { buildOsrmRouteUrl, normalizeRoadRouteCoordinates } from './map/roadRoute';
import { buildRoadTrailScript } from './map/roadTrail';
import { buildStopMarkersScript } from './map/stopMarkers';
import { getSavedLocationHistory } from './services/locationHistoryService';
import { getLatestLocations, getLocationHistory, setupSocketHandler } from './signaling/socketHandler';

const app = express();
const server = http.createServer(app);

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
  res.status(200).json({ locations: getLatestLocations() });
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

app.get('/road-route', async (req, res) => {
  try {
    const rawCoordinates = typeof req.query.coordinates === 'string' ? req.query.coordinates : '';
    const coordinates = normalizeRoadRouteCoordinates(rawCoordinates);
    if (!coordinates) {
      res.status(400).json({ code: 'InvalidCoordinates' });
      return;
    }

    const routeResponse = await fetch(buildOsrmRouteUrl(coordinates), {
      headers: {
        'User-Agent': 'FactoryTalk/1.0 (https://factory-talk-server.onrender.com)'
      }
    });
    const body = await routeResponse.text();
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

app.get('/delivery/:userId', (req, res) => {
  const userId = req.params.userId || '';
  const user = getLatestLocations().find((location) => location.userId === userId);
  const title = user?.name ? `Delivery Tracking - ${user.name}` : 'Delivery Tracking';

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
    html, body, #map { height: 100%; margin: 0; background: #0f172a; }
    body { font: 14px system-ui, -apple-system, Segoe UI, sans-serif; }
    .card {
      position: fixed;
      left: 12px;
      right: 12px;
      z-index: 1000;
      background: rgba(15, 23, 42, 0.92);
      color: #f8fafc;
      border-radius: 10px;
      box-shadow: 0 8px 30px rgba(0,0,0,.28);
      backdrop-filter: blur(10px);
    }
    .top-card { top: 12px; padding: 10px 12px; }
    .top-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }
    .title { font-weight: 900; font-size: 16px; line-height: 1.2; }
    .status { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 800; }
    .dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
    .meta-grid {
      margin-top: 8px;
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 6px;
    }
    .meta-box {
      border-radius: 8px;
      background: rgba(255,255,255,.06);
      padding: 7px;
    }
    .meta-label { color: #cbd5e1; font-size: 11px; }
    .meta-value { margin-top: 2px; font-weight: 800; font-size: 13px; color: #ffffff; }
    .bottom-drawer {
      bottom: 12px;
      padding: 10px 12px;
    }
    .drawer-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px;
      margin-top: 8px;
    }
    .muted { color: #cbd5e1; font-size: 12px; }
    .toolbar {
      margin-top: 8px;
      display: flex;
      gap: 8px;
    }
    button {
      border: 0;
      border-radius: 999px;
      padding: 8px 12px;
      font-weight: 800;
      cursor: pointer;
    }
    #followBtn { background: #0ea5e9; color: #fff; }
    #centerBtn { background: rgba(148,163,184,.3); color: #e2e8f0; }
    @media (min-width: 820px) {
      .top-card, .bottom-drawer { right: auto; width: 430px; }
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <div class="card top-card">
    <div class="top-row">
      <div>
        <div class="title" id="driverName">Delivery Tracking</div>
        <div class="muted" id="lastUpdated">Waiting for location...</div>
      </div>
      <div class="status"><span class="dot" id="onlineDot"></span><span id="onlineText">Offline</span></div>
    </div>
    <div class="meta-grid">
      <div class="meta-box"><div class="meta-label">Accuracy</div><div class="meta-value" id="accuracy">--</div></div>
      <div class="meta-box"><div class="meta-label">Speed</div><div class="meta-value" id="speed">--</div></div>
      <div class="meta-box"><div class="meta-label">Battery</div><div class="meta-value" id="battery">--</div></div>
    </div>
    <div class="toolbar">
      <button id="followBtn" type="button">Follow live: ON</button>
      <button id="centerBtn" type="button">Center now</button>
    </div>
  </div>

  <div class="card bottom-drawer">
    <div class="title">Today Trip</div>
    <div class="drawer-grid">
      <div class="meta-box"><div class="meta-label">Trip km</div><div class="meta-value" id="tripKm">0 m</div></div>
      <div class="meta-box"><div class="meta-label">Start time</div><div class="meta-value" id="startTime">--</div></div>
      <div class="meta-box"><div class="meta-label">Stops</div><div class="meta-value" id="stops">0</div></div>
      <div class="meta-box"><div class="meta-label">Status</div><div class="meta-value" id="tripStatus">No active trip</div></div>
    </div>
    <div class="muted" id="tripInfo">Route line shows active delivery movement.</div>
  </div>

  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    const userId = ${JSON.stringify(userId)};
    const map = L.map('map').setView([21.1702, 72.8311], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap'
    }).addTo(map);
    ${buildFactoryZoneScript()}
    ${buildRoadTrailScript()}

    const markerLayer = L.layerGroup().addTo(map);
    const routeLayer = L.layerGroup().addTo(map);
    let marker = null;
    let accuracyCircle = null;
    let followLive = true;
    let historyPoints = [];
    let currentRouteSignature = '';

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

    function formatDistance(meters) {
      if (!Number.isFinite(Number(meters)) || Number(meters) <= 0) return '0 m';
      if (meters < 1000) return Math.round(meters) + ' m';
      return (meters / 1000).toFixed(2) + ' km';
    }

    function formatClock(timestamp) {
      if (!timestamp) return '--';
      return new Date(Number(timestamp)).toLocaleTimeString();
    }

    function formatAge(timestamp) {
      const seconds = Math.max(0, Math.floor((Date.now() - Number(timestamp || 0)) / 1000));
      if (seconds < 5) return 'just now';
      if (seconds < 60) return seconds + ' sec ago';
      return Math.floor(seconds / 60) + ' min ago';
    }

    function formatSpeedValue(location, points) {
      const sensorSpeed = Number(location.speedKmh || 0);
      if (sensorSpeed > 0) return Math.round(sensorSpeed) + ' km/h';
      if (points.length < 2) return '--';
      const prev = points[points.length - 2];
      const next = points[points.length - 1];
      const deltaMs = Math.max(1, Number(next.locationUpdatedAt || 0) - Number(prev.locationUpdatedAt || 0));
      const kmh = (distanceMeters(prev, next) / 1000) / (deltaMs / 3600000);
      return Number.isFinite(kmh) && kmh > 1 ? Math.round(kmh) + ' km/h' : '--';
    }

    function batteryText(location) {
      const raw = location.batteryLevel ?? location.battery ?? null;
      const value = Number(raw);
      if (!Number.isFinite(value)) return '--';
      return value > 1 ? Math.round(value) + '%' : Math.round(value * 100) + '%';
    }

    function splitFactoryTrips(points) {
      const trips = [];
      let currentTrip = null;
      let previousPoint = null;
      let returnStartedAt = 0;
      const RETURN_CONFIRM_MS = 60 * 1000;

      function isInsideFactoryZone(point) {
        return distanceMeters(point, {
          latitude: factoryZone.latitude,
          longitude: factoryZone.longitude
        }) <= factoryZone.radiusMeters;
      }

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

      if (currentTrip) trips.push(currentTrip);
      return trips;
    }

    function buildTripReport(points) {
      let distance = 0;
      const stops = [];
      const STOP_MIN_DURATION_MS = 2 * 60 * 1000;
      let stopStart = null;
      let stopAnchor = null;

      for (let i = 0; i < points.length - 1; i++) {
        const current = points[i];
        const next = points[i + 1];
        const segmentDistance = distanceMeters(current, next);
        if (segmentDistance < 60) {
          if (!stopStart) {
            stopStart = Number(current.locationUpdatedAt || 0);
            stopAnchor = current;
          }
        } else {
          distance += segmentDistance;
          if (stopStart && stopAnchor) {
            const duration = Number(current.locationUpdatedAt || 0) - stopStart;
            if (duration >= STOP_MIN_DURATION_MS) stops.push(stopAnchor);
          }
          stopStart = null;
          stopAnchor = null;
        }
      }

      return {
        distanceMeters: distance,
        stopsCount: stops.length
      };
    }

    function activeRoutePoints(points) {
      const trips = splitFactoryTrips(points);
      const activeTrip = trips.find((trip) => !trip.isComplete);
      if (!activeTrip) return [];
      return activeTrip.points
        .filter((point) => Number.isFinite(Number(point.latitude)) && Number.isFinite(Number(point.longitude)))
        .sort((a, b) => Number(a.locationUpdatedAt || 0) - Number(b.locationUpdatedAt || 0));
    }

    function updateRoute(points) {
      const routePoints = activeRoutePoints(points);
      routeLayer.clearLayers();
      if (routePoints.length < 2) return;
      const signature = routePoints
        .slice(-20)
        .map((point) => Math.round(point.latitude * 10000) + ':' + Math.round(point.longitude * 10000))
        .join('|');
      if (signature === currentRouteSignature) return;
      currentRouteSignature = signature;

      const rawLatLngs = routePoints.map((point) => [point.latitude, point.longitude]);
      const routeLine = L.polyline([], {
        color: '#0ea5e9',
        weight: 6,
        opacity: 0.95,
        lineCap: 'round',
        lineJoin: 'round'
      }).addTo(routeLayer);

      const roadPoints = sampleRoadTrailPoints(routePoints);
      if (roadPoints.length > 1) {
        fetchRoadLatLngs(roadPoints)
          .then((roadLatLngs) => {
            if (roadLatLngs.length > 1 && signature === currentRouteSignature) {
              routeLine.setLatLngs(roadLatLngs);
              return;
            }
            if (signature === currentRouteSignature) routeLine.setLatLngs(rawLatLngs);
          })
          .catch(() => {
            if (signature === currentRouteSignature) routeLine.setLatLngs(rawLatLngs);
          });
      } else {
        routeLine.setLatLngs(rawLatLngs);
      }
    }

    function renderTopCard(location) {
      const freshnessMs = Date.now() - Number(location.receivedAt || location.locationUpdatedAt || 0);
      const online = freshnessMs <= 120000;
      document.getElementById('driverName').textContent = location.name || 'Delivery boy';
      document.getElementById('onlineText').textContent = online ? 'Online' : 'Offline';
      document.getElementById('onlineDot').style.background = online ? '#22c55e' : '#94a3b8';
      document.getElementById('lastUpdated').textContent = 'Last updated ' + formatAge(location.locationUpdatedAt);
      document.getElementById('accuracy').textContent = location.accuracy ? Math.round(location.accuracy) + ' m' : '--';
      document.getElementById('speed').textContent = formatSpeedValue(location, historyPoints);
      document.getElementById('battery').textContent = batteryText(location);
    }

    function renderBottomDrawer(points) {
      const trips = splitFactoryTrips(points);
      const activeTrip = trips.find((trip) => !trip.isComplete);
      if (!activeTrip) {
        document.getElementById('tripKm').textContent = '0 m';
        document.getElementById('startTime').textContent = '--';
        document.getElementById('stops').textContent = '0';
        document.getElementById('tripStatus').textContent = 'No active trip';
        return;
      }
      const report = buildTripReport(activeTrip.points);
      document.getElementById('tripKm').textContent = formatDistance(report.distanceMeters);
      document.getElementById('startTime').textContent = formatClock(activeTrip.startTime);
      document.getElementById('stops').textContent = String(report.stopsCount);
      document.getElementById('tripStatus').textContent = 'Active delivery';
    }

    function renderMarker(location) {
      const latLng = [location.latitude, location.longitude];
      markerLayer.clearLayers();
      marker = L.marker(latLng).addTo(markerLayer);
      if (location.accuracy && Number(location.accuracy) > 0 && Number(location.accuracy) < 5000) {
        accuracyCircle = L.circle(latLng, {
          radius: Number(location.accuracy),
          color: '#38bdf8',
          weight: 1,
          fillColor: '#38bdf8',
          fillOpacity: 0.12
        }).addTo(markerLayer);
      }
      if (followLive) {
        map.setView(latLng, Math.max(map.getZoom(), 16), { animate: true });
      }
    }

    async function refresh() {
      try {
        const response = await fetch('/locations', { cache: 'no-store' });
        const historyResponse = await fetch('/locations/history?userId=' + encodeURIComponent(userId), { cache: 'no-store' });
        const data = await response.json();
        const historyData = await historyResponse.json();
        const location = (data.locations || []).find((item) => item.userId === userId);
        historyPoints = (historyData.history || [])
          .filter((point) => point.userId === userId)
          .filter((point) => Number.isFinite(Number(point.latitude)) && Number.isFinite(Number(point.longitude)))
          .sort((a, b) => Number(a.locationUpdatedAt || 0) - Number(b.locationUpdatedAt || 0));

        if (!location) {
          document.getElementById('onlineText').textContent = 'Offline';
          document.getElementById('onlineDot').style.background = '#94a3b8';
          return;
        }

        renderTopCard(location);
        renderBottomDrawer(historyPoints);
        renderMarker(location);
        updateRoute(historyPoints);
      } catch (error) {
        document.getElementById('onlineText').textContent = 'Offline';
        document.getElementById('onlineDot').style.background = '#ef4444';
      }
    }

    document.getElementById('followBtn').addEventListener('click', () => {
      followLive = !followLive;
      document.getElementById('followBtn').textContent = 'Follow live: ' + (followLive ? 'ON' : 'OFF');
      if (followLive && marker) {
        map.setView(marker.getLatLng(), Math.max(map.getZoom(), 16), { animate: true });
      }
    });

    document.getElementById('centerBtn').addEventListener('click', () => {
      if (marker) map.setView(marker.getLatLng(), Math.max(map.getZoom(), 16), { animate: true });
    });

    refresh();
    setInterval(refresh, 2000);
  </script>
</body>
</html>`);
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
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 8px;
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
      grid-template-columns: 1fr 1fr 1fr;
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
    .marker-pin {
      width: 18px;
      height: 18px;
      border-radius: 50% 50% 50% 0;
      transform: rotate(-45deg);
      border: 3px solid white;
      box-shadow: 0 2px 10px rgba(0,0,0,.35);
    }
    .marker-pin span {
      display: block;
      width: 6px;
      height: 6px;
      margin: 3px;
      border-radius: 50%;
      background: white;
    }
    @media (min-width: 720px) {
      .topbar { right: auto; width: 390px; }
      .panel { right: auto; width: 390px; }
      .trip-drawer { max-height: min(62vh, 620px); }
      .trip-drawer-content { max-height: calc(min(62vh, 620px) - 72px); }
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <div class="topbar">
    <div>
      <div class="title">Factory Talk Live Map</div>
      <div class="muted" id="summary">Waiting for phones...</div>
    </div>
    <div class="status"><span class="dot" id="serverDot"></span><span id="serverText">Connecting</span></div>
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
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
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
    const circles = new Map();
    const historyLines = new Map();
    const tripLayers = L.layerGroup().addTo(map);
    const tripRouteCache = new Map();
    const LIVE_TRAIL_MAX_POINTS = 25;
    const LIVE_TRAIL_MAX_AGE_MS = 10 * 60 * 1000;
    const LIVE_TRAIL_COLOR = '#2563eb';
    let savedHistory = [];
    let lastHistoryPoints = [];
    let currentTrips = [];
    let selectedTripIndex = -1;
    let selectedTripSignature = '';
    let shouldAutoFitTripBounds = true;
    let selectedTimelineUserId = userId || '';
    let tripDrawerExpanded = false;
    let firstFix = true;

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
        second: '2-digit'
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

    function formatDistance(meters) {
      if (meters < 1000) return Math.round(meters) + ' m';
      return (meters / 1000).toFixed(2) + ' km';
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

    function makeIcon(color) {
      return L.divIcon({
        className: '',
        iconSize: [24, 24],
        iconAnchor: [12, 24],
        popupAnchor: [0, -24],
        html: '<div class="marker-pin" style="background:' + color + '"><span></span></div>'
      });
    }

    function popupHtml(location) {
      const status = statusFor(location);
      const accuracy = location.accuracy ? Math.round(location.accuracy) + 'm accuracy' : 'accuracy unknown';
      const mapsUrl = 'https://www.google.com/maps/search/?api=1&query=' + location.latitude + ',' + location.longitude;
      return '<strong>' + escapeText(location.name || 'Factory Phone') + '</strong><br>' +
        '<span style="color:' + status.color + '">' + status.label + '</span> - ' + timeAgo(location) + '<br>' +
        escapeText(accuracy) + '<br><br>' +
        '<a style="color:#38bdf8" target="_blank" rel="noopener" href="' + mapsUrl + '">Open in Google Maps</a>';
    }

    function liveTrailPoints(points) {
      if (points.length < 2) return points;
      const last = points[points.length - 1];
      const cutoff = Number(last.locationUpdatedAt || 0) - LIVE_TRAIL_MAX_AGE_MS;
      const recent = points.filter((point) => Number(point.locationUpdatedAt || 0) >= cutoff);
      const trail = recent.length >= 2 ? recent : points;
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
        const latLngs = trailPoints.map((point) => [point.latitude, point.longitude]);
        if (latLngs.length < 2) return;
        const color = LIVE_TRAIL_COLOR;
        if (!historyLines.has(key)) {
          historyLines.set(key, L.polyline(latLngs, {
            color,
            weight: 2,
            opacity: 0.45,
            lineCap: 'round',
            lineJoin: 'round',
            dashArray: '2 8'
          }).addTo(map));
        } else {
          historyLines.get(key).setLatLngs(latLngs);
          historyLines.get(key).setStyle({ color, weight: 2, opacity: 0.45, dashArray: '2 8' });
        }
      });

      historyLines.forEach((line, key) => {
        if (!grouped.has(key)) {
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
      if (!markers.has(key)) {
        markers.set(key, L.marker(latLng, { icon: makeIcon(status.color) }).addTo(map));
      }
      const marker = markers.get(key);
      marker.setLatLng(latLng);
      marker.setIcon(makeIcon(status.color));
      marker.bindPopup(popupHtml(location));

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

    function setLayerVisible(layer, visible) {
      if (!layer) return;
      if (visible) {
        if (!map.hasLayer(layer)) layer.addTo(map);
      } else if (map.hasLayer(layer)) {
        map.removeLayer(layer);
      }
    }

    function setLiveLayersVisible(visible) {
      markers.forEach((marker) => setLayerVisible(marker, visible));
      circles.forEach((circle) => setLayerVisible(circle, visible));
      historyLines.forEach((line) => setLayerVisible(line, visible));
      stopMarkers.forEach((marker) => setLayerVisible(marker, visible));
    }

    function setSelectedHistoryLineVisible(visible) {
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
        const status = statusFor(location);
        const accuracy = location.accuracy ? Math.round(location.accuracy) + 'm' : 'unknown';
        const pointCount = historyCounts.get(location.userId) || 0;
        const mapsUrl = 'https://www.google.com/maps/search/?api=1&query=' + location.latitude + ',' + location.longitude;
        return '<div class="user">' +
          '<div>' +
            '<div style="font-weight:800">' + escapeText(location.name || 'Factory Phone') + '</div>' +
            '<div class="muted"><span class="dot" style="background:' + status.color + '"></span> ' +
              status.label + ' - ' + timeAgo(location) + ' - ' + escapeText(accuracy) + ' - Trail ' + pointCount + '</div>' +
          '</div>' +
          '<div style="display:flex;gap:6px;align-items:center">' +
            '<button onclick="focusUser(\\'' + escapeText(location.userId) + '\\')">Track</button>' +
            '<a target="_blank" rel="noopener" href="' + mapsUrl + '">Google</a>' +
          '</div>' +
        '</div>';
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
      const activeTrip = trips.find((trip) => !trip.isComplete);
      const visibleTrips = activeTrip ? [activeTrip] : [];
      currentTrips = visibleTrips;
      if (selectedTripIndex >= visibleTrips.length) {
        selectedTripIndex = -1;
        selectedTripSignature = '';
        shouldAutoFitTripBounds = true;
        tripLayers.clearLayers();
      }
      if (!visibleTrips.length) {
        selectedTripIndex = -1;
        shouldAutoFitTripBounds = true;
        tripLayers.clearLayers();
        setLiveLayersVisible(true);
        updateTripDrawerChrome('Current trip - ' + selectedName, 'Active trip nathi');
        timeline.innerHTML = '<div class="timeline-title">Current trip - ' + selectedName + '</div>' +
          '<div class="muted">Atyare active trip nathi. Factory thi bahar nikalse tyare current trip ane road route dekhase.</div>';
        return;
      }
      if (selectedTripIndex < 0) {
        selectedTripIndex = 0;
        selectedTripSignature = '';
        shouldAutoFitTripBounds = true;
      }

      const summary = buildTripSummary(visibleTrips);
      updateTripDrawerChrome(
        'Current trip - ' + selectedName,
        formatDistance(summary.totalDistanceMeters) + ' - tap karo details mate'
      );
      timeline.innerHTML =
        '<div class="trip-toolbar">' +
          '<div class="timeline-title">Current trip - ' + selectedName + '</div>' +
          '<button onclick="showLiveMap()">Live Map</button>' +
        '</div>' +
        renderTripSummary(summary) +
        visibleTrips.map(renderTripCard).join('');

      if (selectedTripIndex >= 0) {
        drawTripOnMap(visibleTrips[selectedTripIndex], selectedTripIndex);
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
        '<div class="timeline-time">Current trip summary</div>' +
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
        '</div>' +
      '</button>';
    }

    function reportBox(label, value) {
      return '<div class="report-box"><div class="report-label">' + escapeText(label) + '</div><div class="report-value">' + escapeText(value) + '</div></div>';
    }

    function simplifyPoints(points) {
      const simplified = [];
      points.forEach((point) => {
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

    function drawTripOnMap(trip, index) {
      if (!trip || !trip.points.length) return;
      const signature = tripSignature(trip, index);
      setLiveLayersVisible(!trip.isComplete);
      if (!trip.isComplete) setSelectedHistoryLineVisible(false);
      if (selectedTripSignature === signature) return;
      selectedTripSignature = signature;
      tripLayers.clearLayers();

      const latLngs = trip.points
        .filter((point) => Number.isFinite(Number(point.latitude)) && Number.isFinite(Number(point.longitude)))
        .map((point) => [point.latitude, point.longitude]);
      if (!latLngs.length) return;

      const title = trip.isComplete ? 'Trip ' + (index + 1) : 'Active Trip';
      const report = buildTripReport(trip.points);
      const routeLine = L.polyline([], {
        color: '#1d9bf0',
        weight: 6,
        opacity: 0.9,
        lineCap: 'round',
        lineJoin: 'round'
      }).addTo(tripLayers).bindPopup(title + '<br>' + formatDistance(report.distanceMeters));

      const roadPoints = sampleRoadTrailPoints(trip.points);
      const routeCacheKey = roadRouteCacheKey(roadPoints, signature);
      const cachedRoute = tripRouteCache.get(routeCacheKey);
      if (cachedRoute && cachedRoute.length > 1) {
        routeLine.setLatLngs(cachedRoute);
      } else if (roadPoints.length > 1) {
        fetchRoadLatLngs(roadPoints)
          .then((roadLatLngs) => {
            if (roadLatLngs.length > 1) {
              tripRouteCache.set(routeCacheKey, roadLatLngs);
              if (selectedTripSignature === signature) {
                routeLine.setLatLngs(roadLatLngs);
              }
              return;
            }
            if (selectedTripSignature === signature) {
              routeLine.setLatLngs(latLngs);
            }
          })
          .catch(() => {
            if (selectedTripSignature === signature) {
              routeLine.setLatLngs(latLngs);
            }
          });
      } else {
        routeLine.setLatLngs(latLngs);
      }

      const first = trip.points[0];
      const last = trip.points[trip.points.length - 1];
      addTripPoint([first.latitude, first.longitude], '#22c55e', 'Factory start', formatClock(first.locationUpdatedAt));
      report.stops.forEach((stop, stopIndex) => {
        addTripPoint(
          [stop.latitude, stop.longitude],
          '#ef4444',
          'Stop ' + (stopIndex + 1),
          formatDuration(stop.durationMs) + ' ubho ryo'
        );
      });
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

    function openTripOnMap(index) {
      selectedTripIndex = index;
      selectedTripSignature = '';
      shouldAutoFitTripBounds = true;
      renderTripReport(lastHistoryPoints);
    }

    function showLiveMap() {
      selectedTripIndex = -1;
      selectedTripSignature = '';
      shouldAutoFitTripBounds = false;
      tripLayers.clearLayers();
      setLiveLayersVisible(true);
      renderTripReport(lastHistoryPoints);
    }

    window.openTripOnMap = openTripOnMap;
    window.showLiveMap = showLiveMap;

    window.focusUser = function(id) {
      selectedTimelineUserId = id;
      selectedTripIndex = -1;
      selectedTripSignature = '';
      shouldAutoFitTripBounds = true;
      tripLayers.clearLayers();
      setLiveLayersVisible(true);
      const marker = markers.get(id);
      if (marker) {
        map.setView(marker.getLatLng(), 17, { animate: true });
        marker.openPopup();
      }
      refresh();
    };

    async function loadSavedHistory() {
      if (!userId) return;
      try {
        const response = await fetch('/locations/history/saved?userId=' + encodeURIComponent(userId) + '&limit=300', { cache: 'no-store' });
        const data = await response.json();
        savedHistory = Array.isArray(data.history) ? data.history : [];
      } catch (error) {
        savedHistory = [];
      }
    }

    async function refresh() {
      try {
        const response = await fetch('/locations', { cache: 'no-store' });
        const historyResponse = await fetch('/locations/history' + (userId ? '?userId=' + encodeURIComponent(userId) : ''), { cache: 'no-store' });
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
          map.setView([selected.latitude, selected.longitude], 17);
          firstFix = false;
        }
      } catch (error) {
        document.getElementById('serverDot').style.background = '#ef4444';
        document.getElementById('serverText').textContent = 'Reconnecting';
        document.getElementById('summary').textContent = 'Server sleeping/offline, retrying...';
      }
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
  console.log(`🚀 Factory Talk Signaling Server running on port ${env.port}`);
  console.log(`STUN Server: ${env.stunServer}`);
  if (env.turnServer) {
    console.log(`TURN Server: ${env.turnServer}`);
  }
});
