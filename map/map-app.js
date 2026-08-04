const MAP_PREFS_KEY = 'arc_investigation_map_preferences_v1';
const MAP_STATE_KEY = 'arc_investigation_map_state_v1';
const DEFAULT_VIEW = { center: [42.3601, -71.0589], zoom: 12 };
let savedPreferences = {};
try { savedPreferences = JSON.parse(localStorage.getItem(MAP_PREFS_KEY) || '{}'); } catch (error) {}
let savedMapState = {};
try { savedMapState = JSON.parse(localStorage.getItem(MAP_STATE_KEY) || '{}'); } catch (error) {}

// State
let state = {
  evidence: Array.isArray(savedMapState.evidence) ? savedMapState.evidence : [],
  routes: Array.isArray(savedMapState.routes) ? savedMapState.routes : [],
  layers: {
    evidence: true,
    routes: true,
    heat: false
  },
  theme: savedPreferences.theme === 'light-mode' ? 'light-mode' : 'dark-mode'
};

document.body.classList.toggle('dark-mode', state.theme === 'dark-mode');

function saveMapPreferences() {
  try {
    localStorage.setItem(MAP_PREFS_KEY, JSON.stringify({
      theme: state.theme,
      basemap: document.getElementById('basemap-select')?.value || 'dark'
    }));
  } catch (error) {}
}

function saveMapState() {
  try {
    localStorage.setItem(MAP_STATE_KEY, JSON.stringify({
      evidence: state.evidence,
      routes: state.routes,
      savedAt: new Date().toISOString()
    }));
  } catch (error) {
    setMapStatus('Map changes could not be stored in this browser', 'error');
  }
}

const COLORS = {
  cctv: '#10b981',
  alpr: '#f59e0b',
  cell: '#8b5cf6',
  gps: '#06b6d4',
  witness: '#f43f5e',
  other: '#64748b'
};

// UI Elements
const els = {
  themeBtn: document.getElementById('btnTheme'),
  fullscreenBtn: document.getElementById('btnFullscreen'),
  resetViewBtn: document.getElementById('btnResetView'),
  mapStatus: document.getElementById('map-status'),
  tabs: document.querySelectorAll('.module-tab'),
  panels: document.querySelectorAll('.module-panel'),
  evidenceForm: document.getElementById('evidence-form'),
  evList: document.getElementById('evidence-list'),
  evCount: document.getElementById('ev-count'),
  layerEv: document.getElementById('layer-evidence'),
  layerRoutes: document.getElementById('layer-routes'),
  layerHeat: document.getElementById('layer-heat'),
  btnAiExtract: document.getElementById('btn-ai-extract'),
  routeStart: document.getElementById('route-start'),
  routeEnd: document.getElementById('route-end'),
  btnCalcRoute: document.getElementById('btn-calc-route'),
  routeResult: document.getElementById('route-result'),
  timelineSlider: document.getElementById('timeline-slider'),
  btnPlay: document.getElementById('btn-play'),
  clock: document.getElementById('clock-display')
};

// Initialization
const map = L.map('map').setView(DEFAULT_VIEW.center, DEFAULT_VIEW.zoom);
const tileLayers = {
  streets: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }),
  satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19 }),
  dark: L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 19 })
};
const initialBasemap = tileLayers[savedPreferences.basemap] ? savedPreferences.basemap : (state.theme === 'dark-mode' ? 'dark' : 'streets');
document.getElementById('basemap-select').value = initialBasemap;
tileLayers[initialBasemap].addTo(map);

const evLayer = L.layerGroup().addTo(map);
const routeLayer = L.layerGroup().addTo(map);
const tempLayer = L.featureGroup().addTo(map);
let heatLayer = null;

if (map.pm && typeof map.pm.addControls === 'function') {
  map.pm.addControls({
    position: 'topleft',
    drawMarker: true,
    drawPolygon: true,
    drawPolyline: true,
    drawCircle: true,
    editMode: true,
    dragMode: true,
    removalMode: true
  });
}

