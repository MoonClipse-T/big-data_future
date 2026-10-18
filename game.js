import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { LEVELS, REGIONS, GENOME, GENOTYPE, STORY, VOTE } from './content.js';
import { Sound } from './audio.js';
import { openGenome, openDrug } from './analysis.js';

/* =========================================================
   크로노스 프로토콜 · 2차시 미래 편 「바이러스 X」
   교사용 URL 옵션: ?skip (인트로 건너뛰기)  ?stage=2 (치료 작전부터)  ?teacher (미션 완료 버튼)  ?touch / ?mouse
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
// 혈관 벽 텍스처 (실핏줄 무늬)
function fleshTex() {
  const c = document.createElement('canvas'); c.width = c.height = 512; const g = c.getContext('2d');
  g.fillStyle = '#b8323c'; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 900; i++) { const x = Math.random() * 512, y = Math.random() * 512, r = Math.random() * 26 + 6; const gr = g.createRadialGradient(x, y, 0, x, y, r); const l = Math.random() < 0.5; gr.addColorStop(0, l ? 'rgba(255,150,150,0.18)' : 'rgba(90,10,20,0.2)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); }
  g.lineCap = 'round';
  for (let i = 0; i < 40; i++) { let x = Math.random() * 512, y = Math.random() * 512, a = Math.random() * 6.28, w = Math.random() * 3 + 1; g.strokeStyle = `rgba(${90 + Math.random() * 60},10,30,0.55)`; g.lineWidth = w; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 30; k++) { a += (Math.random() - 0.5) * 0.7; x += Math.cos(a) * 9; y += Math.sin(a) * 9; g.lineTo(x, y); } g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}

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
   몸속 (혈관 고리)
   ========================================================= */
const body = { scene: new THREE.Scene() }, bs = body.scene;
// 온몸을 도는 혈관 고리
const LOOP_PTS = []; for (let k = 0; k < 18; k++) { const a = k / 18 * Math.PI * 2, r = 120 + 26 * Math.sin(3 * a + 0.4); LOOP_PTS.push(new THREE.Vector3(Math.cos(a) * r, 7 * Math.sin(2 * a), Math.sin(a) * r)); }
const CURVE = new THREE.CatmullRomCurve3(LOOP_PTS, true, 'catmullrom', 0.5);
const LEN = CURVE.getLength(), NS = 1800;
const FP = [], FT = [], FN = [], FB = [], FR = [];
const radiusAt = f => 12 + 3.5 * Math.sin(f * Math.PI * 2 * 3 + 1) - 3.5 * smooth(0.5, 0.58, f) * (1 - smooth(0.74, 0.8, f));
for (let i = 0; i < NS; i++) {
  const f = i / NS, p = CURVE.getPointAt(f), t = CURVE.getTangentAt(f).normalize();
  const n = V3().crossVectors(t, new THREE.Vector3(0, 1, 0)).normalize(), b = V3().crossVectors(n, t).normalize();
  FP.push(p); FT.push(t); FN.push(n); FB.push(b); FR.push(radiusAt(f));
}
const regionAt = f => REGIONS.find(r => f >= r.from && f < r.to) || REGIONS[0];
function frame(f, o = {}) {
  const x = wrap01(f) * NS, i = Math.floor(x) % NS, j = (i + 1) % NS, k = x - Math.floor(x);
  o.P = (o.P || V3()).lerpVectors(FP[i], FP[j], k); o.T = (o.T || V3()).lerpVectors(FT[i], FT[j], k).normalize();
  o.N = (o.N || V3()).lerpVectors(FN[i], FN[j], k).normalize(); o.B = (o.B || V3()).lerpVectors(FB[i], FB[j], k).normalize(); o.R = lerp(FR[i], FR[j], k);
  return o;
}
// 혈관 벽 위의 점: u = 옆으로 떨어진 거리. 바닥에서 벽을 타고 올라갈 수 있어요(반파이프).
const _fr = {};
function surface(f, u, out = {}) {
  const F = frame(f, _fr), R = F.R, uu = clamp(u, -0.86 * R, 0.86 * R), d = Math.sqrt(R * R - uu * uu);
  out.pos = (out.pos || V3()).copy(F.P).addScaledVector(F.N, uu).addScaledVector(F.B, -d);
  out.n = (out.n || V3()).copy(F.P).sub(out.pos).normalize();
  out.lat = (out.lat || V3()).copy(F.N).addScaledVector(F.B, uu / d).normalize();
  out.T = (out.T || V3()).copy(F.T); out.R = R; out.u = uu; out.P = F.P; out.N = F.N; out.B = F.B;
  return out;
}

const pl = { f: 0.02, u: 0, hd: 0, hp: 100, hpMax: 100, st: 100, xp: 0, level: 1, shield: false, inv: 0, slow: 0, shake: 0, boosting: false, pos: V3(), n: V3(), fwd: V3(0, 0, 1), zapT: 0 };
let stage = 1, stageT = 0, vital = 62, immune = false, variantOn = false;
const viruses = [], wbcs = [], cells = [], rbcs = [], pickups = [];
let genomes = [], patients = [], rows = [];
const stats = { zapped: 0, scanned: 0, treated: 0, deaths: 0, start: 0 };
let voteChoice = 0;

