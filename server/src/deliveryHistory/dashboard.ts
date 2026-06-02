export function buildDeliveryHistoryDashboardHtml(): string {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Delivery History Dashboard</title>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <style>
    html, body { margin: 0; min-height: 100%; background: #0f172a; color: #f8fafc; }
    body { font: 14px system-ui, -apple-system, Segoe UI, sans-serif; }
    .shell { display: grid; grid-template-rows: auto 1fr; min-height: 100vh; }
    .toolbar {
      display: grid;
      grid-template-columns: 1fr;
      gap: 10px;
      padding: 14px;
      background: #111827;
      border-bottom: 1px solid rgba(255,255,255,.1);
    }
    .title { font-size: 18px; font-weight: 900; }
    .warning {
      color: #fde68a;
      background: rgba(245,158,11,.14);
      border: 1px solid rgba(245,158,11,.35);
      border-radius: 8px;
      padding: 8px 10px;
      font-weight: 800;
    }
    .filters {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 8px;
      align-items: end;
    }
    label { color: #cbd5e1; font-size: 12px; font-weight: 800; display: grid; gap: 4px; }
    input, button, a.export-link {
      min-height: 38px;
      border-radius: 8px;
      border: 1px solid rgba(255,255,255,.14);
      background: #0b1220;
      color: #ffffff;
      padding: 0 10px;
      font: inherit;
      box-sizing: border-box;
    }
    button, a.export-link {
      display: inline-grid;
      place-items: center;
      text-decoration: none;
      cursor: pointer;
      font-weight: 900;
      background: #2563eb;
      border-color: #3b82f6;
    }
    .main { display: grid; grid-template-columns: 390px 1fr; min-height: 0; }
    .side {
      overflow: auto;
      padding: 12px;
      background: #101827;
      border-right: 1px solid rgba(255,255,255,.1);
    }
    .metrics { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .metric {
      background: rgba(255,255,255,.055);
      border: 1px solid rgba(255,255,255,.08);
      border-radius: 8px;
      padding: 10px;
    }
    .metric-label { color: #94a3b8; font-size: 11px; font-weight: 800; }
    .metric-value { margin-top: 4px; font-size: 17px; font-weight: 900; }
    .status { margin-top: 10px; color: #cbd5e1; line-height: 1.4; }
    .replay-controls { display: flex; gap: 8px; margin-top: 12px; }
    .replay-controls button { flex: 1; }
    #map { min-height: 520px; height: 100%; }
    .table { width: 100%; border-collapse: collapse; margin-top: 12px; color: #e5e7eb; }
    .table th, .table td { text-align: left; border-bottom: 1px solid rgba(255,255,255,.08); padding: 8px 4px; font-size: 12px; }
    .table th { color: #94a3b8; font-weight: 900; }
    .stop-marker {
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: #f59e0b;
      border: 3px solid #ffffff;
      box-shadow: 0 3px 14px rgba(0,0,0,.45);
    }
    @media (max-width: 860px) {
      .filters { grid-template-columns: 1fr 1fr; }
      .main { grid-template-columns: 1fr; }
      .side { border-right: 0; border-bottom: 1px solid rgba(255,255,255,.1); }
      #map { height: 58vh; }
    }
  </style>
</head>
<body>
  <div class="shell">
    <header class="toolbar">
      <div>
        <div class="title">Delivery History Dashboard</div>
        <div class="warning">Old reports may be unavailable if location history was cleaned.</div>
      </div>
      <div class="filters">
        <label>User
          <input id="userFilter" list="userOptions" placeholder="Enter or select userId" autocomplete="off" />
          <datalist id="userOptions"></datalist>
        </label>
        <label>Date
          <input id="dateFilter" type="date" />
        </label>
        <button type="button" onclick="loadReport()">Load Report</button>
        <a class="export-link" id="exportCsvLink" href="#" onclick="return exportCsv()">Export CSV</a>
      </div>
    </header>
    <main class="main">
      <section class="side">
        <div class="metrics">
          <div class="metric"><div class="metric-label">Daily distance</div><div class="metric-value" id="distanceValue">-</div></div>
          <div class="metric"><div class="metric-label">Moving time</div><div class="metric-value" id="movingValue">-</div></div>
          <div class="metric"><div class="metric-label">Stopped time</div><div class="metric-value" id="stoppedValue">-</div></div>
          <div class="metric"><div class="metric-label">Points</div><div class="metric-value" id="pointsValue">-</div></div>
          <div class="metric"><div class="metric-label">First departure</div><div class="metric-value" id="departureValue">-</div></div>
          <div class="metric"><div class="metric-label">Return to factory</div><div class="metric-value" id="returnValue">-</div></div>
          <div class="metric"><div class="metric-label">Total stops</div><div class="metric-value" id="totalStopsValue">-</div></div>
          <div class="metric"><div class="metric-label">Longest stop</div><div class="metric-value" id="longestStopValue">-</div></div>
        </div>
        <div class="replay-controls">
          <button type="button" id="replayButton" onclick="startReplay()">Replay</button>
          <button type="button" onclick="stopReplay()">Stop</button>
        </div>
        <div class="status" id="statusText">Select user and date, then load report.</div>
        <table class="table">
          <tbody>
            <tr><th>User</th><td id="userValue">-</td></tr>
            <tr><th>Date</th><td id="reportDateValue">-</td></tr>
            <tr><th>Rejected points</th><td id="rejectedValue">-</td></tr>
          </tbody>
        </table>
      </section>
      <div id="map"></div>
    </main>
  </div>

  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    const map = L.map('map').setView([21.259843683720433, 72.9386185449755], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap'
    }).addTo(map);
    let routeLine = null;
    let replayMarker = null;
    let replayTimer = null;
    let currentReport = null;
    let stopMarkers = [];

    function todayValue() {
      const now = new Date();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      return now.getFullYear() + '-' + month + '-' + day;
    }

    function formatDuration(ms) {
      const totalSeconds = Math.max(0, Math.round(Number(ms || 0) / 1000));
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;
      return [hours, minutes, seconds].map((value) => String(value).padStart(2, '0')).join(':');
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

    function exportCsv() {
      const userId = document.getElementById('userFilter').value.trim();
      const date = document.getElementById('dateFilter').value;
      if (!userId || !date) {
        setStatus('Select user and date before export.');
        return false;
      }
      window.location.href = '/delivery-history/export?userId=' + encodeURIComponent(userId) +
        '&date=' + encodeURIComponent(date) +
        '&timezoneOffsetMinutes=' + encodeURIComponent(String(new Date().getTimezoneOffset()));
      return false;
    }

    function setStatus(text) {
      document.getElementById('statusText').textContent = text;
    }

    async function loadUsers() {
      try {
        const response = await fetch('/locations', { cache: 'no-store' });
        const data = await response.json();
        const options = document.getElementById('userOptions');
        options.innerHTML = (data.locations || []).map((location) =>
          '<option value="' + escapeHtml(location.userId) + '">' + escapeHtml(location.name || location.userId) + '</option>'
        ).join('');
        if (!document.getElementById('userFilter').value && data.locations && data.locations[0]) {
          document.getElementById('userFilter').value = data.locations[0].userId;
        }
        if (document.getElementById('userFilter').value && document.getElementById('dateFilter').value) {
          loadReport();
        }
      } catch (error) {
        setStatus('Unable to load live users. Enter userId manually.');
      }
    }

    async function loadReport() {
      const userId = document.getElementById('userFilter').value.trim();
      const date = document.getElementById('dateFilter').value;
      if (!userId || !date) {
        setStatus('Select user and date.');
        return;
      }
      setStatus('Loading report...');
      stopReplay();
      try {
        const response = await fetch('/delivery-history/report?userId=' + encodeURIComponent(userId) +
          '&date=' + encodeURIComponent(date) +
          '&timezoneOffsetMinutes=' + encodeURIComponent(String(new Date().getTimezoneOffset())), { cache: 'no-store' });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Failed to load report');
        currentReport = data.report;
        renderReport(currentReport);
      } catch (error) {
        currentReport = null;
        renderReport(null);
        setStatus(error.message || 'Failed to load report.');
      }
    }

    function renderReport(report) {
      clearRoute();
      if (!report) {
        ['distanceValue','movingValue','stoppedValue','pointsValue','departureValue','returnValue','totalStopsValue','longestStopValue','userValue','reportDateValue','rejectedValue'].forEach((id) => {
          document.getElementById(id).textContent = '-';
        });
        return;
      }
      document.getElementById('distanceValue').textContent = (Number(report.dailyDistanceMeters || 0) / 1000).toFixed(2) + ' km';
      document.getElementById('movingValue').textContent = formatDuration(report.movingTimeMs);
      document.getElementById('stoppedValue').textContent = formatDuration(report.stoppedTimeMs);
      document.getElementById('pointsValue').textContent = String(report.pointCount || 0);
      document.getElementById('departureValue').textContent = formatClock(report.firstDepartureAt);
      document.getElementById('returnValue').textContent = formatClock(report.returnToFactoryAt);
      document.getElementById('totalStopsValue').textContent = String((report.stopSummary && report.stopSummary.totalStops) || 0);
      document.getElementById('longestStopValue').textContent = formatDuration(report.stopSummary && report.stopSummary.longestStopMs);
      document.getElementById('userValue').textContent = report.name ? report.name + ' (' + report.userId + ')' : report.userId;
      document.getElementById('reportDateValue').textContent = report.date;
      document.getElementById('rejectedValue').textContent = String(report.rejectedPointCount || 0);
      drawRoute(report.routeReplay || []);
      drawStopMarkers(report.stops || []);
      setStatus((report.routeReplay || []).length ? 'Report loaded. Route replay is ready.' : 'No history available for selected user/date.');
    }

    function drawRoute(points) {
      const latLngs = points.map((point) => [point.latitude, point.longitude]);
      if (latLngs.length < 1) return;
      routeLine = L.polyline(latLngs, {
        color: '#2563eb',
        weight: 5,
        opacity: 0.95,
        lineCap: 'round',
        lineJoin: 'round'
      }).addTo(map);
      if (latLngs.length > 1) {
        map.fitBounds(L.latLngBounds(latLngs), { padding: [42, 42], maxZoom: 17 });
      } else {
        map.setView(latLngs[0], 17);
      }
    }

    function clearRoute() {
      if (routeLine) map.removeLayer(routeLine);
      routeLine = null;
      if (replayMarker) map.removeLayer(replayMarker);
      replayMarker = null;
      stopMarkers.forEach((marker) => map.removeLayer(marker));
      stopMarkers = [];
    }

    function drawStopMarkers(stops) {
      stopMarkers.forEach((marker) => map.removeLayer(marker));
      stopMarkers = [];
      stopMarkers = stops
        .filter((stop) => Number.isFinite(Number(stop.latitude)) && Number.isFinite(Number(stop.longitude)))
        .map((stop, index) => L.marker([stop.latitude, stop.longitude], {
          icon: L.divIcon({
            className: '',
            iconSize: [24, 24],
            iconAnchor: [12, 12],
            html: '<div class="stop-marker"></div>'
          })
        }).addTo(map).bindPopup(
          'Stop ' + (index + 1) + '<br>' +
          formatDuration(stop.durationMs) + '<br>' +
          formatClock(stop.startTime) + ' - ' + formatClock(stop.endTime)
        ));
    }

    function startReplay() {
      if (!currentReport || !currentReport.routeReplay || !currentReport.routeReplay.length) {
        setStatus('No route points available for replay.');
        return;
      }
      stopReplay(false);
      let index = 0;
      const points = currentReport.routeReplay;
      replayMarker = L.circleMarker([points[0].latitude, points[0].longitude], {
        radius: 8,
        color: '#ffffff',
        weight: 3,
        fillColor: '#22c55e',
        fillOpacity: 1
      }).addTo(map);
      setStatus('Replay running...');
      replayTimer = setInterval(() => {
        index += 1;
        if (index >= points.length) {
          stopReplay(false);
          setStatus('Replay finished.');
          return;
        }
        replayMarker.setLatLng([points[index].latitude, points[index].longitude]);
        map.panTo([points[index].latitude, points[index].longitude], { animate: true, duration: 0.25 });
      }, 450);
    }

    function stopReplay(updateStatus = true) {
      if (replayTimer) clearInterval(replayTimer);
      replayTimer = null;
      if (replayMarker) map.removeLayer(replayMarker);
      replayMarker = null;
      if (updateStatus) setStatus('Replay stopped.');
    }

    function escapeHtml(value) {
      return String(value || '').replace(/[&<>"']/g, (char) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
      }[char]));
    }

    document.getElementById('dateFilter').value = todayValue();
    loadUsers();
  </script>
</body>
</html>`;
}