Object.values(tileLayers).forEach(layer => {
  layer.on('tileerror', () => setMapStatus('Some map tiles could not load. Check the internet connection.', 'error', true));
});

// Event Listeners
function updateThemeButton() {
  const dark = state.theme === 'dark-mode';
  els.themeBtn.textContent = dark ? 'Light Mode' : 'Dark Mode';
  els.themeBtn.setAttribute('aria-pressed', String(!dark));
}

function setMapStatus(message, tone, persistent) {
  els.mapStatus.textContent = message || 'Map ready';
  els.mapStatus.dataset.tone = tone || 'ready';
  clearTimeout(setMapStatus.timer);
  if (!persistent && message !== 'Map ready') {
    setMapStatus.timer = setTimeout(() => setMapStatus('Map ready', 'ready', true), 3500);
  }
}

updateThemeButton();
els.themeBtn.addEventListener('click', () => {
  state.theme = state.theme === 'dark-mode' ? 'light-mode' : 'dark-mode';
  document.body.classList.toggle('dark-mode', state.theme === 'dark-mode');
  updateThemeButton();
  saveMapPreferences();
  setMapStatus(state.theme === 'dark-mode' ? 'Dark mode enabled' : 'Light mode enabled');
});

els.resetViewBtn.addEventListener('click', () => {
  map.setView(DEFAULT_VIEW.center, DEFAULT_VIEW.zoom);
  tempLayer.clearLayers();
  setMapStatus('Map view reset');
});

els.fullscreenBtn.addEventListener('click', async () => {
  try {
    if (!document.fullscreenElement) await document.getElementById('app').requestFullscreen();
    else await document.exitFullscreen();
  } catch (error) {
    setMapStatus('Fullscreen is unavailable in this browser', 'error');
  }
});

document.addEventListener('fullscreenchange', () => {
  els.fullscreenBtn.textContent = document.fullscreenElement ? 'Exit Fullscreen' : 'Fullscreen';
  setTimeout(() => map.invalidateSize(), 100);
});

els.tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    els.tabs.forEach(t => t.classList.remove('active'));
    els.panels.forEach(p => p.style.display = 'none');
    tab.classList.add('active');
    document.getElementById(tab.dataset.target).style.display = 'block';
  });
});

document.getElementById('basemap-select').addEventListener('change', (e) => {
  Object.values(tileLayers).forEach(layer => map.removeLayer(layer));
  tileLayers[e.target.value].addTo(map);
  saveMapPreferences();
  setMapStatus(e.target.options[e.target.selectedIndex].text + ' map enabled');
});

