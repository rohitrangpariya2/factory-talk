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
import { getLatestLocations, setupSocketHandler } from './signaling/socketHandler';

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

    function renderList(locations) {
      const list = document.getElementById('userList');
      if (!locations.length) {
        list.innerHTML = '<div class="muted">Koi phone nu location haju receive nathi thayu.</div>';
        return;
      }
      list.innerHTML = locations.map((location) => {
        const status = statusFor(location);
        const accuracy = location.accuracy ? Math.round(location.accuracy) + 'm' : 'unknown';
        const mapsUrl = 'https://www.google.com/maps/search/?api=1&query=' + location.latitude + ',' + location.longitude;
        return '<div class="user">' +
          '<div>' +
            '<div style="font-weight:800">' + escapeText(location.name || 'Factory Phone') + '</div>' +
            '<div class="muted"><span class="dot" style="background:' + status.color + '"></span> ' +
              status.label + ' - ' + timeAgo(location) + ' - ' + escapeText(accuracy) + '</div>' +
          '</div>' +
          '<div style="display:flex;gap:6px;align-items:center">' +
            '<button onclick="focusUser(\\'' + escapeText(location.userId) + '\\')">Track</button>' +
            '<a target="_blank" rel="noopener" href="' + mapsUrl + '">Google</a>' +
          '</div>' +
        '</div>';
      }).join('');
    }

    window.focusUser = function(id) {
      const marker = markers.get(id);
      if (!marker) return;
      map.setView(marker.getLatLng(), 17, { animate: true });
      marker.openPopup();
    };

    async function refresh() {
      try {
        const response = await fetch('/locations', { cache: 'no-store' });
        const data = await response.json();
        const locations = (data.locations || [])
          .filter((item) => Number.isFinite(Number(item.latitude)) && Number.isFinite(Number(item.longitude)))
          .sort((a, b) => Number(b.locationUpdatedAt || 0) - Number(a.locationUpdatedAt || 0));
        document.getElementById('serverDot').style.background = '#22c55e';
        document.getElementById('serverText').textContent = 'Online';
        document.getElementById('summary').textContent = locations.length + ' phone location' + (locations.length === 1 ? '' : 's');
        if (!locations.length) {
          renderList([]);
          return;
        }
        locations.forEach(updateMap);
        renderList(locations);
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

    refresh();
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
