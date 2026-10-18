import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LEVELS, STAGES, STORY, VOTE, howto } from './content.js';
import { Sound } from './audio.js';
import { openIdentify, openRisk, openDrug } from './analysis.js';

/* =========================================================
   크로노스 프로토콜 · 2차시 미래 편 「바이러스 X」
   교사용 URL 옵션: ?skip (인트로 건너뛰기)  ?stage=heart|brain|cure (해당 장소부터)  ?teacher (미션 완료 버튼)  ?touch / ?mouse
   ========================================================= */
const $ = id => document.getElementById(id);
const P = new URLSearchParams(location.search);
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const fmt = n => Math.round(n).toLocaleString('ko-KR');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const V3 = () => new THREE.Vector3();
const TODAY = new Date();
const wrap01 = f => f - Math.floor(f);

/* ---------------- 렌더러 ---------------- */
const IS_TOUCH = !P.has('mouse') && (P.has('touch') || (navigator.maxTouchPoints > 0 && matchMedia('(pointer: coarse)').matches));
if (IS_TOUCH) document.body.classList.add('touch');
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
const PR_MAX = Math.min(devicePixelRatio, IS_TOUCH ? 1.5 : 1.75), PR_MIN = 0.6;
let pixRatio = Math.min(PR_MAX, IS_TOUCH ? 1.25 : 1.6), perfT = 0, perfN = 0;
renderer.setPixelRatio(pixRatio); renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.outputColorSpace = THREE.SRGBColorSpace;
function adaptResolution(raw) {
  if (raw > 0.25) return; perfT += raw; perfN++; if (perfT < 2) return;
  const fps = perfN / perfT; perfT = 0; perfN = 0;
  const next = fps < 40 ? Math.max(PR_MIN, pixRatio - 0.15) : fps > 57 ? Math.min(PR_MAX, pixRatio + 0.1) : pixRatio;
  if (next !== pixRatio) { pixRatio = next; renderer.setPixelRatio(pixRatio); }
}
const camera = new THREE.PerspectiveCamera(64, innerWidth / innerHeight, 0.05, 500);
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });
const envTex = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
const sound = new Sound();
const sfx = (n, v, r) => sound.play(n, v, r);

/* ---------------- 에셋 ---------------- */
const FILES = ['robot', 'virus', 'wbc', 'lab', 'timemachine'];
const assets = {};
async function loadAssets() {
  const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder); const prog = {};
  const upd = () => { let l = 0, t = 0; for (const k of FILES) { l += prog[k]?.l || 0; t += prog[k]?.t || 1; } $('loadbar').firstElementChild.style.width = (100 * l / t).toFixed(1) + '%'; };
  await Promise.all(FILES.map(k => new Promise((res, rej) => loader.load('assets/' + k + '.glb', g => { assets[k] = g.scene; prog[k] = { l: 1, t: 1 }; upd(); res(); }, e => { prog[k] = { l: e.loaded, t: e.total || e.loaded * 2 || 1 }; upd(); }, rej))));
}
const MODEL_YAW = { robot: -Math.PI / 2 };
function makeModel(key, len) {
  const inner = assets[key].clone(true); inner.rotation.y = MODEL_YAW[key] || 0;
  const wrap = new THREE.Group(); wrap.add(inner); wrap.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(wrap), size = box.getSize(V3()), c = box.getCenter(V3());
  inner.position.sub(c); const s = len / Math.max(size.x, size.z); wrap.scale.setScalar(s);
  const pivot = new THREE.Group(); pivot.add(wrap); pivot.userData = { wrap, height: size.y * s }; return pivot;
}
// 여러 재질로 된 모델을 인스턴싱용 (형태, 재질) 목록으로
function bakeParts(key, len) {
  const piv = makeModel(key, len); piv.updateMatrixWorld(true); const parts = [];
  piv.traverse(m => {
    if (!m.isMesh) return; const g = m.geometry.clone();
    for (const k of Object.keys(g.attributes)) { const a = g.attributes[k]; if (a.isInterleavedBufferAttribute || !(a.array instanceof Float32Array)) { const f = new Float32Array(a.count * a.itemSize), get = [a.getX, a.getY, a.getZ, a.getW]; for (let i = 0; i < a.count; i++) for (let c = 0; c < a.itemSize; c++) f[i * a.itemSize + c] = get[c].call(a, i); g.setAttribute(k, new THREE.BufferAttribute(f, a.itemSize)); } }
    g.applyMatrix4(m.matrixWorld); parts.push({ geo: g, mat: m.material });
  });
  return parts;
}
function radialTex(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)') {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, inner); gr.addColorStop(1, outer); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
}
function bangTex() { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); g.fillStyle = '#ff2d45'; g.beginPath(); g.arc(64, 64, 54, 0, 7); g.fill(); g.fillStyle = '#fff'; g.font = '900 92px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('!', 64, 70); return new THREE.CanvasTexture(c); }
function ringTex() { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); g.strokeStyle = '#fff'; g.lineWidth = 7; g.shadowColor = '#fff'; g.shadowBlur = 10; g.beginPath(); g.arc(64, 64, 52, 0, 7); g.stroke(); return new THREE.CanvasTexture(c); }
const BANG_TEX = bangTex(), RING_TEX = ringTex();

/* =========================================================
   연구소 (2026 / 2187 폐허)
   ========================================================= */
const lab = { scene: new THREE.Scene(), t: 0, power: 0, alarm: false, ruined: false, shake: 0, camFrom: V3(), camTo: V3(), look: V3() };
function buildLab() {
  const s = lab.scene; s.environment = envTex; s.environmentIntensity = 0.55; s.background = new THREE.Color(0x03070a); s.fog = new THREE.Fog(0x03070a, 18, 40);
  const room = assets.lab.clone(true), b = new THREE.Box3().setFromObject(room), c = b.getCenter(V3()); room.position.set(-c.x, -b.min.y, -c.z); s.add(room);
  lab.mats = new Set(); room.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); const m = o.material; m.userData.c0 = m.color.clone(); m.userData.e0 = m.emissiveIntensity ?? 1; lab.mats.add(m); } });
  const tm = makeModel('timemachine', 6.2), metal = new THREE.MeshStandardMaterial({ color: 0x8d97a3, metalness: 0.92, roughness: 0.32 });
  tm.traverse(o => { if (o.isMesh) o.material = metal; }); tm.position.set(3.0, tm.userData.height / 2, 1.6); tm.rotation.y = 0.5; s.add(tm);
  const vortex = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, uniforms: { uTime: { value: 0 }, uPow: { value: 0 }, uCol: { value: new THREE.Color(0x5ff2ff) } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `varying vec2 vUv; uniform float uTime; uniform float uPow; uniform vec3 uCol; void main(){ vec2 p = vUv*2.0-1.0; float r = length(p); if(r>1.0) discard; float a = atan(p.y,p.x); float sw = sin(a*6.0 + r*14.0 - uTime*6.0)*0.5+0.5; float glow = smoothstep(1.0,0.0,r); float v = (sw*0.6+0.4)*glow*uPow; gl_FragColor = vec4(uCol*(v*1.6 + pow(glow,6.0)*uPow*2.0), v); }` });
  const ring = new THREE.Group(), torus = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.06, 16, 96), new THREE.MeshBasicMaterial({ color: 0x5ff2ff }));
  ring.add(torus, new THREE.Mesh(new THREE.CircleGeometry(1.1, 64), vortex)); ring.position.set(-1.02, 0.5, 0.08); ring.rotation.y = Math.PI / 2; ring.scale.setScalar(0.66); tm.add(ring);
  lab.vortex = vortex; lab.torus = torus; lab.ring = ring;
  lab.amb = new THREE.AmbientLight(0x9fdcff, 0.35); s.add(lab.amb);
  const key = new THREE.SpotLight(0xbff4ff, 60, 30, 0.7, 0.6); key.position.set(1, 5.2, 4); key.target = tm; s.add(key, key.target); lab.key = key;
  lab.fill = []; for (const [x, z] of [[-6, -2], [0, -3], [6, 2]]) { const l = new THREE.PointLight(0x7fdfff, 6, 12); l.position.set(x, 4.6, z); s.add(l); lab.fill.push(l); }
  lab.red = new THREE.PointLight(0xff2030, 0, 30); lab.red.position.set(0, 4.5, 0); s.add(lab.red);
  // 환자 캡슐 빛 (2187)
  lab.pod = new THREE.PointLight(0x7dffb0, 0, 10); lab.pod.position.set(-3.2, 1.6, -2.6); s.add(lab.pod);
  // 먼지 (폐허)
  const dg = new THREE.BufferGeometry(), dp = new Float32Array(1200 * 3); for (let i = 0; i < 1200; i++) { dp[i * 3] = rand(-10, 10); dp[i * 3 + 1] = rand(0, 5.5); dp[i * 3 + 2] = rand(-5, 5); }
  dg.setAttribute('position', new THREE.BufferAttribute(dp, 3));
  lab.dust = new THREE.Points(dg, new THREE.PointsMaterial({ size: 0.05, map: radialTex(), color: 0xd8c8b0, transparent: true, opacity: 0, depthWrite: false })); s.add(lab.dust);
}
function setLabMood(ruined) {
  lab.ruined = ruined; lab.scene.fog.color.set(ruined ? 0x0b0606 : 0x03070a); lab.scene.background.set(ruined ? 0x0b0606 : 0x03070a); lab.scene.fog.near = ruined ? 8 : 18; lab.scene.fog.far = ruined ? 26 : 40;
  lab.scene.environmentIntensity = ruined ? 0.18 : 0.55; lab.amb.intensity = ruined ? 0.12 : 0.35; lab.key.intensity = ruined ? 18 : 60;
  lab.dust.material.opacity = ruined ? 0.7 : 0; lab.pod.intensity = ruined ? 25 : 0;
  // 폐허: 재질을 어둡고 누렇게, 화면 노출도 낮춤
  const grime = new THREE.Color(0x4a3428);
  lab.mats.forEach(m => { m.color.copy(m.userData.c0); if (ruined) m.color.multiplyScalar(0.35).lerp(grime, 0.35); if ('emissiveIntensity' in m) m.emissiveIntensity = m.userData.e0 * (ruined ? 0.15 : 1); });
  renderer.toneMappingExposure = ruined ? 0.7 : 1;
}
function updateLab(dt) {
  lab.t += dt; const pw = lab.power;
  lab.vortex.uniforms.uTime.value = lab.t; lab.vortex.uniforms.uPow.value = pw; lab.vortex.uniforms.uCol.value.set(lab.alarm ? 0xff5070 : 0x5ff2ff); lab.torus.rotation.z += dt * (0.4 + pw * 6);
  lab.red.intensity = lab.alarm ? 120 * (0.5 + 0.5 * Math.sin(lab.t * 9)) : lab.ruined ? 30 * (0.6 + 0.4 * Math.sin(lab.t * 2.3)) : 0;
  if (lab.ruined) { lab.fill.forEach((l, i) => l.intensity = Math.random() < 0.04 ? 0 : 2.5 + Math.sin(lab.t * 7 + i) * 1.5); lab.pod.intensity = 20 + 8 * Math.sin(lab.t * 1.6); const p = lab.dust.geometry.attributes.position; for (let i = 0; i < p.count; i++) { let y = p.getY(i) - dt * 0.05; if (y < 0) y = 5.5; p.setY(i, y); } p.needsUpdate = true; }
  else lab.fill.forEach(l => l.intensity = 6);
  camera.position.lerpVectors(lab.camFrom, lab.camTo, smooth(0, 1, Math.min(1, lab.t / 26)));
  if (lab.alarm) { lab.shake = Math.min(1, lab.shake + dt * 0.5); camera.position.x += (Math.random() - 0.5) * 0.05 * lab.shake; }
  camera.lookAt(lab.look); camera.up.set(0, 1, 0);
}
function startLabCamera(mode) {
  lab.t = 0; lab.shake = 0; camera.up.set(0, 1, 0);
  if (mode === 'pod') { lab.camFrom.set(-0.6, 1.9, 3.8); lab.camTo.set(-2.0, 1.5, 0.6); lab.look.set(-3.4, 1.3, -2.8); }
  else { lab.camFrom.set(-2.8, 2.0, 6.6); lab.camTo.set(0.4, 1.75, 4.9); lab.look.set(2.3, 1.9, 1.4); }
}

/* =========================================================
   워프
   ========================================================= */
const warp = { scene: new THREE.Scene(), t: 0, dur: 3.4, col: new THREE.Color(0x5ff2ff), seed: [] };
{
  const N = 1400, g = new THREE.BufferGeometry();
  for (let i = 0; i < N; i++) { const a = Math.random() * Math.PI * 2, r = rand(1.5, 22); warp.seed.push([Math.cos(a) * r, Math.sin(a) * r, rand(-420, 0)]); }
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 6), 3));
  warp.lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x9ff6ff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending }));
  warp.scene.add(warp.lines); warp.scene.background = new THREE.Color(0x01040a);
}
function updateWarp(dt) {
  warp.t += dt; const k = clamp(warp.t / warp.dur, 0, 1), sp = 120 + 520 * Math.sin(Math.PI * k), pos = warp.lines.geometry.attributes.position;
  warp.seed.forEach((s, i) => { s[2] += sp * dt; if (s[2] > 2) s[2] -= 420; pos.setXYZ(i * 2, s[0], s[1], s[2]); pos.setXYZ(i * 2 + 1, s[0], s[1], s[2] - sp * 0.05); });
  pos.needsUpdate = true; warp.lines.material.color.copy(warp.col).offsetHSL(Math.sin(warp.t * 3) * 0.05, 0, 0);
  camera.up.set(0, 1, 0); camera.position.set(0, 0, 0); camera.rotation.set(0, 0, warp.t * 0.6); camera.fov = 64 + 40 * Math.sin(Math.PI * k); camera.updateProjectionMatrix();
}

/* =========================================================
   몸속 — 혈관 · 심장 · 뇌 (모두 몸속을 도는 고리 모양 통로, 벽을 걸어 다녀요)
   과학 사실: 바이러스는 혼자서는 움직이지도 늘어나지도 못해요.
   → 떠다니는 바이러스는 혈류에 실려 갈 뿐이고, 건강한 세포에 닿으면 그 세포 안에서 복제돼요.
   → 바이러스에 점령된 세포(감염체)가 움직이며 바이러스를 퍼뜨리고 로봇을 공격해요.
   ========================================================= */
