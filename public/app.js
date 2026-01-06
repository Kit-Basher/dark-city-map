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
container.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.target.set(0, 0, 0);
controls.minDistance = 1;
controls.maxDistance = 8000;

const hemi = new THREE.HemisphereLight(0xdde8ff, 0x0b0f14, 1.0);
hemi.position.set(0, 400, 0);
scene.add(hemi);

const dir = new THREE.DirectionalLight(0xffffff, 0.9);
dir.position.set(300, 600, 200);
scene.add(dir);

const grid = new THREE.GridHelper(2000, 50, 0x233041, 0x182233);
grid.position.y = -0.01;
scene.add(grid);

const loader = new GLTFLoader();

const modelUrl = '/api/map.glb';

statusEl.textContent = 'Loading model…';

loader.load(
  modelUrl,
  (gltf) => {
    const root = gltf.scene;
    scene.add(root);

    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    root.position.sub(center);

    const maxDim = Math.max(size.x, size.y, size.z);
    const fitDistance = maxDim * 1.1;

    camera.position.set(0, fitDistance * 0.6, fitDistance);
    controls.target.set(0, 0, 0);
    controls.update();

    statusEl.textContent = 'Loaded';
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