function buildBody() {
  bs.background = new THREE.Color(0x2a0508); bs.fog = new THREE.FogExp2(0x3a080d, 0.028); bs.environment = envTex; bs.environmentIntensity = 0.25;
  bs.add(new THREE.HemisphereLight(0xff9a9a, 0x400810, 1.4));
  // 혈관 벽 메시
  const RS = 720, AS = 44, geo = new THREE.BufferGeometry(), pos = new Float32Array((RS + 1) * AS * 3), uv = new Float32Array((RS + 1) * AS * 2), col = new Float32Array((RS + 1) * AS * 3), idx = [];
  const F = {};
  for (let i = 0; i <= RS; i++) {
    const f = i / RS; frame(f, F); const reg = regionAt(wrap01(f));
    for (let a = 0; a < AS; a++) {
      const th = a / AS * Math.PI * 2, bump = 1 + 0.05 * Math.sin(th * 7 + f * 300) * Math.sin(f * 900 + th * 3);
      const k = (i * AS + a) * 3, r = F.R * bump, dir = V3().copy(F.N).multiplyScalar(Math.cos(th)).addScaledVector(F.B, Math.sin(th));
      pos[k] = F.P.x + dir.x * r; pos[k + 1] = F.P.y + dir.y * r; pos[k + 2] = F.P.z + dir.z * r;
      uv[(i * AS + a) * 2] = a / AS * 6; uv[(i * AS + a) * 2 + 1] = f * LEN / 14;
      const dk = 0.75 + 0.25 * Math.sin(th * 3 + f * 40); col[k] = reg.tint[0] * dk; col[k + 1] = reg.tint[1] * dk; col[k + 2] = reg.tint[2] * dk;
    }
  }
  for (let i = 0; i < RS; i++) for (let a = 0; a < AS; a++) { const a2 = (a + 1) % AS, p0 = i * AS + a, p1 = i * AS + a2, p2 = (i + 1) * AS + a, p3 = (i + 1) * AS + a2; idx.push(p0, p2, p1, p1, p2, p3); }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.setIndex(idx); geo.computeVertexNormals();
  const tex = fleshTex();
  body.wallMat = new THREE.MeshStandardMaterial({ map: tex, vertexColors: true, roughness: 0.38, metalness: 0.0, side: THREE.BackSide, emissive: 0x3a0408, emissiveIntensity: 0.6, bumpMap: tex, bumpScale: 2.5 });
  bs.add(new THREE.Mesh(geo, body.wallMat));
  // 적혈구 (오목한 원반) · 혈장 입자
  const prof = []; for (let k = 0; k <= 16; k++) { const r = k / 16; const h = 0.22 * Math.sqrt(1 - r * r) * (0.35 + 1.1 * r * r); prof.push(new THREE.Vector2(r * 0.9 + 0.001, h)); }
  for (let k = 16; k >= 0; k--) { const p = prof[k]; prof.push(new THREE.Vector2(p.x, -p.y)); }
  const rbcGeo = new THREE.LatheGeometry(prof, 24);
  body.rbc = new THREE.InstancedMesh(rbcGeo, new THREE.MeshStandardMaterial({ color: 0xd8202c, roughness: 0.35, emissive: 0x400005 }), 280);
  for (let i = 0; i < 280; i++) rbcs.push({ f: Math.random(), a: rand(0, 6.28), r: Math.sqrt(Math.random()) * 0.82, spd: rand(0.8, 1.2), q: new THREE.Quaternion().random(), w: new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize(), s: rand(1.2, 1.8) });
  bs.add(body.rbc);
  const PN = 1500, pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(PN * 3), 3));
  body.plasma = new THREE.Points(pg, new THREE.PointsMaterial({ size: 0.12, map: radialTex('rgba(255,210,200,0.9)', 'rgba(255,210,200,0)'), transparent: true, depthWrite: false, opacity: 0.6 })); body.plasma.frustumCulled = false;
  body.plasmaS = Array.from({ length: PN }, () => ({ f: Math.random(), a: rand(0, 6.28), r: Math.sqrt(Math.random()) * 0.9 })); bs.add(body.plasma);
  // 바이러스 (인스턴싱)
  body.virParts = bakeParts('virus', 1.1).map(p => { const m = new THREE.InstancedMesh(p.geo, p.mat, 170); m.count = 0; m.frustumCulled = false; bs.add(m); return m; });
  // 감염 세포 8곳
  const cellGeo = new THREE.SphereGeometry(2.3, 72, 48), cp = cellGeo.attributes.position;
  for (let i = 0; i < cp.count; i++) { const v = V3().fromBufferAttribute(cp, i), k = 1 + 0.12 * Math.sin(v.x * 3) * Math.sin(v.y * 4 + 1) * Math.sin(v.z * 3.5); cp.setXYZ(i, v.x * k, v.y * k * 0.75, v.z * k); }
  cellGeo.computeVertexNormals();
  const spots = [0.09, 0.17, 0.3, 0.41, 0.56, 0.66, 0.83, 0.93];
  spots.forEach((f, i) => {
    const u = (i % 2 ? 1 : -1) * rand(0.35, 0.55), S = surface(f, u * frame(f).R), g = new THREE.Group();
    const mat = new THREE.MeshPhysicalMaterial({ color: 0x9a46e0, emissive: 0x6a18c0, emissiveIntensity: 0.8, roughness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.25, sheen: 1, sheenColor: 0xffb0ff, bumpMap: tex, bumpScale: 1.5 });
    const blob = new THREE.Mesh(cellGeo, mat); g.add(blob);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(4.2, 0.08, 8, 64), new THREE.MeshBasicMaterial({ color: 0xc58bff, transparent: true, opacity: 0.6 })); ring.rotation.x = Math.PI / 2; ring.position.y = -1.2; g.add(ring);
    const light = new THREE.PointLight(0xb070ff, 18, 16); light.position.y = 2; g.add(light);
    g.position.copy(S.pos).addScaledVector(S.n, 1.3); g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), S.n); bs.add(g);
    cells.push({ f, u: S.u, g, mat, ring, light, pos: g.position, scanned: false, treated: false, prog: 0, spawnT: rand(2, 6) });
  });
  // 주입 포트 (시작·귀환 지점)
  const S0 = surface(0.015, 0);
  body.port = new THREE.Group();
  body.port.add(new THREE.Mesh(new THREE.TorusGeometry(3, 0.18, 12, 64), new THREE.MeshBasicMaterial({ color: 0x5dff8a })));
  body.port.children[0].rotation.x = Math.PI / 2;
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.8, 16, 24, 1, true), new THREE.MeshBasicMaterial({ color: 0x5dff8a, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  beam.position.y = 8; body.port.add(beam); body.portBeam = beam;
  const pl2 = new THREE.PointLight(0x5dff8a, 25, 20); pl2.position.y = 3; body.port.add(pl2);
  body.port.position.copy(S0.pos).addScaledVector(S0.n, 0.05); body.port.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), S0.n); bs.add(body.port);
  body.portPos = body.port.position.clone();
  // 나노 로봇
  body.robot = makeModel('robot', 1.4); bs.add(body.robot);
  const head = new THREE.SpotLight(0xe8fbff, 60, 45, 0.55, 0.5, 1.4); head.position.set(0, 0.5, 0.3); const tgt = new THREE.Object3D(); tgt.position.set(0, -0.3, 8); body.robot.add(head, tgt); head.target = tgt;
  const glow = new THREE.PointLight(0x9ff6ff, 8, 7); glow.position.set(0, 1.2, 0); body.robot.add(glow);
  body.shieldMesh = new THREE.Mesh(new THREE.SphereGeometry(1.25, 24, 16), new THREE.MeshBasicMaterial({ color: 0x5ff2ff, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false }));
  body.shieldMesh.position.y = 0.6; body.shieldMesh.visible = false; body.robot.add(body.shieldMesh);
  // 레이저 · 조각 · 거품
  body.beam = new THREE.Line(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3)), new THREE.LineBasicMaterial({ color: 0x9ff6ff, transparent: true, blending: THREE.AdditiveBlending }));
  body.beam.frustumCulled = false; body.beam.visible = false; bs.add(body.beam);
  body.pickMat = new THREE.SpriteMaterial({ map: radialTex('rgba(120,255,170,1)', 'rgba(120,255,170,0)'), blending: THREE.AdditiveBlending, depthWrite: false });
  const BN = 400, bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(BN * 3), 3));
  body.bub = { pts: new THREE.Points(bg, new THREE.PointsMaterial({ size: 0.3, map: radialTex('rgba(255,220,220,0.9)', 'rgba(255,220,220,0)'), transparent: true, depthWrite: false })), v: Array.from({ length: BN }, () => V3()), life: new Float32Array(BN), next: 0 };
  body.bub.pts.frustumCulled = false; bs.add(body.bub.pts);
}
function burst(p, n, speed = 4) { const b = body.bub, pos = b.pts.geometry.attributes.position; for (let k = 0; k < n; k++) { const i = b.next = (b.next + 1) % b.life.length; pos.setXYZ(i, p.x, p.y, p.z); b.v[i].set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(speed); b.life[i] = rand(0.5, 1.1); } }

