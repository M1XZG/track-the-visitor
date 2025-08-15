// script.js - main logic
// This script runs entirely client-side. It fetches the public IP, geolocates it, animates a Leaflet map, and collects browser data.

const statusEl = document.getElementById('status');
const hudEl = document.getElementById('hud');
const calloutEl = document.getElementById('callout');
const copyJsonBtn = document.getElementById('copyJsonBtn');
const crosshairEl = document.getElementById('crosshair');
const sonarEl = document.getElementById('sonar');
const audioCtaEl = document.getElementById('audioCta');
const tableBody = document.querySelector('#detailsTable tbody');
const consoleEl = document.getElementById('console');
// SFX and Chaos are always enabled; there are no user toggles.
const replayBtn = document.getElementById('replayBtn');
let audioCtx;
let huntBeepTimer = null;

// Config for geolocation providers (no key required). We'll try them in order.
const ipEndpoints = [
  { name: 'ipapi.co', url: 'https://ipapi.co/json/', pick: d => ({ ip: d.ip, city: d.city, region: d.region, country: d.country_name, lat: d.latitude, lon: d.longitude, org: d.org, timezone: d.timezone }) },
  { name: 'ipinfo.io', url: 'https://ipinfo.io/json?token=', pick: d => { const [lat, lon] = (d.loc||',').split(','); return ({ ip: d.ip, city: d.city, region: d.region, country: d.country, lat: parseFloat(lat), lon: parseFloat(lon), org: d.org, timezone: d.timezone }); } },
  { name: 'ipapi.com', url: 'https://ip-api.com/json/?fields=61439', pick: d => ({ ip: d.query, city: d.city, region: d.regionName, country: d.country, lat: d.lat, lon: d.lon, org: d.org, timezone: d.timezone }) },
];

function setStatus(text) {
  if (statusEl) statusEl.textContent = text;
  log(text);
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

  const tiles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors',
    updateWhenIdle: false,
    updateWhenZooming: false,
    keepBuffer: 4,
  }).addTo(map);
  try {
    tiles.on('tileerror', (e) => {
      log('Tile load error from OSM; map may appear blank. Retrying…', 'warn');
    });
  } catch {}

  // Safety: ensure Leaflet knows the container size once visible
  setTimeout(() => { try { map.invalidateSize(); } catch {} }, 200);
  try {
    window.addEventListener('resize', () => { try { map.invalidateSize(); } catch {} });
  } catch {}

  L.control.zoom({ position: 'topright' }).addTo(map);
  L.control.attribution({ position: 'bottomright' }).addTo(map);
  return map;
}