const TAU = Math.PI * 2;
const ENV = {
  vessel: {
    loop: [70, 14, 3, 5], R: f => 10 + 2.5 * Math.sin(f * TAU * 4 + 1), tex: 'vessel', bg: 0x2a0508, fog: 0x3a080d, fogD: 0.03,
    hemi: [0xff9a9a, 0x400810, 1.4], tint: [1, 0.4, 0.42], emis: 0x3a0408, flow: 22, start: 0.02, rbc: true, plasma: 0xffd2c8,
    regions: [[0, '대정맥'], [0.3, '간 혈관'], [0.55, '폐 모세혈관'], [0.8, '대동맥']],
    cells: [0.2, 0.42, 0.63, 0.85], healthy: 14, carriers: 5, immune: ['neutro', 'neutro', 'neutro', 'neutro', 'bcell', 'bcell'],
  },
  heart: {
    loop: [55, 8, 2, 7], R: f => 8.5 + 15 * Math.pow(Math.sin(f * TAU * 2), 2), tex: 'heart', bg: 0x220406, fog: 0x30070a, fogD: 0.024,
    hemi: [0xffa08a, 0x3a0608, 1.5], tint: [0.95, 0.42, 0.38], emis: 0x300406, flow: 12, start: 0.125, rbc: true, plasma: 0xffc0b0,
    regions: [[0, '우심방'], [0.25, '우심실'], [0.5, '좌심방'], [0.75, '좌심실']], valves: [0, 0.25, 0.5, 0.75],
    cells: [0.36, 0.62, 0.87], nodes: [0.17, 0.43, 0.7], healthy: 12, carriers: 5, immune: ['neutro', 'neutro', 'macro', 'macro', 'bcell', 'bcell'],
  },
  brain: {
    loop: [60, 12, 3, 10], R: f => 11 + 2.5 * Math.sin(f * TAU * 3 + 2), tex: 'brain', bg: 0x0e0818, fog: 0x1a0f2a, fogD: 0.032,
    hemi: [0xd8c0ff, 0x201030, 1.3], tint: [0.9, 0.78, 0.95], emis: 0x1a0828, flow: 5, start: 0.02, rbc: false, plasma: 0xc8a8ff,
    regions: [[0, '대뇌 피질'], [0.3, '해마 (기억)'], [0.6, '뇌줄기 (호흡·심장 조절)'], [0.8, '소뇌 (균형)']],
    cells: [0.24, 0.5, 0.76], healthy: 12, carriers: 6, immune: ['macro', 'macro', 'macro', 'bcell', 'bcell', 'neutro'], axons: 3,
  },
};
ENV.cure = { ...ENV.brain, carriers: 3, immune: ['neutro', 'neutro', 'macro', 'macro'] };

const body = { scene: new THREE.Scene() }, bs = body.scene;
const NS = 1600; let FP = [], FT = [], FN = [], FB = [], FR = [], LEN = 1, E = ENV.vessel, SQ = 0;
const SQU = { value: 0 };
function buildPath(env) {
  const [r0, amp, k, h] = env.loop, pts = [];
  for (let i = 0; i < 18; i++) { const a = i / 18 * TAU, r = r0 + amp * Math.sin(k * a + 0.4); pts.push(new THREE.Vector3(Math.cos(a) * r, h * Math.sin(2 * a), Math.sin(a) * r)); }
  const curve = new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.5); LEN = curve.getLength();
  FP = []; FT = []; FN = []; FB = []; FR = [];
  for (let i = 0; i < NS; i++) {
    const f = i / NS, p = curve.getPointAt(f), t = curve.getTangentAt(f).normalize(), n = V3().crossVectors(t, new THREE.Vector3(0, 1, 0)).normalize(), b = V3().crossVectors(n, t).normalize();
    FP.push(p); FT.push(t); FN.push(n); FB.push(b); FR.push(env.R(f));
  }
}
const regionAt = f => { let n = E.regions[0][1]; for (const [s, name] of E.regions) if (f >= s) n = name; return n; };
const df = (a, b) => { let x = a - b; x -= Math.round(x); return x; }; // 고리 위에서 a−b (−0.5~0.5)
function frame(f, o = {}) {
  const x = wrap01(f) * NS, i = Math.floor(x) % NS, j = (i + 1) % NS, k = x - Math.floor(x);
  o.P = (o.P || V3()).lerpVectors(FP[i], FP[j], k); o.T = (o.T || V3()).lerpVectors(FT[i], FT[j], k).normalize();
  o.N = (o.N || V3()).lerpVectors(FN[i], FN[j], k).normalize(); o.B = (o.B || V3()).lerpVectors(FB[i], FB[j], k).normalize(); o.R = lerp(FR[i], FR[j], k) * (1 - SQ);
  return o;
}
const bumpAt = (env, th, f) => 1 + 0.05 * Math.sin(th * 7 + f * 300) * Math.sin(f * 900 + th * 3) + (env.tex === 'heart' ? 0.07 * Math.sin(th * 11 + f * 160) * Math.sin(f * 420) : env.tex === 'brain' ? 0.04 * Math.sin(th * 9 + Math.sin(f * 200) * 3) : 0);
// 벽 위의 점: u = 바닥 가운데에서 옆으로 떨어진 거리 (벽을 타고 올라갈 수 있어요)
const _fr = {};
function surface(f, u, out = {}) {
  const F = frame(f, _fr), R = F.R, uu = clamp(u, -0.86 * R, 0.86 * R), d = Math.sqrt(R * R - uu * uu);
  const bb = bumpAt(E, Math.atan2(-d, uu), wrap01(f)); // 벽의 울퉁불퉁함을 따라 걸어요
  out.pos = (out.pos || V3()).copy(F.P).addScaledVector(F.N, uu * bb).addScaledVector(F.B, -d * bb);
  out.n = (out.n || V3()).copy(F.P).sub(out.pos).normalize();
  out.lat = (out.lat || V3()).copy(F.N).addScaledVector(F.B, uu / d).normalize();
  out.T = (out.T || V3()).copy(F.T); out.R = R; out.u = uu; out.P = F.P; out.N = F.N; out.B = F.B;
  return out;
}
// 월드 좌표 → 가장 가까운 고리 위치 f (근처만 탐색)
function nearestF(p, guess) { let best = guess, bd = 1e9; for (let k = -40; k <= 40; k++) { const f = wrap01(guess + k / NS * 2), i = Math.floor(f * NS) % NS, d = FP[i].distanceToSquared(p); if (d < bd) { bd = d; best = f; } } return best; }

/* ---------------- 벽 텍스처 ---------------- */
function wallTex(kind) {
  const c = document.createElement('canvas'); c.width = c.height = 512; const g = c.getContext('2d'); g.lineCap = 'round';
  const blobs = (n, a, b) => { for (let i = 0; i < n; i++) { const x = Math.random() * 512, y = Math.random() * 512, r = Math.random() * 26 + 6, gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, Math.random() < 0.5 ? a : b); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); } };
  const worm = (n, col, w0, w1, step, turn, len) => { for (let i = 0; i < n; i++) { let x = Math.random() * 512, y = Math.random() * 512, a = Math.random() * TAU; g.strokeStyle = typeof col === 'function' ? col() : col; g.lineWidth = rand(w0, w1); g.beginPath(); g.moveTo(x, y); for (let k = 0; k < len; k++) { a += (Math.random() - 0.5) * turn; x += Math.cos(a) * step; y += Math.sin(a) * step; g.lineTo(x, y); } g.stroke(); } };
  if (kind === 'vessel') {
    g.fillStyle = '#b8323c'; g.fillRect(0, 0, 512, 512); blobs(900, 'rgba(255,150,150,0.18)', 'rgba(90,10,20,0.2)');
    worm(40, () => `rgba(${90 + Math.random() * 60},10,30,0.55)`, 1, 4, 9, 0.7, 30);
  } else if (kind === 'heart') {
    g.fillStyle = '#9a2a2c'; g.fillRect(0, 0, 512, 512); blobs(500, 'rgba(255,170,150,0.14)', 'rgba(60,4,10,0.22)');
    for (let i = 0; i < 280; i++) { const y = Math.random() * 512, ph = Math.random() * 6; g.strokeStyle = Math.random() < 0.5 ? 'rgba(255,175,160,0.16)' : 'rgba(70,5,10,0.32)'; g.lineWidth = rand(0.8, 3); g.beginPath(); for (let x = -10; x <= 522; x += 16) { const yy = y + Math.sin(x * 0.02 + ph) * 5; x < 0 ? g.moveTo(x, yy) : g.lineTo(x, yy); } g.stroke(); }
    worm(16, 'rgba(60,0,8,0.45)', 10, 22, 14, 0.5, 14); worm(16, 'rgba(255,140,130,0.16)', 3, 6, 14, 0.5, 14); // 근육 기둥(육주)
    blobs(30, 'rgba(255,220,140,0.25)', 'rgba(255,220,140,0.18)');
  } else {
    g.fillStyle = '#c79aa3'; g.fillRect(0, 0, 512, 512); blobs(500, 'rgba(255,230,235,0.18)', 'rgba(110,60,90,0.2)');
    worm(70, 'rgba(110,50,72,0.55)', 5, 9, 8, 0.9, 40); worm(60, 'rgba(255,228,235,0.28)', 1.5, 3, 8, 0.9, 40); // 주름(이랑·고랑)
    worm(30, 'rgba(150,30,70,0.5)', 0.8, 1.8, 6, 0.8, 30); // 모세혈관
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
const TEX = {};

/* ---------------- 공용 메시 ---------------- */
const blobGeo = (r, seg, amp) => { const g = new THREE.SphereGeometry(r, seg, Math.round(seg * 0.66)), p = g.attributes.position; for (let i = 0; i < p.count; i++) { const v = V3().fromBufferAttribute(p, i), k = 1 + amp * Math.sin(v.x * 3 / r) * Math.sin(v.y * 4 / r + 1) * Math.sin(v.z * 3.5 / r); p.setXYZ(i, v.x * k, v.y * k * 0.78, v.z * k); } g.computeVertexNormals(); return g; };
let CELL_GEO, CARRIER_GEO, SPIKE_GEO, AB_GEO, NEURON_GEO;
function infectedMat(c = 0x9a46e0, e = 0x6a18c0) { return new THREE.MeshPhysicalMaterial({ color: c, emissive: e, emissiveIntensity: 0.8, roughness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.25, sheen: 1, sheenColor: 0xffb0ff, bumpMap: TEX.vessel, bumpScale: 1.5 }); }
function healthyMat(env) { const c = env === 'brain' || env === 'cure' ? 0xe8c8a0 : env === 'heart' ? 0xd06a6a : 0xf0a0a8; return new THREE.MeshPhysicalMaterial({ color: c, emissive: c, emissiveIntensity: 0.12, roughness: 0.4, clearcoat: 0.6, sheen: 1, sheenColor: 0xffffff, transparent: true, opacity: 0.92 }); }
function buildShared() {
  TEX.vessel = wallTex('vessel'); TEX.heart = wallTex('heart'); TEX.brain = wallTex('brain');
  CELL_GEO = blobGeo(2.3, 72, 0.12); CARRIER_GEO = blobGeo(1.05, 48, 0.16); NEURON_GEO = blobGeo(1.1, 40, 0.08);
  SPIKE_GEO = new THREE.ConeGeometry(0.12, 0.55, 8); SPIKE_GEO.translate(0, 0.27, 0);
  const stem = new THREE.CylinderGeometry(0.05, 0.05, 0.5, 6), a1 = new THREE.CylinderGeometry(0.045, 0.045, 0.4, 6), a2 = a1.clone();
  a1.rotateZ(0.6); a1.translate(-0.13, 0.4, 0); a2.rotateZ(-0.6); a2.translate(0.13, 0.4, 0);
  AB_GEO = mergeGeometries([stem, a1, a2]); AB_GEO.rotateX(Math.PI / 2);
}
const SPORE_MAT = () => new THREE.SpriteMaterial({ map: radialTex('rgba(210,120,255,1)', 'rgba(150,40,255,0)'), blending: THREE.AdditiveBlending, depthWrite: false });

/* ---------------- 장소 만들기 ---------------- */
let stageGrp = null;
function disposeGroup(g) { g.traverse(o => { if (o.geometry && ![CELL_GEO, CARRIER_GEO, SPIKE_GEO, AB_GEO, NEURON_GEO].includes(o.geometry)) o.geometry.dispose(); }); bs.remove(g); }
function buildWall(env, grp) {
  const RS = 640, AS = 48, N = (RS + 1) * AS, pos = new Float32Array(N * 3), uv = new Float32Array(N * 2), col = new Float32Array(N * 3), cen = new Float32Array(N * 3), idx = [], F = {};
  const saveSQ = SQ; SQ = 0;
  for (let i = 0; i <= RS; i++) {
    const f = i / RS; frame(f, F);
    for (let a = 0; a < AS; a++) {
      const th = a / AS * TAU, k = (i * AS + a) * 3;
      const bump = bumpAt(env, th, f);
      const r = F.R * bump, dir = V3().copy(F.N).multiplyScalar(Math.cos(th)).addScaledVector(F.B, Math.sin(th));
      pos[k] = F.P.x + dir.x * r; pos[k + 1] = F.P.y + dir.y * r; pos[k + 2] = F.P.z + dir.z * r; cen[k] = F.P.x; cen[k + 1] = F.P.y; cen[k + 2] = F.P.z;
      uv[(i * AS + a) * 2] = a / AS * 6; uv[(i * AS + a) * 2 + 1] = f * LEN / 14;
      const dk = 0.75 + 0.25 * Math.sin(th * 3 + f * 40); col[k] = env.tint[0] * dk; col[k + 1] = env.tint[1] * dk; col[k + 2] = env.tint[2] * dk;
    }
  }
  SQ = saveSQ;
  for (let i = 0; i < RS; i++) for (let a = 0; a < AS; a++) { const a2 = (a + 1) % AS, p0 = i * AS + a, p1 = i * AS + a2, p2 = (i + 1) * AS + a, p3 = (i + 1) * AS + a2; idx.push(p0, p2, p1, p1, p2, p3); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.setAttribute('aCenter', new THREE.BufferAttribute(cen, 3)); geo.setIndex(idx); geo.computeVertexNormals();
  const tex = TEX[env.tex];
  const mat = new THREE.MeshStandardMaterial({ map: tex, vertexColors: true, roughness: env.tex === 'brain' ? 0.55 : 0.38, metalness: 0, side: THREE.BackSide, emissive: env.emis, emissiveIntensity: 0.6, bumpMap: tex, bumpScale: 2.5 });
  mat.onBeforeCompile = sh => { sh.uniforms.uSq = SQU; sh.vertexShader = 'attribute vec3 aCenter;\nuniform float uSq;\n' + sh.vertexShader.replace('#include <begin_vertex>', 'vec3 transformed = mix(position, aCenter, uSq);'); };
  const m = new THREE.Mesh(geo, mat); m.frustumCulled = false; grp.add(m); body.wallMat = mat;
}
function onWall(f, u, lift, obj) { const S = surface(f, u); obj.position.copy(S.pos).addScaledVector(S.n, lift); obj.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), S.n); return S; }
function buildStage(key) {
  if (stageGrp) disposeGroup(stageGrp);
  E = ENV[key]; buildPath(E); mapBounds = null; SQ = 0; SQU.value = 0;
  stageGrp = new THREE.Group(); bs.add(stageGrp);
  bs.background = new THREE.Color(E.bg); bs.fog = new THREE.FogExp2(E.fog, E.fogD);
  body.hemi.color.set(E.hemi[0]); body.hemi.groundColor.set(E.hemi[1]); body.hemi.intensity = E.hemi[2];
  buildWall(E, stageGrp);
  body.rbc.visible = E.rbc; body.plasma.material.color.set(E.plasma);
  // 판막 (심장)
  body.valves = (E.valves || []).map((f, i) => {
    const F = frame(f), g = new THREE.Group(), R = F.R;
    const flap = new THREE.ShaderMaterial({ transparent: true, side: THREE.DoubleSide, uniforms: { uOpen: { value: 1 }, uWarn: { value: 0 } },
      vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `varying vec2 vP; uniform float uOpen; uniform float uWarn; void main(){ float r = length(vP); float a = atan(vP.y, vP.x);
        float hole = uOpen * 0.92; if (r < hole) discard; float seam = smoothstep(0.03, 0.0, abs(sin(a * 1.5)) * r);
        vec3 c = mix(vec3(0.95,0.72,0.66), vec3(0.6,0.22,0.24), r) - seam * 0.3; c = mix(c, vec3(1.0,0.15,0.2), uWarn * 0.7); gl_FragColor = vec4(c, 0.93); }` });
    const disk = new THREE.Mesh(new THREE.CircleGeometry(1, 48), flap); disk.scale.setScalar(R * 1.02); g.add(disk);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(R * 1.0, 0.7, 12, 48), new THREE.MeshStandardMaterial({ color: 0xf0c0b0, roughness: 0.5, emissive: 0x300808 })); g.add(ring);
    g.position.copy(F.P); g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), F.T); stageGrp.add(g);
    return { f, g, flap, open: 1, closed: false, av: i % 2 === 0, name: ['삼첨판', '폐동맥판', '승모판', '대동맥판'][i] };
  });
  // 힘줄끈 (심장 속 하얀 줄)
  if (E.tex === 'heart') for (let i = 0; i < 16; i++) {
    const f = rand(0, 1); if (body.valves.some(v => Math.abs(df(f, v.f)) < 0.05)) continue;
    const F = frame(f), a1 = rand(0, TAU), a2 = a1 + rand(1.2, 2), p1 = V3().copy(F.P).addScaledVector(F.N, Math.cos(a1) * F.R).addScaledVector(F.B, Math.sin(a1) * F.R * 0.9 + F.R * 0.25), p2 = V3().copy(F.P).addScaledVector(F.N, Math.cos(a2) * F.R).addScaledVector(F.B, Math.abs(Math.sin(a2)) * F.R * 0.95);
    const cord = new THREE.Mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(p1, V3().lerpVectors(p1, p2, 0.5).addScaledVector(F.T, rand(-3, 3)), p2), 12, 0.16, 6), new THREE.MeshStandardMaterial({ color: 0xf2e6dc, roughness: 0.4, emissive: 0x201010 }));
    stageGrp.add(cord);
  }
  // 신경 세포 장식 + 축삭(신경 신호 길)
  body.axons = [];
  if (E.tex === 'brain') {
    for (let i = 0; i < 16; i++) { const f = i / 16 + rand(0, 0.03), u = rand(-0.7, 0.7) * E.R(f), g = makeNeuron(0xffd27a, 0xb07a20); onWall(f, u, 0.8, g); stageGrp.add(g); }
    for (let k = 0; k < (E.axons || 0); k++) {
      const base = [-0.48, 0.02, 0.5][k], ph = k * 2.1, uAt = f => (base + 0.16 * Math.sin(f * TAU * 5 + ph)) * E.R(f), pts = [], S = {};
      for (let i = 0; i < 1600; i++) { const f = i / 1600; surface(f, uAt(f), S); pts.push(V3().copy(S.pos).addScaledVector(S.n, 0.3)); }
      const mat = new THREE.MeshStandardMaterial({ color: 0x2a5aa0, emissive: 0x3a8cff, emissiveIntensity: 0.9, roughness: 0.3 });
      const mesh = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 1600, 0.32, 8, true), mat); stageGrp.add(mesh);
      body.axons.push({ uAt, mat, pulses: [], next: rand(1, 3) });
    }
  }
  // 건강한 세포 (바이러스가 닿으면 감염돼요)
  healthy.length = 0;
  for (let i = 0; i < E.healthy; i++) {
    const f = (i + rand(0.2, 0.8)) / E.healthy, u = rand(-0.6, 0.6) * E.R(f), g = E.tex === 'brain' ? makeNeuron(0xe8c8a0, 0x806040) : new THREE.Mesh(CARRIER_GEO, healthyMat(E.tex));
    if (E.tex !== 'brain') g.scale.setScalar(1.3);
    const S = onWall(f, u, 1.0, g); stageGrp.add(g); healthy.push({ f, u: S.u, g, pos: g.position, infect: 0, dead: false });
  }
  // 목표: 감염 세포 / 데이터 노드
  cells.length = 0;
  E.cells.forEach((f, i) => cells.push(makeTarget('cell', f, (i % 2 ? 1 : -1) * rand(0.3, 0.5) * E.R(f))));
  (E.nodes || []).forEach((f, i) => cells.push(makeTarget('node', f, (i % 2 ? -1 : 1) * rand(0.25, 0.45) * E.R(f))));
  // 출구 포털
  body.portal.visible = false;
}
function makeNeuron(c, e) {
  const g = new THREE.Group(), mat = new THREE.MeshPhysicalMaterial({ color: c, emissive: e, emissiveIntensity: 0.7, roughness: 0.35, clearcoat: 0.7, sheen: 1, sheenColor: 0xffffff });
  g.add(new THREE.Mesh(NEURON_GEO, mat));
  for (let k = 0; k < 5; k++) { const a = k / 5 * TAU + rand(-0.3, 0.3), d = rand(2.5, 4.5), p1 = new THREE.Vector3(Math.cos(a) * 0.9, -0.2, Math.sin(a) * 0.9), p2 = new THREE.Vector3(Math.cos(a) * d * 0.5, rand(-0.5, 0.3), Math.sin(a) * d * 0.5).add(new THREE.Vector3(rand(-0.6, 0.6), 0, rand(-0.6, 0.6))), p3 = new THREE.Vector3(Math.cos(a + rand(-0.4, 0.4)) * d, -0.7, Math.sin(a + rand(-0.4, 0.4)) * d);
    g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([p1, p2, p3]), 12, 0.13, 6), mat)); }
  g.userData.mat = mat; return g;
}
function makeTarget(kind, f, u) {
  const g = new THREE.Group(); let mat, lift = 1.3;
  if (kind === 'node') {
    mat = new THREE.MeshStandardMaterial({ color: 0x2a4a5a, emissive: 0x5ff2ff, emissiveIntensity: 0.6, metalness: 0.8, roughness: 0.3 });
    const hex = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.7, 1.2, 6), mat); g.add(hex);
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.6), new THREE.MeshBasicMaterial({ color: 0xff5050 })); core.position.y = 1.2; g.add(core); g.userData.core = core; lift = 0.5;
  } else if (E.tex === 'brain') { const n = makeNeuron(0xb070ff, 0x7a20d0); mat = n.userData.mat; n.scale.setScalar(1.6); g.add(n); lift = 1.2; }
  else { mat = infectedMat(); const blob = new THREE.Mesh(CELL_GEO, mat); if (E.tex === 'heart') blob.scale.set(1.6, 0.75, 0.9); g.add(blob); addSpikes(g, 2.1, 14); }
  const ring = new THREE.Mesh(new THREE.TorusGeometry(4.2, 0.08, 8, 64), new THREE.MeshBasicMaterial({ color: kind === 'node' ? 0x5ff2ff : 0xc58bff, transparent: true, opacity: 0.6 })); ring.rotation.x = Math.PI / 2; ring.position.y = -lift + 0.15; g.add(ring);
  const light = new THREE.PointLight(kind === 'node' ? 0x5ff2ff : 0xb070ff, 18, 16); light.position.y = 2; g.add(light);
  const S = onWall(f, u, lift, g); stageGrp.add(g);
  return { kind, f, u: S.u, g, mat, ring, light, pos: g.position, n: S.n.clone(), done: false, prog: 0, spawnT: rand(3, 6) };
}
function addSpikes(g, r, n) { const m = new THREE.MeshStandardMaterial({ color: 0xffa040, emissive: 0xff6010, emissiveIntensity: 0.6 }); for (let i = 0; i < n; i++) { const s = new THREE.Mesh(SPIKE_GEO, m), d = V3().randomDirection(); if (d.y < -0.3) d.y = -d.y; s.position.copy(d).multiplyScalar(r * 0.92); s.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d); g.add(s); } }