/* ---------------- 바이러스 ---------------- */
function spawnVirus(f, u, variant = false) {
  if (viruses.length >= 170) return;
  viruses.push({ f: wrap01(f), u: u ?? rand(-0.6, 0.6) * frame(f).R, h: rand(0.9, 5), ph: rand(0, 6.28), variant, pos: V3(), q: new THREE.Quaternion().random(), spin: rand(0.3, 1) });
}
const _vs = {};
function updateViruses(dt) {
  const M = new THREE.Matrix4(), S = new THREE.Vector3(), col = new THREE.Color(); let near = 0;
  for (let i = viruses.length - 1; i >= 0; i--) {
    const v = viruses[i]; v.ph += dt;
    v.f = wrap01(v.f + dt * regionAt(v.f).flow * 0.05 / LEN); v.u += Math.sin(v.ph * 0.7) * dt * 0.6;
    surface(v.f, v.u, _vs); v.u = _vs.u;
    v.pos.copy(_vs.pos).addScaledVector(_vs.n, v.h + Math.sin(v.ph * 1.8) * 0.4);
    const d = v.pos.distanceTo(pl.pos);
    if (d < 9 && !pl.shield && G.playing) { // 숙주를 찾아 다가와요
      v.pos.lerp(pl.pos, dt * 0.25); if (d < 1.4 && pl.inv <= 0) { hurt(5 * dt, true); near++; }
    }
    v.q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0.3, 1, 0.2).normalize(), v.spin * dt));
    const sc = v.variant ? 1.15 : 1; M.compose(v.pos, v.q, S.set(sc, sc, sc));
    body.virParts.forEach(m => { m.setMatrixAt(i, M); m.setColorAt(i, col.set(v.variant ? 0xffa040 : 0xffffff)); });
  }
  body.virParts.forEach(m => { m.count = viruses.length; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; });
  G.infected = near > 0;
}

/* ---------------- 백혈구 (면역 세포) ---------------- */
class WBC {
  constructor(k) { this.obj = makeModel('wbc', 3.4); bs.add(this.obj); this.f = wrap01(pl.f + 0.12 + k * 0.095 + rand(-0.02, 0.02)); this.u = rand(-0.4, 0.4) * frame(this.f).R; this.dir = Math.random() < 0.5 ? 1 : -1; this.state = 'patrol'; this.timer = 0; this.cool = 0; this.eatT = 0; this.ph = rand(0, 6); this.pos = V3(); this.S = {};
    this.bang = new THREE.Sprite(new THREE.SpriteMaterial({ map: BANG_TEX, depthTest: false, transparent: true })); this.bang.scale.setScalar(1.6); this.bang.visible = false; this.bang.renderOrder = 10; bs.add(this.bang);
    this.ring = new THREE.Sprite(new THREE.SpriteMaterial({ map: RING_TEX, transparent: true, depthWrite: false })); this.ring.visible = false; bs.add(this.ring); }
  update(dt) {
    this.ph += dt; this.timer -= dt; this.cool -= dt; this.eatT -= dt;
    const d = this.pos.distanceTo(pl.pos), friendly = immune;
    const df = (() => { let x = pl.f - this.f; x -= Math.round(x); return x; })(); // 플레이어 쪽 방향
    let sp = 2.6, tf = this.dir, tu = null;
    if (friendly) this.state = 'patrol';
    switch (this.state) {
      case 'patrol': if (!friendly && G.playing && d < 15 * (pl.shield ? 0.35 : 1) && this.cool <= 0) { this.state = 'notice'; this.timer = 0.6; sfx('alert', 0.7); } break;
      case 'notice': sp = 0.5; tf = Math.sign(df); if (this.timer <= 0) { this.state = 'chase'; this.timer = 9; } break;
      case 'chase': sp = 6.4 * (stage === 2 ? 1.1 : 1); tf = Math.sign(df); tu = pl.u; if (d < 3.2) { this.state = 'windup'; this.timer = 0.45; sfx('roar', 0.5, 1.4); } if (d > 30 || this.timer <= 0 || pl.shield) { this.state = 'patrol'; this.cool = 4; } break;
      case 'windup': sp = 0.6; tf = Math.sign(df); tu = pl.u; if (this.timer <= 0) { this.state = 'lunge'; this.timer = 0.5; this.hit = false; sfx('dash', 0.7, 0.6); } break;
      case 'lunge': sp = 15; tf = Math.sign(df); tu = pl.u; if (!this.hit && d < 2.4 && pl.inv <= 0 && G.playing) { this.hit = true; this.catch(); } if (this.timer <= 0) { this.state = 'recover'; this.timer = this.hit ? 2.6 : 1; } break;
      case 'recover': sp = this.hit ? 3 : 1; tf = this.hit ? -Math.sign(df) : this.dir; if (this.timer <= 0) { this.state = 'patrol'; this.cool = this.hit ? 5 : 2; } break;
    }
    this.f = wrap01(this.f + tf * sp * dt / LEN);
    if (tu !== null) this.u = lerp(this.u, tu, 1 - Math.exp(-dt * 2)); else this.u += Math.sin(this.ph * 0.5) * dt;
    surface(this.f, this.u, this.S); this.u = this.S.u;
    this.pos.copy(this.S.pos).addScaledVector(this.S.n, 1.5 + Math.sin(this.ph * 2) * 0.1);
    this.obj.position.copy(this.pos); this.obj.rotation.y += dt * 0.6; this.obj.rotation.x = Math.sin(this.ph) * 0.2;
    const sq = this.state === 'windup' ? 0.85 + 0.1 * Math.sin(G.t * 40) : this.state === 'lunge' ? 1.15 : 1; this.obj.scale.set(sq, 1 / sq, sq);
    // 백혈구는 바이러스도 잡아먹어요
    if (this.eatT <= 0) { const k = viruses.findIndex(v => v.pos.distanceToSquared(this.pos) < 9); if (k >= 0) { burst(viruses[k].pos, 8, 2); viruses.splice(k, 1); } this.eatT = friendly ? 0.5 : 1.4; }
    const alert = this.state === 'notice' || this.state === 'windup' || this.state === 'lunge';
    this.bang.visible = alert; if (alert) this.bang.position.copy(this.pos).addScaledVector(this.S.n, 3.2);
    this.ring.visible = d < 28; if (this.ring.visible) { this.ring.position.copy(this.pos); this.ring.scale.setScalar(4.2); this.ring.material.color.set(friendly ? 0x5dff8a : 0xff3b50); this.ring.material.opacity = 0.35; }
  }
  catch() {
    const dmg = pl.shield ? 4 : 16; hurt(dmg); pl.slow = pl.shield ? 0.3 : 1.3; sfx(pl.shield ? 'shield' : 'bite'); burst(pl.pos, 24, 5);
    toast(pl.shield ? '위장막 덕분에 금방 빠져나왔어요!' : `백혈구에게 붙잡혔어요! (−${dmg})`, pl.shield ? 'gold' : 'red');
  }
}

