import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import { OrbitControls } from 'https://unpkg.com/three@0.160.0/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'https://unpkg.com/three@0.160.0/examples/jsm/loaders/GLTFLoader.js';

const statusEl = document.getElementById('status');
const districtNameEl = document.getElementById('district-name');
const districtBodyEl = document.getElementById('district-body');
const districtSwatchEl = document.getElementById('district-swatch');
const districtListEl = document.getElementById('district-list');
const pcBuildingSelectEl = document.getElementById('pc-building-select');
const pcBuildingDetailsEl = document.getElementById('pc-building-details');
const addPinEl = document.getElementById('add-pin');
const pinPanelEl = document.getElementById('pin-panel');
const pinNameEl = document.getElementById('pin-name');
const pinTypeEl = document.getElementById('pin-type');
const pinDistrictEl = document.getElementById('pin-district');
const pinDescEl = document.getElementById('pin-desc');
const pinMoveEl = document.getElementById('pin-move');
const pinSaveEl = document.getElementById('pin-save');
const pinDeleteEl = document.getElementById('pin-delete');
const pinCloseEl = document.getElementById('pin-close');
const districtSaveEl = document.getElementById('district-save');

const container = document.getElementById('app');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0f14);

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 50000);
camera.position.set(0, 250, 450);

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  powerPreference: 'high-performance',
  logarithmicDepthBuffer: true,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
container.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.target.set(0, 0, 0);
controls.minDistance = 1;
controls.maxDistance = 8000;

const districtLabelSprites = [];
const districtLabelById = {};
let selectedDistrictId = null;
const LABEL_STATIC_BOOST = 2.6;
const LABEL_SELECTED_DISTANCE_EXP = 1.2;
const LABEL_SELECTED_EXTRA_BOOST = 1.15;

const hemi = new THREE.HemisphereLight(0xdde8ff, 0x0b0f14, 1.15);
hemi.position.set(0, 400, 0);
scene.add(hemi);

const dir = new THREE.DirectionalLight(0xffffff, 1.35);
dir.position.set(300, 600, 200);
dir.castShadow = true;
dir.shadow.mapSize.set(2048, 2048);
dir.shadow.camera.near = 0.5;
dir.shadow.camera.far = 5000;
scene.add(dir);

const fill = new THREE.DirectionalLight(0xffffff, 0.35);
fill.position.set(-400, 250, -300);
scene.add(fill);

const loader = new GLTFLoader();

const modelUrl = '/api/map.glb';

let editMode = new URLSearchParams(window.location.search).get('edit') === '1';

const DEFAULT_DISTRICT_RADIUS_SCALE = 0.65;
const DISTRICT_RADIUS_OVERRIDES = {
  penn_square: 0.4,
  downtown: 0.4,
  suplex: 0.4,
};

const DISTRICT_RADIUS_OVERRIDES_STORAGE_KEY = 'dc_district_radius_overrides_v1';

let currentUser = null;