/* ---------------- 공통 오브젝트 (한 번만 만들기) ---------------- */
const pl = { f: 0.02, u: 0, hd: 0, hp: 100, hpMax: 100, st: 100, xp: 0, level: 1, shield: false, inv: 0, slow: 0, stun: 0, shake: 0, boosting: false, pos: V3(), n: V3(), fwd: V3(0, 0, 1), zapT: 0, walk: 0, gait: 0 };
let stageKey = 'vessel', stageT = 0, vital = 62, immune = false;
const viruses = [], immuneCells = [], carriers = [], cells = [], healthy = [], rbcs = [], pickups = [], projs = [];
const stats = { zapped: 0, killed: 0, cellsDone: 0, nodesDone: 0, infected: 0, deaths: 0, start: 0, samples: 0, scans: 0 };
const data = { reads: 0, records: 0, structs: 0, rows: 0 };
let voteChoice = 0;

function buildBody() {
  buildShared();
  bs.environment = envTex; bs.environmentIntensity = 0.25;
  body.hemi = new THREE.HemisphereLight(0xff9a9a, 0x400810, 1.4); bs.add(body.hemi);
  // 적혈구 (오목한 원반) · 떠다니는 입자
  const prof = []; for (let k = 0; k <= 16; k++) { const r = k / 16, h = 0.22 * Math.sqrt(1 - r * r) * (0.35 + 1.1 * r * r); prof.push(new THREE.Vector2(r * 0.9 + 0.001, h)); }
  for (let k = 16; k >= 0; k--) { const p = prof[k]; prof.push(new THREE.Vector2(p.x, -p.y)); }
  body.rbc = new THREE.InstancedMesh(new THREE.LatheGeometry(prof, 24), new THREE.MeshStandardMaterial({ color: 0xd8202c, roughness: 0.35, emissive: 0x400005 }), 240); body.rbc.frustumCulled = false;
  for (let i = 0; i < 240; i++) rbcs.push({ f: Math.random(), a: rand(0, TAU), r: Math.sqrt(Math.random()) * 0.82, spd: rand(0.8, 1.2), q: new THREE.Quaternion().random(), w: new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize(), s: rand(1.2, 1.8) });
  bs.add(body.rbc);
  const PN = 1400, pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(PN * 3), 3));
  body.plasma = new THREE.Points(pg, new THREE.PointsMaterial({ size: 0.14, map: radialTex(), transparent: true, depthWrite: false, opacity: 0.6, blending: THREE.AdditiveBlending })); body.plasma.frustumCulled = false;
  body.plasmaS = Array.from({ length: PN }, () => ({ f: Math.random(), a: rand(0, TAU), r: Math.sqrt(Math.random()) * 0.9 })); bs.add(body.plasma);
  body.virParts = bakeParts('virus', 1.0).map(p => { const m = new THREE.InstancedMesh(p.geo, p.mat, 220); m.count = 0; m.frustumCulled = false; bs.add(m); return m; });
  // 출구 포털
  body.portal = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(3, 0.2, 12, 64), new THREE.MeshBasicMaterial({ color: 0x5dff8a })); ring.rotation.x = Math.PI / 2; body.portal.add(ring);
  body.portalBeam = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.8, 16, 24, 1, true), new THREE.MeshBasicMaterial({ color: 0x5dff8a, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  body.portalBeam.position.y = 8; body.portal.add(body.portalBeam); const pl2 = new THREE.PointLight(0x5dff8a, 30, 24); pl2.position.y = 3; body.portal.add(pl2); body.portal.visible = false; bs.add(body.portal);
  // 나노 로봇 (다리 4개가 따로 움직여요)
  body.robot = makeModel('robot', 1.4); bs.add(body.robot);
  body.legs = ['leg_FL', 'leg_BR', 'leg_FR', 'leg_BL'].map((n, i) => { const o = body.robot.getObjectByName(n); return o && { o, ph: i < 2 ? 0 : Math.PI, rz: o.rotation.z, rx: o.rotation.x, side: n.endsWith('L') ? 1 : -1 }; }).filter(Boolean);
  const head = new THREE.SpotLight(0xe8fbff, 60, 45, 0.55, 0.5, 1.4); head.position.set(0, 0.5, 0.3); const tgt = new THREE.Object3D(); tgt.position.set(0, -0.3, 8); body.robot.add(head, tgt); head.target = tgt;
  const glow = new THREE.PointLight(0x9ff6ff, 8, 7); glow.position.set(0, 1.2, 0); body.robot.add(glow);
  body.shieldMesh = new THREE.Mesh(new THREE.SphereGeometry(1.25, 24, 16), new THREE.MeshBasicMaterial({ color: 0x5ff2ff, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false }));
  body.shieldMesh.position.y = 0.6; body.shieldMesh.visible = false; body.robot.add(body.shieldMesh);
  // 채취 팔 (등에서 뻗어 나와요)
  body.arm = { k: 0, target: null, mesh: new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({ color: 0xcfd8de, metalness: 0.85, roughness: 0.25, emissive: 0x0a2a30 })), tip: new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.6, 10), new THREE.MeshBasicMaterial({ color: 0x9ff6ff })), col: 0x9ff6ff, rev: false };
  body.arm.mesh.frustumCulled = false; body.arm.tip.geometry.rotateX(Math.PI / 2); bs.add(body.arm.mesh, body.arm.tip); body.arm.mesh.visible = body.arm.tip.visible = false;
  // 레이저 · 조각 · 거품
  body.beam = new THREE.Line(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3)), new THREE.LineBasicMaterial({ color: 0x9ff6ff, transparent: true, blending: THREE.AdditiveBlending }));
  body.beam.frustumCulled = false; body.beam.visible = false; bs.add(body.beam);
  body.beamGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTex('rgba(200,250,255,1)', 'rgba(95,242,255,0)'), blending: THREE.AdditiveBlending, depthWrite: false })); body.beamGlow.scale.setScalar(1.6); body.beamGlow.visible = false; bs.add(body.beamGlow);
  body.pickMat = new THREE.SpriteMaterial({ map: radialTex('rgba(120,255,170,1)', 'rgba(120,255,170,0)'), blending: THREE.AdditiveBlending, depthWrite: false });
  body.sporeMat = SPORE_MAT(); body.pulseMat = new THREE.SpriteMaterial({ map: radialTex('rgba(255,255,255,1)', 'rgba(120,200,255,0)'), blending: THREE.AdditiveBlending, depthWrite: false });
  body.abMat = new THREE.MeshStandardMaterial({ color: 0xbfe0ff, emissive: 0x4a8cff, emissiveIntensity: 0.9 });
  const BN = 500, bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(BN * 3), 3));
  body.bub = { pts: new THREE.Points(bg, new THREE.PointsMaterial({ size: 0.3, map: radialTex(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffd8d8 })), v: Array.from({ length: BN }, () => V3()), life: new Float32Array(BN), next: 0 };
  body.bub.pts.frustumCulled = false; bs.add(body.bub.pts);
  body.tintMats = {};
}
function burst(p, n, speed = 4) { const b = body.bub, pos = b.pts.geometry.attributes.position; for (let k = 0; k < n; k++) { const i = b.next = (b.next + 1) % b.life.length; pos.setXYZ(i, p.x, p.y, p.z); b.v[i].set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(speed); b.life[i] = rand(0.5, 1.1); } }