/* ---------------- 입력 (1차시와 같은 조작) ---------------- */
const keys = {}; const ptr = { L: false, R: false };
addEventListener('keydown', e => {
  keys[e.code] = true;
  if ((e.code === 'Space' || e.code === 'Enter') && !$('dialog').classList.contains('hidden')) { e.preventDefault(); nextLine(); return; }
  if (e.code === 'KeyN' && e.ctrlKey && e.shiftKey && G.playing) teacherComplete();
  if (e.code === 'Space') e.preventDefault();
});
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('contextmenu', e => e.preventDefault());
const joy = { id: null, ox: 0, oy: 0, x: 0, y: 0, full: 0 }, JOY_R = 64, look = { id: null, x: 0, y: 0 }, cam = { yaw: 0, pitch: -0.25, last: -99 };
const JOY_HOME = () => ({ x: Math.max(110, innerWidth * 0.13), y: innerHeight - Math.max(120, innerHeight * 0.2) });
function joyShow(x, y) { const el = $('joy'); el.style.left = x + 'px'; el.style.top = y + 'px'; }
canvas.addEventListener('pointerdown', e => {
  if (!$('dialog').classList.contains('hidden')) { nextLine(); return; }
  const left = e.clientX < innerWidth * 0.45 && e.pointerType !== 'mouse';
  if (left && joy.id === null) { joy.id = e.pointerId; joy.ox = e.clientX; joy.oy = e.clientY; joy.x = joy.y = 0; joy.full = 0; joyShow(joy.ox, joy.oy); $('joy').classList.add('on'); $('joy').firstElementChild.style.transform = ''; }
  else if (look.id === null) { look.id = e.pointerId; look.x = e.clientX; look.y = e.clientY; }
  try { canvas.setPointerCapture(e.pointerId); } catch (_) { }
});
canvas.addEventListener('pointermove', e => {
  if (e.pointerId === joy.id) { let dx = e.clientX - joy.ox, dy = e.clientY - joy.oy; const L = Math.hypot(dx, dy); if (L > JOY_R) { dx *= JOY_R / L; dy *= JOY_R / L; } joy.x = dx / JOY_R; joy.y = dy / JOY_R; $('joy').firstElementChild.style.transform = `translate(${dx}px,${dy}px)`; }
  else if (e.pointerId === look.id) { const s = e.pointerType === 'mouse' ? 0.005 : 0.0065; cam.yaw -= (e.clientX - look.x) * s; cam.pitch = clamp(cam.pitch - (e.clientY - look.y) * s * 0.8, -1.0, 0.6); look.x = e.clientX; look.y = e.clientY; cam.last = G.t; }
});
const ptrEnd = e => { if (e.pointerId === joy.id) { joy.id = null; joy.x = joy.y = 0; const h = JOY_HOME(); joyShow(h.x, h.y); $('joy').classList.remove('on'); $('joy').firstElementChild.style.transform = ''; } if (e.pointerId === look.id) look.id = null; };
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
function teacherComplete() {
  if (stage === 1) { cells.slice(0, 5).forEach(c => { if (!c.scanned) scanDone(c); }); while (stats.zapped < 40) { stats.zapped++; genomes.push(genGenome()); } }
  else cells.filter(c => !c.treated).slice(0, 6 - stats.treated).forEach(c => treatDone(c));
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
  const boost = (keys.Space || ptr.L || keys.ShiftLeft || joy.full > 0.6) && pl.st > 1 && !pl.shield;
  if (boost && !pl.boosting) sfx('dash', 0.5); pl.boosting = boost;
  pl.st = clamp(pl.st + (boost ? -26 : pl.shield ? -11 : 16) * dt, 0, 100);
  surface(pl.f, pl.u, _ps);
  // 카메라 기준 방향 → 혈관 벽 위의 이동 방향
  const fwdP = V3().copy(_ps.T).multiplyScalar(Math.cos(cam.yaw)).addScaledVector(_ps.lat, Math.sin(cam.yaw));
  const right = V3().crossVectors(fwdP, _ps.n).normalize();
  if (boost && mag === 0) { jy = -1; jx = 0; mag = 1; }
  if (mag > 0) {
    const d = V3().addScaledVector(fwdP, -jy).addScaledVector(right, jx).normalize();
    const want = Math.atan2(d.dot(_ps.lat), d.dot(_ps.T)); let dh = want - pl.hd; dh = Math.atan2(Math.sin(dh), Math.cos(dh)); pl.hd += clamp(dh, -5 * dt, 5 * dt);
  }
  if (G.t - cam.last > 2.5 && mag > 0.2) { let dc = pl.hd - cam.yaw; dc = Math.atan2(Math.sin(dc), Math.cos(dc)); cam.yaw += dc * (1 - Math.exp(-dt * 0.9)); }
  const lv = LEVELS[pl.level - 1], base = 6 + (pl.level - 1) * 0.4;
  let speed = mag * base * (boost ? (pl.level >= 4 ? 2.5 : 2.2) : 1) * (pl.slow > 0 ? 0.3 : 1);
  const mv = V3().copy(_ps.T).multiplyScalar(Math.cos(pl.hd)).addScaledVector(_ps.lat, Math.sin(pl.hd));
  const withFlow = Math.cos(pl.hd) * regionAt(pl.f).flow * 0.02; // 혈류를 따라가면 빨라져요
  pl.f = wrap01(pl.f + (mv.dot(_ps.T) * speed + withFlow * (speed > 0 ? 1 : 0.3)) * dt / LEN);
  pl.u += mv.dot(_ps.lat) * speed * dt;
  surface(pl.f, pl.u, _ps); pl.u = _ps.u;
  pl.pos.copy(_ps.pos); pl.n.copy(_ps.n); pl.fwd.copy(_ps.T).multiplyScalar(Math.cos(pl.hd)).addScaledVector(_ps.lat, Math.sin(pl.hd)).normalize();
  // 로봇 자세: 혈관 벽에 붙어서 걸어요
  const o = body.robot, up = V3().copy(pl.n), z = V3().copy(pl.fwd).addScaledVector(up, -pl.fwd.dot(up)).normalize(), x = V3().crossVectors(up, z);
  o.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, up, z));
  const walk = speed > 0.5 ? Math.abs(Math.sin(G.t * (boost ? 22 : 13))) * 0.08 : 0;
  o.position.copy(pl.pos).addScaledVector(pl.n, 0.62 + walk);
  o.userData.wrap.rotation.z = speed > 0.5 ? Math.sin(G.t * 13) * 0.05 : 0;
  body.shieldMesh.visible = pl.shield; if (pl.shield) body.shieldMesh.material.opacity = 0.18 + 0.08 * Math.sin(G.t * 10);
  if (boost && Math.random() < 0.5) burst(V3().copy(o.position).addScaledVector(pl.fwd, -0.8), 1, 1);
  pl.slow -= dt; pl.inv -= dt; pl.zapT -= dt;
  if (pl.level >= 5 || !G.infected) pl.hp = Math.min(pl.hpMax, pl.hp + dt * (pl.level >= 5 ? 3 : 1));
  // 자동 조준 레이저
  if (pl.zapT <= 0) {
    let best = -1, bd = lv.range * lv.range;
    viruses.forEach((v, i) => { const d2 = v.pos.distanceToSquared(o.position); if (d2 < bd) { bd = d2; best = i; } });
    if (best >= 0) zap(best); else body.beam.visible = false;
  }
  if (pl.zapT < lv.cd - 0.12) body.beam.visible = false;
  if (pl.hp <= 0) respawn();
}
function zap(i) {
  const v = viruses[i], lv = LEVELS[pl.level - 1]; pl.zapT = lv.cd;
  const p = body.beam.geometry.attributes.position, from = V3().copy(body.robot.position).addScaledVector(pl.n, 0.7);
  p.setXYZ(0, from.x, from.y, from.z); p.setXYZ(1, v.pos.x, v.pos.y, v.pos.z); p.needsUpdate = true; body.beam.visible = true;
  body.beam.material.color.set(v.variant && stage === 2 ? 0xffb060 : 0x9ff6ff);
  sfx('eat', 0.7, 1.6); burst(v.pos, 10, 3); viruses.splice(i, 1); stats.zapped++;
  genomes.push(genGenome(v.variant));
  const sp = new THREE.Sprite(body.pickMat); sp.scale.setScalar(0.8); sp.position.copy(v.pos); bs.add(sp); pickups.push({ sp, t: 0 });
  gainXP(2);
}
function hurt(dmg, quiet) {
  if (dmg <= 0 || G.respawning) return; pl.hp -= dmg;
  if (!quiet) { pl.inv = 1.0; pl.shake = 0.6; flash('rgba(255,40,60,.4)', 450); floatText('−' + Math.round(dmg), body.robot.position, '#ff5b6b', true); }
}
function gainXP(x) {
  pl.xp += x; const next = LEVELS[pl.level];
  if (next && pl.xp >= next.xp) { pl.level++; pl.hpMax = LEVELS[pl.level - 1].hp; pl.hp = pl.hpMax; sfx('molt'); burst(body.robot.position, 30, 4); banner('업그레이드!', LEVELS[pl.level - 1].name, '레이저 사거리·속도 향상', 2200); }
}
async function respawn() {
  if (G.respawning) return; G.respawning = true; G.playing = false; stats.deaths++;
  flash('rgba(0,0,0,1)', 1000); await sleep(700);
  pl.f = 0.02; pl.u = 0; pl.hp = pl.hpMax; pl.inv = 3; vital = Math.max(10, vital - 4);
  wbcs.forEach(w => { w.state = 'patrol'; w.cool = 5; });
  radio('로봇 손상! 주입 포트에서 다시 시작해요. 그동안 환자의 생명 신호가 조금 떨어졌어요.');
  G.playing = true; G.respawning = false;
}
function updateCamera(dt) {
  if (window.DBG.freeze) return;
  surface(pl.f, pl.u, _ps);
  const cf = V3().copy(_ps.T).multiplyScalar(Math.cos(cam.yaw) * Math.cos(cam.pitch)).addScaledVector(_ps.lat, Math.sin(cam.yaw) * Math.cos(cam.pitch)).addScaledVector(_ps.n, Math.sin(cam.pitch));
  const want = V3().copy(body.robot.position).addScaledVector(cf, -5.2).addScaledVector(_ps.n, 2.4);
  // 혈관 밖으로 나가지 않게
  const F = frame(pl.f), rel = V3().subVectors(want, F.P), along = rel.dot(F.T), radial = rel.addScaledVector(F.T, -along), R = F.R * 0.86;
  if (radial.length() > R) { radial.setLength(R); want.copy(F.P).addScaledVector(F.T, along).add(radial); }
  camera.position.lerp(want, 1 - Math.exp(-dt * 7));
  if (pl.shake > 0) { pl.shake -= dt; camera.position.addScaledVector(V3().randomDirection(), pl.shake * 0.4); }
  camera.up.copy(_ps.n).lerp(F.B, 0.5).normalize();
  camera.lookAt(V3().copy(body.robot.position).addScaledVector(cf, 3).addScaledVector(_ps.n, 0.8));
}

