// script.js - main logic
// This script runs entirely client-side. It fetches the public IP, geolocates it, animates a Leaflet map, and collects browser data.

const statusEl = document.getElementById('status');
const hudEl = document.getElementById('hud');
const calloutEl = document.getElementById('callout');
const copyJsonBtn = document.getElementById('copyJsonBtn');
const crosshairEl = document.getElementById('crosshair');
const tableBody = document.querySelector('#detailsTable tbody');

// Config for geolocation providers (no key required). We'll try them in order.
const ipEndpoints = [
  { name: 'ipapi.co', url: 'https://ipapi.co/json/', pick: d => ({ ip: d.ip, city: d.city, region: d.region, country: d.country_name, lat: d.latitude, lon: d.longitude, org: d.org, timezone: d.timezone }) },
  { name: 'ipinfo.io', url: 'https://ipinfo.io/json?token=', pick: d => { const [lat, lon] = (d.loc||',').split(','); return ({ ip: d.ip, city: d.city, region: d.region, country: d.country, lat: parseFloat(lat), lon: parseFloat(lon), org: d.org, timezone: d.timezone }); } },
  { name: 'ipapi.com', url: 'https://ip-api.com/json/?fields=61439', pick: d => ({ ip: d.query, city: d.city, region: d.regionName, country: d.country, lat: d.lat, lon: d.lon, org: d.org, timezone: d.timezone }) },
];

function setStatus(text) {
  if (statusEl) statusEl.textContent = text;
}