function flyWithTheatrics(map, lat, lon) {
  return new Promise(async (resolve) => {
    // Start from a randomized world view for variety
    const startLat = randRange(-25, 25);
    const startLon = randRange(-120, 120);
    map.setView([startLat, startLon], 2, { animate: true });
    await sleep(450 + randInt(0, 400));

  // Phase 1: Random global hops (3-6 or more with chaos), avoid immediately near destination
  const hops = [];
  const chaos = true;
  const farHops = chaos ? randInt(5, 9) : randInt(3, 6);
    for (let i = 0; i < farHops; i++) {
      const p = randomGlobalPoint(lat, lon);
      hops.push({
        lat: p.lat,
        lon: p.lon,
    zoom: chaos ? randInt(2, 4) : randInt(2, 3),
    duration: chaos ? randRange(0.7, 1.5) : randRange(0.95, 1.5),
    pause: chaos ? randInt(120, 300) : randInt(180, 320),
      });
    }

  // Phase 2: 1-2 (or 2-3 with chaos) approach hops with decreasing offsets
  const approachHops = chaos ? randInt(2, 3) : randInt(1, 2);
    for (let i = approachHops; i >= 1; i--) {
      const scale = i; // larger first, smaller later
      hops.push({
  lat: clampLat(lat + randRange(chaos ? -14 : -8, chaos ? 14 : 8) * scale),
  lon: wrapLon(lon + randRange(chaos ? -20 : -12, chaos ? 20 : 12) * scale),
  zoom: chaos ? randInt(3, 5) : randInt(3, 4),
  duration: chaos ? randRange(0.9, 1.6) : randRange(1.1, 1.6),
  pause: chaos ? randInt(160, 360) : randInt(220, 360),
      });
    }

    // Execute hops with optional arc drawing
    for (const h of hops) {
      const from = [map.getCenter().lat, map.getCenter().lng];
      const to = [h.lat, h.lon];
      const draw = Math.random() < (chaos ? 0.6 : 0.75); // vary arc drawing
      const arc = draw ? drawArc(map, from, to) : null;
      map.flyTo([h.lat, h.lon], h.zoom, { animate: true, duration: h.duration });
      beep(randInt(chaos ? 200 : 230, chaos ? 360 : 320), randRange(0.05, chaos ? 0.12 : 0.09));
      await sleep((h.duration * 1000) + (h.pause || 200));
      if (arc) map.removeLayer(arc);
    }

    // Phase 3: Bounce-in over destination with variability
    const finalZoom = chaos ? 13 : 12;
    const steps = [];
    // Warm-up zooms
    steps.push({ z: randInt(5, 7), d: randRange(chaos ? 0.7 : 0.9, 1.3), p: randInt(100, 200) });
    steps.push({ z: randInt(8, 10), d: randRange(chaos ? 0.6 : 0.8, 1.2), p: randInt(90, 190) });
    steps.push({ z: randInt(11, 12), d: randRange(chaos ? 0.6 : 0.7, 1.1), p: randInt(80, 180) });
    // Optional overshoot
    if (Math.random() < (chaos ? 0.95 : 0.85)) {
      steps.push({ z: finalZoom + randRange(0.8, chaos ? 2.4 : 1.8), d: randRange(0.6, 1.0), p: randInt(80, 170) });
    }
    // Optional micro-correct
    if (Math.random() < (chaos ? 0.7 : 0.5)) {
      steps.push({ z: finalZoom - randRange(0.3, chaos ? 1.2 : 0.8), d: randRange(0.5, 0.9), p: randInt(80, 160) });
    }
  // Settle
  steps.push({ z: finalZoom, d: randRange(chaos ? 0.6 : 0.7, 1.0), p: randInt(90, 180) });

    for (const s of steps) {
  const jitterLat = randRange(chaos ? -0.25 : -0.15, chaos ? 0.25 : 0.15);
  const jitterLon = randRange(chaos ? -0.35 : -0.22, chaos ? 0.35 : 0.22);
      map.flyTo([lat + jitterLat, lon + jitterLon], s.z, { animate: true, duration: s.d });
  beep(randInt(320, chaos ? 560 : 480), randRange(0.06, chaos ? 0.12 : 0.1));
      await sleep((s.d * 1000) + s.p);
    }

    // Force exact final center on the detected location (no jitter) at target zoom
    try {
      map.setView([lat, lon], finalZoom, { animate: true });
      await sleep(450);
    } catch {}
    resolve();
  });
}

// Helpers for animation
function randRange(min, max) { return Math.random() * (max - min) + min; }
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function clampLat(v) { return Math.max(-85, Math.min(85, v)); }
function wrapLon(v) { let x = v % 360; if (x > 180) x -= 360; if (x < -180) x += 360; return x; }

// Get a random global point that's not too close to the destination
function randomGlobalPoint(avoidLat, avoidLon) {
  let lat, lon;
  let tries = 0;
  do {
    // Favor habitable latitudes a bit (-60..70) and anywhere in lon
    lat = randRange(-60, 70);
    lon = randRange(-180, 180);
    tries++;
    // avoid being immediately near the target
  } while (tries < 8 && Math.abs(lat - avoidLat) < 15 && Math.abs(((lon - avoidLon + 540) % 360) - 180) < 30);
  return { lat, lon };
}

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
  await ensureLeafletLoaded();
  const map = createMap();
  try {
    crosshair(true);
  wireControls(map);
  setupAudioUnlock(map);
  setHudTyping(true);
    // Theatrical steps
    hudEl.querySelectorAll('.hud-line').forEach((n,i)=> i<3 ? n.classList.remove('done') : null);
    setStatus('Fetching public IP & location…');
    const geo = await fetchIPGeo();

  setStatus('Animating to location…');
  sonar(true);
  // Start-of-hunt cue
  beep(360, 0.08);
  startHuntSfx();
  await flyWithTheatrics(map, geo.lat, geo.lon);

    setStatus('Marking position…');
    const info = `${geo.city ? geo.city+',' : ''} ${geo.region || ''} ${geo.country || ''}`.trim();
  const marker = makePulsingMarker(geo.lat, geo.lon, `<b>${geo.ip}</b><br/>${info}`);
    marker.addTo(map);
  // Lock confirmation
  beep(800, 0.12);

  calloutEl.classList.remove('hidden');
    calloutEl.innerHTML = `You appear to be near <b>${info || 'Unknown'}</b><br/><small>Provider: ${geo.provider}</small>`;

  markHudDone();
  setHudTyping(false);
  crosshair(false);
  sonar(false);
  stopHuntSfx();
  try { document.getElementById('map')?.classList.add('lock-flash'); setTimeout(()=>document.getElementById('map')?.classList.remove('lock-flash'), 1000);} catch {}

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
  sonar(true);
  // Start-of-hunt cue
  beep(360, 0.08);
  startHuntSfx();
  await flyWithTheatrics(map, lat, lon);
  const marker = makePulsingMarker(lat, lon, 'Device location');
      marker.addTo(map);
  // Lock confirmation
  beep(800, 0.12);
      const all = gatherBrowserData({ provider: 'device-geolocation' });
      renderTable(all);
  setStatus('Done (device location)');
  crosshair(false);
  sonar(false);
  stopHuntSfx();
  try { document.getElementById('map')?.classList.add('lock-flash'); setTimeout(()=>document.getElementById('map')?.classList.remove('lock-flash'), 1000);} catch {}
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

// Ensure Leaflet JS/CSS is available; inject fallback if not
async function ensureLeafletLoaded() {
  if (typeof window.L !== 'undefined') return;
  log('Leaflet not found. Loading fallback…', 'warn');
  setStatus('Loading map engine…');
  // Try alternate CDN without SRI to avoid corporate proxies/SRI blockers
  const cssUrl = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.css';
  const jsUrl = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js';
  await Promise.allSettled([injectCss(cssUrl)]);
  await injectScript(jsUrl);
  if (typeof window.L === 'undefined') {
    throw new Error('Leaflet failed to load.');
  }
}

function injectScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Script load failed: ' + src));
    document.head.appendChild(s);
  });
}
function injectCss(href) {
  return new Promise((resolve, reject) => {
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = href;
    l.onload = () => resolve();
    l.onerror = () => reject(new Error('CSS load failed: ' + href));
    document.head.appendChild(l);
  });
}