/* ---------------- 유전체 · 데이터 ---------------- */
const CONS = Array.from({ length: GENOME.regions }, () => Math.floor(Math.random() * 4));
const MUT = Array.from({ length: GENOME.regions }, (_, r) => GENOME.conserved.includes(r) ? 0.006 : rand(0.1, 0.42));
function genGenome(variant) {
  const g = new Uint8Array(GENOME.regions);
  for (let r = 0; r < GENOME.regions; r++) g[r] = Math.random() < MUT[r] * (variant ? 1.6 : 1) ? (CONS[r] + 1 + Math.floor(Math.random() * 3)) % 4 : CONS[r];
  return g;
}
function genPatients(n) {
  for (let i = 0; i < n; i++) { const x = Math.random(), g = x < GENOTYPE.AA.p ? 'AA' : x < GENOTYPE.AA.p + GENOTYPE.AG.p ? 'AG' : 'GG'; patients.push({ g, severe: Math.random() < GENOTYPE[g].severe }); }
}
const SEG = 48; let segV, segW, segC, predV;
function resetData() { segV = new Float32Array(SEG); segW = new Float32Array(SEG); segC = new Float32Array(SEG); predV = new Float32Array(SEG).fill(NaN); }
function sampleRow() {
  const reg = regionAt(pl.f), vNear = viruses.filter(v => v.pos.distanceToSquared(pl.pos) < 400).length, wNear = wbcs.filter(w => w.pos.distanceToSquared(pl.pos) < 900).length;
  const r = { t: stageT, f: pl.f, region: reg.name, virus: vNear, wbc: wNear, o2: reg.o2 - vNear * 0.25 + rand(-1, 1), temp: 37 + viruses.length / 45 + rand(-0.1, 0.1), flow: reg.flow + rand(-2, 2) };
  rows.push(r); const s = Math.floor(pl.f * SEG) % SEG; segV[s] += vNear; segW[s] += wNear; segC[s]++; G.row = r;
}
const accuracy = () => Math.round(100 * (1 - Math.exp(-(rows.length + genomes.length) / 650)));
function predict() {
  for (let s = 0; s < SEG; s++) { let a = 0, w = 0; for (let d = -3; d <= 3; d++) { const k = (s + d + SEG) % SEG; if (!segC[k]) continue; const ww = segC[k] / (1 + d * d); a += segV[k] / segC[k] * ww; w += ww; } predV[s] = w > 0.3 ? a / w : NaN; }
}

/* ---------------- 감염 세포: 샘플 채취 · 치료제 주입 ---------------- */
function scanDone(c) {
  c.scanned = true; c.prog = 0; stats.scanned++; sfx('probe');
  for (let k = 0; k < 40; k++) genomes.push(genGenome()); genPatients(500); gainXP(10);
  floatText('+40 유전체 · +500 진료 기록', c.pos, '#c58bff');
  const facts = ['감염 세포 안에서 바이러스가 자기 유전체를 복제하고 있어요. 유전체 40개를 확보했어요!', '세포 근처 의료 칩에서 환자 진료 기록 500건을 복구했어요. 유전형과 중증 여부가 들어 있어요.', '바이러스 유전체는 약 30,000개의 염기(A·T·G·C)로 되어 있어요. 사람 유전체는 약 30억 개예요!', '같은 바이러스라도 유전체가 조금씩 달라요. 이것을 “변이”라고 해요.', '샘플 5개 완료! 이제 이 데이터로 바이러스의 약점을 찾을 수 있어요.'];
  radio(`유전체 샘플 ${stats.scanned}/5 채취!\n${facts[Math.min(4, stats.scanned - 1)]}`, 7000);
}
function treatDone(c) {
  c.treated = true; c.prog = 0; stats.treated++; sfx('molt'); vital = Math.min(100, vital + 7); gainXP(12);
  c.mat.color.set(0xff9aa8); c.mat.emissive.set(0x401018); c.mat.emissiveIntensity = 0.3; c.light.color.set(0xff8090); c.light.intensity = 6; c.ring.material.color.set(0x5dff8a);
  for (let i = viruses.length - 1; i >= 0; i--) if (viruses[i].pos.distanceTo(c.pos) < 18) { burst(viruses[i].pos, 6, 2); viruses.splice(i, 1); }
  floatText('치료제 주입 완료!', c.pos, '#5dff8a');
  if (stats.treated === 2) { immune = true; radio('하나의 면역력이 돌아오고 있어요! 이제 백혈구가 박사님을 공격하지 않고, 바이러스만 잡아요.', 6500); }
  if (stats.treated === 3 && !variantOn) variantEvent();
}
function variantEvent() {
  variantOn = true; sfx('alert'); flash('rgba(255,150,40,.35)', 700);
  banner('경고!', '변이 바이러스 출현', '바이러스 유전체 일부가 바뀌었어요', 2600);
  viruses.forEach(v => { if (Math.random() < 0.5) v.variant = true; });
  for (let k = 0; k < 25; k++) spawnVirus(pl.f + rand(-0.1, 0.1), undefined, true);
  setTimeout(() => radio('주황색 바이러스는 변이체예요. 그런데 걱정 마세요! 우리가 고른 표적은 변하지 않는 “보존 구역”이라서, 치료제가 변이체에도 그대로 들어요. 빅데이터 분석이 미래를 대비한 거예요!', 9000), 2800);
}
function updateCells(dt) {
  for (const c of cells) {
    const d = c.pos.distanceTo(pl.pos), pulse = 0.5 + 0.5 * Math.sin(G.t * 3 + c.f * 20);
    if (!c.treated) { c.mat.emissiveIntensity = 0.5 + 0.6 * pulse; c.g.scale.setScalar(1 + 0.05 * pulse); c.ring.rotation.z += dt; }
    const target = stage === 1 ? !c.scanned : !c.treated;
    c.ring.visible = target || c.treated;
    if (G.playing && target && d < 5) {
      c.prog += dt / (stage === 1 ? 2.2 : 1.5);
      if (c.prog >= 1) stage === 1 ? scanDone(c) : treatDone(c);
    } else c.prog = Math.max(0, c.prog - dt);
    // 감염 세포는 바이러스를 계속 내보내요
    if (!c.treated && G.playing) { c.spawnT -= dt; if (c.spawnT <= 0) { c.spawnT = stage === 1 ? rand(3, 6) : rand(4, 8); if (viruses.length < targetVirus()) for (let k = 0; k < 3; k++) spawnVirus(c.f + rand(-0.006, 0.006), c.u + rand(-2, 2), variantOn && Math.random() < 0.5); } }
  }
}
const targetVirus = () => stage === 1 ? 55 + 70 * Math.min(1, stageT / 5) : 40 + 40 * (cells.filter(c => !c.treated).length / cells.length);