/* ---------------- 바이러스: 스스로 움직이지 못하고 흐름에 실려 다녀요 ---------------- */
function spawnVirus(f, u, h) {
  if (viruses.length >= 220) return;
  const v = { f: wrap01(f), u: u ?? rand(-0.6, 0.6) * E.R(f), h: h ?? rand(0.8, 4.5), ph: rand(0, TAU), pos: V3(), q: new THREE.Quaternion().random(), spin: rand(0.3, 1), free: null };
  viruses.push(v); return v;
}
// 감염 세포가 바이러스를 내보내요 (세포 안에서 복제된 바이러스가 터져 나옴)
function releaseViruses(p, n, speed = 4, fg = pl.f) { for (let k = 0; k < n; k++) { const v = spawnVirus(nearestF(p, fg), 0, 1); if (!v) return; v.free = { p: p.clone(), v: V3().randomDirection().multiplyScalar(speed), t: 1.2 }; } }
const _vs = {}, _M = new THREE.Matrix4(), _S = new THREE.Vector3(1, 1, 1), _Q = new THREE.Quaternion(), _ax = new THREE.Vector3(0.3, 1, 0.2).normalize();
function updateViruses(dt) {
  const flow = E.flow * (stageKey === 'heart' ? 0.6 + body.surge * 2 : 1);
  for (let i = viruses.length - 1; i >= 0; i--) {
    const v = viruses[i]; v.ph += dt;
    if (v.free) { // 막 터져 나온 바이러스: 잠깐 날아가다가 흐름에 실려요
      v.free.t -= dt; v.free.v.multiplyScalar(1 - dt * 2); v.free.p.addScaledVector(v.free.v, dt); v.pos.copy(v.free.p);
      if (v.free.t <= 0) { v.f = nearestF(v.pos, v.f); const F = frame(v.f), rel = V3().subVectors(v.pos, F.P); v.u = rel.dot(F.N); v.h = 1.2; v.free = null; }
    } else {
      v.f = wrap01(v.f + dt * flow * 0.12 / LEN); v.u += Math.sin(v.ph * 0.7) * dt * 0.4; // 브라운 운동처럼 살짝 흔들려요
      surface(v.f, v.u, _vs); v.u = _vs.u; v.pos.copy(_vs.pos).addScaledVector(_vs.n, v.h + Math.sin(v.ph * 1.8) * 0.35);
    }
    v.q.multiply(_Q.setFromAxisAngle(_ax, v.spin * dt));
    _M.compose(v.pos, v.q, _S); body.virParts.forEach(m => m.setMatrixAt(i, _M));
  }
  body.virParts.forEach(m => { m.count = viruses.length; m.instanceMatrix.needsUpdate = true; });
  // 바이러스가 건강한 세포에 닿으면 세포 안으로 들어가 감염시켜요
  for (const h of healthy) {
    if (h.dead || h.pos.distanceToSquared(pl.pos) > 3600 || carriers.length >= E.carriers + 3) continue; let touching = false;
    for (let i = viruses.length - 1; i >= 0; i--) if (viruses[i].pos.distanceToSquared(h.pos) < 5) { touching = true; if (Math.random() < dt * 0.35) { viruses.splice(i, 1); h.infect += 0.34; } break; }
    const mat = h.g.userData.mat || h.g.material; mat.emissive.setHex(0x8a2ae0).multiplyScalar(h.infect * 0.8);
    if (h.infect >= 1) infectCell(h);
    else if (touching && !h.warned && h.pos.distanceTo(pl.pos) < 40) { h.warned = true; toast('바이러스가 건강한 세포에 붙었어요! 레이저로 없애요', 'gold'); }
  }
}
function infectCell(h) {
  h.dead = true; h.g.visible = false; stats.infected++; vital = Math.max(10, vital - 2); burst(h.pos, 20, 3); sfx('sting', 0.6);
  if (h.pos.distanceTo(pl.pos) < 45) { floatText('세포 감염!', h.pos, '#c58bff', true); if (stats.infected === 1) radio('세포가 바이러스에 감염됐어요! 바이러스는 세포 안에서만 복제될 수 있어요. 감염된 세포는 바이러스 공장이 되어 움직이며 박사님을 공격해요.', 7000); }
  carriers.push(new Carrier(h.f, h.u));
  setTimeout(() => { if (!stageGrp || !healthy.includes(h)) return; h.dead = false; h.infect = 0; h.warned = false; h.g.visible = true; }, 40000); // 몸이 새 세포를 만들어요
}

/* ---------------- 감염체: 바이러스에 점령되어 움직이는 세포 ---------------- */
class Carrier {
  constructor(f, u) {
    this.obj = new THREE.Group(); this.mat = infectedMat(0x8a3ad0, 0x5a10b0); this.mesh = new THREE.Mesh(CARRIER_GEO, this.mat); this.obj.add(this.mesh); addSpikes(this.obj, 1.0, 9); bs.add(this.obj);
    this.f = f ?? wrap01(pl.f + rand(0.15, 0.85)); this.u = u ?? rand(-0.5, 0.5) * E.R(this.f); this.state = 'wander'; this.t = 0; this.spitCD = rand(2, 5); this.ramCD = 0; this.ph = rand(0, TAU); this.pos = V3(); this.S = {};
    this.hp = stageKey === 'brain' ? 4 : 3; this.hit = 0; this.dir = Math.random() < 0.5 ? 1 : -1;
  }
  update(dt) {
    this.t -= dt; this.spitCD -= dt; this.ramCD -= dt; this.ph += dt; this.hit -= dt;
    const d = this.pos.distanceTo(pl.pos), sees = G.playing && d < (pl.shield ? 9 : 26), dF = df(pl.f, this.f);
    let sp = 1.2, tf = this.dir, tu = null, lift = 1.2;
    switch (this.state) {
      case 'wander': if (sees) this.state = 'chase'; break;
      case 'chase': sp = d < 2.4 ? 0 : stageKey === 'brain' ? 4.2 : 3.6; tf = Math.sign(dF); tu = pl.u;
        if (!sees) this.state = 'wander';
        else if (d < 3.6 && this.ramCD <= 0) { this.state = 'windR'; this.t = 0.55; sfx('roar', 0.45, 1.6); }
        else if (d > 7 && d < 20 && this.spitCD <= 0) { this.state = 'windS'; this.t = 0.85; sfx('sting', 0.5, 0.7); }
        break;
      case 'windR': sp = 0.3; tf = Math.sign(dF); tu = pl.u; if (this.t <= 0) { this.state = 'ram'; this.t = 0.35; this.done = false; } break;
      case 'ram': sp = 13; tf = Math.sign(dF); tu = pl.u; if (!this.done && d < 2.1 && pl.inv <= 0) { this.done = true; hurt(pl.shield ? 4 : 12); pl.slow = 0.5; burst(pl.pos, 16, 5); toast(pl.shield ? '위장막이 충격을 막았어요' : '감염체에게 부딪혔어요!', pl.shield ? 'gold' : 'red'); } if (this.t <= 0) { this.state = 'chase'; this.ramCD = 2.6; } break;
      case 'windS': sp = 0; if (this.t <= 0) { this.spit(); this.state = 'chase'; this.spitCD = rand(4, 6); } break;
    }
    this.f = wrap01(this.f + tf * sp * dt / LEN);
    if (tu !== null) this.u = lerp(this.u, tu, 1 - Math.exp(-dt * 1.6)); else this.u += Math.sin(this.ph * 0.4) * dt;
    surface(this.f, this.u, this.S); this.u = this.S.u;
    const wob = this.state === 'windR' || this.state === 'windS' ? 0.12 * Math.sin(G.t * 40) : 0;
    this.pos.copy(this.S.pos).addScaledVector(this.S.n, lift + Math.abs(Math.sin(this.ph * 3)) * 0.15);
    this.obj.position.copy(this.pos); this.obj.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), this.S.n); this.obj.rotateY(this.ph * 0.5);
    const sw = (this.state === 'windS' ? 1.25 : 1) + wob; this.obj.scale.set(sw, 1 / Math.sqrt(sw), sw);
    this.mat.emissiveIntensity = this.hit > 0 ? 3 : this.state.startsWith('wind') ? 1.6 + Math.sin(G.t * 30) : 0.8;
    this.mat.emissive.setHex(this.state.startsWith('wind') ? 0xff2050 : 0x5a10b0);
  }
  spit() { // 세포 안에서 복제된 바이러스 덩어리를 내뿜어요 → 로봇 센서를 막아요
    for (let k = -1; k <= 1; k++) {
      const dir = V3().subVectors(V3().copy(pl.pos).addScaledVector(pl.n, 0.6), this.pos).normalize(), side = V3().crossVectors(dir, this.S.n).normalize();
      dir.addScaledVector(side, k * 0.16).normalize(); addProj('spore', V3().copy(this.pos).addScaledVector(this.S.n, 0.6), dir.multiplyScalar(10));
    }
  }
  damage() { this.hp--; this.hit = 0.12; sfx('bite', 0.4, 1.8); burst(this.pos, 8, 3); if (this.hp <= 0) this.die(); }
  die() {
    stats.killed++; bs.remove(this.obj); carriers.splice(carriers.indexOf(this), 1); sfx('eat', 0.9, 0.7); burst(this.pos, 26, 5); gainXP(6);
    floatText('감염체 제거 · 바이러스 방출!', this.pos, '#c58bff'); releaseViruses(this.pos, 3, 5, this.f); // 세포가 터지면 안에 있던 바이러스가 나와요
  }
}

/* ---------------- 투사체: 바이러스 덩어리 · 항체 ---------------- */
function addProj(kind, p, v) {
  const o = kind === 'spore' ? new THREE.Sprite(body.sporeMat) : new THREE.Mesh(AB_GEO, body.abMat);
  if (kind === 'spore') o.scale.setScalar(1.1); else o.scale.setScalar(1.6);
  o.position.copy(p); bs.add(o); projs.push({ kind, o, v, life: kind === 'spore' ? 2.4 : 2.8, pos: o.position });
}
function updateProjs(dt) {
  for (let i = projs.length - 1; i >= 0; i--) {
    const p = projs[i]; p.life -= dt; p.pos.addScaledVector(p.v, dt); if (p.kind === 'ab') { p.o.lookAt(V3().copy(p.pos).add(p.v)); }
    const d = p.pos.distanceTo(V3().copy(pl.pos).addScaledVector(pl.n, 0.6));
    if (d < 1.1 && G.playing && pl.inv <= 0) {
      if (p.kind === 'spore') { hurt(pl.shield ? 2 : 6); pl.slow = 0.6; toast('바이러스 덩어리가 센서를 막았어요!', 'red'); }
      else if (pl.shield) { toast('위장막이 항체를 막았어요!', 'gold'); sfx('shield'); }
      else { hurt(5); pl.slow = 1.0; toast('항체가 붙었어요! 느려져요', 'red'); }
      p.life = 0;
    }
    if (p.life <= 0) { bs.remove(p.o); projs.splice(i, 1); }
  }
}

/* ---------------- 면역 세포 3종 ---------------- */
const IMMUNE = {
  neutro: { name: '호중구 (백혈구)', size: 2.6, tint: null, tip: '빠르게 덮쳐요' },
  macro: { name: '대식세포 (백혈구)', size: 5.2, tint: 0xffc890, tip: '빨간 원 밖으로 피하세요' },
  bcell: { name: 'B세포 (백혈구)', size: 2.3, tint: 0x9cc4ff, tip: '멀리서 항체를 쏴요 · 위장막으로 막기' },
};
function tintedWBC(type, size) {
  const m = makeModel('wbc', size), t = IMMUNE[type].tint; if (!t) return m;
  if (!body.tintMats[type]) body.tintMats[type] = new Map();
  m.traverse(o => { if (!o.isMesh) return; const cache = body.tintMats[type]; if (!cache.has(o.material)) { const c = o.material.clone(); c.color.multiply(new THREE.Color(t)); if (c.emissive) c.emissive.multiply(new THREE.Color(t)); cache.set(o.material, c); } o.material = cache.get(o.material); });
  return m;
}
class Immune {
  constructor(type, k, n) {
    this.type = type; this.cfg = IMMUNE[type]; this.obj = tintedWBC(type, this.cfg.size); bs.add(this.obj);
    this.f = wrap01(pl.f + 0.12 + k / n * 0.8 + rand(-0.03, 0.03)); this.u = rand(-0.4, 0.4) * E.R(this.f); this.dir = Math.random() < 0.5 ? 1 : -1;
    this.state = 'patrol'; this.t = 0; this.cool = rand(1, 3); this.eatT = 0; this.ph = rand(0, 6); this.pos = V3(); this.S = {};
    this.bang = new THREE.Sprite(new THREE.SpriteMaterial({ map: BANG_TEX, depthTest: false, transparent: true })); this.bang.scale.setScalar(1.6); this.bang.visible = false; this.bang.renderOrder = 10; bs.add(this.bang);
    if (type === 'macro') { this.zone = new THREE.Group(); this.zone.add(new THREE.Mesh(new THREE.RingGeometry(3.6, 4.2, 48), new THREE.MeshBasicMaterial({ color: 0xff2040, transparent: true, opacity: 0.85, depthWrite: false }))); this.zoneFill = new THREE.Mesh(new THREE.CircleGeometry(1, 48), new THREE.MeshBasicMaterial({ color: 0xff2040, transparent: true, opacity: 0.25, depthWrite: false })); this.zone.add(this.zoneFill); this.zone.visible = false; bs.add(this.zone); this.zf = 0; this.zu = 0; }
  }
  get threat() { return ['notice', 'chase', 'windup', 'lunge', 'aim', 'slam'].includes(this.state); }
  update(dt) {
    this.ph += dt; this.t -= dt; this.cool -= dt; this.eatT -= dt;
    const d = this.pos.distanceTo(pl.pos), dF = df(pl.f, this.f), friendly = immune, sees = !friendly && G.playing && this.cool <= 0 && d < (pl.shield ? 0.35 : 1) * (this.type === 'bcell' ? 26 : 16);
    let sp = this.type === 'macro' ? 1.6 : 2.6, tf = this.dir, tu = null, lift = this.cfg.size * 0.45;
    if (friendly && this.state !== 'patrol') { this.state = 'patrol'; if (this.zone) this.zone.visible = false; }
    if (this.type === 'neutro') switch (this.state) {
      case 'patrol': if (sees) { this.state = 'notice'; this.t = 0.6; sfx('alert', 0.7); } break;
      case 'notice': sp = 0.5; tf = Math.sign(dF); if (this.t <= 0) { this.state = 'chase'; this.t = 8; } break;
      case 'chase': sp = 6.6; tf = Math.sign(dF); tu = pl.u; if (d < 3.4) { this.state = 'windup'; this.t = 0.45; sfx('roar', 0.5, 1.4); } if (d > 30 || this.t <= 0 || pl.shield) { this.state = 'patrol'; this.cool = 4; } break;
      case 'windup': sp = 0.6; tf = Math.sign(dF); tu = pl.u; if (this.t <= 0) { this.state = 'lunge'; this.t = 0.5; this.hit = false; sfx('dash', 0.7, 0.6); } break;
      case 'lunge': sp = 15; tf = Math.sign(dF); tu = pl.u; if (!this.hit && d < 2.4 && pl.inv <= 0 && G.playing) { this.hit = true; this.catch(14, '호중구에게 붙잡혔어요!'); } if (this.t <= 0) { this.state = 'recover'; this.t = this.hit ? 2.4 : 1; } break;
      case 'recover': sp = this.hit ? 3 : 1; tf = this.hit ? -Math.sign(dF) : this.dir; if (this.t <= 0) { this.state = 'patrol'; this.cool = this.hit ? 5 : 2; } break;
    }
    else if (this.type === 'macro') switch (this.state) { // 대식세포: 바닥에 빨간 원을 표시하고 그 자리를 통째로 삼켜요
      case 'patrol': if (sees) { this.state = 'aim'; this.t = 1.8; this.zf = pl.f; this.zu = pl.u; this.zone.visible = true; sfx('alert', 0.7, 0.7); } break;
      case 'aim': { sp = 2.2; tf = Math.sign(df(this.zf, this.f)); tu = this.zu; const k = 1 - this.t / 1.8; this.zoneFill.scale.setScalar(0.3 + 3.6 * k); this.zone.children[0].material.opacity = 0.5 + 0.5 * Math.sin(G.t * 18);
        const Z = surface(this.zf, this.zu); this.zone.position.copy(Z.pos).addScaledVector(Z.n, 0.12); this.zone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), Z.n);
        if (this.t <= 0) { this.state = 'slam'; this.t = 0.3; sfx('bite', 0.9, 0.6); } break; }
      case 'slam': { const k = 1 - this.t / 0.3; this.f = lerp(this.f, this.zf, k); this.u = lerp(this.u, this.zu, k); sp = 0; tf = 0;
        if (this.t <= 0) { this.zone.visible = false; const Z = surface(this.zf, this.zu); burst(Z.pos, 30, 6); pl.shake = 0.5; if (G.playing && pl.pos.distanceTo(Z.pos) < 4.2 && pl.inv <= 0) this.catch(18, '대식세포에게 삼켜졌어요!'); else floatText('피했다!', pl.pos, '#5dff8a'); this.state = 'recover'; this.t = 2.4; } break; }
      case 'recover': sp = 0.6; if (this.t <= 0) { this.state = 'patrol'; this.cool = 3.5; } break;
    }
    else switch (this.state) { // B세포: 거리를 두고 항체를 쏴요
      case 'patrol': if (sees) this.state = 'chase'; break;
      case 'chase': tf = d < 11 ? -Math.sign(dF) : d > 18 ? Math.sign(dF) : 0; sp = 3; tu = pl.u * 0.5;
        if (!sees && d > 30) this.state = 'patrol'; else if (this.cool <= 0 && d < 26) { this.state = 'windup'; this.t = 0.7; sfx('alert', 0.5, 1.5); } break;
      case 'windup': sp = 0; if (this.t <= 0) { for (let k = -1; k <= 1; k++) { const dir = V3().subVectors(V3().copy(pl.pos).addScaledVector(pl.n, 0.6), this.pos).normalize(), side = V3().crossVectors(dir, pl.n).normalize(); dir.addScaledVector(side, k * 0.12).normalize(); addProj('ab', this.pos.clone(), dir.multiplyScalar(12)); } this.state = 'chase'; this.cool = 3.4; } break;
    }
    this.f = wrap01(this.f + tf * sp * dt / LEN);
    if (tu !== null) this.u = lerp(this.u, tu, 1 - Math.exp(-dt * 2)); else this.u += Math.sin(this.ph * 0.5) * dt;
    surface(this.f, this.u, this.S); this.u = this.S.u;
    this.pos.copy(this.S.pos).addScaledVector(this.S.n, lift + Math.sin(this.ph * 2) * 0.1);
    this.obj.position.copy(this.pos); this.obj.rotation.y += dt * 0.6; this.obj.rotation.x = Math.sin(this.ph) * 0.2;
    const sq = this.state === 'windup' || this.state === 'aim' ? 0.88 + 0.08 * Math.sin(G.t * 30) : this.state === 'lunge' || this.state === 'slam' ? 1.15 : 1; this.obj.scale.set(sq, 1 / sq, sq);
    if (this.eatT <= 0) { const k = viruses.findIndex(v => v.pos.distanceToSquared(this.pos) < this.cfg.size * this.cfg.size); if (k >= 0) { burst(viruses[k].pos, 8, 2); viruses.splice(k, 1); } this.eatT = friendly ? 0.4 : 1.4; }
    if (friendly) { const c = carriers.find(c => c.pos.distanceToSquared(this.pos) < 16); if (c && Math.random() < dt * 0.8) c.damage(); }
    const alert = ['notice', 'windup', 'lunge', 'aim'].includes(this.state);
    this.bang.visible = alert; if (alert) this.bang.position.copy(this.pos).addScaledVector(this.S.n, this.cfg.size * 0.8);
  }
  catch(dmg, msg) {
    const dd = pl.shield ? Math.round(dmg * 0.3) : dmg; hurt(dd); pl.slow = pl.shield ? 0.3 : 1.3; sfx(pl.shield ? 'shield' : 'bite'); burst(pl.pos, 24, 5);
    toast(pl.shield ? '위장막 덕분에 금방 빠져나왔어요!' : `${msg} (−${dd})`, pl.shield ? 'gold' : 'red');
  }
  remove() { bs.remove(this.obj); bs.remove(this.bang); if (this.zone) bs.remove(this.zone); }
}