async function fetchJson(url, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
    credentials: 'include',
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    const msg = data?.error || `Request failed (${res.status})`;
    const err = new Error(msg);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

async function refreshMe() {
  try {
    const data = await fetchJson('/api/me');
    currentUser = data?.user || null;
  } catch {
    currentUser = null;
  }
  return currentUser;
}

async function loadDistrictConfigFromServer() {
  try {
    const data = await fetchJson('/api/districts/config');
    return data?.config || null;
  } catch {
    return null;
  }
}

async function saveDistrictConfigToServer(config) {
  const data = await fetchJson('/api/districts/config', {
    method: 'PUT',
    body: JSON.stringify({ config }),
  });
  return data?.config || null;
}

function redirectToDiscordLogin() {
  const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  window.location.href = `/auth/discord?returnTo=${encodeURIComponent(returnTo)}`;
}

async function requireLoginOrRedirect() {
  const me = await refreshMe();
  if (me) return me;
  redirectToDiscordLogin();
  return null;
}

async function loadPinsFromServer() {
  const data = await fetchJson('/api/pins');
  return Array.isArray(data?.pins) ? data.pins : [];
}

async function createPinOnServer(pin) {
  const data = await fetchJson('/api/pins', {
    method: 'POST',
    body: JSON.stringify(pin),
  });
  return data?.pin || null;
}

async function updatePinOnServer(id, patch) {
  const data = await fetchJson(`/api/pins/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(patch),
  });
  return data?.pin || null;
}

async function deletePinOnServer(id) {
  await fetchJson(`/api/pins/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

function debounce(fn, waitMs) {
  let t;
  return (...args) => {
    if (t) window.clearTimeout(t);
    t = window.setTimeout(() => fn(...args), waitMs);
  };
}

function makeId() {
  return `pin_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

function getDistrictRadiusScale(id, globalScale) {
  const override = DISTRICT_RADIUS_OVERRIDES[id];
  return Number.isFinite(override) ? override : globalScale;
}

function setSelectedPcBuilding(building) {
  if (!pcBuildingDetailsEl) return;
  if (!building) {
    pcBuildingDetailsEl.textContent = '';
    return;
  }

  const districtName = districtDefs.find((d) => d.id === building.districtId)?.name || '';
  const suffix = districtName ? `\nDistrict: ${districtName}` : '';
  pcBuildingDetailsEl.textContent = `${building.name}${suffix}`;
}

function setPinPanelOpen(open) {
  if (!pinPanelEl) return;
  pinPanelEl.setAttribute('data-open', open ? 'true' : 'false');
}

function loadRadiusScale() {
  try {
    const raw = window.localStorage.getItem('dc_district_radius_scale_v1');
    if (!raw) return DEFAULT_DISTRICT_RADIUS_SCALE;
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) return DEFAULT_DISTRICT_RADIUS_SCALE;
    return n;
  } catch {
    return DEFAULT_DISTRICT_RADIUS_SCALE;
  }
}

function saveRadiusScale(scale) {
  window.localStorage.setItem('dc_district_radius_scale_v1', String(scale));
}

function loadRadiusOverrides() {
  try {
    const raw = window.localStorage.getItem(DISTRICT_RADIUS_OVERRIDES_STORAGE_KEY);
    if (!raw) return {};
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== 'object') return {};
    return obj;
  } catch {
    return {};
  }
}

function saveRadiusOverrides(overrides) {
  window.localStorage.setItem(DISTRICT_RADIUS_OVERRIDES_STORAGE_KEY, JSON.stringify(overrides));
}

const districtDefs = [
  { id: 'pembroke', name: 'Pembroke', color: 0x5b8cff },
  { id: 'little_york', name: 'Little York', color: 0xff8a3d },
  { id: 'le_grande', name: 'Le Grande', color: 0xffd34d },
  { id: 'penn_square', name: 'Penn-Square', color: 0x65d8a6 },
  { id: 'downtown', name: 'Downtown', color: 0xff5b84 },
  { id: 'wharf', name: 'Wharf', color: 0x4cc9ff },
  { id: 'suplex', name: 'SuPlex', color: 0xc77dff },
  { id: 'hamptons', name: 'Hamptons', color: 0x8ee36b },
  { id: 'soho', name: 'Soho', color: 0xff6bb3 },
  { id: 'old_quarter', name: 'Old Quarter', color: 0xb7a6ff },
  { id: 'industrial_quarter', name: 'Industrial Quarter', color: 0xb0b0b0 },
];

const districtDetails = {
  pembroke: {
    tagline:
      "An old timey neighborhood on the far edge of town, with old cottage style family homes, small yards, and woods leading off one end. Everyone here knows each other and often leave their homes unlocked. There is a small corner store and a small local theater—life is slow and quiet here.",
  },
  little_york: {
    tagline:
      "A middle-class, mostly residential area—classic New York style apartment buildings and businesses. One of the few \"old-styled\" areas with only minor neo upgrades: lots of brick and simple stone decorations. Glass-windowed boutiques and mom-and-pop stores line the street with a little neon and chrome peeking through here and there.",
  },
  le_grande: {
    tagline:
      "A beautifully maintained resort area along the coast. Home to the \"Grande Time\" theme/water park with roller-coasters, water-slides, beaches, and shops. There is an attached arena for circulating attractions such as circuses, as well as the Le Grande hotel proper—over a hundred years old—lovingly maintained and updated by a mysterious benefactor.",
  },
  penn_square: {
    tagline:
      "A contemporary part of the city with freshly paved roads and lots of greenery. It contains entertainment and commercial facilities such as museums, theaters, cinemas, restaurants, bars, contemporary art galleries, a department store, and retail shops. Also home to a popular farmers market and several food, wine, art, and culture festivals.",
  },
  downtown: {
    tagline:
      "Though its borders are not clearly defined, Downtown consists roughly of the residential neighborhoods and commercial shopping areas from the river to the city center. Found here are many department stores, boutiques, day spas, a multiplex cinema, and other services catering to residents and visitors. Moderate and discount chains mix with corporate offices and broadcast media—heavy traffic is not uncommon.",
  },
  suplex: {
    tagline:
      "The city’s largest indoor mall, consisting of every amenity imaginable. Shops of every kind, theaters, restaurants, even theme parks. Hotels of all kinds are spread throughout—some offering long-term monthly rental deals. Delving into hidden areas can reveal a darker underbelly to the markets, too.",
  },
  hamptons: {
    tagline:
      "An upper-class private walled community. A mostly residential district with multi-million dollar mansions and landscaped yards with pools. Black-tie restaurants and super-car dealerships are sprinkled throughout.",
  },
  wharf: {
    tagline:
      "With easy access to the ocean and the growing expanse of the city, new construction was needed to facilitate trade and commerce—thus the Wharf: a massive spread of docks, warehouses, and shipping yards. Ships of all sizes come to deliver and send off goods while workers manage the dry docks. It also provides a prime location for clandestine meetings and corrupt underhanded deals.",
  },
  soho: {
    tagline:
      "A looser part of the city with older architecture. Once historical, after years of neglect and self policing it’s now corrupted with black curtains and red lights. Known for girl gangs and drug rings; bars, casinos, and clubs provide a rush of freedom. Scandals with stars and the odd politician pop up as many come in secret. The supernatural find criminals and underground groups—wolves, shapeshifters, vampire blood parlors, and more. Police are generally unwelcome here—except those who come to indulge.",
  },
  old_quarter: {
    tagline:
      "The first settlers built a community near the mouth of the river. This area contains preserved colonial-era buildings and homes, including Old Town Hall (now a museum), the original Farmer’s Market, the prestigious City University, St. Bibiana’s Cathedral, the Old Cemetery, the War Memorial, and The Commons—the city’s first public park. Rumor has it a network of tunnels spiders between strategic locations in the Old Quarter.",
  },
  industrial_quarter: {
    tagline:
      "A large industrial district and one of the most technologically advanced areas of the city. Huge strange buildings of steel and chrome stretch skyward awkwardly. The roads are labyrinthine, and occasionally strange foreign scents—or a stray scream—roll through the district.",
  },
};

function setSelectedDistrict(def) {
  selectedDistrictId = def ? def.id : null;
  if (!def) {
    districtNameEl.textContent = 'No district selected';
    districtBodyEl.textContent =
      "Click a district to view details.\n\n#the-undercity channel.\nWhile the city's expansion continued, so did\nintricacy of the subway network. Originally\ndesigned to house a lot of the unseen workings of\nthe city, like water reservoirs, maintenance\ntunnels, electric and internet lines, and\nunderground transportation, its purpose has\ngrown far beyond the initial expectations.";
    districtSwatchEl.style.background = 'transparent';
    return;
  }

  districtNameEl.textContent = def.name;
  const details = districtDetails[def.id];
  districtBodyEl.textContent = details?.tagline || '';

  const hex = `#${def.color.toString(16).padStart(6, '0')}`;
  districtSwatchEl.style.background = hex;
}

function loadSavedCenters() {
  try {
    const raw = window.localStorage.getItem('dc_district_centers_v1');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveCenters(centers) {
  window.localStorage.setItem('dc_district_centers_v1', JSON.stringify(centers));
}

function makeTextSprite(text) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  const fontSize = 96;
  ctx.font = `800 ${fontSize}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial`;

  const metrics = ctx.measureText(text);
  const paddingX = 56;
  const paddingY = 34;

  canvas.width = Math.ceil(metrics.width + paddingX * 2);
  canvas.height = Math.ceil(fontSize + paddingY * 2);

  ctx.font = `800 ${fontSize}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial`;
  ctx.textBaseline = 'middle';

  ctx.fillStyle = 'rgba(0,0,0,0.62)';
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.lineWidth = 6;
  ctx.beginPath();
  const r = 26;
  const w = canvas.width;
  const h = canvas.height;
  ctx.moveTo(r, 2);
  ctx.lineTo(w - r, 2);
  ctx.quadraticCurveTo(w - 2, 2, w - 2, r);
  ctx.lineTo(w - 2, h - r);
  ctx.quadraticCurveTo(w - 2, h - 2, w - r, h - 2);
  ctx.lineTo(r, h - 2);
  ctx.quadraticCurveTo(2, h - 2, 2, h - r);
  ctx.lineTo(2, r);
  ctx.quadraticCurveTo(2, 2, r, 2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = 'rgba(255,255,255,0.96)';
  ctx.shadowColor = 'rgba(0,0,0,0.72)';
  ctx.shadowBlur = 16;
  ctx.fillText(text, paddingX, h / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;

  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(material);
  const scale = 1.15;
  sprite.scale.set((canvas.width / 10) * scale, (canvas.height / 10) * scale, 1);
  sprite.renderOrder = 999;
  return sprite;
}

const clock = new THREE.Clock();

const keyState = {
  forward: false,
  back: false,
  left: false,
  right: false,
  up: false,
  down: false,
  fast: false,
};

function isTypingInUi() {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

function setKey(e, on) {
  if (isTypingInUi()) return;

  switch (e.code) {
    case 'KeyW':
      keyState.forward = on;
      break;
    case 'KeyS':
      keyState.back = on;
      break;
    case 'KeyA':
      keyState.right = on;
      break;
    case 'KeyD':
      keyState.left = on;
      break;
    case 'KeyQ':
      keyState.down = on;
      break;
    case 'KeyE':
      keyState.up = on;
      break;
    case 'Space':
      keyState.up = on;
      break;
    case 'ControlLeft':
    case 'ControlRight':
      keyState.down = on;
      break;
    case 'ShiftLeft':
    case 'ShiftRight':
      keyState.fast = on;
      break;
    default:
      return;
  }
  e.preventDefault();
}

window.addEventListener('keydown', (e) => setKey(e, true), { passive: false });
window.addEventListener('keyup', (e) => setKey(e, false), { passive: false });

statusEl.textContent = 'Loading model…';

loader.load(
  modelUrl,
  async (gltf) => {
    const root = gltf.scene;
    scene.add(root);

    root.traverse((obj) => {
      if (!obj.isMesh) return;
      obj.castShadow = true;
      obj.receiveShadow = true;

      if (obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const m of mats) {
          m.side = THREE.DoubleSide;
          m.needsUpdate = true;
        }
      }
    });

    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    root.position.sub(center);

    const adjustedBox = new THREE.Box3().setFromObject(root);
    const adjustedSize = adjustedBox.getSize(new THREE.Vector3());
    const adjustedMin = adjustedBox.min.clone();
    const adjustedMax = adjustedBox.max.clone();

    const maxDim = Math.max(adjustedSize.x, adjustedSize.y, adjustedSize.z);
    const fitDistance = maxDim * 1.1;

    camera.near = Math.max(0.1, maxDim / 5000);
    camera.far = Math.max(5000, maxDim * 30);
    camera.updateProjectionMatrix();

    camera.position.set(0, fitDistance * 0.6, fitDistance);
    controls.target.set(0, 0, 0);
    controls.update();

    const initialCameraDistance = camera.position.distanceTo(controls.target);

    const groundSize = Math.max(adjustedSize.x, adjustedSize.z) * 1.25;
    const groundGeo = new THREE.PlaneGeometry(groundSize, groundSize);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x0e1622, roughness: 1.0, metalness: 0.0 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = adjustedMin.y - 0.5;
    ground.receiveShadow = true;
    scene.add(ground);

    const markerGroup = new THREE.Group();
    markerGroup.renderOrder = 50;
    scene.add(markerGroup);

    const pinMeshes = [];
    const pinIdByUuid = {};
    let pins = [];
    let selectedPinId = null;
    let placingPinDraft = null;
    let movingPinId = null;

    function clearPins() {
      for (const m of pinMeshes) markerGroup.remove(m);
      pinMeshes.length = 0;
      for (const k of Object.keys(pinIdByUuid)) delete pinIdByUuid[k];
    }

    function makeGlowTexture() {
      const canvas = document.createElement('canvas');
      canvas.width = 128;
      canvas.height = 128;
      const ctx = canvas.getContext('2d');
      const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
      g.addColorStop(0.0, 'rgba(255, 245, 200, 1)');
      g.addColorStop(0.2, 'rgba(255, 245, 200, 0.95)');
      g.addColorStop(0.55, 'rgba(255, 180, 90, 0.35)');
      g.addColorStop(1.0, 'rgba(255, 180, 90, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 128, 128);
      const t = new THREE.CanvasTexture(canvas);
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    }

    const glowTexture = makeGlowTexture();

    function addPinMesh(pin) {
      const mat = new THREE.SpriteMaterial({
        map: glowTexture,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        opacity: 0.95,
      });
      const sprite = new THREE.Sprite(mat);
      sprite.position.set(pin.pos.x, pin.pos.y + 10, pin.pos.z);
      sprite.scale.set(26, 26, 1);
      sprite.renderOrder = 999;
      markerGroup.add(sprite);
      pinMeshes.push(sprite);
      pinIdByUuid[sprite.uuid] = pin.id;
    }

    function rebuildPins() {
      clearPins();
      for (const pin of pins) {
        if (!pin || !pin.pos) continue;
        addPinMesh(pin);
      }
    }

    function getPinById(id) {
      return pins.find((p) => p.id === id) || null;
    }

    function refreshPinDistrictOptions() {
      if (!pinDistrictEl) return;
      pinDistrictEl.innerHTML = '';
      const empty = document.createElement('option');
      empty.value = '';
      empty.textContent = 'District (optional)';
      pinDistrictEl.appendChild(empty);
      for (const d of districtDefs) {
        const opt = document.createElement('option');
        opt.value = d.id;
        opt.textContent = d.name;
        pinDistrictEl.appendChild(opt);
      }
    }

    function focusCameraOnPoint(point, opts = {}) {
      const durationMs = typeof opts.durationMs === 'number' ? opts.durationMs : 550;

      const fromTarget = controls.target.clone();
      const toTarget = new THREE.Vector3(point.x, point.y, point.z);
      const fromCam = camera.position.clone();
      const camOffset = fromCam.clone().sub(fromTarget);
      const toCam = toTarget.clone().add(camOffset);

      const start = performance.now();
      function easeInOut(t) {
        return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      }

      function step(now) {
        const t = Math.min(1, (now - start) / durationMs);
        const k = easeInOut(t);
        controls.target.lerpVectors(fromTarget, toTarget, k);
        camera.position.lerpVectors(fromCam, toCam, k);
        controls.update();
        if (t < 1) requestAnimationFrame(step);
      }

      requestAnimationFrame(step);
    }

    function setSelectedPin(id) {
      selectedPinId = id;
      const pin = id ? getPinById(id) : null;
      if (pinNameEl) pinNameEl.value = pin?.name || '';
      if (pinTypeEl) pinTypeEl.value = pin?.type || '';
      if (pinDescEl) pinDescEl.value = pin?.desc || '';
      if (pinDistrictEl) pinDistrictEl.value = pin?.districtId || '';
      setPinPanelOpen(!!pin);
      if (pin) {
        setSelectedPcBuilding({ name: pin.name || 'Pin', districtId: pin.districtId || '' });
      }

      const canEdit = !!(pin && currentUser && (editMode || (pin.ownerId && pin.ownerId === currentUser.id)));
      if (pinMoveEl) pinMoveEl.disabled = !canEdit;
      if (pinSaveEl) pinSaveEl.disabled = !canEdit;
      if (pinDeleteEl) pinDeleteEl.disabled = !canEdit;
    }

    const autoSaveSelectedPin = debounce(async () => {
      if (!selectedPinId) return;
      const pin = getPinById(selectedPinId);
      if (!pin) return;

      const me = await refreshMe();
      if (!me) return;

      const canEdit = editMode || (pin.ownerId && pin.ownerId === me.id);
      if (!canEdit) return;

      const next = {
        name: pinNameEl?.value?.trim() || '',
        type: pinTypeEl?.value?.trim() || '',
        desc: pinDescEl?.value || '',
        districtId: pinDistrictEl?.value || '',
      };

      const changed =
        next.name !== (pin.name || '') ||
        next.type !== (pin.type || '') ||
        next.desc !== (pin.desc || '') ||
        next.districtId !== (pin.districtId || '');

      if (!changed) return;

      try {
        const updated = await updatePinOnServer(pin.id, next);
        if (updated) {
          const idx = pins.findIndex((x) => x.id === updated.id);
          if (idx >= 0) pins[idx] = updated;
        }
        updatePcDropdownForSelectedDistrict();
        statusEl.textContent = 'Saved';
      } catch (err) {
        if (err?.status === 401) {
          redirectToDiscordLogin();
          return;
        }
        statusEl.textContent = err?.message || 'Auto-save failed';
      }
    }, 650);

    function pointIsInZone(point, districtId) {
      const z = zones[districtId];
      if (!z) return false;
      const dx = point.x - z.position.x;
      const dz = point.z - z.position.z;
      const s = z.scale.x;
      const r = baseZoneRadius * s;
      return dx * dx + dz * dz <= r * r;
    }

    function autoDistrictForPoint(point) {
      const inside = [];
      for (const d of districtDefs) {
        if (pointIsInZone(point, d.id)) inside.push(d.id);
      }
      return inside.length === 1 ? inside[0] : '';
    }

    function updatePcDropdownForSelectedDistrict() {
      if (!pcBuildingSelectEl) return;
      pcBuildingSelectEl.innerHTML = '';

      pcBuildingSelectEl.onchange = null;

      const emptyOpt = document.createElement('option');
      emptyOpt.value = '';
      emptyOpt.textContent = 'Select a building…';
      pcBuildingSelectEl.appendChild(emptyOpt);

      if (!selectedDistrictId) {
        setSelectedPcBuilding(null);
        return;
      }

      const candidates = pins.filter((p) => p.districtId === selectedDistrictId);
      for (const p of candidates) {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.name || '(unnamed pin)';
        pcBuildingSelectEl.appendChild(opt);
      }

      pcBuildingSelectEl.onchange = () => {
        const id = pcBuildingSelectEl.value;
        const pin = pins.find((x) => x.id === id) || null;
        if (pin) {
          setSelectedPin(pin.id);
          setSelectedDistrict(districtDefs.find((d) => d.id === pin.districtId) || null);
          setSelectedPcBuilding({ name: pin.name || '(unnamed pin)', districtId: pin.districtId || '' });
          if (pin.pos) focusCameraOnPoint(pin.pos);
        } else {
          setSelectedPcBuilding(null);
        }
      };
    }

    await refreshMe();
    pins = await loadPinsFromServer();
    refreshPinDistrictOptions();
    rebuildPins();

    if (addPinEl) {
      addPinEl.addEventListener('click', async () => {
        const me = await requireLoginOrRedirect();
        if (!me) return;
        placingPinDraft = {
          id: makeId(),
          name: '',
          type: '',
          desc: '',
          districtId: '',
          pos: null,
        };
        statusEl.textContent = 'Click the map to place pin…';
      });
    }

    if (pinMoveEl) {
      pinMoveEl.addEventListener('click', async () => {
        const me = await requireLoginOrRedirect();
        if (!me) return;
        if (!selectedPinId) return;
        const pin = getPinById(selectedPinId);
        if (!pin || pin.ownerId !== me.id) {
          statusEl.textContent = 'You can only move your own pins';
          return;
        }
        movingPinId = selectedPinId;
        statusEl.textContent = 'Click the map to move pin…';
      });
    }

    if (pinSaveEl) {
      pinSaveEl.addEventListener('click', async () => {
        const me = await requireLoginOrRedirect();
        if (!me) return;
        if (!selectedPinId) return;
        const pin = getPinById(selectedPinId);
        if (!pin) return;
        if (pin.ownerId !== me.id) {
          statusEl.textContent = 'You can only edit your own pins';
          return;
        }
        pin.name = pinNameEl?.value?.trim() || '';
        pin.type = pinTypeEl?.value?.trim() || '';
        pin.desc = pinDescEl?.value || '';
        pin.districtId = pinDistrictEl?.value || '';

        try {
          const updated = await updatePinOnServer(pin.id, {
            name: pin.name,
            type: pin.type,
            desc: pin.desc,
            districtId: pin.districtId,
          });
          if (updated) {
            const idx = pins.findIndex((p) => p.id === updated.id);
            if (idx >= 0) pins[idx] = updated;
          }
          updatePcDropdownForSelectedDistrict();
          statusEl.textContent = 'Saved pin';
        } catch (err) {
          if (err?.status === 401) {
            redirectToDiscordLogin();
            return;
          }
          statusEl.textContent = err?.message || 'Failed to save pin';
        }
      });
    }

    if (pinNameEl) pinNameEl.addEventListener('input', () => autoSaveSelectedPin());
    if (pinTypeEl) pinTypeEl.addEventListener('input', () => autoSaveSelectedPin());
    if (pinDescEl) pinDescEl.addEventListener('input', () => autoSaveSelectedPin());
    if (pinDistrictEl) pinDistrictEl.addEventListener('change', () => autoSaveSelectedPin());

    if (pinDeleteEl) {
      pinDeleteEl.addEventListener('click', async () => {
        const me = await requireLoginOrRedirect();
        if (!me) return;
        if (!selectedPinId) return;
        const pin = getPinById(selectedPinId);
        if (!pin) return;
        if (!editMode && pin.ownerId !== me.id) {
          statusEl.textContent = 'You can only delete your own pins';
          return;
        }
        try {
          await deletePinOnServer(selectedPinId);
          pins = pins.filter((p) => p.id !== selectedPinId);
          selectedPinId = null;
          setSelectedPin(null);
          rebuildPins();
          updatePcDropdownForSelectedDistrict();
          statusEl.textContent = 'Deleted pin';
        } catch (err) {
          if (err?.status === 401) {
            redirectToDiscordLogin();
            return;
          }
          statusEl.textContent = err?.message || 'Failed to delete pin';
        }
      });
    }

    if (pinCloseEl) {
      pinCloseEl.addEventListener('click', () => setSelectedPin(null));
    }

    const serverConfig = await loadDistrictConfigFromServer();
    if (serverConfig) {
      if (serverConfig.centers && typeof serverConfig.centers === 'object') {
        saveCenters(serverConfig.centers);
      }
      if (Number.isFinite(Number(serverConfig.radiusScale))) {
        saveRadiusScale(Number(serverConfig.radiusScale));
      }
      if (serverConfig.radiusOverrides && typeof serverConfig.radiusOverrides === 'object') {
        saveRadiusOverrides(serverConfig.radiusOverrides);
      }
    }

    const defaultCentersNdc = {
      pembroke: { x: -0.269830844714094, z: 0.9101437867080426 },
      little_york: { x: 0.33254451228022464, z: 0.606756677576358 },
      le_grande: { x: 0.24775241537833637, z: 0.2817743544579936 },
      penn_square: { x: -0.21562081329044247, z: -0.114442060741628 },
      downtown: { x: -0.09404747006370895, z: 0.07569766945879763 },
      wharf: { x: 0.3384136085925058, z: -0.05447398663151626 },
      suplex: { x: -0.29622000017055194, z: 0.08227770458231354 },
      hamptons: { x: -0.6825614331575234, z: -0.12010049500897635 },
      soho: { x: -0.5207904097068141, z: -0.7261299202004462 },
      old_quarter: { x: 0.06561274531670502, z: -0.3305229818875026 },
      industrial_quarter: { x: -0.003095646103198235, z: -0.7420975342535193 },
    };

    const saved = loadSavedCenters();
    const centers = {};

    for (const d of districtDefs) {
      const ndc = (saved && saved[d.id]) || defaultCentersNdc[d.id] || { x: 0, z: 0 };
      const x = THREE.MathUtils.lerp(adjustedMin.x, adjustedMax.x, (ndc.x + 1) / 2);
      const z = THREE.MathUtils.lerp(adjustedMin.z, adjustedMax.z, (ndc.z + 1) / 2);
      centers[d.id] = { x, z };
    }

    const districtsGroup = new THREE.Group();
    scene.add(districtsGroup);

    let radiusScale = loadRadiusScale();
    const radiusOverrides = loadRadiusOverrides();
    const baseZoneRadius = Math.max(adjustedSize.x, adjustedSize.z) * 0.14;

    const zones = {};
    const labels = {};
    const zonesArray = [];
    const defByZoneUuid = {};

    for (const d of districtDefs) {
      const zoneGeo = new THREE.CircleGeometry(baseZoneRadius, 64);
      const zoneMat = new THREE.MeshBasicMaterial({
        color: d.color,
        transparent: true,
        opacity: 0.14,
        depthWrite: false,
        depthTest: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      });
      const zone = new THREE.Mesh(zoneGeo, zoneMat);
      zone.rotation.x = -Math.PI / 2;
      zone.position.set(centers[d.id].x, ground.position.y + 0.25, centers[d.id].z);
      const storedOverride = radiusOverrides && Number.isFinite(Number(radiusOverrides[d.id])) ? Number(radiusOverrides[d.id]) : null;
      const s = Number.isFinite(storedOverride) ? storedOverride : getDistrictRadiusScale(d.id, radiusScale);
      zone.scale.set(s, s, 1);
      zone.renderOrder = 10;
      districtsGroup.add(zone);
      zones[d.id] = zone;
      zonesArray.push(zone);
      defByZoneUuid[zone.uuid] = d;

      const label = makeTextSprite(d.name);
      label.position.set(centers[d.id].x, ground.position.y + baseZoneRadius * s * 0.18, centers[d.id].z);
      districtsGroup.add(label);
      labels[d.id] = label;
      label.scale.multiplyScalar(LABEL_STATIC_BOOST);
      label.userData.baseScale = label.scale.clone();
      label.userData.refDistance = initialCameraDistance;
      districtLabelSprites.push(label);
      districtLabelById[d.id] = label;
    }

    let activeIndex = 0;
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const baseOpacity = 0.14;
    const hoverOpacity = 0.22;
    const selectedOpacity = 0.28;

    let hoveredId = null;
    let selectedId = null;

    if (districtListEl) {
      districtListEl.innerHTML = '';
      for (const d of districtDefs) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'district-btn';
        btn.setAttribute('aria-current', 'false');

        const label = document.createElement('span');
        label.textContent = d.name;
        btn.appendChild(label);

        const pill = document.createElement('span');
        pill.className = 'pill';
        pill.style.background = `#${d.color.toString(16).padStart(6, '0')}`;
        btn.appendChild(pill);

        btn.addEventListener('click', () => {
          selectedId = d.id;
          setSelectedDistrict(d);
          updatePcDropdownForSelectedDistrict();
          applyZoneStyles();
          for (const child of districtListEl.children) child.setAttribute('aria-current', 'false');
          btn.setAttribute('aria-current', 'true');
        });

        districtListEl.appendChild(btn);
      }
    }

    if (pcBuildingSelectEl) {
      updatePcDropdownForSelectedDistrict();
    }

    function applyZoneStyles() {
      for (const d of districtDefs) {
        const zone = zones[d.id];
        if (!zone || !zone.material) continue;
        if (selectedId === d.id) zone.material.opacity = selectedOpacity;
        else if (hoveredId === d.id) zone.material.opacity = hoverOpacity;
        else zone.material.opacity = baseOpacity;
      }
    }

    let statusResetTimer;

    function flashStatus(text) {
      statusEl.textContent = text;
      if (statusResetTimer) window.clearTimeout(statusResetTimer);
      statusResetTimer = window.setTimeout(() => {
        updateEditHud();
      }, 1200);
    }

    function updateEditHud() {
      if (!editMode) {
        statusEl.textContent = 'Loaded';
        return;
      }
      const name = selectedId ? districtDefs.find((d) => d.id === selectedId)?.name : null;
      statusEl.textContent = name
        ? `Edit: ${name} (drag to move, drag edge to resize)`
        : 'Edit: click a circle to select (drag to move, drag edge to resize)';
    }

    function setActiveIndex(i) {
      activeIndex = (i + districtDefs.length) % districtDefs.length;
      updateEditHud();
    }

    function setEditMode(on) {
      editMode = on;
      controls.enabled = !editMode;
      if (districtSaveEl) districtSaveEl.style.display = editMode ? '' : 'none';
      updateEditHud();
    }

    setEditMode(editMode);

    function onKeyDown(e) {
      if (e.key === '[' || e.key === '{' || e.key === ']' || e.key === '}') {
        const dir = (e.key === '[' || e.key === '{') ? -1 : 1;
        const step = 0.05;

        if (editMode && selectedId) {
          const current = zones[selectedId]?.scale?.x || getDistrictRadiusScale(selectedId, radiusScale);
          const next = THREE.MathUtils.clamp(Math.round((current + dir * step) * 100) / 100, 0.25, 3);
          radiusOverrides[selectedId] = next;
          saveRadiusOverrides(radiusOverrides);
          zones[selectedId].scale.set(next, next, 1);
          labels[selectedId].position.y = ground.position.y + baseZoneRadius * next * 0.18;
          flashStatus(`Circle: ${Math.round(next * 100)}%`);
          return;
        }

        radiusScale = THREE.MathUtils.clamp(Math.round((radiusScale + dir * step) * 100) / 100, 0.3, 3);
        saveRadiusScale(radiusScale);
        for (const d of districtDefs) {
          const override = radiusOverrides && Number.isFinite(Number(radiusOverrides[d.id])) ? Number(radiusOverrides[d.id]) : null;
          const s = Number.isFinite(override) ? override : getDistrictRadiusScale(d.id, radiusScale);
          zones[d.id].scale.set(s, s, 1);
          labels[d.id].position.y = ground.position.y + baseZoneRadius * s * 0.18;
        }
        flashStatus(`Circles: ${Math.round(radiusScale * 100)}%`);
        return;
      }

      if (!editMode) return;
      if (e.key === 'n' || e.key === 'N') setActiveIndex(activeIndex + 1);
    }

    let pointerDownPos = null;

    function onPointerMove(e) {
      if (editMode) return;

      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);

      raycaster.setFromCamera(mouse, camera);

      const pinHits = raycaster.intersectObjects(pinMeshes, false);
      if (pinHits.length) return;

      const hits = raycaster.intersectObjects(zonesArray, false);
      const hit = hits[0];

      const nextHovered = hit ? defByZoneUuid[hit.object.uuid]?.id ?? null : null;
      if (nextHovered === hoveredId) return;
      hoveredId = nextHovered;
      applyZoneStyles();
    }

    function onPointerDownSelect(e) {
      if (editMode) return;
      pointerDownPos = { x: e.clientX, y: e.clientY };
    }

    function onPointerUpSelect(e) {
      if (editMode) return;
      if (!pointerDownPos) return;

      const dx = e.clientX - pointerDownPos.x;
      const dy = e.clientY - pointerDownPos.y;
      pointerDownPos = null;

      if (Math.hypot(dx, dy) > 6) return;

      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);

      raycaster.setFromCamera(mouse, camera);

      if (placingPinDraft || movingPinId) {
        const groundHits = raycaster.intersectObject(ground, false);
        if (!groundHits.length) return;
        const p = groundHits[0].point;

        if (placingPinDraft) {
          placingPinDraft.pos = { x: p.x, y: p.y, z: p.z };
          placingPinDraft.districtId = autoDistrictForPoint(p);

          requireLoginOrRedirect().then(async (me) => {
            if (!me) return;
            try {
              const created = await createPinOnServer(placingPinDraft);
              if (created) {
                pins.push(created);
                rebuildPins();
                setSelectedPin(created.id);
                updatePcDropdownForSelectedDistrict();
                statusEl.textContent = 'Placed pin';
              } else {
                statusEl.textContent = 'Failed to create pin';
              }
            } catch (err) {
              if (err?.status === 401) {
                redirectToDiscordLogin();
                return;
              }
              statusEl.textContent = err?.message || 'Failed to create pin';
            } finally {
              placingPinDraft = null;
            }
          });
          return;
        }

        if (movingPinId) {
          const pin = getPinById(movingPinId);
          if (!pin) return;
          pin.pos = { x: p.x, y: p.y, z: p.z };
          pin.districtId = pin.districtId || autoDistrictForPoint(p);

          requireLoginOrRedirect().then(async (me) => {
            if (!me) return;
            if (pin.ownerId !== me.id) {
              statusEl.textContent = 'You can only move your own pins';
              movingPinId = null;
              return;
            }
            try {
              const updated = await updatePinOnServer(pin.id, { pos: pin.pos, districtId: pin.districtId });
              if (updated) {
                const idx = pins.findIndex((x) => x.id === updated.id);
                if (idx >= 0) pins[idx] = updated;
              }
              rebuildPins();
              updatePcDropdownForSelectedDistrict();
              statusEl.textContent = 'Moved pin';
            } catch (err) {
              if (err?.status === 401) {
                redirectToDiscordLogin();
                return;
              }
              statusEl.textContent = err?.message || 'Failed to move pin';
            } finally {
              movingPinId = null;
            }
          });
          return;
        }
      }

      const pinHits = raycaster.intersectObjects(pinMeshes, false);
      if (pinHits.length) {
        const pinId = pinIdByUuid[pinHits[0].object.uuid];
        if (pinId) setSelectedPin(pinId);
        return;
      }

      const hits = raycaster.intersectObjects(zonesArray, false);
      const hit = hits[0];

      const def = hit ? defByZoneUuid[hit.object.uuid] : null;
      selectedId = def ? def.id : null;
      setSelectedDistrict(def);
      updatePcDropdownForSelectedDistrict();
      applyZoneStyles();

      if (districtListEl) {
        for (const child of districtListEl.children) child.setAttribute('aria-current', 'false');
        if (def) {
          for (const child of districtListEl.children) {
            if (child.textContent && child.textContent.includes(def.name)) {
              child.setAttribute('aria-current', 'true');
              break;
            }
          }
        }
      }
    }

    const dragState = {
      mode: null,
      districtId: null,
      grabOffset: null,
    };

    function persistCenter(districtId, point) {
      const ndcX = ((point.x - adjustedMin.x) / (adjustedMax.x - adjustedMin.x)) * 2 - 1;
      const ndcZ = ((point.z - adjustedMin.z) / (adjustedMax.z - adjustedMin.z)) * 2 - 1;
      const toSave = loadSavedCenters() || {};
      toSave[districtId] = { x: ndcX, z: ndcZ };
      saveCenters(toSave);
    }

    function applyCenterAndLabel(districtId, x, z) {
      centers[districtId] = { x, z };
      const zone = zones[districtId];
      if (zone) zone.position.set(x, ground.position.y + 0.25, z);
      const s = zone?.scale?.x || getDistrictRadiusScale(districtId, radiusScale);
      const label = labels[districtId];
      if (label) label.position.set(x, ground.position.y + baseZoneRadius * s * 0.18, z);
    }

    function setSelectedDistrictInUi(def) {
      selectedId = def ? def.id : null;
      setSelectedDistrict(def);
      updatePcDropdownForSelectedDistrict();
      applyZoneStyles();

      if (districtListEl) {
        for (const child of districtListEl.children) child.setAttribute('aria-current', 'false');
        if (def) {
          for (const child of districtListEl.children) {
            if (child.textContent && child.textContent.includes(def.name)) {
              child.setAttribute('aria-current', 'true');
              break;
            }
          }
        }
      }

      updateEditHud();
    }

    function onPointerDown(e) {
      if (!editMode) return;

      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);

      raycaster.setFromCamera(mouse, camera);

      const pinHits = raycaster.intersectObjects(pinMeshes, false);
      if (pinHits.length) {
        const pinId = pinIdByUuid[pinHits[0].object.uuid];
        if (pinId) setSelectedPin(pinId);
        e.preventDefault();
        return;
      }

      const zoneHits = raycaster.intersectObjects(zonesArray, false);
      if (!zoneHits.length) return;

      const hit = zoneHits[0];
      const def = defByZoneUuid[hit.object.uuid];
      if (!def) return;

      setSelectedDistrictInUi(def);

      const groundHits = raycaster.intersectObject(ground, false);
      if (!groundHits.length) return;
      const point = groundHits[0].point;

      const cx = centers[def.id].x;
      const cz = centers[def.id].z;
      const dist = Math.hypot(point.x - cx, point.z - cz);
      const currentScale = zones[def.id]?.scale?.x || getDistrictRadiusScale(def.id, radiusScale);
      const edge = baseZoneRadius * currentScale;
      const edgeBand = Math.max(1.5, edge * 0.08);
      const isResize = Math.abs(dist - edge) <= edgeBand;

      dragState.mode = isResize ? 'resize' : 'move';
      dragState.districtId = def.id;
      dragState.grabOffset = isResize ? null : { x: cx - point.x, z: cz - point.z };
      renderer.domElement.setPointerCapture(e.pointerId);
      e.preventDefault();
    }

    function onPointerMoveEdit(e) {
      if (!editMode) return;
      if (!dragState.mode || !dragState.districtId) return;

      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
      raycaster.setFromCamera(mouse, camera);

      const groundHits = raycaster.intersectObject(ground, false);
      if (!groundHits.length) return;

      const p = groundHits[0].point;
      const districtId = dragState.districtId;

      if (dragState.mode === 'move' && dragState.grabOffset) {
        const nx = p.x + dragState.grabOffset.x;
        const nz = p.z + dragState.grabOffset.z;
        applyCenterAndLabel(districtId, nx, nz);
        persistCenter(districtId, { x: nx, z: nz });
        return;
      }

      if (dragState.mode === 'resize') {
        const cx = centers[districtId].x;
        const cz = centers[districtId].z;
        const dist = Math.max(0.01, Math.hypot(p.x - cx, p.z - cz));
        const nextScale = THREE.MathUtils.clamp(Math.round((dist / baseZoneRadius) * 100) / 100, 0.25, 3);
        radiusOverrides[districtId] = nextScale;
        saveRadiusOverrides(radiusOverrides);
        zones[districtId].scale.set(nextScale, nextScale, 1);
        labels[districtId].position.y = ground.position.y + baseZoneRadius * nextScale * 0.18;
      }
    }

    function onPointerUpEdit(e) {
      if (!editMode) return;
      if (!dragState.mode) return;
      try {
        renderer.domElement.releasePointerCapture(e.pointerId);
      } catch {
      }
      dragState.mode = null;
      dragState.districtId = null;
      dragState.grabOffset = null;
    }

    function buildCentersNdcForSave() {
      const out = {};
      for (const d of districtDefs) {
        const c = centers[d.id];
        if (!c) continue;
        const ndcX = ((c.x - adjustedMin.x) / (adjustedMax.x - adjustedMin.x)) * 2 - 1;
        const ndcZ = ((c.z - adjustedMin.z) / (adjustedMax.z - adjustedMin.z)) * 2 - 1;
        out[d.id] = { x: ndcX, z: ndcZ };
      }
      return out;
    }

    if (districtSaveEl) {
      districtSaveEl.addEventListener('click', async () => {
        if (!editMode) return;
        const me = await requireLoginOrRedirect();
        if (!me) return;

        try {
          districtSaveEl.disabled = true;
          statusEl.textContent = 'Saving districts…';

          const centersNdc = buildCentersNdcForSave();
          const overrides = loadRadiusOverrides();
          const config = {
            centers: centersNdc,
            radiusScale: loadRadiusScale(),
            radiusOverrides: overrides,
          };

          await saveDistrictConfigToServer(config);
          statusEl.textContent = 'Saved districts';
        } catch (err) {
          if (err?.status === 401) {
            redirectToDiscordLogin();
            return;
          }
          statusEl.textContent = err?.message || 'Failed to save districts';
        } finally {
          districtSaveEl.disabled = false;
        }
      });
    }

    window.addEventListener('keydown', onKeyDown);
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointermove', onPointerMoveEdit);
    renderer.domElement.addEventListener('pointerup', onPointerUpEdit);

    setSelectedDistrict(null);
    applyZoneStyles();
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerdown', onPointerDownSelect);
    renderer.domElement.addEventListener('pointerup', onPointerUpSelect);

    updateEditHud();
  },
  (evt) => {
    if (!evt.total) return;
    const pct = Math.round((evt.loaded / evt.total) * 100);
    statusEl.textContent = `Loading model… ${pct}%`;
  },
  (err) => {
    console.error(err);
    statusEl.textContent = 'Failed to load model';
  }
);

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

window.addEventListener('resize', onResize);

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);

  for (const s of districtLabelSprites) {
    const base = s.userData.baseScale;
    if (!base) continue;
    s.scale.set(base.x, base.y, base.z);
  }

  if (selectedDistrictId) {
    const s = districtLabelById[selectedDistrictId];
    if (s) {
      const base = s.userData.baseScale;
      const ref = s.userData.refDistance;
      if (base && ref) {
        const d = s.position.distanceTo(camera.position);
        const ratio = Math.max(0.001, d / ref);
        const factor = THREE.MathUtils.clamp(LABEL_SELECTED_EXTRA_BOOST * Math.pow(ratio, LABEL_SELECTED_DISTANCE_EXP), 1, 6);
        s.scale.set(base.x * factor, base.y * factor, base.z);
      }
    }
  }

  const moveSpeed = (keyState.fast ? 520 : 260) * dt;
  const moveUpSpeed = (keyState.fast ? 420 : 220) * dt;

  if (!isTypingInUi() && (keyState.forward || keyState.back || keyState.left || keyState.right || keyState.up || keyState.down)) {
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();

    const right = new THREE.Vector3().crossVectors(forward, camera.up).normalize().negate();
    const delta = new THREE.Vector3();

    if (keyState.forward) delta.addScaledVector(forward, moveSpeed);
    if (keyState.back) delta.addScaledVector(forward, -moveSpeed);
    if (keyState.right) delta.addScaledVector(right, moveSpeed);
    if (keyState.left) delta.addScaledVector(right, -moveSpeed);
    if (keyState.up) delta.y += moveUpSpeed;
    if (keyState.down) delta.y -= moveUpSpeed;

    camera.position.add(delta);
    controls.target.add(delta);
  }

  controls.update();
  renderer.render(scene, camera);
}

animate();