/* ---------------- 몸속 장면 진행 ---------------- */
let wbcN = 0;
function setupStage(s) {
  stage = s; stageT = 0; immune = false; variantOn = false;
  viruses.length = 0; pickups.forEach(p => bs.remove(p.sp)); pickups.length = 0;
  wbcs.forEach(w => { bs.remove(w.obj); bs.remove(w.bang); bs.remove(w.ring); }); wbcs.length = 0;
  pl.f = 0.02; pl.u = 0; pl.hd = 0; cam.yaw = 0; cam.pitch = -0.25; pl.hp = pl.hpMax; pl.st = 100; pl.inv = 2;
  for (let k = 0; k < 9; k++) wbcs.push(new WBC(k));
  for (let k = 0; k < (s === 1 ? 60 : 70); k++) { const c = cells[k % cells.length]; spawnVirus(Math.random() < 0.7 ? c.f + rand(-0.025, 0.025) : Math.random()); }
  if (s === 2) { cells.forEach(c => { c.prog = 0; }); vital = Math.min(vital, 48); }
  resetData(); radioQ.length = 0; G.missionDone = false;
  $('m-title').textContent = s === 1 ? '작전 1 · 유전체 수집' : '작전 2 · 치료제 투입';
  $('o-a').classList.remove('hidden'); $('o-b').classList.toggle('hidden', s === 2); $('o-home').classList.add('hidden');
}
let sampleT = 0, predT = 0, hudT = 0, mapT = 0, beatT = 0;
function updateBody(dt) {
  if (G.playing) {
    stageT += dt / 60;
    updatePlayer(dt);
    vital = clamp(vital - (viruses.length / 150) * (stage === 1 ? 0.12 : 0.07) * dt, 10, 100);
    sampleT -= dt; predT -= dt; if (sampleT <= 0) { sampleT = 0.5; sampleRow(); } if (predT <= 0) { predT = 2; predict(); }
    const done = stage === 1 ? stats.scanned >= 5 && stats.zapped >= 40 : stats.treated >= 6;
    if (done && !G.missionDone) { G.missionDone = true; sfx('molt'); radio(stage === 1 ? '샘플이 다 모였어요! 초록빛 주입 포트로 돌아와 데이터를 분석해요.' : '치료제 투입 완료! 주입 포트로 돌아가요!', 7000); $('o-home').classList.remove('hidden'); }
    if (G.missionDone && pl.pos.distanceTo(body.portPos) < 5) finishStage();
    beatT -= dt; if (beatT <= 0) { beatT = 0.86; sfx('heartbeat', 0.35); body.pulse = 1; } // 심장 박동
  }
  body.pulse = Math.max(0, (body.pulse || 0) - dt * 2.5); body.wallMat.emissiveIntensity = 0.45 + body.pulse * 0.5;
  updateViruses(dt); wbcs.forEach(w => w.update(G.playing ? dt : dt * 0.3)); updateCells(dt);
  G.chasing = wbcs.some(w => ['notice', 'chase', 'windup', 'lunge'].includes(w.state)); sound.chase(G.chasing && G.playing);
  // 적혈구 · 혈장의 흐름
  const M = new THREE.Matrix4(), S = new THREE.Vector3(), F = {}, p = V3();
  rbcs.forEach((r, i) => {
    r.f = wrap01(r.f + r.spd * regionAt(r.f).flow * dt / LEN); frame(r.f, F);
    p.copy(F.P).addScaledVector(F.N, Math.cos(r.a) * r.r * F.R).addScaledVector(F.B, Math.sin(r.a) * r.r * F.R);
    if (G.playing && p.distanceToSquared(pl.pos) < 2.5) { pl.u += (Math.random() - 0.5) * 0.2; }
    r.q.multiply(new THREE.Quaternion().setFromAxisAngle(r.w, dt * 0.8)); M.compose(p, r.q, S.set(r.s, r.s, r.s)); body.rbc.setMatrixAt(i, M);
  });
  body.rbc.instanceMatrix.needsUpdate = true;
  const pp = body.plasma.geometry.attributes.position;
  body.plasmaS.forEach((q, i) => { q.f = wrap01(q.f + regionAt(q.f).flow * 1.2 * dt / LEN); frame(q.f, F); p.copy(F.P).addScaledVector(F.N, Math.cos(q.a) * q.r * F.R).addScaledVector(F.B, Math.sin(q.a) * q.r * F.R); pp.setXYZ(i, p.x, p.y, p.z); });
  pp.needsUpdate = true;
  // 유전체 조각이 로봇으로 빨려 들어와요
  for (let i = pickups.length - 1; i >= 0; i--) { const k = pickups[i]; k.t += dt * 2.4; k.sp.position.lerp(body.robot.position, Math.min(1, k.t)); k.sp.scale.setScalar(0.8 * (1 - k.t * 0.6)); if (k.t >= 1) { bs.remove(k.sp); pickups.splice(i, 1); } }
  const b = body.bub, bp = b.pts.geometry.attributes.position;
  for (let i = 0; i < b.life.length; i++) { if (b.life[i] <= 0) { bp.setY(i, -999); continue; } b.life[i] -= dt; b.v[i].multiplyScalar(1 - dt * 2.5); bp.setXYZ(i, bp.getX(i) + b.v[i].x * dt, bp.getY(i) + b.v[i].y * dt, bp.getZ(i) + b.v[i].z * dt); }
  bp.needsUpdate = true;
  body.portBeam.material.opacity = (G.missionDone ? 0.28 : 0.1) + 0.06 * Math.sin(G.t * 3);
  updateCamera(dt);
  hudT -= dt; if (hudT <= 0) { hudT = 0.1; updateHUD(); }
  mapT -= dt; if (mapT <= 0) { mapT = 0.25; drawMinimap(); }
  updateMarkers(); updateLabels();
}