/* ---------------- 입력 (1차시와 같은 조작 + 톡 쳐서 레이저) ---------------- */
const keys = {}; const ptr = { L: false, R: false };
addEventListener('keydown', e => {
  keys[e.code] = true;
  if ((e.code === 'Space' || e.code === 'Enter') && !$('dialog').classList.contains('hidden')) { e.preventDefault(); nextLine(); return; }
  if (e.code === 'KeyN' && e.ctrlKey && e.shiftKey && G.playing) teacherComplete();
  if (e.code === 'KeyF' && G.playing) shootAt(innerWidth / 2, innerHeight * 0.55, true);
  if (e.code === 'Space') e.preventDefault();
});
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('contextmenu', e => e.preventDefault());
const joy = { id: null, ox: 0, oy: 0, x: 0, y: 0, full: 0 }, JOY_R = 64, look = { id: null, x: 0, y: 0, sx: 0, sy: 0, t0: 0, moved: 0 }, cam = { yaw: 0, pitch: -0.25, last: -99 };
const JOY_HOME = () => ({ x: Math.max(110, innerWidth * 0.13), y: innerHeight - Math.max(120, innerHeight * 0.2) });
function joyShow(x, y) { const el = $('joy'); el.style.left = x + 'px'; el.style.top = y + 'px'; }
canvas.addEventListener('pointerdown', e => {
  if (!$('dialog').classList.contains('hidden')) { nextLine(); return; }
  const left = e.clientX < innerWidth * 0.45 && e.pointerType !== 'mouse';
  if (left && joy.id === null) { joy.id = e.pointerId; joy.ox = e.clientX; joy.oy = e.clientY; joy.x = joy.y = 0; joy.full = 0; joyShow(joy.ox, joy.oy); $('joy').classList.add('on'); $('joy').firstElementChild.style.transform = ''; }
  else if (look.id === null) { look.id = e.pointerId; look.x = look.sx = e.clientX; look.y = look.sy = e.clientY; look.t0 = performance.now(); look.moved = 0; }
  try { canvas.setPointerCapture(e.pointerId); } catch (_) { }
});
canvas.addEventListener('pointermove', e => {
  if (e.pointerId === joy.id) { let dx = e.clientX - joy.ox, dy = e.clientY - joy.oy; const L = Math.hypot(dx, dy); if (L > JOY_R) { dx *= JOY_R / L; dy *= JOY_R / L; } joy.x = dx / JOY_R; joy.y = dy / JOY_R; $('joy').firstElementChild.style.transform = `translate(${dx}px,${dy}px)`; }
  else if (e.pointerId === look.id) {
    look.moved = Math.max(look.moved, Math.hypot(e.clientX - look.sx, e.clientY - look.sy)); if (look.moved < 8) return; // 살짝 떨린 건 '톡'으로 봐요
    const s = e.pointerType === 'mouse' ? 0.005 : 0.0065; cam.yaw += (e.clientX - look.x) * s * LOOK_INV; cam.pitch = clamp(cam.pitch - (e.clientY - look.y) * s * 0.8, -1.0, 0.6); look.x = e.clientX; look.y = e.clientY; cam.last = G.t;
  }
});
const ptrEnd = e => {
  if (e.pointerId === joy.id) { joy.id = null; joy.x = joy.y = 0; const h = JOY_HOME(); joyShow(h.x, h.y); $('joy').classList.remove('on'); $('joy').firstElementChild.style.transform = ''; }
  if (e.pointerId === look.id) { look.id = null; if (e.type === 'pointerup' && look.moved < 14 && performance.now() - look.t0 < 400 && G.playing) shootAt(e.clientX, e.clientY); }
};
canvas.addEventListener('pointerup', ptrEnd); canvas.addEventListener('pointercancel', ptrEnd);
addEventListener('resize', () => { if (joy.id === null) { const h = JOY_HOME(); joyShow(h.x, h.y); } }); { const h = JOY_HOME(); joyShow(h.x, h.y); }
function holdButton(el, key) {
  const on = e => { e.preventDefault(); ptr[key] = true; el.classList.add('on'); try { el.setPointerCapture(e.pointerId); } catch (_) { } };
  const off = () => { ptr[key] = false; el.classList.remove('on'); };
  el.addEventListener('pointerdown', on); el.addEventListener('pointerup', off); el.addEventListener('pointercancel', off); el.addEventListener('lostpointercapture', off);
}
holdButton($('tb-dash'), 'L'); holdButton($('tb-roll'), 'R');
if (P.has('teacher')) $('tb-teacher').classList.remove('hidden');
$('tb-teacher').addEventListener('click', () => { if (G.playing) teacherComplete(); });
$('mute').addEventListener('click', () => { $('mute').textContent = sound.toggleMute() ? '소리 꺼짐' : '소리 켜짐'; });
// 시점 반전 (패드마다 기본값을 기억)
let LOOK_INV = 1; try { LOOK_INV = localStorage.getItem('lookInv') === '1' ? -1 : 1; } catch (_) { }
const invLabel = () => $('invert').textContent = LOOK_INV < 0 ? '시점 반전 켬' : '시점 반전 끔'; invLabel();
$('invert').addEventListener('click', () => { LOOK_INV *= -1; try { localStorage.setItem('lookInv', LOOK_INV < 0 ? '1' : '0'); } catch (_) { } invLabel(); });
function teacherComplete() { cells.filter(c => !c.done).forEach(c => targetDone(c)); while (stats.zapped < (need().zap || 0)) { stats.zapped++; data.reads += 1800; } }

/* ---------------- 레이저: 화면에서 톡 친 곳의 바이러스·감염체를 쏴요 ---------------- */
function project(wp) { const v = wp.clone().project(camera); return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight, behind: v.z > 1, nx: v.x, ny: v.y }; }
function shootAt(sx, sy, center) {
  if (pl.zapT > 0 || pl.stun > 0) return;
  const lv = LEVELS[pl.level - 1], from = V3().copy(body.robot.position).addScaledVector(pl.n, 0.7), R2 = lv.range * lv.range, lim = center ? 260 : IS_TOUCH ? 95 : 70;
  let best = null, bd = lim;
  const consider = (p, kind, ref) => { if (p.distanceToSquared(from) > R2) return; const s = project(p); if (s.behind) return; const d = Math.hypot(s.x - sx, s.y - sy); if (d < bd) { bd = d; best = { p, kind, ref }; } };
  viruses.forEach(v => consider(v.pos, 'virus', v)); carriers.forEach(c => consider(c.pos, 'carrier', c)); projs.forEach(p => p.kind === 'spore' && consider(p.pos, 'proj', p));
  pl.zapT = lv.cd; sfx('eat', 0.5, 2.2);
  let to;
  if (best) to = best.p.clone();
  else { const ray = new THREE.Raycaster(); ray.setFromCamera(new THREE.Vector2(sx / innerWidth * 2 - 1, -(sy / innerHeight) * 2 + 1), camera); to = ray.ray.at(lv.range * 0.8, V3()); }
  const p = body.beam.geometry.attributes.position; p.setXYZ(0, from.x, from.y, from.z); p.setXYZ(1, to.x, to.y, to.z); p.needsUpdate = true; body.beam.visible = true; body.beamT = 0.09;
  body.beamGlow.position.copy(to); body.beamGlow.visible = true;
  if (!best) return;
  if (best.kind === 'virus') {
    const i = viruses.indexOf(best.ref); if (i < 0) return; burst(best.p, 10, 3); viruses.splice(i, 1); stats.zapped++; data.reads += 1800; gainXP(1);
    const sp = new THREE.Sprite(body.pickMat); sp.scale.setScalar(0.8); sp.position.copy(best.p); bs.add(sp); pickups.push({ sp, t: 0 });
    if (stats.zapped % 5 === 1) floatText('+유전체 조각', best.p, '#7dffb0');
  } else if (best.kind === 'carrier') best.ref.damage();
  else { best.ref.life = 0; burst(best.p, 6, 2); }
}

/* ---------------- 플레이어 (나노 로봇) ---------------- */
const _ps = {};
function updatePlayer(dt) {
  let jx = 0, jy = 0;
  if (keys.KeyA || keys.ArrowLeft) jx -= 1; if (keys.KeyD || keys.ArrowRight) jx += 1; if (keys.KeyW || keys.ArrowUp) jy -= 1; if (keys.KeyS || keys.ArrowDown) jy += 1;
  if (!jx && !jy && joy.id !== null) { jx = joy.x; jy = joy.y; }
  let mag = clamp(Math.hypot(jx, jy), 0, 1); if (mag < 0.12) mag = 0;
  joy.full = mag > 0.9 && joy.id !== null ? joy.full + dt : 0;
  pl.shield = (keys.KeyE || ptr.R) && pl.st > 2;
  const boost = (keys.Space || ptr.L || keys.ShiftLeft || joy.full > 0.6) && pl.st > 1 && !pl.shield && pl.stun <= 0;
  if (boost && !pl.boosting) sfx('dash', 0.5); pl.boosting = boost;
  pl.st = clamp(pl.st + (boost ? -24 : pl.shield ? -11 : 16) * dt, 0, 100);
  surface(pl.f, pl.u, _ps);
  const fwdP = V3().copy(_ps.T).multiplyScalar(Math.cos(cam.yaw)).addScaledVector(_ps.lat, Math.sin(cam.yaw)), right = V3().crossVectors(fwdP, _ps.n).normalize();
  if (boost && mag === 0) { jy = -1; jx = 0; mag = 1; }
  if (pl.stun > 0) mag = 0;
  if (mag > 0) {
    const d = V3().addScaledVector(fwdP, -jy).addScaledVector(right, jx).normalize();
    const want = Math.atan2(d.dot(_ps.lat), d.dot(_ps.T)); let dh = want - pl.hd; dh = Math.atan2(Math.sin(dh), Math.cos(dh)); pl.hd += clamp(dh, -5 * dt, 5 * dt);
  }
  if (G.t - cam.last > 2.5 && mag > 0.2) { let dc = pl.hd - cam.yaw; dc = Math.atan2(Math.sin(dc), Math.cos(dc)); cam.yaw += dc * (1 - Math.exp(-dt * 0.9)); }
  const base = 6.5 + (pl.level - 1) * 0.4;
  const speed = mag * base * (boost ? (pl.level >= 4 ? 2.5 : 2.2) : 1) * (pl.slow > 0 ? 0.35 : 1);
  const mv = V3().copy(_ps.T).multiplyScalar(Math.cos(pl.hd)).addScaledVector(_ps.lat, Math.sin(pl.hd));
  const flow = stageKey === 'heart' ? body.surge * 9 : E.flow * 0.02 * Math.cos(pl.hd) * (speed > 0 ? 1 : 0.3); // 혈류 / 심장이 뛸 때 밀려요
  pl.f = wrap01(pl.f + (mv.dot(_ps.T) * speed + flow) * dt / LEN);
  pl.u += mv.dot(_ps.lat) * speed * dt;
  surface(pl.f, pl.u, _ps); pl.u = _ps.u;
  pl.pos.copy(_ps.pos); pl.n.copy(_ps.n); pl.fwd.copy(_ps.T).multiplyScalar(Math.cos(pl.hd)).addScaledVector(_ps.lat, Math.sin(pl.hd)).normalize();
  // 로봇 자세: 벽에 붙어 걸어요 + 다리 4개 걷기 동작 (대각선 다리끼리 같이 움직여요)
  const o = body.robot, up = V3().copy(pl.n), z = V3().copy(pl.fwd).addScaledVector(up, -pl.fwd.dot(up)).normalize(), x = V3().crossVectors(up, z);
  o.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, up, z));
  pl.walk = lerp(pl.walk, speed > 0.3 ? 1 : 0, 1 - Math.exp(-dt * 8)); pl.gait += speed * dt * 1.9;
  for (const L of body.legs) { const s = Math.sin(pl.gait + L.ph), lift = Math.max(0, Math.cos(pl.gait + L.ph)); L.o.rotation.z = L.rz + s * 0.42 * pl.walk; L.o.rotation.x = L.rx - L.side * lift * 0.3 * pl.walk; }
  const bob = Math.abs(Math.sin(pl.gait)) * 0.06 * pl.walk;
  o.position.copy(pl.pos).addScaledVector(pl.n, 0.62 + bob);
  o.userData.wrap.rotation.z = Math.sin(pl.gait) * 0.04 * pl.walk;
  body.shieldMesh.visible = pl.shield; if (pl.shield) body.shieldMesh.material.opacity = 0.18 + 0.08 * Math.sin(G.t * 10);
  if (boost && Math.random() < 0.5) burst(V3().copy(o.position).addScaledVector(pl.fwd, -0.8), 1, 1);
  pl.slow -= dt; pl.inv -= dt; pl.zapT -= dt; pl.stun -= dt;
  if (pl.level >= 5) pl.hp = Math.min(pl.hpMax, pl.hp + dt * 3); else if (pl.inv < -4) pl.hp = Math.min(pl.hpMax, pl.hp + dt);
  if (pl.hp <= 0) respawn();
}
function hurt(dmg) {
  if (dmg <= 0 || G.respawning) return; pl.hp -= dmg; pl.inv = 0.8; pl.shake = 0.5; flash('rgba(255,40,60,.35)', 400); floatText('−' + Math.round(dmg), body.robot.position, '#ff5b6b', true);
}
function gainXP(x) {
  pl.xp += x; const next = LEVELS[pl.level];
  if (next && pl.xp >= next.xp) { pl.level++; pl.hpMax = LEVELS[pl.level - 1].hp; pl.hp = pl.hpMax; sfx('molt'); burst(body.robot.position, 30, 4); banner('업그레이드!', LEVELS[pl.level - 1].name, '레이저 사거리·연사 속도 향상', 2200); }
}
async function respawn() { // 그 자리에서 재부팅 (먼 길을 다시 걷지 않아요)
  if (G.respawning) return; G.respawning = true; G.playing = false; stats.deaths++;
  flash('rgba(0,0,0,1)', 1000); await sleep(700);
  pl.hp = pl.hpMax; pl.inv = 3; pl.slow = 0; pl.stun = 0; vital = Math.max(10, vital - 4);
  immuneCells.forEach(w => { w.state = 'patrol'; w.cool = 6; if (w.zone) w.zone.visible = false; });
  carriers.forEach(c => { if (c.pos.distanceTo(pl.pos) < 12) { c.f = wrap01(c.f + 0.06 * Math.sign(df(c.f, pl.f) || 1)); c.state = 'wander'; } });
  projs.forEach(p => p.life = 0);
  radio('로봇 손상! 그 자리에서 재부팅했어요. 그동안 환자의 생명 신호가 조금 떨어졌어요.');
  G.playing = true; G.respawning = false;
}
function updateCamera(dt) {
  if (window.DBG.freeze) return;
  surface(pl.f, pl.u, _ps);
  const cf = V3().copy(_ps.T).multiplyScalar(Math.cos(cam.yaw) * Math.cos(cam.pitch)).addScaledVector(_ps.lat, Math.sin(cam.yaw) * Math.cos(cam.pitch)).addScaledVector(_ps.n, Math.sin(cam.pitch));
  const want = V3().copy(body.robot.position).addScaledVector(cf, -5.6).addScaledVector(_ps.n, 2.5);
  const F = frame(pl.f), rel = V3().subVectors(want, F.P), along = rel.dot(F.T), radial = rel.addScaledVector(F.T, -along), R = F.R * 0.74;
  if (radial.length() > R) { radial.setLength(R); want.copy(F.P).addScaledVector(F.T, along).add(radial); }
  camera.position.lerp(want, 1 - Math.exp(-dt * 7));
  if (pl.shake > 0) { pl.shake -= dt; camera.position.addScaledVector(V3().randomDirection(), pl.shake * 0.4); }
  camera.up.copy(_ps.n).lerp(F.B, 0.5).normalize();
  camera.lookAt(V3().copy(body.robot.position).addScaledVector(cf, 3).addScaledVector(_ps.n, 0.8));
}

