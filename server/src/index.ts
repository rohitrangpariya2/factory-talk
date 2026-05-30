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
      max-height: 38vh;
      overflow: auto;
      padding: 10px;
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
      .panel { right: auto; width: 390px; max-height: 48vh; }
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
  <div class="panel">
    <div id="userList"></div>
    <div id="timeline" class="timeline"></div>
  </div>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    const userId = ${JSON.stringify(userId)};
    const map = L.map('map').setView([21.1702, 72.8311], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap'
    }).addTo(map);
    const markers = new Map();
    const circles = new Map();
    const historyLines = new Map();
    let savedHistory = [];
    let selectedTimelineUserId = userId || '';
    let firstFix = true;

    function escapeText(value) {
      return String(value || '').replace(/[&<>"']/g, (char) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
      }[char]));
    }

    function ageMs(location) {
      return Math.max(0, Date.now() - Number(location.locationUpdatedAt || 0));
    }

    function statusFor(location) {
      if (location.isBusy) return { label: 'Busy', color: '#f59e0b' };
      if (ageMs(location) > 120000) return { label: 'Old location', color: '#94a3b8' };
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
        const latLngs = userPoints.map((point) => [point.latitude, point.longitude]);
        if (latLngs.length < 2) return;
        const last = userPoints[userPoints.length - 1];
        const color = statusFor(last).color;
        if (!historyLines.has(key)) {
          historyLines.set(key, L.polyline(latLngs, {
            color,
            weight: 4,
            opacity: 0.75,
            lineCap: 'round',
            lineJoin: 'round'
          }).addTo(map));
        } else {
          historyLines.get(key).setLatLngs(latLngs);
          historyLines.get(key).setStyle({ color });
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
      const timeline = document.getElementById('timeline');
      if (!selectedTimelineUserId) {
        timeline.innerHTML = '<div class="timeline-title">Trip Report</div><div class="muted">User par Track dabavo, pachi trip summary dekhase.</div>';
        return;
      }

      const userPoints = simplifyPoints(points
        .filter((point) => point.userId === selectedTimelineUserId)
        .filter((point) => Number.isFinite(Number(point.latitude)) && Number.isFinite(Number(point.longitude)))
        .sort((a, b) => Number(a.locationUpdatedAt || 0) - Number(b.locationUpdatedAt || 0)));

      if (userPoints.length < 2) {
        timeline.innerHTML = '<div class="timeline-title">Trip Report</div><div class="muted">Aa user ni trip report mate ochha points che. Phone move thase pachi report banse.</div>';
        return;
      }

      const selectedName = escapeText(userPoints[userPoints.length - 1].name || 'Factory Phone');
      const report = buildTripReport(userPoints);
      const expectedSlowMs = report.distanceMeters / 20 * 3600000 / 1000;
      const expectedFastMs = report.distanceMeters / 30 * 3600000 / 1000;
      const expectedText = formatDuration(expectedFastMs) + ' - ' + formatDuration(expectedSlowMs);
      const directText = report.stops.length
        ? 'Vachhe ' + report.stops.length + ' stop'
        : 'Direct gayo, major stop nathi';

      const stopRows = report.stops.length
        ? report.stops.map((stop, index) => {
            const mapsUrl = 'https://www.google.com/maps/search/?api=1&query=' + stop.latitude + ',' + stop.longitude;
            return '<div class="timeline-item">' +
              '<div class="timeline-time">Stop ' + (index + 1) + ' - ' + escapeText(formatClock(stop.startTime)) + '</div>' +
              '<div class="timeline-chip">Stopped</div>' +
              '<div class="timeline-main">Aa jagya par ' + escapeText(formatDuration(stop.durationMs)) + ' ubho ryo.</div>' +
              '<div class="timeline-meta">Location: ' + Number(stop.latitude).toFixed(5) + ', ' + Number(stop.longitude).toFixed(5) + '</div>' +
              '<div class="timeline-meta"><a class="timeline-link" target="_blank" rel="noopener" href="' + mapsUrl + '">Stop Google Map ma kholo</a></div>' +
            '</div>';
          }).join('')
        : '<div class="timeline-item"><div class="timeline-main">Vachhe koi major stop detect nathi thayu.</div><div class="timeline-meta">3 min thi vadhu same area ma rokay to stop count thase.</div></div>';

      timeline.innerHTML =
        '<div class="timeline-title">Trip Report - ' + selectedName + '</div>' +
        '<div class="timeline-main">' + escapeText(directText) + '</div>' +
        '<div class="report-grid">' +
          reportBox('Start', formatClock(report.startTime)) +
          reportBox('Last point', formatClock(report.endTime)) +
          reportBox('Actual time', formatDuration(report.totalTimeMs)) +
          reportBox('Expected bike time', expectedText) +
          reportBox('Distance', formatDistance(report.distanceMeters)) +
          reportBox('Moving time', formatDuration(report.movingTimeMs)) +
          reportBox('Avg speed', formatSpeed(report.avgSpeedKmh)) +
          reportBox('Max speed', formatSpeed(report.maxSpeedKmh)) +
        '</div>' +
        '<div class="timeline-title">Stops</div>' +
        stopRows;
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

    function buildTripReport(points) {
      let distance = 0;
      let movingTime = 0;
      let maxSpeed = 0;
      const stops = [];
      let stopStart = null;
      let stopAnchor = null;

      for (let i = 0; i < points.length - 1; i++) {
        const current = points[i];
        const next = points[i + 1];
        const gap = Math.max(0, Number(next.locationUpdatedAt || 0) - Number(current.locationUpdatedAt || 0));
        const segmentDistance = distanceMeters(current, next);
        const segmentSpeed = speedKmh(segmentDistance, gap);
        if (segmentSpeed > maxSpeed && segmentSpeed < 120) maxSpeed = segmentSpeed;

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
            if (duration >= 3 * 60 * 1000) {
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
        if (duration >= 3 * 60 * 1000) {
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
        avgSpeedKmh: speedKmh(distance, movingTime || totalTimeMs),
        maxSpeedKmh: maxSpeed,
        stops
      };
    }

    window.focusUser = function(id) {
      selectedTimelineUserId = id;
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
