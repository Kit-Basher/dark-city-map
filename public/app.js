import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import { OrbitControls } from 'https://unpkg.com/three@0.160.0/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'https://unpkg.com/three@0.160.0/examples/jsm/loaders/GLTFLoader.js';

const statusEl = document.getElementById('status');

const container = document.getElementById('app');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0f14);

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 50000);
camera.position.set(0, 250, 450);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
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

  const fontSize = 64;
  ctx.font = `700 ${fontSize}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial`;

  const metrics = ctx.measureText(text);
  const paddingX = 42;
  const paddingY = 26;

  canvas.width = Math.ceil(metrics.width + paddingX * 2);
  canvas.height = Math.ceil(fontSize + paddingY * 2);

  ctx.font = `700 ${fontSize}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial`;
  ctx.textBaseline = 'middle';

  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 4;
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

  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.shadowColor = 'rgba(0,0,0,0.65)';
  ctx.shadowBlur = 10;
  ctx.fillText(text, paddingX, h / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;

  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(material);
  const scale = 0.75;
  sprite.scale.set((canvas.width / 10) * scale, (canvas.height / 10) * scale, 1);
  sprite.renderOrder = 999;
  return sprite;
}

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

    const zoneRadius = Math.max(adjustedSize.x, adjustedSize.z) * 0.14;

    const zones = {};
    const labels = {};

    for (const d of districtDefs) {
      const zoneGeo = new THREE.CircleGeometry(zoneRadius, 64);
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
      zone.renderOrder = 10;
      districtsGroup.add(zone);
      zones[d.id] = zone;

      const label = makeTextSprite(d.name);
      label.position.set(centers[d.id].x, ground.position.y + zoneRadius * 0.18, centers[d.id].z);
      districtsGroup.add(label);
      labels[d.id] = label;
    }

    let activeIndex = 0;
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    function updateEditHud() {
      if (!editMode) {
        statusEl.textContent = 'Loaded';
        return;
      }
      statusEl.textContent = `Edit: click to set ${districtDefs[activeIndex].name} (N=next, E=exit)`;
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
      if (e.key === 'e' || e.key === 'E') {
        setEditMode(!editMode);
        return;
      }
      if (!editMode) return;
      if (e.key === 'n' || e.key === 'N') setActiveIndex(activeIndex + 1);
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
      labels[d.id].position.set(point.x, ground.position.y + zoneRadius * 0.18, point.z);

      const ndcX = ((point.x - adjustedMin.x) / (adjustedMax.x - adjustedMin.x)) * 2 - 1;
      const ndcZ = ((point.z - adjustedMin.z) / (adjustedMax.z - adjustedMin.z)) * 2 - 1;

      const toSave = loadSavedCenters() || {};
      toSave[d.id] = { x: ndcX, z: ndcZ };
      saveCenters(toSave);

      setActiveIndex(activeIndex + 1);
    }

    window.addEventListener('keydown', onKeyDown);
    renderer.domElement.addEventListener('pointerdown', onPointerDown);

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
  controls.update();
  renderer.render(scene, camera);
}

animate();
