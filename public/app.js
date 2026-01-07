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

const localPcBuildings = [
  { id: 'pc_001', name: 'PC Building (example)', districtId: 'downtown' },
];

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

  const districtName = districtDefs.find((d) => d.id === building.districtId)?.name || 'Unknown district';
  pcBuildingDetailsEl.textContent = `${building.name}\nDistrict: ${districtName}`;
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
  if (!def) {
    districtNameEl.textContent = 'No district selected';
    districtBodyEl.textContent =
      'Click a district to view details.\n\nUndercity: a vast tunnel/subway network connecting major landmarks and hidden routes (not shown as a surface district yet).';
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
      keyState.left = on;
      break;
    case 'KeyD':
      keyState.right = on;
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
  (gltf) => {
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

    const groundSize = Math.max(adjustedSize.x, adjustedSize.z) * 1.25;
    const groundGeo = new THREE.PlaneGeometry(groundSize, groundSize);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x0e1622, roughness: 1.0, metalness: 0.0 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = adjustedMin.y - 0.5;
    ground.receiveShadow = true;
    scene.add(ground);

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
      const s = getDistrictRadiusScale(d.id, radiusScale);
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
          applyZoneStyles();
          for (const child of districtListEl.children) child.setAttribute('aria-current', 'false');
          btn.setAttribute('aria-current', 'true');
        });

        districtListEl.appendChild(btn);
      }
    }

    if (pcBuildingSelectEl) {
      pcBuildingSelectEl.innerHTML = '';
      const emptyOpt = document.createElement('option');
      emptyOpt.value = '';
      emptyOpt.textContent = 'Select a building…';
      pcBuildingSelectEl.appendChild(emptyOpt);

      for (const b of localPcBuildings) {
        const opt = document.createElement('option');
        opt.value = b.id;
        opt.textContent = b.name;
        pcBuildingSelectEl.appendChild(opt);
      }

      pcBuildingSelectEl.addEventListener('change', () => {
        const id = pcBuildingSelectEl.value;
        const b = localPcBuildings.find((x) => x.id === id) || null;
        setSelectedPcBuilding(b);
      });
      setSelectedPcBuilding(null);
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
      statusEl.textContent = `Edit: click to set ${districtDefs[activeIndex].name} (N=next)`;
    }

    function setActiveIndex(i) {
      activeIndex = (i + districtDefs.length) % districtDefs.length;
      updateEditHud();
    }

    function setEditMode(on) {
      editMode = on;
      controls.enabled = !editMode;
      updateEditHud();
    }

    setEditMode(editMode);

    function onKeyDown(e) {
      if (e.key === '[' || e.key === '{') {
        radiusScale = Math.max(0.3, Math.round((radiusScale - 0.05) * 100) / 100);
        saveRadiusScale(radiusScale);
        for (const d of districtDefs) {
          const s = getDistrictRadiusScale(d.id, radiusScale);
          zones[d.id].scale.set(s, s, 1);
          labels[d.id].position.y = ground.position.y + baseZoneRadius * s * 0.18;
        }
        flashStatus(`Circles: ${Math.round(radiusScale * 100)}%`);
        return;
      }

      if (e.key === ']' || e.key === '}') {
        radiusScale = Math.min(3, Math.round((radiusScale + 0.05) * 100) / 100);
        saveRadiusScale(radiusScale);
        for (const d of districtDefs) {
          const s = getDistrictRadiusScale(d.id, radiusScale);
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
      const hits = raycaster.intersectObjects(zonesArray, false);
      const hit = hits[0];

      const def = hit ? defByZoneUuid[hit.object.uuid] : null;
      selectedId = def ? def.id : null;
      setSelectedDistrict(def);
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

    function onPointerDown(e) {
      if (!editMode) return;

      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);

      raycaster.setFromCamera(mouse, camera);
      const hits = raycaster.intersectObject(ground, false);
      if (!hits.length) return;

      const point = hits[0].point;
      const d = districtDefs[activeIndex];
      centers[d.id] = { x: point.x, z: point.z };
      zones[d.id].position.set(point.x, ground.position.y + 0.25, point.z);
      const s = getDistrictRadiusScale(d.id, radiusScale);
      labels[d.id].position.set(point.x, ground.position.y + baseZoneRadius * s * 0.18, point.z);

      const ndcX = ((point.x - adjustedMin.x) / (adjustedMax.x - adjustedMin.x)) * 2 - 1;
      const ndcZ = ((point.z - adjustedMin.z) / (adjustedMax.z - adjustedMin.z)) * 2 - 1;

      const toSave = loadSavedCenters() || {};
      toSave[d.id] = { x: ndcX, z: ndcZ };
      saveCenters(toSave);

      setActiveIndex(activeIndex + 1);
    }

    window.addEventListener('keydown', onKeyDown);
    renderer.domElement.addEventListener('pointerdown', onPointerDown);

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