function crosshair(show) {
  if (!crosshairEl) return;
  if (show) crosshairEl.classList.add('active');
  else crosshairEl.classList.remove('active');
}

function sonar(show) {
  if (!sonarEl) return;
  sonarEl.style.display = show ? 'block' : 'none';
}

// Lightweight console log in UI
function log(msg, level='log') {
  if (!consoleEl) return;
  const line = document.createElement('div');
  line.className = `log ${level}`;
  const ts = new Date().toLocaleTimeString();
  line.textContent = `[${ts}] ${msg}`;
  consoleEl.appendChild(line);
  consoleEl.scrollTop = consoleEl.scrollHeight;
}

// Simple WebAudio beep for SFX
function ensureAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
}
function beep(freq=440, dur=0.12) {
  // Richer "radar ping": triangle osc with slight downward glide, bandpass filter sweep, subtle echo
  try {
    ensureAudio();
    if (audioCtx.state === 'suspended') {
      // Will only resume on a user gesture; setupAudioUnlock attaches listeners
      return;
    }
    const now = audioCtx.currentTime;
    const o = audioCtx.createOscillator();
    const f = audioCtx.createBiquadFilter();
    const g = audioCtx.createGain();
    const d = audioCtx.createDelay(0.5);
    const wet = audioCtx.createGain();

    // Oscillator setup with a slight downward glide
    o.type = 'triangle';
    const startFreq = Math.max(220, freq * 1.2);
    const endFreq = Math.max(180, freq * 0.6);
    o.frequency.setValueAtTime(startFreq, now);
    o.frequency.exponentialRampToValueAtTime(endFreq, now + Math.max(0.06, dur * 0.9));

    // Bandpass filter sweep for more character
    f.type = 'bandpass';
    f.Q.value = 10;
    f.frequency.setValueAtTime(Math.max(200, freq), now);
    f.frequency.exponentialRampToValueAtTime(Math.max(180, freq * 0.5), now + Math.max(0.06, dur * 0.9));

    // Gain envelope
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.16, now + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, now + Math.max(0.08, dur));

    // Simple echo (no feedback)
    d.delayTime.value = 0.16;
    wet.gain.value = 0.18;

    // Connect graph: osc -> filter -> gain -> (dry + wet)
    o.connect(f).connect(g);
    g.connect(audioCtx.destination);
    g.connect(d);
    d.connect(wet).connect(audioCtx.destination);

    // Start/stop
    o.start(now);
    const stopAt = now + Math.max(0.25, dur + 0.18);
    o.stop(stopAt);
    o.onended = () => {
      try {
        o.disconnect();
        f.disconnect();
        g.disconnect();
        d.disconnect();
        wet.disconnect();
      } catch {}
    };
  } catch {}
}