/* ---------------- HUD ---------------- */
function updateHUD() {
  const r = G.row; if (r) {
    $('sv-reg').textContent = r.region; $('sv-flow').textContent = Math.round(r.flow); $('sv-o2').textContent = Math.round(r.o2); $('sv-temp').textContent = r.temp.toFixed(1); $('sv-vir').textContent = fmt(r.virus * 1200); $('sv-imm').textContent = immune ? '회복' : r.wbc >= 2 ? '높음' : r.wbc === 1 ? '보통' : '낮음';
    $('sr-temp').className = 'srow ' + (r.temp > 38.5 ? 'bad' : r.temp > 37.8 ? 'warn' : 'ok'); $('sr-vir').className = 'srow ' + (r.virus > 6 ? 'bad' : r.virus > 2 ? 'warn' : 'ok');
  }
  const acc = accuracy();
  if (stage === 1) { $('v-a').textContent = `${stats.scanned} / 5`; $('o-a').querySelector('i').style.width = stats.scanned * 20 + '%'; $('l-a').textContent = '감염 세포 유전체 샘플'; $('o-a').classList.toggle('done', stats.scanned >= 5);
    $('v-b').textContent = `${Math.min(40, stats.zapped)} / 40`; $('o-b').querySelector('i').style.width = Math.min(100, stats.zapped / 40 * 100) + '%'; $('o-b').classList.toggle('done', stats.zapped >= 40); }
  else { $('v-a').textContent = `${stats.treated} / 6`; $('o-a').querySelector('i').style.width = stats.treated / 6 * 100 + '%'; $('l-a').textContent = '감염 세포 치료제 주입'; $('o-a').classList.toggle('done', stats.treated >= 6); }
  $('v-rows').textContent = `${fmt(genomes.length)}개 · ${fmt(rows.length)}행`; $('v-acc').textContent = acc + '%'; $('o-acc').querySelector('i').style.width = acc + '%';
  $('hp-i').style.width = clamp(pl.hp / pl.hpMax * 100, 0, 100) + '%'; $('v-hp').textContent = `${Math.max(0, Math.ceil(pl.hp))} / ${pl.hpMax}`;
  const cur = LEVELS[pl.level - 1], nxt = LEVELS[pl.level]; $('xp-i').style.width = (nxt ? clamp((pl.xp - cur.xp) / (nxt.xp - cur.xp) * 100, 0, 100) : 100) + '%'; $('v-stage').textContent = cur.name; $('st-i').style.width = pl.st + '%';
  $('vt-i').style.width = vital + '%'; $('v-vt').textContent = Math.round(vital) + '%'; $('status').classList.toggle('low', vital < 25 || pl.hp < pl.hpMax * 0.3);
  const chips = [];
  if (G.chasing) chips.push('<span class="chip red">백혈구가 박사님을 침입자로 착각했어요! 위장막(파란 버튼)</span>');
  if (pl.shield) chips.push('<span class="chip gold">위장막 작동 중 · 백혈구가 잘 못 알아봐요</span>');
  if (G.infected) chips.push('<span class="chip red">바이러스 접촉! 레이저로 없애거나 피하세요</span>');
  if (variantOn) chips.push('<span class="chip ai">변이 바이러스 출현 · 보존 구역 표적 치료제는 여전히 효과 있음</span>');
  if (vital < 25) chips.push('<span class="chip red">환자 생명 신호 위험!</span>');
  $('chips').innerHTML = chips.slice(0, 3).join('');
  $('vignette').style.boxShadow = `inset 0 0 160px 40px rgba(255,30,50,${G.chasing || pl.hp < pl.hpMax * 0.3 ? 0.35 + 0.15 * Math.sin(G.t * 8) : 0})`;
}
let mapBounds = null;
function drawMinimap() {
  const cv = $('minimap'), g = cv.getContext('2d'), W = cv.width, acc = accuracy();
  if (!mapBounds) { let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; FP.forEach(p => { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); }); const s = (W - 40) / Math.max(x1 - x0, z1 - z0); mapBounds = { x0, z0, s, ox: (W - (x1 - x0) * s) / 2, oz: (W - (z1 - z0) * s) / 2 }; }
  const M = mapBounds, X = p => M.ox + (p.x - M.x0) * M.s, Z = p => M.oz + (p.z - M.z0) * M.s;
  g.fillStyle = '#12040a'; g.fillRect(0, 0, W, W); g.lineCap = 'round';
  for (let s = 0; s < SEG; s++) {
    const a = FP[Math.floor(s / SEG * NS)], b = FP[Math.floor(((s + 1) % SEG) / SEG * NS)], v = predV[s];
    g.strokeStyle = isNaN(v) ? '#3a1a22' : `hsl(${clamp(120 - v * 14, 0, 120)},85%,${45 + acc * 0.1}%)`; g.globalAlpha = isNaN(v) ? 1 : clamp(0.35 + acc / 100, 0, 1);
    g.lineWidth = 16; g.beginPath(); g.moveTo(X(a), Z(a)); g.lineTo(X(b), Z(b)); g.stroke();
  }
  g.globalAlpha = 1;
  cells.forEach(c => { g.fillStyle = c.treated ? '#ff9aa8' : (stage === 1 && c.scanned) ? '#6a4a8a' : '#c58bff'; g.beginPath(); g.arc(X(c.pos), Z(c.pos), 9, 0, 7); g.fill(); });
  g.fillStyle = G.missionDone ? '#5dff8a' : '#2f8f55'; g.fillRect(X(body.portPos) - 8, Z(body.portPos) - 8, 16, 16);
  wbcs.forEach(w => { if (!immune && w.pos.distanceTo(pl.pos) < 70) { g.fillStyle = '#ff4f5e'; g.beginPath(); g.arc(X(w.pos), Z(w.pos), 6, 0, 7); g.fill(); } });
  g.fillStyle = '#fff'; g.beginPath(); g.arc(X(pl.pos), Z(pl.pos), 8, 0, 7); g.fill(); g.strokeStyle = '#5ff2ff'; g.lineWidth = 3; g.stroke();
  $('map-acc').textContent = acc < 20 ? '데이터 부족' : `AI 예측 정확도 ${acc}%`;
}
function project(wp) { const v = wp.clone().project(camera); return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight, behind: v.z > 1, nx: v.x, ny: v.y }; }
function placeMarker(el, wp, show, label) {
  if (!show) { el.classList.add('hidden'); return; }
  const v = wp.clone().project(camera); let x = v.x, y = v.y; if (v.z > 1) { x = -x; y = -y; }
  if (v.z > 1 || Math.abs(x) > 0.72 || Math.abs(y) > 0.6) { const m = Math.max(Math.abs(x) / 0.72, Math.abs(y) / 0.6); x /= m; y /= m; }
  el.classList.remove('hidden'); el.style.left = ((x + 1) / 2 * innerWidth) + 'px'; el.style.top = ((1 - y) / 2 * innerHeight) + 'px'; el.querySelector('span').textContent = label;
}
function updateMarkers() {
  const left = cells.filter(c => stage === 1 ? !c.scanned : !c.treated).sort((a, b) => a.pos.distanceTo(pl.pos) - b.pos.distanceTo(pl.pos));
  const c = left[0];
  placeMarker($('mk-cell'), c ? c.pos : pl.pos, G.playing && !!c && !G.missionDone, c ? (c.prog > 0 ? `${stage === 1 ? '샘플 채취' : '치료제 주입'} ${Math.round(c.prog * 100)}%` : `감염 세포 ${Math.round(c.pos.distanceTo(pl.pos))}m`) : '');
  placeMarker($('mk-home'), body.portPos, G.playing && G.missionDone, `주입 포트 ${Math.round(body.portPos.distanceTo(pl.pos))}m`);
  const threats = wbcs.filter(w => ['notice', 'chase', 'windup', 'lunge'].includes(w.state));
  document.querySelectorAll('.threat').forEach((el, i) => {
    const w = threats[i]; if (!w || !G.playing) { el.classList.add('hidden'); return; }
    const p = project(w.pos); if (!p.behind && Math.abs(p.nx) < 0.9 && Math.abs(p.ny) < 0.85) { el.classList.add('hidden'); return; }
    let x = p.behind ? -p.nx : p.nx, y = p.behind ? -p.ny : p.ny; const m = Math.max(Math.abs(x) / 0.88, Math.abs(y) / 0.8); x /= m; y /= m;
    el.classList.remove('hidden'); el.style.left = ((x + 1) / 2 * innerWidth) + 'px'; el.style.top = ((1 - y) / 2 * innerHeight) + 'px';
  });
}
function updateLabels() {
  const items = [];
  wbcs.forEach(w => items.push({ p: w.pos, d: w.pos.distanceTo(pl.pos), n: '백혈구 (면역 세포)', t: immune ? ['eat', '이제 우리 편이에요'] : ['bad', '박사님을 침입자로 착각해요'] }));
  cells.forEach(c => items.push({ p: c.pos, d: c.pos.distanceTo(pl.pos), n: c.treated ? '치료된 세포' : '감염 세포', t: c.treated ? ['eat', '회복 중'] : ['meh', stage === 1 ? (c.scanned ? '샘플 채취 완료' : '가까이 가면 샘플 채취') : '가까이 가면 치료제 주입'] }));
  const near = items.filter(i => i.d < 16).sort((a, b) => a.d - b.d).slice(0, 3);
  document.querySelectorAll('.clabel').forEach((el, i) => {
    const it = near[i]; if (!it || !G.playing) { el.classList.add('hidden'); return; }
    const p = project(V3().copy(it.p).addScaledVector(pl.n, 3)); if (p.behind) { el.classList.add('hidden'); return; }
    el.className = 'clabel ' + it.t[0]; el.innerHTML = `${it.n}<small>${it.t[1]}</small>`; el.style.left = p.x + 'px'; el.style.top = p.y + 'px';
  });
}
let toastTimer; const radioQ = []; let radioBusy = false;
function toast(msg, tone = '') { const t = $('toast'); t.textContent = msg; t.className = 'panel show ' + tone; clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2400); }
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
   흐름
   ========================================================= */