/* ---------------- 채취 팔 ---------------- */
function updateArm(dt) {
  const A = body.arm; A.k = clamp(A.k + (A.target ? dt * 2.5 : -dt * 3), 0, 1);
  const show = A.k > 0.02; A.mesh.visible = A.tip.visible = show; if (!show) return;
  const r = body.robot, back = V3().copy(r.position).addScaledVector(pl.n, 1.15).addScaledVector(pl.fwd, -0.35);
  if (A.target) A.last = A.target.clone(); const tgt = V3().lerpVectors(back, A.last || back, A.k);
  const mid = V3().lerpVectors(back, tgt, 0.45).addScaledVector(pl.n, 1.6 * A.k + 0.4), curve = new THREE.QuadraticBezierCurve3(back, mid, tgt);
  A.mesh.geometry.dispose(); A.mesh.geometry = new THREE.TubeGeometry(curve, 18, 0.09, 7);
  A.tip.position.copy(tgt); A.tip.lookAt(V3().copy(tgt).add(curve.getTangent(1))); A.tip.material.color.setHex(A.col);
  if (A.target && A.k > 0.95 && Math.random() < dt * 30) { // 샘플이 팔을 따라 빨려 들어가요 (치료제는 반대로)
    const t = Math.random(), p = curve.getPoint(A.rev ? t : 1 - t); const sp = new THREE.Sprite(A.rev ? body.pickMat : body.sporeMat); sp.scale.setScalar(0.35); sp.position.copy(p); bs.add(sp); pickups.push({ sp, t: 0.4, curve, dir: A.rev ? 1 : -1, u: A.rev ? t : 1 - t });
  }
}

/* ---------------- 장소별 위험: 심장 판막 · 뇌 신경 신호 ---------------- */
const BEAT = 1.2; let beatT = 0, beatPh = 0;
function updateHeart(dt) {
  beatPh = (beatPh + dt / BEAT) % 1;
  const sys = beatPh < 0.4; // 수축기
  SQ = 0.1 * Math.max(0, Math.sin(beatPh / 0.4 * Math.PI)) * (sys ? 1 : 0); SQU.value = SQ; body.surge = sys ? Math.sin(beatPh / 0.4 * Math.PI) : 0;
  for (const v of body.valves) {
    // 방실판막(삼첨판·승모판)은 수축기에 닫히고, 반달판막(폐동맥판·대동맥판)은 이완기에 닫혀요
    const closePh = v.av ? 0 : 0.45, rel = (beatPh - closePh + 1) % 1, closed = rel < 0.45, warn = !closed && rel > 0.78;
    v.open = lerp(v.open, closed ? 0 : 1, 1 - Math.exp(-dt * 14)); v.flap.uniforms.uOpen.value = v.open; v.flap.uniforms.uWarn.value = warn ? 0.5 + 0.5 * Math.sin(G.t * 30) : closed ? 0.3 : 0;
    const F = frame(v.f); v.g.scale.setScalar(1 - SQ); v.closed = closed;
    const dd = df(pl.f, v.f) * LEN;
    if (G.playing && v.open < 0.35 && Math.abs(dd) < 2.2 && pl.inv <= 0) { // 닫히는 판막에 부딪힘
      hurt(8); pl.f = wrap01(v.f + Math.sign(dd || 1) * 5 / LEN); pl.stun = 0.4; sfx('bite', 0.8, 0.5); toast(`${v.name}이 닫혔어요! 빨갛게 빛날 땐 기다리세요`, 'red');
    }
  }
  beatT -= dt; if (beatT <= 0) { beatT = BEAT; sfx('heartbeat', 0.6); }
}
function updateBrain(dt) {
  let spikes = 0;
  for (const ax of body.axons) {
    ax.next -= dt; ax.mat.emissiveIntensity = 0.7 + 0.2 * Math.sin(G.t * 3);
    if (ax.next <= 0) { ax.next = rand(2.2, 4.2); const dir = Math.random() < 0.5 ? 1 : -1, sp = new THREE.Sprite(body.pulseMat); sp.scale.setScalar(2.8); bs.add(sp); ax.pulses.push({ f: wrap01(pl.f - dir * rand(0.12, 0.2)), dir, sp, life: 7 }); }
    for (let i = ax.pulses.length - 1; i >= 0; i--) {
      const p = ax.pulses[i]; p.life -= dt; p.f = wrap01(p.f + p.dir * 30 * dt / LEN); spikes++;
      const S = surface(p.f, ax.uAt(p.f)); p.sp.position.copy(S.pos).addScaledVector(S.n, 0.5); p.sp.scale.setScalar(2.4 + Math.sin(G.t * 40) * 0.5);
      const ds = Math.abs(df(pl.f, p.f)) * LEN, du = Math.abs(pl.u - ax.uAt(pl.f));
      if (ds < 22 && du < 2.2 && !p.warned && G.playing) { p.warned = true; sfx('sting', 0.45, 1.3); }
      if (G.playing && ds < 1.8 && du < 1.7 && pl.inv <= 0) { hurt(10); pl.stun = 0.8; flash('rgba(120,200,255,.5)', 300); sfx('alarm', 0.6); toast('신경 신호에 감전됐어요! 파란 줄에서 비켜서세요', 'red'); }
      if (p.life <= 0) { bs.remove(p.sp); ax.pulses.splice(i, 1); }
    }
  }
  G.spikeRate = spikes * 0.4;
}

/* ---------------- 목표: 샘플 채취 · 노드 수리 · 치료제 주입 ---------------- */
const need = () => STAGES[stageKey].need;
function targetDone(c) {
  c.done = true; c.prog = 0; sfx('molt'); gainXP(10);
  if (c.kind === 'node') {
    stats.nodesDone++; data.records = Math.min(10000, data.records + 3334); c.mat.emissive.set(0x5dff8a); c.g.userData.core.material.color.set(0x5dff8a); c.ring.material.color.set(0x5dff8a); c.light.color.set(0x5dff8a);
    floatText(`데이터 노드 연결 · 환자 기록 +3,334건`, c.pos, '#5ff2ff');
    radio(`의료 데이터 노드 ${stats.nodesDone}/3 수리! ${stats.nodesDone < 3 ? '병원 데이터 센터와 연결이 조금씩 돌아오고 있어요.' : '환자 1만 명의 유전체와 진료 기록에 접속했어요!'}`, 6000);
  } else {
    stats.cellsDone++; c.mat.color.set(stageKey === 'cure' ? 0xffd8a0 : 0x6a4a8a); c.mat.emissive.set(stageKey === 'cure' ? 0x806020 : 0x201030); c.mat.emissiveIntensity = 0.4; c.light.intensity = 5; c.ring.material.color.set(0x5dff8a);
    if (stageKey === 'vessel') { stats.samples++; data.reads += 412000; floatText('바이러스 샘플 +412,000조각', c.pos, '#c58bff'); }
    if (stageKey === 'heart') { stats.samples++; floatText('심장 근육 세포 샘플 채취', c.pos, '#c58bff'); }
    if (stageKey === 'brain') { stats.scans++; data.structs += 2400000; floatText('단백질 3D 구조 +240만 원자', c.pos, '#c58bff'); }
    if (stageKey === 'cure') { vital = Math.min(100, vital + 12); floatText('치료제 주입 완료!', c.pos, '#5dff8a'); for (let i = viruses.length - 1; i >= 0; i--) if (viruses[i].pos.distanceTo(c.pos) < 20) { burst(viruses[i].pos, 6, 2); viruses.splice(i, 1); } }
    const L = {
      vessel: ['혈관 세포 샘플 1/3! 세포 안에서 바이러스가 자기 유전체를 복제하고 있어요. 바이러스는 혼자서는 복제할 수 없어서, 꼭 세포 안에 들어가야 해요.', '샘플 2/3! 바이러스 유전체는 약 30,000글자(A·T·G·C)예요. 기계로 읽으면 짧은 조각 수십만 개로 나와요.', '샘플 3/3! 이제 유전체 조각을 이어 붙여서 바이러스의 정체를 밝힐 수 있어요.'],
      heart: ['심장 근육 세포 샘플 1/3! 바이러스가 근육 세포를 망가뜨려서 박동이 불규칙해졌어요.', '샘플 2/3! 같은 바이러스인데 하나는 왜 이렇게 심하게 아플까요? 다른 환자들과 비교해 봐야 해요.', '샘플 3/3 완료!'],
      brain: ['스캔 1/3! 바이러스의 스파이크(열쇠)가 신경 세포의 수용체(자물쇠)에 꽂히는 순간이에요.', '스캔 2/3! 원자 하나하나의 위치를 기록하고 있어요. 엄청난 양의 데이터예요.', '스캔 3/3! 열쇠 끝의 3D 모양을 완성했어요. 이게 치료제 설계도가 돼요!'],
      cure: ['치료제 주입 1/3! 신경 세포가 회복되고 있어요.', '2/3! 뇌파가 강해지고 있어요!', '3/3! 하나의 뇌가 깨어나고 있어요!'],
    }[stageKey];
    radio(L[Math.min(L.length - 1, stats.cellsDone - 1)], 7000);
  }
}
function updateTargets(dt) {
  let armT = null;
  for (const c of cells) {
    const d = c.pos.distanceTo(pl.pos), pulse = 0.5 + 0.5 * Math.sin(G.t * 3 + c.f * 20);
    if (!c.done) { c.mat.emissiveIntensity = c.kind === 'node' ? (Math.random() < 0.1 ? 0.1 : 0.6) : 0.5 + 0.6 * pulse; c.ring.rotation.z += dt; if (c.kind === 'node' && Math.random() < dt * 4) burst(c.pos, 3, 4); }
    if (G.playing && !c.done && d < 6) {
      armT = c.pos; c.prog += dt / (c.kind === 'node' ? 2.2 : 2.4); if (Math.random() < dt * 6) sfx('click', 0.5);
      if (c.kind === 'node' && Math.random() < dt * 20) burst(c.pos, 2, 5);
      if (c.prog >= 1) targetDone(c);
    } else c.prog = Math.max(0, c.prog - dt * 0.5);
    // 감염된 세포 안에서 복제된 바이러스가 계속 터져 나와요
    if (c.kind === 'cell' && !(stageKey === 'cure' && c.done) && G.playing) { c.spawnT -= dt; if (c.spawnT <= 0) { c.spawnT = rand(5, 8); if (viruses.length < 100) releaseViruses(V3().copy(c.pos).addScaledVector(c.n, 2), 3, 3, c.f); } }
  }
  body.arm.target = armT; body.arm.col = stageKey === 'cure' ? 0x5dff8a : stageKey === 'heart' && armT && cells.find(c => c.pos === armT)?.kind === 'node' ? 0xffd66b : 0x9ff6ff; body.arm.rev = stageKey === 'cure';
}
const objDone = () => { const n = need(); return stats.cellsDone >= n.cells && (!n.zap || stats.zapped >= n.zap) && (!n.nodes || stats.nodesDone >= n.nodes); };

