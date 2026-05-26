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

app.get('/map/:userId', (req, res) => {
  const userId = req.params.userId;
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
    html, body, #map { height: 100%; margin: 0; }
    .panel {
      position: fixed;
      z-index: 1000;
      left: 12px;
      right: 12px;
      bottom: 12px;
      background: rgba(15, 18, 25, 0.92);
      color: white;
      border-radius: 10px;
      padding: 12px 14px;
      font: 15px system-ui, -apple-system, Segoe UI, sans-serif;
      box-shadow: 0 8px 30px rgba(0,0,0,.28);
    }
    .name { font-weight: 700; margin-bottom: 4px; }
    .muted { color: #c7ccd8; font-size: 13px; }
  </style>
</head>
<body>
  <div id="map"></div>
  <div class="panel">
    <div class="name" id="name">Loading location...</div>
    <div class="muted" id="status">Waiting for latest Factory Talk location</div>
  </div>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    const userId = ${JSON.stringify(userId)};
    const map = L.map('map').setView([21.1702, 72.8311], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap'
    }).addTo(map);
    let marker;
    let firstFix = true;

    function updatePanel(location) {
      document.getElementById('name').textContent = location.name || 'Factory Phone';
      document.getElementById('status').textContent =
        'Last update: ' + new Date(location.locationUpdatedAt).toLocaleTimeString();
    }

    async function refresh() {
      try {
        const response = await fetch('/locations', { cache: 'no-store' });
        const data = await response.json();
        const location = (data.locations || []).find((item) => item.userId === userId);
        if (!location) {
          document.getElementById('name').textContent = 'Location not received yet';
          document.getElementById('status').textContent = 'Keep location sharing ON in Factory Talk';
          return;
        }
        const latLng = [location.latitude, location.longitude];
        if (!marker) {
          marker = L.marker(latLng).addTo(map);
        } else {
          marker.setLatLng(latLng);
        }
        marker.bindPopup(location.name || 'Factory Phone');
        if (firstFix) {
          map.setView(latLng, 17);
          firstFix = false;
        } else {
          map.panTo(latLng, { animate: true });
        }
        updatePanel(location);
      } catch (error) {
        document.getElementById('status').textContent = 'Server reconnecting...';
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
