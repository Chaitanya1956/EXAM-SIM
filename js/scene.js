/**
 * scene.js  –  Three.js scene, renderer, lighting and GLB loading.
 * Exports: { scene, renderer, camera, clock, loadHall, getNamedObjects }
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// ── Renderer ────────────────────────────────────────────────────
export const renderer = new THREE.WebGLRenderer({
  canvas: document.getElementById('three-canvas'),
  antialias: true,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping    = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = false;   // keep Quest-friendly
renderer.xr.enabled = true;

// ── Scene + fog ─────────────────────────────────────────────────
export const scene = new THREE.Scene();
scene.background = new THREE.Color(0xcfe3f2);
scene.fog = new THREE.Fog(0xcfe3f2, 18, 32);

// ── Camera ──────────────────────────────────────────────────────
export const camera = new THREE.PerspectiveCamera(
  70, window.innerWidth / window.innerHeight, 0.05, 60
);
// VR start: standing at primary desk, eye-height ≈ 1.15 m
camera.position.set(0, 1.15, -1.20);  // Three.js coords (after hall offset)
camera.lookAt(0, 1.00, -4.0);

// ── Clock ───────────────────────────────────────────────────────
export const clock = new THREE.Clock();

// ── Lighting  (cheap, Quest-compatible) ─────────────────────────
const hemi = new THREE.HemisphereLight(0xdfe9f2, 0x9a957a, 1.1);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xfff1dc, 1.6);
sun.position.set(-8, 7, 3);
scene.add(sun);

// Soft fill from the right to lift shadows without expensive shadow maps
const fill = new THREE.DirectionalLight(0xdce8f0, 0.4);
fill.position.set(6, 4, -2);
scene.add(fill);

// Warm ceiling bounce
const bounce = new THREE.PointLight(0xfff5e0, 0.6, 20, 2);
bounce.position.set(0, 3.2, -3.0);
scene.add(bounce);

// ── Responsive resize ───────────────────────────────────────────
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ── Named-object registry ────────────────────────────────────────
const WANTED = [
  'PRIMARY_DESK', 'PRIMARY_CHAIR', 'EXAM_PAPER', 'EXAM_CLOCK',
  'EXAM_CLOCK_FACE', 'EXAM_CLOCK_HOUR_HAND', 'EXAM_CLOCK_MINUTE_HAND',
  'EXAM_CLOCK_SECOND_HAND', 'EXAM_PEN', 'CLASSROOM_DOOR', 'BLACKBOARD',
  'NOTICE_BOARD', 'INVIGILATOR_DESK', 'VR_START', 'CEILING_FAN_01',
];
const named = {};

export function getNamedObjects() { return named; }

function catalogObjects(root) {
  const all = [];
  root.traverse(o => { all.push(o.name); });

  console.groupCollapsed('EXAM//SIM – scene object catalog (%d nodes)', all.length);
  WANTED.forEach(n => {
    const obj = root.getObjectByName(n);
    if (obj) {
      named[n] = obj;
      console.log(`  ✓  ${n}`, '→', obj.type, obj.position.toArray().map(v => v.toFixed(3)));
    } else {
      console.warn(`  ✗  ${n}  (not found – check GLB export)`);
    }
  });
  console.groupEnd();
}

// ── Fix glass transparency that may survive GLB export ──────────
function fixMaterials(root) {
  root.traverse(obj => {
    if (!obj.isMesh) return;

    // Glass meshes
    if (obj.name.endsWith('_GLASS')) {
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach(m => {
        m.transparent = true;
        m.opacity     = 0.15;
        m.depthWrite  = false;
        m.side        = THREE.DoubleSide;
        if (m.color) m.color.set(0xcfe8ea);
      });
    }

    // Emissive ceiling lights
    if (obj.name.startsWith('CEILING_LIGHT_')) {
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach(m => {
        m.emissive = m.emissive || new THREE.Color(0xfff9e6);
        m.emissive.set(0xfff9e6);
        m.emissiveIntensity = 0.9;
      });
    }

    // Frustum-cull all meshes properly
    obj.frustumCulled = true;
  });
}

// ── GLB loader ───────────────────────────────────────────────────
const GLB_PATH = './assets/models/examination-hall.glb';

/**
 * loadHall(onProgress) → Promise<THREE.Group>
 * onProgress({ loaded, total, label })
 */
export function loadHall(onProgress) {
  return new Promise((resolve, reject) => {
    const loader = new GLTFLoader();

    loader.load(
      GLB_PATH,

      // onLoad
      (gltf) => {
        const hall = gltf.scene;

        // The script documented VR_START at Blender (0, 2.40, 0) which becomes
        // Three.js (0, 0, -2.40).  We offset the hall so that position is at
        // the world origin, letting the XR camera start at (0,0,0).
        hall.position.set(0, 0, 2.40);

        fixMaterials(hall);
        catalogObjects(hall);
        scene.add(hall);

        // Now that the hall is at this offset, nudge the preview camera too
        camera.position.set(0, 1.15, 1.20);
        camera.lookAt(0, 1.00, -1.60);

        resolve(hall);
      },

      // onProgress
      (evt) => {
        if (evt.lengthComputable && onProgress) {
          onProgress({
            loaded: evt.loaded,
            total:  evt.total,
            label:  `Loading environment… ${Math.round(evt.loaded / evt.total * 100)}%`,
          });
        }
      },

      // onError
      (err) => {
        console.error('GLTFLoader error:', err);
        reject(new Error(
          `Could not load "${GLB_PATH}".\n` +
          `Confirm the file exists and that you are serving the project through a local HTTP server.\n` +
          `Original error: ${err.message || err}`
        ));
      }
    );
  });
}