/* ---------------- 장소 시작 · 진행 ---------------- */
function setupStage(key) {
  stageKey = key; stageT = 0; immune = key === 'cure';
  if (!stageGrp || ENV[key] !== E) buildStage(key);
  viruses.length = 0; pickups.forEach(p => bs.remove(p.sp)); pickups.length = 0; projs.forEach(p => bs.remove(p.o)); projs.length = 0;
  immuneCells.forEach(w => w.remove()); immuneCells.length = 0; carriers.forEach(c => bs.remove(c.obj)); carriers.length = 0;
  cells.forEach(c => { if (key === 'cure') { c.done = false; c.prog = 0; c.mat.color.set(0xb070ff); c.mat.emissive.set(0x7a20d0); c.ring.material.color.set(0x5dff8a); c.light.color.set(0x5dff8a); c.light.intensity = 18; } });
  healthy.forEach(h => { h.dead = false; h.infect = 0; h.warned = false; h.g.visible = true; });
  Object.assign(stats, { zapped: 0, cellsDone: 0, nodesDone: 0, infected: 0 });
  pl.f = E.start; pl.u = 0; pl.hd = 0; cam.yaw = 0; cam.pitch = -0.25; pl.hp = pl.hpMax; pl.st = 100; pl.inv = 2; pl.stun = 0; pl.slow = 0;
  E.immune.forEach((t, k) => immuneCells.push(new Immune(t, k, E.immune.length)));
  for (let k = 0; k < E.carriers; k++) carriers.push(new Carrier());
  for (let k = 0; k < 50; k++) { const c = cells[k % cells.length]; spawnVirus(Math.random() < 0.5 ? c.f + rand(-0.06, 0.06) : Math.random()); }
  resetData(); radioQ.length = 0; G.missionDone = false; body.portal.visible = false; carrierT = 6;
  const S = STAGES[key]; $('m-title').textContent = S.title; $('m-sub').textContent = S.mission;
  $('l-a').textContent = S.cellName + ' ' + S.cellAct; $('o-b').classList.toggle('hidden', !S.objB); $('l-b').textContent = S.objB; $('o-home').classList.add('hidden');
  $('srows').innerHTML = S.sensors.map((s, i) => `<div class="srow" id="sr-${i}"><span class="k">${s[0]}</span><span class="v"><span id="sv-${i}">-</span><small>${s[2]}</small></span></div>`).join('');
}
let sampleT = 0, predT = 0, hudT = 0, mapT = 0, carrierT = 6;
function openPortal() { // 목표를 다 채우면 바로 앞에 출구가 열려요
  let f = wrap01(pl.f + Math.sign(Math.cos(pl.hd) || 1) * 18 / LEN);
  if (body.valves.length) for (const v of body.valves) if (Math.abs(df(f, v.f)) * LEN < 8) f = wrap01(v.f + Math.sign(df(f, v.f) || 1) * 9 / LEN);
  body.portalF = f; onWall(f, 0, 0.05, body.portal); body.portal.visible = true; body.portalPos = body.portal.position.clone();
}
function updateBody(dt) {
  if (stageKey === 'heart') updateHeart(dt); else { SQ = 0; SQU.value = 0; body.surge = 0; }
  if (E.tex === 'brain') updateBrain(dt);
  if (G.playing) {
    stageT += dt / 60; updatePlayer(dt);
    vital = clamp(vital + (stageKey === 'cure' ? 0.15 : -0.03 - carriers.length * 0.004) * dt, 10, 100);
    sampleT -= dt; predT -= dt; if (sampleT <= 0) { sampleT = 0.5; sampleRow(); } if (predT <= 0) { predT = 2; predict(); }
    carrierT -= dt; if (carrierT <= 0) { carrierT = 10; if (carriers.length < E.carriers && stageKey !== 'cure') carriers.push(new Carrier()); }
    if (objDone() && !G.missionDone) { G.missionDone = true; sfx('molt'); openPortal(); radio('목표 완료! 바로 앞에 초록 출구가 열렸어요. 들어가면 데이터를 분석해요.', 6000); $('o-home').classList.remove('hidden'); }
    if (G.missionDone && body.portalPos && pl.pos.distanceTo(body.portalPos) < 4.5) finishStage();
  }
  updateViruses(dt); updateProjs(dt);
  immuneCells.forEach(w => w.update(G.playing ? dt : dt * 0.3)); [...carriers].forEach(c => c.update(G.playing ? dt : dt * 0.3)); updateTargets(dt); updateArm(dt);
  G.chasing = immuneCells.some(w => w.threat) || carriers.some(c => c.state !== 'wander'); sound.chase(G.chasing && G.playing);
  // 적혈구 · 입자의 흐름
  const M = new THREE.Matrix4(), S = new THREE.Vector3(), F = {}, p = V3(), fl = E.flow * (stageKey === 'heart' ? 0.5 + body.surge * 3 : 1);
  if (E.rbc) { rbcs.forEach((r, i) => { r.f = wrap01(r.f + r.spd * fl * dt / LEN); frame(r.f, F); p.copy(F.P).addScaledVector(F.N, Math.cos(r.a) * r.r * F.R).addScaledVector(F.B, Math.sin(r.a) * r.r * F.R); r.q.multiply(new THREE.Quaternion().setFromAxisAngle(r.w, dt * 0.8)); M.compose(p, r.q, S.set(r.s, r.s, r.s)); body.rbc.setMatrixAt(i, M); }); body.rbc.instanceMatrix.needsUpdate = true; }
  const pp = body.plasma.geometry.attributes.position;
  body.plasmaS.forEach((q, i) => { q.f = wrap01(q.f + (fl * 1.2 + 1) * dt / LEN); frame(q.f, F); p.copy(F.P).addScaledVector(F.N, Math.cos(q.a) * q.r * F.R).addScaledVector(F.B, Math.sin(q.a) * q.r * F.R); pp.setXYZ(i, p.x, p.y, p.z); });
  pp.needsUpdate = true;
  for (let i = pickups.length - 1; i >= 0; i--) {
    const k = pickups[i];
    if (k.curve) { k.u += k.dir * dt * 1.8; if (k.u < 0 || k.u > 1) { bs.remove(k.sp); pickups.splice(i, 1); continue; } k.sp.position.copy(k.curve.getPoint(k.u)); continue; }
    k.t += dt * 2.4; k.sp.position.lerp(body.robot.position, Math.min(1, k.t)); k.sp.scale.setScalar(0.8 * (1 - k.t * 0.6)); if (k.t >= 1) { bs.remove(k.sp); pickups.splice(i, 1); }
  }
  const b = body.bub, bp = b.pts.geometry.attributes.position;
  for (let i = 0; i < b.life.length; i++) { if (b.life[i] <= 0) { bp.setY(i, -999); continue; } b.life[i] -= dt; b.v[i].multiplyScalar(1 - dt * 2.5); bp.setXYZ(i, bp.getX(i) + b.v[i].x * dt, bp.getY(i) + b.v[i].y * dt, bp.getZ(i) + b.v[i].z * dt); }
  bp.needsUpdate = true;
  if (body.beamT !== undefined) { body.beamT -= dt; if (body.beamT <= 0) { body.beam.visible = false; body.beamGlow.visible = false; } }
  if (body.portal.visible) { body.portalBeam.material.opacity = 0.22 + 0.08 * Math.sin(G.t * 4); body.portal.children[0].rotation.z += dt; }
  updateCamera(dt);
  hudT -= dt; if (hudT <= 0) { hudT = 0.1; updateHUD(); }
  mapT -= dt; if (mapT <= 0) { mapT = 0.25; drawMinimap(); }
  updateMarkers(); updateLabels();
}

/* ---------------- 데이터 (0.5초마다 센서 1행) ---------------- */
const SEG = 48; let segV, segC, predV;
function resetData() { segV = new Float32Array(SEG); segC = new Float32Array(SEG); predV = new Float32Array(SEG).fill(NaN); }
function sampleRow() {
  const vNear = viruses.filter(v => v.pos.distanceToSquared(pl.pos) < 400).length + carriers.filter(c => c.pos.distanceToSquared(pl.pos) < 400).length * 3;
  data.rows++; const s = Math.floor(pl.f * SEG) % SEG; segV[s] += vNear; segC[s]++;
  G.vNear = vNear; G.immNear = immuneCells.filter(w => w.pos.distanceToSquared(pl.pos) < 900).length;
  G.bpm = stageKey === 'heart' ? 60 / BEAT + rand(-12, 18) * (1 - vital / 120) : 72 + rand(-3, 3);
}
const accuracy = () => Math.round(100 * (1 - Math.exp(-data.rows / 260)));
function predict() {
  for (let s = 0; s < SEG; s++) { let a = 0, w = 0; for (let d = -3; d <= 3; d++) { const k = (s + d + SEG) % SEG; if (!segC[k]) continue; const ww = segC[k] / (1 + d * d); a += segV[k] / segC[k] * ww; w += ww; } predV[s] = w > 0.3 ? a / w : NaN; }
}

/* ---------------- HUD ---------------- */
function sensorVal(k) {
  switch (k) {
    case 'reg': return regionAt(pl.f);
    case 'flow': return Math.round(E.flow + rand(-2, 2));
    case 'o2': return Math.round(clamp(97 - (G.vNear || 0) * 0.4 - (100 - vital) * 0.1, 70, 99));
    case 'temp': return (37.3 + viruses.length / 60 + (100 - vital) / 60).toFixed(1);
    case 'vir': return fmt((G.vNear || 0) * 1200);
    case 'imm': return immune ? '회복 · 우리 편' : G.immNear >= 2 ? '높음' : G.immNear === 1 ? '보통' : '낮음';
    case 'bpm': return Math.round(G.bpm || 72);
    case 'valve': { const v = body.valves.slice().sort((a, b) => Math.abs(df(pl.f, a.f)) - Math.abs(df(pl.f, b.f)))[0]; return v ? `${v.name} ${v.closed ? '닫힘' : '열림'}` : '-'; }
    case 'dmg': return Math.round(100 - vital);
    case 'eeg': return Math.round(vital);
    case 'spike': return Math.round(G.spikeRate || 0);
  }
}
function updateHUD() {
  const S = STAGES[stageKey], n = S.need;
  S.sensors.forEach((s, i) => { const el = $('sv-' + i); if (el) el.textContent = sensorVal(s[1]); });
  const tv = +sensorVal('temp'), vi = S.sensors.findIndex(s => s[1] === 'vir'), ti = S.sensors.findIndex(s => s[1] === 'temp');
  if (ti >= 0) $('sr-' + ti).className = 'srow ' + (tv > 38.5 ? 'bad' : tv > 37.8 ? 'warn' : 'ok');
  if (vi >= 0) $('sr-' + vi).className = 'srow ' + ((G.vNear || 0) > 8 ? 'bad' : (G.vNear || 0) > 3 ? 'warn' : 'ok');
  $('v-a').textContent = `${stats.cellsDone} / ${n.cells}`; $('o-a').querySelector('i').style.width = Math.min(100, stats.cellsDone / n.cells * 100) + '%'; $('o-a').classList.toggle('done', stats.cellsDone >= n.cells);
  const bn = n.zap || n.nodes || 0, bv = n.zap ? stats.zapped : stats.nodesDone;
  if (bn) { $('v-b').textContent = `${Math.min(bn, bv)} / ${bn}`; $('o-b').querySelector('i').style.width = Math.min(100, bv / bn * 100) + '%'; $('o-b').classList.toggle('done', bv >= bn); }
  const parts = []; if (data.reads) parts.push(`유전체 조각 ${fmt(data.reads)}`); if (data.records) parts.push(`환자 기록 ${fmt(data.records)}건`); if (data.structs) parts.push(`원자 ${fmt(data.structs)}`); parts.push(`센서 ${fmt(data.rows)}행`);
  $('v-rows').innerHTML = parts.join('<br>');
  const acc = accuracy(); $('v-acc').textContent = acc + '%'; $('o-acc').querySelector('i').style.width = acc + '%';
  $('hp-i').style.width = clamp(pl.hp / pl.hpMax * 100, 0, 100) + '%'; $('v-hp').textContent = `${Math.max(0, Math.ceil(pl.hp))} / ${pl.hpMax}`;
  const cur = LEVELS[pl.level - 1], nxt = LEVELS[pl.level]; $('xp-i').style.width = (nxt ? clamp((pl.xp - cur.xp) / (nxt.xp - cur.xp) * 100, 0, 100) : 100) + '%'; $('v-stage').textContent = cur.name; $('st-i').style.width = pl.st + '%';
  $('vt-i').style.width = vital + '%'; $('v-vt').textContent = Math.round(vital) + '%'; $('status').classList.toggle('low', vital < 25 || pl.hp < pl.hpMax * 0.3);
  const chips = [];
  const imm = immuneCells.find(w => w.threat); if (imm) chips.push(`<span class="chip red">${imm.cfg.name}가 박사님을 침입자로 착각했어요! ${imm.cfg.tip}</span>`);
  const car = carriers.find(c => c.state.startsWith('wind')); if (car) chips.push(`<span class="chip red">감염체가 ${car.state === 'windS' ? '바이러스 덩어리를 뿜으려 해요!' : '돌진하려 해요!'} 톡 쳐서 쏘세요</span>`);
  if (pl.stun > 0) chips.push('<span class="chip red">감전! 잠시 못 움직여요</span>');
  if (pl.shield) chips.push('<span class="chip gold">위장막 작동 중 · 면역 세포가 잘 못 알아봐요</span>');
  if (healthy.some(h => !h.dead && h.infect > 0 && h.pos.distanceTo(pl.pos) < 30)) chips.push('<span class="chip ai">바이러스가 근처 세포를 감염시키는 중! 바이러스를 쏘세요</span>');
  if (vital < 25) chips.push('<span class="chip red">환자 생명 신호 위험!</span>');
  $('chips').innerHTML = chips.slice(0, 3).join('');
  $('vignette').style.boxShadow = `inset 0 0 160px 40px rgba(255,30,50,${G.chasing || pl.hp < pl.hpMax * 0.3 ? 0.3 + 0.12 * Math.sin(G.t * 8) : 0})`;
}
let mapBounds = null;
function drawMinimap() {
  const cv = $('minimap'), g = cv.getContext('2d'), W = cv.width, acc = accuracy();
  if (!mapBounds) { let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; FP.forEach(p => { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); }); const s = (W - 40) / Math.max(x1 - x0, z1 - z0); mapBounds = { x0, z0, s, ox: (W - (x1 - x0) * s) / 2, oz: (W - (z1 - z0) * s) / 2 }; }
  const M = mapBounds, X = p => M.ox + (p.x - M.x0) * M.s, Z = p => M.oz + (p.z - M.z0) * M.s;
  g.fillStyle = '#12040a'; g.fillRect(0, 0, W, W); g.lineCap = 'round';
  for (let s = 0; s < SEG; s++) {
    const a = FP[Math.floor(s / SEG * NS)], b = FP[Math.floor(((s + 1) % SEG) / SEG * NS)], v = predV[s];
    g.strokeStyle = isNaN(v) ? '#3a1a22' : `hsl(${clamp(120 - v * 10, 0, 120)},85%,${45 + acc * 0.1}%)`; g.globalAlpha = isNaN(v) ? 1 : clamp(0.35 + acc / 100, 0, 1);
    g.lineWidth = 16; g.beginPath(); g.moveTo(X(a), Z(a)); g.lineTo(X(b), Z(b)); g.stroke();
  }
  g.globalAlpha = 1;
  body.valves.forEach(v => { const p = FP[Math.floor(v.f * NS) % NS]; g.fillStyle = v.closed ? '#ff4f5e' : '#f0c0b0'; g.fillRect(X(p) - 3, Z(p) - 10, 6, 20); });
  cells.forEach(c => { g.fillStyle = c.done ? '#5dff8a' : c.kind === 'node' ? '#5ff2ff' : '#c58bff'; g.beginPath(); g.arc(X(c.pos), Z(c.pos), 9, 0, 7); g.fill(); });
  if (body.portal.visible) { g.fillStyle = '#5dff8a'; g.fillRect(X(body.portalPos) - 9, Z(body.portalPos) - 9, 18, 18); }
  carriers.forEach(c => { if (c.pos.distanceTo(pl.pos) < 60) { g.fillStyle = '#b060ff'; g.beginPath(); g.arc(X(c.pos), Z(c.pos), 5, 0, 7); g.fill(); } });
  immuneCells.forEach(w => { if (!immune && w.pos.distanceTo(pl.pos) < 70) { g.fillStyle = '#ff4f5e'; g.beginPath(); g.arc(X(w.pos), Z(w.pos), 6, 0, 7); g.fill(); } });
  g.fillStyle = '#fff'; g.beginPath(); g.arc(X(pl.pos), Z(pl.pos), 8, 0, 7); g.fill(); g.strokeStyle = '#5ff2ff'; g.lineWidth = 3; g.stroke();
  $('map-acc').textContent = acc < 20 ? '데이터 부족' : `AI 예측 정확도 ${acc}%`;
}
function placeMarker(el, wp, show, label) {
  if (!show) { el.classList.add('hidden'); return; }
  const v = wp.clone().project(camera); let x = v.x, y = v.y; if (v.z > 1) { x = -x; y = -y; }
  if (v.z > 1 || Math.abs(x) > 0.72 || Math.abs(y) > 0.6) { const m = Math.max(Math.abs(x) / 0.72, Math.abs(y) / 0.6); x /= m; y /= m; }
  el.classList.remove('hidden'); el.style.left = ((x + 1) / 2 * innerWidth) + 'px'; el.style.top = ((1 - y) / 2 * innerHeight) + 'px'; el.querySelector('span').textContent = label;
}
function updateMarkers() {
  const left = cells.filter(c => !c.done).sort((a, b) => a.pos.distanceTo(pl.pos) - b.pos.distanceTo(pl.pos)), c = left[0], S = STAGES[stageKey];
  const act = c && (c.kind === 'node' ? '노드 수리' : S.cellAct);
  placeMarker($('mk-cell'), c ? c.pos : pl.pos, G.playing && !!c && !G.missionDone, c ? (c.prog > 0 ? `${act} ${Math.round(c.prog * 100)}%` : `${c.kind === 'node' ? '데이터 노드' : S.cellName} ${Math.round(c.pos.distanceTo(pl.pos))}m`) : '');
  $('mk-cell').style.color = c && c.kind === 'node' ? '#5ff2ff' : '#c58bff';
  placeMarker($('mk-home'), body.portalPos || pl.pos, G.playing && G.missionDone, `출구 ${Math.round((body.portalPos || pl.pos).distanceTo(pl.pos))}m`);
  const threats = [...immuneCells.filter(w => w.threat), ...carriers.filter(c => c.state.startsWith('wind'))];
  document.querySelectorAll('.threat').forEach((el, i) => {
    const w = threats[i]; if (!w || !G.playing) { el.classList.add('hidden'); return; }
    const p = project(w.pos); if (!p.behind && Math.abs(p.nx) < 0.9 && Math.abs(p.ny) < 0.85) { el.classList.add('hidden'); return; }
    let x = p.behind ? -p.nx : p.nx, y = p.behind ? -p.ny : p.ny; const m = Math.max(Math.abs(x) / 0.88, Math.abs(y) / 0.8); x /= m; y /= m;
    el.classList.remove('hidden'); el.style.left = ((x + 1) / 2 * innerWidth) + 'px'; el.style.top = ((1 - y) / 2 * innerHeight) + 'px';
  });
}
function updateLabels() {
  const items = [], S = STAGES[stageKey];
  immuneCells.forEach(w => items.push({ p: w.pos, d: w.pos.distanceTo(pl.pos), h: w.cfg.size * 0.7, n: stageKey !== 'vessel' && w.type === 'macro' && E.tex === 'brain' ? '미세아교세포 (뇌의 면역 세포)' : w.cfg.name, t: immune ? ['eat', '이제 우리 편이에요'] : ['bad', w.cfg.tip] }));
  carriers.forEach(c => items.push({ p: c.pos, d: c.pos.distanceTo(pl.pos), h: 1.6, n: `감염체 ${'●'.repeat(Math.max(0, c.hp))}`, t: ['bad', '바이러스에 점령된 세포 · 톡 쳐서 쏘기'] }));
  cells.forEach(c => items.push({ p: c.pos, d: c.pos.distanceTo(pl.pos), h: 3, n: c.kind === 'node' ? '의료 데이터 노드' : S.cellName, t: c.done ? ['eat', '완료'] : ['meh', `가까이 가면 ${c.kind === 'node' ? '수리' : S.cellAct}`] }));
  const near = items.filter(i => i.d < 18).sort((a, b) => a.d - b.d).slice(0, 3);
  document.querySelectorAll('.clabel').forEach((el, i) => {
    const it = near[i]; if (!it || !G.playing) { el.classList.add('hidden'); return; }
    const p = project(V3().copy(it.p).addScaledVector(pl.n, it.h)); if (p.behind || p.y < 140) { el.classList.add('hidden'); return; }
    el.className = 'clabel ' + it.t[0]; el.innerHTML = `${it.n}<small>${it.t[1]}</small>`; el.style.left = p.x + 'px'; el.style.top = p.y + 'px';
  });
}
let toastTimer; const radioQ = []; let radioBusy = false;
function toast(msg, tone = '') { const t = $('toast'); if (t.textContent === msg && t.classList.contains('show')) return; t.textContent = msg; t.className = 'panel show ' + tone; clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2400); }
function radio(msg, ms = 6000) { radioQ.push([msg, ms]); if (!radioBusy) nextRadio(); }
function nextRadio() { const it = radioQ.shift(); if (!it) { radioBusy = false; $('radio').classList.remove('show'); return; } radioBusy = true; $('radio-text').textContent = it[0]; $('radio').classList.add('show'); sfx('click'); setTimeout(nextRadio, Math.max(3500, it[1] - radioQ.length * 1500)); }
function floatText(txt, wp, color, big) { const p = project(wp); if (p.behind) return; const el = document.createElement('div'); el.className = 'fx' + (big ? ' big' : ''); el.textContent = txt; if (color) el.style.color = color; el.style.left = p.x + 'px'; el.style.top = p.y + 'px'; $('hud').appendChild(el); setTimeout(() => { el.style.transform = 'translateY(-54px)'; el.style.opacity = '0'; }, 20); setTimeout(() => el.remove(), 1000); }
function flash(color = '#fff', ms = 500) { const f = $('flash'); f.style.transition = 'none'; f.style.background = color; f.style.opacity = 1; void f.offsetWidth; setTimeout(() => { f.style.transition = `opacity ${ms}ms`; f.style.opacity = 0; }, 30); }
async function banner(a, b, c, ms = 3200) { $('bn-a').textContent = a; $('bn-b').textContent = b; $('bn-c').textContent = c; $('banner').classList.add('show'); await sleep(ms); $('banner').classList.remove('show'); }

