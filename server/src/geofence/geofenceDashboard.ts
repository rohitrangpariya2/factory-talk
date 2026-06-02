export function buildGeofenceHistoryDashboardHtml(): string {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Geofence History</title>
  <style>
    html, body { margin: 0; min-height: 100%; background: #0f172a; color: #f8fafc; }
    body { font: 14px system-ui, -apple-system, Segoe UI, sans-serif; }
    .shell { max-width: 1180px; margin: 0 auto; padding: 16px; }
    .top { display: flex; justify-content: space-between; gap: 12px; align-items: start; flex-wrap: wrap; }
    h1 { margin: 0; font-size: 22px; }
    .muted { color: #94a3b8; margin-top: 4px; }
    .panel {
      margin-top: 12px;
      border: 1px solid rgba(255,255,255,.1);
      background: #111827;
      border-radius: 8px;
      padding: 12px;
    }
    .grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
    .config-grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 8px; align-items: end; }
    label { display: grid; gap: 4px; color: #cbd5e1; font-size: 12px; font-weight: 800; }
    input, button {
      min-height: 38px;
      border-radius: 8px;
      border: 1px solid rgba(255,255,255,.14);
      background: #0b1220;
      color: white;
      padding: 0 10px;
      box-sizing: border-box;
      font: inherit;
    }
    button { background: #2563eb; border-color: #3b82f6; font-weight: 900; cursor: pointer; }
    .metric { background: rgba(255,255,255,.055); border-radius: 8px; padding: 10px; }
    .metric-label { color: #94a3b8; font-size: 11px; font-weight: 900; }
    .metric-value { margin-top: 5px; font-size: 18px; font-weight: 900; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    th, td { text-align: left; border-bottom: 1px solid rgba(255,255,255,.08); padding: 9px 6px; }
    th { color: #94a3b8; font-size: 12px; }
    .status { margin-top: 8px; color: #cbd5e1; }
    @media (max-width: 840px) {
      .grid, .config-grid { grid-template-columns: 1fr 1fr; }
    }
  </style>
</head>
<body>
  <div class="shell">
    <div class="top">
      <div>
        <h1>Geofence History</h1>
        <div class="muted">Entry and exit alerts for factory geofence.</div>
      </div>
      <button type="button" onclick="loadEvents()">Refresh</button>
    </div>

    <section class="panel">
      <div class="config-grid">
        <label>Factory latitude <input id="configLat" type="number" step="0.000001" /></label>
        <label>Factory longitude <input id="configLng" type="number" step="0.000001" /></label>
        <label>Radius meters <input id="configRadius" type="number" min="20" value="100" /></label>
        <button type="button" onclick="saveConfig()">Save Geofence</button>
        <div class="status" id="configStatus">Loading config...</div>
      </div>
    </section>

    <section class="panel">
      <div class="config-grid">
        <label>User ID <input id="userFilter" placeholder="Optional userId" /></label>
        <label>Date <input id="dateFilter" type="date" /></label>
        <button type="button" onclick="loadEvents()">Load Events</button>
      </div>
      <div class="grid" style="margin-top:12px">
        <div class="metric"><div class="metric-label">First exit</div><div class="metric-value" id="firstExitValue">-</div></div>
        <div class="metric"><div class="metric-label">Last return</div><div class="metric-value" id="lastReturnValue">-</div></div>
        <div class="metric"><div class="metric-label">Total trips</div><div class="metric-value" id="totalTripsValue">0</div></div>
        <div class="metric"><div class="metric-label">Total time outside</div><div class="metric-value" id="outsideTimeValue">00:00:00</div></div>
      </div>
      <div class="status" id="eventsStatus">Select date and load events.</div>
      <table>
        <thead><tr><th>User</th><th>Exit time</th><th>Entry time</th><th>Duration outside factory</th></tr></thead>
        <tbody id="tripRows"></tbody>
      </table>
    </section>
  </div>

  <script>
    function todayValue() {
      const now = new Date();
      return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
    }
    function formatClock(timestamp) {
      if (!timestamp) return '-';
      return new Date(Number(timestamp)).toLocaleString(undefined, {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
        hourCycle: 'h12'
      });
    }
    function formatDuration(ms) {
      const totalSeconds = Math.max(0, Math.round(Number(ms || 0) / 1000));
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;
      return [hours, minutes, seconds].map((value) => String(value).padStart(2, '0')).join(':');
    }
    async function loadConfig() {
      const response = await fetch('/geofence-config', { cache: 'no-store' });
      const data = await response.json();
      document.getElementById('configLat').value = data.config.latitude;
      document.getElementById('configLng').value = data.config.longitude;
      document.getElementById('configRadius').value = data.config.radiusMeters;
      document.getElementById('configStatus').textContent = 'Config loaded';
    }
    async function saveConfig() {
      document.getElementById('configStatus').textContent = 'Saving...';
      const response = await fetch('/geofence-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          latitude: Number(document.getElementById('configLat').value),
          longitude: Number(document.getElementById('configLng').value),
          radiusMeters: Number(document.getElementById('configRadius').value)
        })
      });
      const data = await response.json();
      if (!response.ok) {
        document.getElementById('configStatus').textContent = data.error || 'Failed to save';
        return;
      }
      document.getElementById('configStatus').textContent = 'Saved';
      await loadEvents();
    }
    async function loadEvents() {
      const date = document.getElementById('dateFilter').value;
      const userId = document.getElementById('userFilter').value.trim();
      if (!date) {
        document.getElementById('eventsStatus').textContent = 'Select date.';
        return;
      }
      document.getElementById('eventsStatus').textContent = 'Loading...';
      const url = '/geofence-history/events?date=' + encodeURIComponent(date) +
        '&timezoneOffsetMinutes=' + encodeURIComponent(String(new Date().getTimezoneOffset())) +
        (userId ? '&userId=' + encodeURIComponent(userId) : '');
      const response = await fetch(url, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) {
        document.getElementById('eventsStatus').textContent = data.error || 'Failed to load events';
        return;
      }
      renderReport(data.report);
      document.getElementById('eventsStatus').textContent = data.events.length ? 'Loaded ' + data.events.length + ' events.' : 'No geofence events for selected date.';
    }
    function renderReport(report) {
      document.getElementById('firstExitValue').textContent = formatClock(report.firstExitAt);
      document.getElementById('lastReturnValue').textContent = formatClock(report.lastReturnAt);
      document.getElementById('totalTripsValue').textContent = String(report.totalTrips || 0);
      document.getElementById('outsideTimeValue').textContent = formatDuration(report.totalTimeOutsideMs);
      document.getElementById('tripRows').innerHTML = (report.trips || []).map((trip) =>
        '<tr><td>' + escapeHtml(trip.name || trip.userId) + '</td><td>' + formatClock(trip.exitAt) + '</td><td>' +
        formatClock(trip.entryAt) + '</td><td>' + formatDuration(trip.durationOutsideMs) + '</td></tr>'
      ).join('');
    }
    function escapeHtml(value) {
      return String(value || '').replace(/[&<>"']/g, (char) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
      }[char]));
    }
    document.getElementById('dateFilter').value = todayValue();
    loadConfig().catch(() => { document.getElementById('configStatus').textContent = 'Failed to load config'; });
    loadEvents();
  </script>
</body>
</html>`;
}
