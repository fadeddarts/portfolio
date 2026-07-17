import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const embedded = new URLSearchParams(location.search).get("embed") === "1";
document.body.classList.toggle("embed", embedded);

const canvas = document.querySelector("#scene");
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x080808);
scene.fog = new THREE.FogExp2(0x080808, 0.055);

const camera = new THREE.PerspectiveCamera(35, 1, .1, 100);
camera.position.set(0, .2, 8.3);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = !reducedMotion.matches;
controls.dampingFactor = .065;
controls.enablePan = false;
controls.minDistance = 4;
controls.maxDistance = 12;

scene.add(new THREE.HemisphereLight(0xb8c7ff, 0x050505, 1.8));
const key = new THREE.DirectionalLight(0xffffff, 6);
key.position.set(4, 5, 5);
scene.add(key);
const cobaltRim = new THREE.PointLight(0x1646ff, 45, 15, 1.7);
cobaltRim.position.set(-4, -1, 3);
scene.add(cobaltRim);
const back = new THREE.DirectionalLight(0x4268ff, 4);
back.position.set(-3, 2, -4);
scene.add(back);

const plinth = new THREE.Mesh(
  new THREE.CylinderGeometry(2.35, 2.35, .045, 96),
  new THREE.MeshStandardMaterial({ color: 0x101010, roughness: .36, metalness: .75 })
);
plinth.position.y = -2;
scene.add(plinth);

const objects = [
  {
    title: "Cobalt Knot",
    meta: "Torus knot / Cobalt ceramic",
    geometry: () => new THREE.TorusKnotGeometry(1.3, .42, 240, 36, 2, 3),
    material: () => new THREE.MeshPhysicalMaterial({
      color: 0x1646ff, roughness: .18, metalness: .1, clearcoat: 1, clearcoatRoughness: .12
    }),
    scale: .95,
  },
  {
    title: "Silver Fold",
    meta: "Deformed ico-shell / Brushed alloy",
    geometry: () => {
      const geometry = new THREE.IcosahedronGeometry(1.65, 5);
      const p = geometry.attributes.position;
      const vector = new THREE.Vector3();
      for (let i = 0; i < p.count; i++) {
        vector.fromBufferAttribute(p, i);
        const length = vector.length();
        const wave = 1 + .11 * Math.sin(vector.y * 5.2) * Math.cos(vector.x * 3.4) + .05 * Math.sin(vector.z * 8);
        vector.normalize().multiplyScalar(length * wave);
        vector.x *= .92;
        vector.y *= 1.15;
        p.setXYZ(i, vector.x, vector.y, vector.z);
      }
      geometry.computeVertexNormals();
      return geometry;
    },
    material: () => new THREE.MeshPhysicalMaterial({
      color: 0xe8e8e2, roughness: .24, metalness: .9, clearcoat: .4, flatShading: false
    }),
    scale: 1,
  },
  {
    title: "Void Orbit",
    meta: "Revolved spline / Obsidian glass",
    geometry: () => {
      const points = [];
      for (let i = 0; i <= 80; i++) {
        const y = -1.75 + i / 80 * 3.5;
        const radius = .72 + .62 * Math.pow(Math.sin(i / 80 * Math.PI), .55) + .13 * Math.sin(i / 80 * Math.PI * 6);
        points.push(new THREE.Vector2(radius, y));
      }
      return new THREE.LatheGeometry(points, 160);
    },
    material: () => new THREE.MeshPhysicalMaterial({
      color: 0x07091a, roughness: .11, metalness: .38, clearcoat: 1,
      clearcoatRoughness: .08, iridescence: 1, iridescenceIOR: 1.7, iridescenceThicknessRange: [100, 500]
    }),
    scale: .9,
  },
];

const group = new THREE.Group();
group.position.y = -.05;
scene.add(group);
let mesh;
let activeIndex = 0;

function showObject(index) {
  activeIndex = index;
  if (mesh) {
    group.remove(mesh);
    mesh.geometry.dispose();
    mesh.material.dispose();
  }
  const item = objects[index];
  mesh = new THREE.Mesh(item.geometry(), item.material());
  mesh.scale.setScalar(item.scale);
  mesh.rotation.set(.12, -.35, index === 2 ? .13 : 0);
  mesh.material.wireframe = document.querySelector("#wireframe").checked;
  group.add(mesh);

  document.querySelector("#object-number").textContent = String(index + 1).padStart(2, "0");
  document.querySelector("#object-title").textContent = item.title;
  document.querySelector("#object-meta").textContent = item.meta;
  document.querySelectorAll(".object-button").forEach((button, buttonIndex) => {
    const active = buttonIndex === index;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

document.querySelectorAll(".object-button").forEach((button) => {
  button.addEventListener("click", () => showObject(Number(button.dataset.object)));
});
document.querySelector("#wireframe").addEventListener("change", (event) => {
  if (mesh) mesh.material.wireframe = event.target.checked;
});
const rotateInput = document.querySelector("#autorotate");
if (reducedMotion.matches) rotateInput.checked = false;
reducedMotion.addEventListener("change", (event) => {
  controls.enableDamping = !event.matches;
  if (event.matches) rotateInput.checked = false;
});
addEventListener("keydown", (event) => {
  if (event.key >= "1" && event.key <= "3") showObject(Number(event.key) - 1);
});

function resize() {
  const { width, height } = canvas.getBoundingClientRect();
  renderer.setSize(width, height, false);
  camera.aspect = width / Math.max(height, 1);
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(canvas);
showObject(0);

const clock = new THREE.Clock();
function render() {
  const delta = Math.min(clock.getDelta(), .05);
  if (mesh && rotateInput.checked && !reducedMotion.matches) group.rotation.y += delta * .22;
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(render);
}
render();