/* ---------------- 대화 ---------------- */
let dlgQ = [], dlgDone = null, typing = null;
function say(lines) { return new Promise(res => { dlgQ = lines.slice(); dlgDone = res; $('dialog').classList.remove('hidden'); $('hud').classList.add('dim'); nextLine(); }); }
function nextLine() {
  if (typing) { clearInterval(typing.id); $('dlg-text').textContent = typing.text; typing = null; return; }
  if (!dlgQ.length) { $('dialog').classList.add('hidden'); $('hud').classList.remove('dim'); const d = dlgDone; dlgDone = null; d && d(); return; }
  const l = dlgQ.shift(), d = $('dialog'); d.className = 'panel ' + (l.who === '나' ? 'me' : l.who === '시스템' ? 'sys' : '');
  $('dlg-who').textContent = l.who === '나' ? `${G.name} 박사` : l.who;
  const text = l.text.replaceAll('{name}', G.name).replaceAll('{date}', `${TODAY.getFullYear()}년 ${TODAY.getMonth() + 1}월 ${TODAY.getDate()}일`); let i = 0; $('dlg-text').textContent = '';
  typing = { text, id: setInterval(() => { i++; $('dlg-text').textContent = text.slice(0, i); if (i >= text.length) { clearInterval(typing.id); typing = null; } }, 22) };
  if (l.fx) l.fx();
}
$('dialog').addEventListener('click', nextLine);

/* =========================================================
   흐름: 2026 → 2187 → 혈관 → 분석① → 심장 → 분석② → 뇌 → 분석③ → 치료 → 엔딩
   ========================================================= */
const G = { mode: 'title', playing: false, t: 0, name: 'K' };
let active = lab.scene;
window.G = G; window.DBG = { pl, body, camera, THREE, viruses, immuneCells, carriers, cells, healthy, projs, stats, data, cam, joy, keys, ptr, shootAt, project, setActive: s => { active = s; } };
async function doWarp(big, small, col) {
  G.mode = 'warp'; G.playing = false; active = warp.scene; warp.t = 0; warp.col.set(col); $('hud').classList.add('hidden'); $('warptxt').classList.remove('hidden'); $('wp-a').textContent = small; sfx('warp');
  const t0 = performance.now(); while (performance.now() - t0 < warp.dur * 1000) { const k = (performance.now() - t0) / (warp.dur * 1000); $('wp-b').textContent = k > 0.75 ? big : big.replace(/\d/g, () => Math.floor(Math.random() * 10)); await sleep(50); }
  $('wp-b').textContent = big; flash('#fff', 900); await sleep(150); $('warptxt').classList.add('hidden'); camera.fov = 64; camera.updateProjectionMatrix(); camera.rotation.set(0, 0, 0);
}
async function intro() {
  G.mode = 'lab'; active = lab.scene; setLabMood(false); startLabCamera(); lab.power = 0.3; sound.music('lab', 2);
  await sleep(500); await say(STORY.intro2026.map((l, i) => i === 3 ? { ...l, fx: () => { lab.powerOn = true; } } : l));
  await doWarp('+161 YEARS', 'TEMPORAL JUMP · 서기 2187년', 0xffd66b);
  G.mode = 'lab'; active = lab.scene; setLabMood(true); lab.power = 0.15; lab.powerOn = false; startLabCamera('pod');
  await sleep(600); await say(STORY.intro2187);
  await doWarp('0.005 mm', 'NANO MODE · 혈관으로', 0x7dffb0);
  startStage('vessel');
}
async function startStage(key) {
  setupStage(key); G.mode = 'body'; active = bs; G.playing = false; renderer.toneMappingExposure = 1; $('hud').classList.remove('hidden'); sound.music('body', 2);
  for (let k = 0; k < 30; k++) { surface(pl.f, pl.u, _ps); body.robot.position.copy(_ps.pos).addScaledVector(_ps.n, 0.6); updateCamera(0.05); }
  updateHUD(); drawMinimap();
  const bn = STAGES[key].banner; banner(bn[0], bn[1], bn[2]); await sleep(1800);
  await say(key === 'vessel' ? STORY.vessel.concat([{ who: '시스템', text: howto(IS_TOUCH) }]) : STORY[key]);
  G.playing = true;
}
function finishStage() {
  G.playing = false; G.mode = 'analysis'; sound.chase(false); sound.music('analysis', 1.5); $('hud').classList.add('dim'); body.arm.target = null;
  const sx = n => sfx(n);
  const next = async (lines, big, small, col, key) => { $('hud').classList.remove('dim'); G.mode = 'body'; await say(lines); await doWarp(big, small, col); startStage(key); };
  if (stageKey === 'vessel') openIdentify({ sub: `혈관에서 모은 유전체 조각 ${fmt(data.reads)}개`, reads: data.reads, sfx: sx, onDone: () => next(STORY.afterVessel, 'HEART', 'NANO JUMP · 심장으로', 0xff6b7a, 'heart') });
  else if (stageKey === 'heart') openRisk({ sub: `되찾은 환자 기록 ${fmt(data.records)}건`, records: data.records || 10000, sfx: sx, onDone: v => { voteChoice = v; next(STORY.afterHeart, 'BRAIN', 'NANO JUMP · 뇌로', 0xb08bff, 'brain'); } });
  else if (stageKey === 'brain') openDrug({ sub: `뇌에서 스캔한 원자 위치 ${fmt(data.structs)}개`, structs: data.structs || 7200000, sfx: sx, onDone: () => startStage('cure') });
  else ending();
}
async function ending() {
  $('hud').classList.add('hidden'); await doWarp('100 %', 'NANO MODE OFF · 원래 크기로', 0x7dffb0);
  G.mode = 'lab'; active = lab.scene; setLabMood(true); lab.pod.color.set(0x9fffcf); startLabCamera('pod'); sound.music('ending', 2);
  await sleep(600);
  await say(STORY.ending2187.map(l => l.who === 'VOTE' ? { who: 'ARIA', text: `그리고 박사님은 유전체 데이터 공유를 이렇게 결정했어요. “${VOTE.opts[voteChoice].t}”\n${VOTE.opts[voteChoice].r}` } : l));
  await doWarp('2026', 'RETURN · 원래 시대로', 0x5ff2ff);
  G.mode = 'lab'; setLabMood(false); startLabCamera(); active = lab.scene;
  const mins = Math.round((performance.now() - stats.start) / 60000);
  $('end-stats').innerHTML = [[fmt(data.reads), '유전체 조각'], [fmt(data.records), '환자 기록'], [fmt(data.structs), '단백질 원자 위치'], [LEVELS[pl.level - 1].name.split(' · ')[0], '로봇 최종 단계'], [mins + '분', '작전 시간']].map(([b, s]) => `<div><b>${b}</b><span>${s}</span></div>`).join('');
  $('end-vote').textContent = VOTE.opts[voteChoice].t;
  $('ending').classList.remove('hidden');
}

/* ---------------- 루프 ---------------- */
let last = performance.now();
function loop(now) { requestAnimationFrame(loop); const raw = (now - last) / 1000; last = now; adaptResolution(raw); frameStep(Math.min(0.05, raw)); }
window.DBG.step = (n = 1, dt = 1 / 30) => { for (let i = 0; i < n; i++) frameStep(dt); };
function frameStep(dt) {
  G.t += dt;
  $('touchui').classList.toggle('hidden', !(IS_TOUCH && G.mode === 'body' && G.playing));
  if (G.mode === 'lab' || G.mode === 'title') { if (lab.powerOn) lab.power = Math.min(1, lab.power + dt * 0.5); updateLab(dt); }
  else if (G.mode === 'warp') updateWarp(dt);
  else if (G.mode === 'body' || G.mode === 'analysis') updateBody(dt);
  renderer.render(active, camera);
}

/* ---------------- 시작 ---------------- */
$('end-restart').onclick = () => location.reload();
(async () => {
  try { await loadAssets(); } catch (e) { $('loadtxt').textContent = '모델을 불러오지 못했어요. 인터넷 연결을 확인하고 새로고침해 주세요.'; console.error(e); return; }
  sound.probe(); buildLab(); buildBody(); buildStage('vessel'); startLabCamera();
  renderer.compile(bs, camera); renderer.compile(lab.scene, camera);
  $('loading').classList.add('hidden'); $('startbox').classList.remove('hidden');
  $('screen').style.background = 'radial-gradient(ellipse at 50% 30%,rgba(10,2,4,.35),rgba(10,2,4,.92) 70%)';
  requestAnimationFrame(loop);
  const go = async () => {
    G.name = $('pname').value.trim() || 'K'; $('screen').classList.add('hidden'); stats.start = performance.now(); sound.unlock();
    if (IS_TOUCH) { const de = document.documentElement; try { (de.requestFullscreen || de.webkitRequestFullscreen)?.call(de)?.catch?.(() => { }); } catch (_) { } try { screen.orientation?.lock?.('landscape').catch(() => { }); } catch (_) { } }
    const wake = async () => { try { await navigator.wakeLock?.request('screen'); } catch (_) { } }; wake(); document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') wake(); });
    const st = { 2: 'heart', heart: 'heart', 3: 'brain', brain: 'brain', 4: 'cure', cure: 'cure' }[P.get('stage')];
    if (st) { data.reads = 1281000; if (st !== 'heart') data.records = 10000; if (st === 'cure') data.structs = 7200000; await doWarp('0.005 mm', 'TEACHER MODE', 0x7dffb0); startStage(st); }
    else if (P.has('skip')) { await doWarp('0.005 mm', 'NANO MODE', 0x7dffb0); startStage('vessel'); }
    else intro();
  };
  $('startbtn').onclick = go; $('pname').addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
})();