// Setup audio unlock on first user interaction
function setupAudioUnlock(map) {
  const unlock = async () => {
    try {
      ensureAudio();
      if (audioCtx.state === 'suspended') await audioCtx.resume();
      // Confirmation chirp
      beep(520, 0.06);
  // If a hunt heartbeat was scheduled, ensure it runs now that audio is resumed
  if (huntBeepTimer === 'pending') startHuntSfx(true);
      // Hide the CTA if visible
      if (audioCtaEl) audioCtaEl.style.display = 'none';
    } catch {}
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
    window.removeEventListener('touchstart', unlock);
  };
  window.addEventListener('pointerdown', unlock, { once: true });
  window.addEventListener('keydown', unlock, { once: true });
  window.addEventListener('touchstart', unlock, { once: true });
  try {
    // Also unlock on first map click
    map.on('click', unlock);
  } catch {}
  // Wire CTA button (if present)
  if (audioCtaEl) {
    audioCtaEl.addEventListener('click', unlock);
  }
}

// Hunt heartbeat SFX: periodic beeps during the search
function startHuntSfx(force=false) {
  try { ensureAudio(); } catch {}
  // If audio is suspended, mark pending to auto-start on unlock
  if (!force && audioCtx && audioCtx.state === 'suspended') {
    huntBeepTimer = 'pending';
    return;
  }
  stopHuntSfx();
  const base = 280;
  const chaos = true;
  huntBeepTimer = setInterval(() => {
    // Slight randomization in rate & pitch, more intense in chaos
    beep(base + randInt(chaos ? -60 : -30, chaos ? 120 : 60), randRange(0.05, chaos ? 0.12 : 0.09));
  }, (chaos ? 260 : 320) + randInt(-60, chaos ? 120 : 90));
}

function stopHuntSfx() {
  if (huntBeepTimer && huntBeepTimer !== 'pending') {
    try { clearInterval(huntBeepTimer); } catch {}
  }
  huntBeepTimer = null;
}

function wireControls(map) {
  if (replayBtn) {
    replayBtn.addEventListener('click', async () => {
      consoleEl && (consoleEl.innerHTML = '');
      crosshair(true);
      try {
        const geo = await fetchIPGeo();
  setStatus('Replaying hunt…');
  // Start-of-hunt cue
  beep(360, 0.08);
  startHuntSfx();
  await flyWithTheatrics(map, geo.lat, geo.lon);
        setStatus('Marking position…');
        const info = `${geo.city ? geo.city+',' : ''} ${geo.region || ''} ${geo.country || ''}`.trim();
        const marker = makePulsingMarker(geo.lat, geo.lon, `<b>${geo.ip}</b><br/>${info}`);
        marker.addTo(map);
  beep(700, 0.12);
        crosshair(false);
        stopHuntSfx();
      } catch (e) {
        crosshair(false);
        log('Replay failed', 'error');
        stopHuntSfx();
      }
    });
  }
}

// Toggles removed; no persistence needed.

// HUD teletype toggle
function setHudTyping(on) {
  if (!hudEl) return;
  if (on) hudEl.classList.add('typing');
  else hudEl.classList.remove('typing');
}

// Draw a simple geodesic-like arc using many short segments
function drawArc(map, [lat1, lon1], [lat2, lon2]) {
  try {
    const steps = 32;
    const pts = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      // Slerp on a sphere (approx)
      const A = toRad(lat1), B = toRad(lon1), C = toRad(lat2), D = toRad(lon2);
      const sinA = Math.sin(A), cosA = Math.cos(A);
      const sinC = Math.sin(C), cosC = Math.cos(C);
      const d = 2 * Math.asin(Math.sqrt(Math.pow(Math.sin((A - C) / 2), 2) + cosA * cosC * Math.pow(Math.sin((B - D) / 2), 2)));
      const k = d === 0 ? 0 : Math.sin((1 - t) * d) / Math.sin(d);
      const j = d === 0 ? 1 : Math.sin(t * d) / Math.sin(d);
      const x = k * cosA * Math.cos(B) + j * cosC * Math.cos(D);
      const y = k * cosA * Math.sin(B) + j * cosC * Math.sin(D);
      const z = k * sinA + j * sinC;
      const lat = Math.atan2(z, Math.sqrt(x * x + y * y));
      const lon = Math.atan2(y, x);
      pts.push([toDeg(lat), toDeg(lon)]);
    }
    const arc = L.polyline(pts, { color: '#22d3ee', weight: 1, opacity: 0.7, dashArray: '4 4' }).addTo(map);
    return arc;
  } catch {
    return null;
  }
}
function toRad(v){return v*Math.PI/180}
function toDeg(v){return v*180/Math.PI}