const G = { mode: 'title', playing: false, t: 0, name: 'K' };
let active = lab.scene;
window.G = G; window.DBG = { pl, body, camera, THREE, viruses, wbcs, cells, stats, cam, joy, keys, ptr, setActive: s => { active = s; } };
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
  await doWarp('0.005 mm', 'NANO MODE · 나노화 진행', 0x7dffb0);
  startStage(1);
}
async function startStage(s) {
  setupStage(s); G.mode = 'body'; active = bs; G.playing = false; renderer.toneMappingExposure = 1; $('hud').classList.remove('hidden'); sound.music('body', 2);
  for (let k = 0; k < 30; k++) { surface(pl.f, pl.u, _ps); body.robot.position.copy(_ps.pos).addScaledVector(_ps.n, 0.6); updateCamera(0.05); }
  updateHUD(); drawMinimap();
  banner(s === 1 ? 'MISSION 1' : 'MISSION 2', s === 1 ? '유전체 데이터 수집' : '치료제 투입 작전', s === 1 ? '감염 세포 샘플 5개 · 바이러스 유전체 40개' : '감염 세포 6곳에 치료제 주입'); await sleep(1800);
  const howto = IS_TOUCH ? `조작법 (1차시와 같아요)
· 왼쪽 화면: 조이스틱으로 이동 (끝까지 밀고 있으면 자동 가속)
· 오른쪽 화면 끌기: 시점 돌리기   · 노란 버튼: 돌진   · 파란 버튼: 위장막
· 혈관 벽을 타고 옆으로 올라갈 수도 있어요. 레이저는 자동으로 조준해요.`
    : `조작법 (1차시와 같아요)
· WASD/방향키: 이동   · 마우스 끌기: 시점 돌리기   · 스페이스/Shift: 돌진   · E: 위장막
· 혈관 벽을 타고 옆으로 올라갈 수도 있어요. 레이저는 자동으로 조준해요.`;
  await say(s === 1 ? STORY.body1.concat([{ who: '시스템', text: howto }]) : STORY.body2);
  G.playing = true;
}
function finishStage() {
  G.playing = false; G.mode = 'analysis'; sound.chase(false); sound.music('analysis', 1.5); $('hud').classList.add('dim');
  if (stage === 1) {
    openGenome({ sub: `바이러스 유전체 ${fmt(genomes.length)}개 · 진료 기록 ${fmt(patients.length)}건`, genomes, patients, rows: rows.length, sfx: n => sfx(n),
      onDone: v => { voteChoice = v; openDrug({ sub: '유전체 분석으로 찾은 표적: ' + GENOME.targetName, sfx: n => sfx(n), onDone: () => { $('hud').classList.remove('dim'); startStage(2); } }); } });
  } else ending();
}
async function ending() {
  $('hud').classList.add('hidden'); await doWarp('100 %', 'NANO MODE OFF · 원래 크기로', 0x7dffb0);
  G.mode = 'lab'; active = lab.scene; setLabMood(true); lab.pod.color.set(0x9fffcf); startLabCamera('pod'); sound.music('ending', 2);
  await sleep(600);
  await say(STORY.ending2187.map(l => l.who === 'VOTE' ? { who: 'ARIA', text: `그리고 박사님은 유전체 데이터 공유를 이렇게 결정했어요. “${VOTE.opts[voteChoice].t}”\n${VOTE.opts[voteChoice].r}` } : l));
  await doWarp('2026', 'RETURN · 원래 시대로', 0x5ff2ff);
  G.mode = 'lab'; setLabMood(false); startLabCamera(); active = lab.scene;
  const mins = Math.round((performance.now() - stats.start) / 60000);
  $('end-stats').innerHTML = [[fmt(genomes.length), '분석한 바이러스 유전체'], [fmt(patients.length), '복구한 진료 기록'], [stats.zapped, '없앤 바이러스'], [LEVELS[pl.level - 1].name.split(' · ')[0], '로봇 최종 단계'], [mins + '분', '작전 시간']].map(([b, s]) => `<div><b>${b}</b><span>${s}</span></div>`).join('');
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
  sound.probe(); buildLab(); buildBody(); startLabCamera();
  renderer.compile(bs, camera); renderer.compile(lab.scene, camera);
  $('loading').classList.add('hidden'); $('startbox').classList.remove('hidden');
  $('screen').style.background = 'radial-gradient(ellipse at 50% 30%,rgba(10,2,4,.35),rgba(10,2,4,.92) 70%)';
  requestAnimationFrame(loop);
  const go = async () => {
    G.name = $('pname').value.trim() || 'K'; $('screen').classList.add('hidden'); stats.start = performance.now(); sound.unlock();
    if (IS_TOUCH) { const de = document.documentElement; try { (de.requestFullscreen || de.webkitRequestFullscreen)?.call(de)?.catch?.(() => { }); } catch (_) { } try { screen.orientation?.lock?.('landscape').catch(() => { }); } catch (_) { } }
    const wake = async () => { try { await navigator.wakeLock?.request('screen'); } catch (_) { } }; wake(); document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') wake(); });
    if (P.get('stage') === '2') { for (let k = 0; k < 240; k++) genomes.push(genGenome()); genPatients(2500); stats.scanned = 5; stats.zapped = 40; cells.slice(0, 5).forEach(c => c.scanned = true); await doWarp('0.005 mm', 'TEACHER MODE', 0x7dffb0); startStage(2); }
    else if (P.has('skip')) { await doWarp('0.005 mm', 'NANO MODE', 0x7dffb0); startStage(1); }
    else intro();
  };
  $('startbtn').onclick = go; $('pname').addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
})();