// Map search
document.getElementById('btn-search').addEventListener('click', async () => {
  const q = document.getElementById('map-search').value;
  if(!q) return;
  setMapStatus('Searching locations...', 'loading', true);
  try {
    let data = null;
    if (/^(?:localhost|127\.0\.0\.1)$/i.test(location.hostname)) {
      const res = await fetch(`/api/geocoding/search?q=${encodeURIComponent(q)}`);
      if (res.ok && (res.headers.get('content-type') || '').includes('application/json')) data = await res.json();
    }
    if (!data) {
      const remote = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(q)}`, {
        headers: { Accept: 'application/json' }
      });
      if (!remote.ok) throw new Error('location service unavailable');
      const results = await remote.json();
      data = { results: results.map(item => ({ lat: Number(item.lat), lng: Number(item.lon), label: item.display_name })) };
    }
    if(data.results && data.results.length > 0) {
      const loc = data.results[0];
      map.setView([loc.lat, loc.lng], 16);
      L.marker([loc.lat, loc.lng]).bindPopup(escapeHtml(loc.label)).addTo(tempLayer).openPopup();
      setMapStatus('Location found');
    } else {
      setMapStatus('No locations found', 'error');
    }
  } catch (err) {
    console.error(err);
    setMapStatus('Search failed: ' + (err.message || 'service unavailable'), 'error');
  }
});

// Map Click to populate form
map.on('click', (e) => {
  document.getElementById('ev-lat').value = e.latlng.lat.toFixed(6);
  document.getElementById('ev-lng').value = e.latlng.lng.toFixed(6);
});

// Evidence Logic
function generateId() { return Math.random().toString(36).substr(2, 9); }

function escapeHtml(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function renderEvidence() {
  evLayer.clearLayers();
  els.evList.innerHTML = '';
  els.routeStart.innerHTML = '';
  els.routeEnd.innerHTML = '';
  
  const heatPoints = [];
  
  state.evidence.sort((a,b) => new Date(a.date+'T'+a.time) - new Date(b.date+'T'+b.time));
  
  state.evidence.forEach(ev => {
    const type = String(ev.type || 'other');
    const color = COLORS[type] || COLORS.other;
    const lat = Number(ev.lat);
    const lng = Number(ev.lng);
    const validCoordinates = Number.isFinite(lat) && Number.isFinite(lng) &&
      lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 && !(lat === 0 && lng === 0);
    // Add to map
    if(state.layers.evidence && validCoordinates) {
      const marker = L.marker([lat, lng], {
        icon: L.divIcon({
          className: '',
          html: `<div class="arc-marker" style="background:${color}"></div>`,
          iconSize: [16,16],
          iconAnchor: [8,8]
        })
      });
      marker.bindPopup(`
        <div class="popup-title">${escapeHtml(ev.title)}</div>
        <div class="popup-meta">${escapeHtml(ev.date)} ${escapeHtml(ev.time)} | ${escapeHtml(type.toUpperCase())}</div>
        <div>${escapeHtml(ev.notes).replace(/\n/g, '<br>')}</div>
        <hr style="margin:5px 0; border:1px solid #333">
        <small>Source: ${escapeHtml(ev.citation)}</small>
      `);
      marker.on('click', () => editEvidence(ev.id));
      evLayer.addLayer(marker);
    }
    
    // Add to list
    const card = document.createElement('div');
    card.className = 'ev-card';
    card.style.borderLeftColor = color;
    card.innerHTML = `
      <h4>${escapeHtml(ev.title)}</h4>
      <div class="ev-meta"><span>${escapeHtml(ev.date)} ${escapeHtml(ev.time)}</span></div>
      <div class="ev-tags">
        <span class="ev-tag" style="color:${color}">${escapeHtml(type)}</span>
        <span class="ev-tag">${escapeHtml(ev.reliability)}</span>
      </div>
    `;
    card.onclick = () => {
      if (validCoordinates) map.setView([lat, lng], 16);
      editEvidence(ev.id);
    };
    els.evList.appendChild(card);
    
    // Add to routing selects
    const optionText = `${String(ev.title || 'Untitled')} (${String(ev.time || 'No time')})`;
    els.routeStart.add(new Option(optionText, String(ev.id || '')));
    els.routeEnd.add(new Option(optionText, String(ev.id || '')));
    
    if (validCoordinates) heatPoints.push([lat, lng, 1]);
  });
  
  els.evCount.textContent = state.evidence.length;
  if(state.evidence.length > 1) {
    els.routeEnd.selectedIndex = state.evidence.length - 1;
  }
  
  // Update Heatmap
  if(heatLayer) map.removeLayer(heatLayer);
  if(state.layers.heat && heatPoints.length > 0 && typeof L.heatLayer === 'function') {
    heatLayer = L.heatLayer(heatPoints, { radius: 25, blur: 15 }).addTo(map);
  } else if (state.layers.heat && typeof L.heatLayer !== 'function') {
    state.layers.heat = false;
    els.layerHeat.checked = false;
    setMapStatus('Heatmap library is unavailable; other map tools still work.', 'error');
  }
}

function renderRoutes() {
  routeLayer.clearLayers();
  if(!state.layers.routes) return;
  state.routes.forEach(r => {
    L.geoJSON(r.geometry, {
      style: { color: '#3b82f6', weight: 4, dashArray: '5 5' }
    }).bindPopup(`Possible ${escapeHtml(r.profile)} route: ${(Number(r.distanceMeters)/1609.34).toFixed(2)} mi`).addTo(routeLayer);
  });
}

function updateMap() {
  renderEvidence();
  renderRoutes();
}

els.layerEv.onchange = (e) => { state.layers.evidence = e.target.checked; updateMap(); };
els.layerRoutes.onchange = (e) => { state.layers.routes = e.target.checked; updateMap(); };
els.layerHeat.onchange = (e) => { state.layers.heat = e.target.checked; updateMap(); };

els.evidenceForm.onsubmit = (e) => {
  e.preventDefault();
  const id = document.getElementById('ev-id').value || generateId();
  const ev = {
    id,
    title: document.getElementById('ev-title').value,
    type: document.getElementById('ev-type').value,
    reliability: document.getElementById('ev-reliability').value,
    lat: Number(document.getElementById('ev-lat').value),
    lng: Number(document.getElementById('ev-lng').value),
    date: document.getElementById('ev-date').value,
    time: document.getElementById('ev-time').value,
    citation: document.getElementById('ev-citation').value,
    notes: document.getElementById('ev-notes').value
  };
  
  const index = state.evidence.findIndex(x => x.id === id);
  if(index >= 0) state.evidence[index] = ev;
  else state.evidence.push(ev);
  
  els.evidenceForm.reset();
  document.getElementById('ev-id').value = '';
  saveMapState();
  updateMap();
};

document.getElementById('btn-clear-ev').onclick = () => {
  els.evidenceForm.reset();
  document.getElementById('ev-id').value = '';
};

function editEvidence(id) {
  const ev = state.evidence.find(x => x.id === id);
  if(!ev) return;
  document.getElementById('ev-id').value = ev.id;
  document.getElementById('ev-title').value = ev.title;
  document.getElementById('ev-type').value = ev.type;
  document.getElementById('ev-reliability').value = ev.reliability;
  document.getElementById('ev-lat').value = ev.lat;
  document.getElementById('ev-lng').value = ev.lng;
  document.getElementById('ev-date').value = ev.date;
  document.getElementById('ev-time').value = ev.time;
  document.getElementById('ev-citation').value = ev.citation;
  document.getElementById('ev-notes').value = ev.notes;
  
  // Switch to tab
  els.tabs[1].click();
}

function straightLineRoute(start, end, profile) {
  const toRadians = value => value * Math.PI / 180;
  const lat1 = toRadians(Number(start.lat));
  const lat2 = toRadians(Number(end.lat));
  const deltaLat = lat2 - lat1;
  const deltaLng = toRadians(Number(end.lng) - Number(start.lng));
  const a = Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
  const distanceMeters = 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const metersPerSecond = profile === 'walking' ? 1.4 : profile === 'cycling' ? 4.5 : 13.4;
  return {
    provider: 'straight-line estimate',
    profile,
    distanceMeters,
    durationSeconds: distanceMeters / metersPerSecond,
    geometry: { type: 'LineString', coordinates: [[Number(start.lng), Number(start.lat)], [Number(end.lng), Number(end.lat)]] }
  };
}

// Routing Tool
els.btnCalcRoute.onclick = async () => {
  const sId = els.routeStart.value;
  const eId = els.routeEnd.value;
  if(!sId || !eId || sId === eId) return alert("Select distinct start and end points.");
  
  const start = state.evidence.find(x => x.id === sId);
  const end = state.evidence.find(x => x.id === eId);
  const profile = document.getElementById('route-mode').value;
  
  els.routeResult.className = 'result-box';
  els.routeResult.innerHTML = 'Calculating...';
  setMapStatus('Calculating route...', 'loading', true);
  
  try {
    let data = null;
    if (/^(?:localhost|127\.0\.0\.1)$/i.test(location.hostname)) {
      const res = await fetch('/api/routing/route', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ start, end, profile })
      });
      if (res.ok && (res.headers.get('content-type') || '').includes('application/json')) data = await res.json();
    }
    if (!data) data = straightLineRoute(start, end, profile);
    
    state.routes.push(data);
    saveMapState();
    updateMap();
    
    const mi = (data.distanceMeters / 1609.34).toFixed(2);
    const min = (data.durationSeconds / 60).toFixed(1);
    els.routeResult.innerHTML = `<strong>${data.provider === 'straight-line estimate' ? 'Distance estimate' : 'Route found'} (${escapeHtml(data.provider)}):</strong><br>${mi} miles, approximately ${min} minutes (${escapeHtml(profile)}).${data.provider === 'straight-line estimate' ? '<br><small>This is not a road route. Run ARC locally for road routing.</small>' : ''}`;
    setMapStatus(data.provider === 'straight-line estimate' ? 'Straight-line estimate calculated' : 'Route calculated');
  } catch(err) {
    els.routeResult.className = 'result-box error';
    els.routeResult.textContent = 'Error: ' + err.message;
    setMapStatus('Route failed: ' + err.message, 'error');
  }
};

// AI Assistant
els.btnAiExtract.onclick = async () => {
  const apiKey = document.getElementById('ai-key').value;
  const text = document.getElementById('ai-text').value;
  if(!text) return alert("Text required.");
  if (!apiKey && !/^(?:localhost|127\.0\.0\.1)$/i.test(location.hostname)) {
    // Hosted: server GEMINI_API_KEY is required; client key is ignored on Vercel.
  } else if (!apiKey && /^(?:localhost|127\.0\.0\.1)$/i.test(location.hostname)) {
    // Local: server may still have GEMINI_API_KEY in .env; allow empty client field.
  }
  
  els.btnAiExtract.disabled = true;
  els.btnAiExtract.textContent = 'Extracting...';
  
  try {
    const headers = {'Content-Type': 'application/json'};
    if (window.ARCApi && window.ARCApi.getAccessToken()) {
      headers['x-arc-token'] = window.ARCApi.getAccessToken();
    }
    const res = await fetch('/api/ai/extract', {
      method: 'POST',
      headers: headers,
      credentials: 'same-origin',
      body: JSON.stringify(apiKey ? { apiKey, text } : { text })
    });
    const data = await res.json();
    if(!res.ok) throw new Error(data.error);
    
    data.forEach(item => {
      state.evidence.push({
        id: generateId(),
        title: item.activity || "Extracted Location",
        type: item.entityClass === 'unknown' ? 'other' : item.entityClass,
        reliability: 'reported',
        lat: 0, lng: 0, // Needs geocoding by investigator
        date: item.date || new Date().toISOString().split('T')[0],
        time: item.time || "00:00:00",
        citation: item.sourceQuote || "",
        notes: "AI Extracted. Needs coordinate verification."
      });
    });
    saveMapState();
    updateMap();
    els.tabs[1].click(); // switch to evidence tab
    alert(`Extracted ${data.length} locations. Please update coordinates for each.`);
  } catch(err) {
    alert("AI Extraction Failed: " + err.message);
  } finally {
    els.btnAiExtract.disabled = false;
    els.btnAiExtract.textContent = 'Extract Evidence';
  }
};

// Spatial Tools
document.getElementById('btn-buffer').onclick = () => {
  if(typeof turf === 'undefined') return setMapStatus('Spatial analysis library is unavailable.', 'error');
  const ev = state.evidence.find(item => Number.isFinite(Number(item.lat)) && Number.isFinite(Number(item.lng)) && !(Number(item.lat)===0 && Number(item.lng)===0));
  if(!ev) return alert("Add an evidence point with verified coordinates first.");
  const pt = turf.point([ev.lng, ev.lat]);
  const buffered = turf.buffer(pt, 1000, {units: 'meters'});
  L.geoJSON(buffered, {style: {color: '#f59e0b', fillOpacity: 0.2}}).bindPopup("1000m Buffer").addTo(tempLayer);
};

function measureFirstTwo(label) {
  const points = state.evidence.filter(item => Number.isFinite(Number(item.lat)) && Number.isFinite(Number(item.lng)) && !(Number(item.lat)===0 && Number(item.lng)===0)).slice(0,2);
  if(points.length < 2) return alert('Add at least two evidence points with verified coordinates.');
  const estimate = straightLineRoute(points[0], points[1], 'walking');
  const miles = (estimate.distanceMeters / 1609.34).toFixed(2);
  L.polyline([[points[0].lat,points[0].lng],[points[1].lat,points[1].lng]], {color:'#f59e0b',weight:3,dashArray:label==='Line of sight'?'8 6':null})
    .bindPopup(`${escapeHtml(label)}: ${miles} miles straight line`).addTo(tempLayer).openPopup();
  map.fitBounds([[points[0].lat,points[0].lng],[points[1].lat,points[1].lng]], {padding:[40,40]});
  setMapStatus(`${label}: ${miles} miles`);
}

document.getElementById('btn-los').onclick = () => measureFirstTwo('Line of sight');
document.getElementById('btn-measure').onclick = () => measureFirstTwo('Distance');

// Draw CCTV FOV
document.getElementById('btn-draw-cctv').onclick = () => {
  if (!map.pm || typeof map.pm.enableDraw !== 'function') return setMapStatus('Drawing tools are unavailable; click the map to capture coordinates.', 'error');
  alert("Click on the map to place the camera, then drag to set rotation.");
  // Basic implementation: Just places a circle sector. Proper Geoman integration can be complex.
  // For demo, we just enable marker drawing.
  map.pm.enableDraw('Marker');
};

document.getElementById('btn-draw-cell').onclick = () => {
  if (!map.pm || typeof map.pm.enableDraw !== 'function') return setMapStatus('Drawing tools are unavailable; click the map to capture coordinates.', 'error');
  alert("Use the Geoman Polygon tool to draw custom cell sectors.");
  map.pm.enableDraw('Polygon');
};

// Timeline Playback
let playInterval = null;
els.btnPlay.onclick = () => {
  if(playInterval) {
    clearInterval(playInterval);
    playInterval = null;
    els.btnPlay.textContent = 'Play';
  } else {
    els.btnPlay.textContent = 'Pause';
    if(els.timelineSlider.value >= 1000) els.timelineSlider.value = 0;
    playInterval = setInterval(() => {
      let val = Number(els.timelineSlider.value);
      val += Number(document.getElementById('play-speed').value) * 2;
      els.timelineSlider.value = Math.min(1000, val);
      updateClock();
      if(val >= 1000) {
        clearInterval(playInterval);
        playInterval = null;
        els.btnPlay.textContent = 'Play';
      }
    }, 50);
  }
};

document.getElementById('btn-reset').onclick = () => {
  els.timelineSlider.value = 1000;
  if(playInterval) { clearInterval(playInterval); playInterval = null; els.btnPlay.textContent = 'Play'; }
  updateClock();
};

els.timelineSlider.oninput = () => updateClock();

function updateClock() {
  const timedEvidence = state.evidence.filter(ev => Number.isFinite(new Date(ev.date + 'T' + ev.time).getTime()));
  if(!timedEvidence.length) {
    els.clock.textContent = 'No timed evidence';
    return;
  }
  const times = timedEvidence.map(ev => new Date(ev.date + 'T' + ev.time).getTime());
  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);
  const pct = els.timelineSlider.value / 1000;
  
  const currTime = minTime + (maxTime - minTime) * pct;
  const d = new Date(currTime);
  els.clock.textContent = isNaN(currTime) ? '00:00:00' : d.toLocaleString();
  
  // Filter points based on timeline
  evLayer.clearLayers();
  timedEvidence.forEach(ev => {
    const et = new Date(ev.date + 'T' + ev.time).getTime();
    if(et <= currTime && state.layers.evidence) {
      const lat = Number(ev.lat);
      const lng = Number(ev.lng);
      if(!Number.isFinite(lat) || !Number.isFinite(lng) || (lat===0 && lng===0)) return;
      const color = COLORS[ev.type] || COLORS.other;
      L.marker([lat, lng], {
        icon: L.divIcon({
          className: '',
          html: `<div class="arc-marker" style="background:${color}"></div>`,
          iconSize: [16,16], iconAnchor: [8,8]
        })
      }).addTo(evLayer);
    }
  });
}

// Case Saving
document.getElementById('btnSave').onclick = async () => {
  const payload = {
    meta: {
      caseName: document.getElementById('caseName').value,
      docket: document.getElementById('caseDocket').value
    },
    evidence: state.evidence,
    routes: state.routes,
    drawings: [] // Can extract from tempLayer using geoman
  };
  saveMapState();
  if (!/^(?:localhost|127\.0\.0\.1)$/i.test(location.hostname)) {
    alert('Map case saved in this browser. Use Export to create a portable case file.');
    return;
  }
  try {
    const res = await fetch('/api/cases', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(payload)
    });
    if(!res.ok) throw new Error("Save failed");
    alert("Case saved to local server database.");
  } catch(err) {
    alert(err.message);
  }
};

// Start
updateMap();
setMapStatus('Map ready', 'ready', true);

// ARC shared case context
function applySharedCase(context) {
  if (!context) return;
  const matter = String(context.matter || context.caseName || context.subjectName || '').trim();
  const docket = String(context.docket || context.docketNumber || '').trim();
  if (matter) document.getElementById('caseName').value = matter;
  if (docket) document.getElementById('caseDocket').value = docket;
}
function syncFromBridge() {
  if (!window.ARCUnified || typeof window.ARCUnified.getCase !== 'function') return;
  applySharedCase(window.ARCUnified.getCase() || {});
}
document.addEventListener('arc:case-context', function (e) { applySharedCase(e.detail || {}); });
document.addEventListener('arc:shared-storage', syncFromBridge);
window.addEventListener('storage', function (e) {
  if (e.key === 'arc_unified_case_context_v1') syncFromBridge();
});
syncFromBridge();
setTimeout(function () { map.invalidateSize(); }, 200);
window.addEventListener('resize', function () { map.invalidateSize(); });

document.getElementById('btnNew').onclick = function () {
  if (!confirm('Clear the current map evidence and routes?')) return;
  state.evidence = [];
  state.routes = [];
  saveMapState();
  updateMap();
};
document.getElementById('btnOpen').onclick = async function () {
  try {
    if (!/^(?:localhost|127\.0\.0\.1)$/i.test(location.hostname)) {
      const saved = JSON.parse(localStorage.getItem(MAP_STATE_KEY) || '{}');
      state.evidence = Array.isArray(saved.evidence) ? saved.evidence : [];
      state.routes = Array.isArray(saved.routes) ? saved.routes : [];
      updateMap();
      alert(state.evidence.length || state.routes.length ? 'Opened the map case saved in this browser.' : 'No saved browser map case was found.');
      return;
    }
    const res = await fetch('/api/cases');
    const cases = await res.json();
    if (!Array.isArray(cases) || !cases.length) return alert('No saved map cases found.');
    const choice = prompt('Open case id:\n' + cases.map(function (c) { return c.id + ' — ' + c.name; }).join('\n'));
    if (!choice) return;
    const loaded = await fetch('/api/cases/' + encodeURIComponent(choice.trim())).then(function (r) { return r.json(); });
    if (loaded.error) throw new Error(loaded.error);
    state.evidence = loaded.evidence || [];
    state.routes = loaded.routes || [];
    if (loaded.meta) {
      if (loaded.meta.caseName) document.getElementById('caseName').value = loaded.meta.caseName;
      if (loaded.meta.docket) document.getElementById('caseDocket').value = loaded.meta.docket;
    }
    saveMapState();
    updateMap();
  } catch (err) {
    alert(err.message || 'Open failed');
  }
};
document.getElementById('btnExport').onclick = function () {
  const payload = {
    meta: {
      caseName: document.getElementById('caseName').value,
      docket: document.getElementById('caseDocket').value
    },
    evidence: state.evidence,
    routes: state.routes
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'arc-investigation-map.json';
  a.click();
};
document.getElementById('btnReport').onclick = function () {
  alert('Use Export to download the map package, then send the verified locations into Main Report from the ARC shell.');
};