function markHudDone() {
  const final = document.getElementById('hud-final');
  if (final) final.classList.add('done');
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchIPGeo() {
  let lastError;
  for (const ep of ipEndpoints) {
    try {
      setStatus(`Contacting ${ep.name}…`);
      const res = await fetch(ep.url, { cache: 'no-store' });
      if (!res.ok) throw new Error(`${ep.name} HTTP ${res.status}`);
      const data = await res.json();
      const picked = ep.pick(data);
      if (!picked || !Number.isFinite(picked.lat) || !Number.isFinite(picked.lon)) throw new Error(`${ep.name} missing lat/lon`);
      return { provider: ep.name, raw: data, ...picked };
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError || new Error('All IP endpoints failed');
}

function createMap() {
  const map = L.map('map', {
    zoomControl: false,
    attributionControl: false,
    fadeAnimation: true,
    zoomAnimation: true,
  }).setView([20, 0], 2);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    crossOrigin: true,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  L.control.zoom({ position: 'topright' }).addTo(map);
  L.control.attribution({ position: 'bottomright' }).addTo(map);
  return map;
}

function flyWithTheatrics(map, lat, lon) {
  return new Promise(async (resolve) => {
    // Start from a world view
    map.setView([15, 0], 2, { animate: true });
    await sleep(700);

    // World tour: a few safe hops to give that "hunting" vibe
    const hops = [
      { lat: 40.7128, lon: -74.0060, zoom: 2, duration: 1.2, pause: 220 }, // NYC
      { lat: 51.5074, lon:  -0.1278, zoom: 2, duration: 1.2, pause: 220 }, // London
      { lat: 25.2048, lon:  55.2708, zoom: 2, duration: 1.2, pause: 220 }, // Dubai
      { lat: 35.6762, lon: 139.6503, zoom: 2, duration: 1.2, pause: 220 }, // Tokyo
      { lat: -33.8688,lon: 151.2093, zoom: 2, duration: 1.2, pause: 260 }, // Sydney
      // Approach near destination (slightly offset)
      { lat: clampLat(lat + randRange(-9, 9)), lon: wrapLon(lon + randRange(-16, 16)), zoom: 3, duration: 1.5, pause: 320 },
    ];
    for (const h of hops) {
      map.flyTo([h.lat, h.lon], h.zoom, { animate: true, duration: h.duration });
      await sleep((h.duration * 1000) + (h.pause || 200));
    }

    // Bounce-in over destination: slight jitter and overshoot then settle
    const final = [
      { z: 6,  d: 1.2, p: 180 },
      { z: 9,  d: 1.1, p: 160 },
      { z: 12, d: 1.0, p: 140 },
      { z: 13, d: 0.9, p: 120 }, // overshoot
      { z: 12, d: 0.8, p: 120 }, // settle
    ];
    for (const step of final) {
      const lt = lat + randRange(-0.06, 0.06);
      const ln = lon + randRange(-0.10, 0.10);
      map.flyTo([lt, ln], step.z, { animate: true, duration: step.d });
      await sleep((step.d * 1000) + step.p);
    }

    resolve();
  });
}

// Helpers for animation
function randRange(min, max) { return Math.random() * (max - min) + min; }
function clampLat(v) { return Math.max(-85, Math.min(85, v)); }
function wrapLon(v) { let x = v % 360; if (x > 180) x -= 360; if (x < -180) x += 360; return x; }

function makePulsingMarker(lat, lon, text) {
  const marker = L.circleMarker([lat, lon], {
    radius: 8,
    color: '#22d3ee',
    weight: 2,
    fillColor: '#10b981',
    fillOpacity: 0.8
  });
  const pulse = L.circle([lat, lon], { radius: 200, color: '#22d3ee', weight: 1, opacity: 0.6 });

  const group = L.layerGroup([pulse, marker]);
  let r = 80;
  let dir = 1;
  const pulseId = setInterval(() => {
    r += dir * 40;
    if (r > 800) dir = -1; else if (r < 80) dir = 1;
    try { pulse.setRadius(r); } catch {}
  }, 120);
  group.on('remove', () => clearInterval(pulseId));

  if (text) marker.bindPopup(text, { autoClose: false, closeOnClick: false }).openPopup();
  return group;
}

function gatherBrowserData(extra) {
  const nav = navigator || {};
  const scr = screen || {};
  const loc = location || {};
  const doc = document || {};

  const permissions = (navigator.permissions && navigator.permissions.query) ? 'supported' : 'unknown';
  const connection = nav.connection || nav.mozConnection || nav.webkitConnection;

  const data = {
    // IP/Geo
    ip: extra?.ip || null,
    city: extra?.city || null,
    region: extra?.region || null,
    country: extra?.country || null,
    org: extra?.org || null,
    timezone: extra?.timezone || null,
    geo_provider: extra?.provider || null,
    // Browser
    userAgent: nav.userAgent,
    language: nav.language,
    languages: nav.languages,
    platform: nav.platform,
    hardwareConcurrency: nav.hardwareConcurrency,
    deviceMemory: nav.deviceMemory,
    cookieEnabled: nav.cookieEnabled,
    doNotTrack: nav.doNotTrack,
    vendor: nav.vendor,
    online: nav.onLine,
    pdfViewerEnabled: nav.pdfViewerEnabled,
    webdriver: nav.webdriver,
    // Window/Screen
    url: loc.href,
    referrer: doc.referrer,
    viewport: { width: window.innerWidth, height: window.innerHeight, pixelRatio: window.devicePixelRatio },
    screen: { width: scr.width, height: scr.height, availWidth: scr.availWidth, availHeight: scr.availHeight, colorDepth: scr.colorDepth, orientation: scr.orientation?.type },
    // Network
    connection: connection ? { downlink: connection.downlink, effectiveType: connection.effectiveType, rtt: connection.rtt, saveData: connection.saveData } : null,
    // Time/Intl
    locale: Intl.DateTimeFormat().resolvedOptions().locale,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    // Storage availability
    storage: {
      localStorage: safeStorage('localStorage'),
      sessionStorage: safeStorage('sessionStorage'),
      indexedDB: !!window.indexedDB
    },
    // Security context
    isSecureContext: window.isSecureContext,
  };
  return data;
}

function safeStorage(kind) {
  try {
    const s = window[kind];
    const key = '__ttv__';
    s.setItem(key, '1');
    s.removeItem(key);
    return true;
  } catch (e) {
    return false;
  }
}

function renderTable(obj) {
  tableBody.innerHTML = '';
  const flat = flattenObject(obj);
  for (const [k, v] of Object.entries(flat)) {
    const tr = document.createElement('tr');
    const tdK = document.createElement('td');
    const tdV = document.createElement('td');
    tdK.textContent = k;
    tdV.appendChild(prettyValue(v));
    tr.appendChild(tdK);
    tr.appendChild(tdV);
    tableBody.appendChild(tr);
  }
}

function prettyValue(v) {
  const span = document.createElement('span');
  if (v === null) {
    span.textContent = 'null';
    span.style.color = '#94a3b8';
    return span;
  }
  if (typeof v === 'object') {
    const pre = document.createElement('code');
    pre.textContent = JSON.stringify(v, null, 2);
    return pre;
  }
  span.textContent = String(v);
  return span;
}

function flattenObject(obj, prefix = '', res = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      flattenObject(v, key, res);
    } else {
      res[key] = v;
    }
  }
  return res;
}

async function main() {
  setStatus('Booting map…');
  const map = createMap();
  try {
  crosshair(true);
    // Theatrical steps
    hudEl.querySelectorAll('.hud-line').forEach((n,i)=> i<3 ? n.classList.remove('done') : null);
    setStatus('Fetching public IP & location…');
    const geo = await fetchIPGeo();

    setStatus('Animating to location…');
    await flyWithTheatrics(map, geo.lat, geo.lon);

    setStatus('Marking position…');
    const info = `${geo.city ? geo.city+',' : ''} ${geo.region || ''} ${geo.country || ''}`.trim();
    const marker = makePulsingMarker(geo.lat, geo.lon, `<b>${geo.ip}</b><br/>${info}`);
    marker.addTo(map);

    calloutEl.classList.remove('hidden');
    calloutEl.innerHTML = `You appear to be near <b>${info || 'Unknown'}</b><br/><small>Provider: ${geo.provider}</small>`;

    markHudDone();
  crosshair(false);

    // Collect and render all details
    const all = gatherBrowserData(geo);
    renderTable(all);

    copyJsonBtn?.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(JSON.stringify(all, null, 2));
        copyJsonBtn.textContent = 'Copied!';
        setTimeout(()=> copyJsonBtn.textContent = 'Copy JSON', 1200);
      } catch (e) {
        alert('Copy failed.');
      }
    });

    setStatus('Done');
  } catch (e) {
    console.error(e);
    setStatus('Failed to locate via IP. Falling back to device location…');
    try {
  crosshair(true);
      const pos = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, timeout: 8000 }));
      const { latitude:lat, longitude:lon } = pos.coords;
      await flyWithTheatrics(map, lat, lon);
      const marker = makePulsingMarker(lat, lon, 'Device location');
      marker.addTo(map);
      const all = gatherBrowserData({ provider: 'device-geolocation' });
      renderTable(all);
      setStatus('Done (device location)');
  crosshair(false);
    } catch (e2) {
      console.error('Geolocation fallback failed', e2);
      setStatus('Unable to determine location. You can still view browser details below.');
      const all = gatherBrowserData();
      renderTable(all);
  crosshair(false);
    }
  }
}

window.addEventListener('DOMContentLoaded', main);

function crosshair(show) {
  if (!crosshairEl) return;
  if (show) crosshairEl.classList.add('active');
  else crosshairEl.classList.remove('active');
}
