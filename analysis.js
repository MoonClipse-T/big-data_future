/* =========================================================
   분석실 — ① 유전체 분석실  ② AI 신약 설계실  (단계별 안내형)
   ========================================================= */
import { GENOME, GENOTYPE, VOTE } from './content.js';

const $ = id => document.getElementById(id);
const fmt = n => Math.round(n).toLocaleString('ko-KR');
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
let A = null;

function setup(ctx, title, steps) {
  A = { ...ctx, step: 0, steps };
  $('an-title').textContent = title; $('an-era').textContent = ctx.sub || '';
  $('analysis').classList.remove('hidden'); render();
}
function render() {
  $('an-steps').innerHTML = A.steps.map((s, i) => `<span class="${i === A.step ? 'on' : i < A.step ? 'done' : ''}">${s[0]}</span>`).join('');
  $('an-next').classList.add('hidden'); A.redraw = null;
  A.steps[A.step][1](); $('analysis').querySelector('.box').scrollTop = 0;
}
function showNext(label, fn) {
  const b = $('an-next'); b.textContent = label; b.classList.remove('hidden');
  b.onclick = () => { A.sfx('click'); fn ? fn() : (A.step++, render()); };
  setTimeout(() => b.scrollIntoView({ behavior: 'smooth', block: 'end' }), 300);
}
function countUp(el, to) { const t0 = performance.now(); const tick = () => { const k = Math.min(1, (performance.now() - t0) / 1400); el.textContent = fmt(to * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(tick); }; tick(); }
function sizeCanvas(cv, ratio) { const dpr = Math.min(2, devicePixelRatio), W = cv.clientWidth || 400, H = W * ratio; cv.style.height = H + 'px'; cv.width = W * dpr; cv.height = H * dpr; const g = cv.getContext('2d'); g.scale(dpr, dpr); g.clearRect(0, 0, W, H); return g; }
function questions(box, qs, done) {
  let i = 0;
  const show = () => {
    const q = qs[i];
    box.innerHTML = `<div class="card"><h3>질문 ${i + 1} / ${qs.length}</h3><div class="q">${q.q}</div>
      <div class="opts">${q.opts.map((o, k) => `<button class="opt" data-k="${k}">${'①②③④'[k]} ${o}</button>`).join('')}</div><div class="fbx"></div></div>`;
    box.querySelectorAll('.opt').forEach(b => b.onclick = () => {
      const k = +b.dataset.k;
      if (k === q.a) {
        b.classList.add('right'); A.sfx('correct'); box.querySelectorAll('.opt').forEach(x => x.disabled = true);
        box.querySelector('.fbx').innerHTML = `<div class="fb ok">${q.ok}</div>` + (i < qs.length - 1 ? '<button class="btn small" id="qnext">다음 질문 ▶</button>' : '');
        if (i < qs.length - 1) $('qnext').onclick = () => { i++; show(); }; else done();
      } else { b.classList.add('wrong'); A.sfx('wrong'); box.querySelector('.fbx').innerHTML = `<div class="fb no">다시 생각해 봐요. 힌트: ${q.no}</div>`; }
    });
  };
  show();
}

/* =========================================================
   ① 유전체 분석실
   ========================================================= */
export function openGenome(ctx) {
  setup(ctx, '유전체 분석실', [['① 내가 모은 빅데이터', gVolume], ['② 치료제 표적 찾기', gConserved], ['③ 개인 위험 예측', gRisk], ['④ 데이터 공유 결정', gVote]]);
}
function gVolume() {
  const n = A.genomes.length, bases = n * 30000, recs = A.patients.length;
  $('an-body').innerHTML = `
    <div class="lead">하나의 몸속에서 모은 데이터예요. 유전체는 데이터 하나하나가 엄청나게 커서, 몇 개만 모아도 <b>빅데이터</b>가 돼요.</div>
    <div class="v3">
      <div class="vcard"><div class="vk">양 · Volume</div><div class="vbig mono" id="c1">0</div><div class="vs">개의 바이러스 X 유전체 (하나에 약 30,000개 염기)</div>
        <div class="vbig2 mono" id="c2">0</div><div class="vs">개 염기 = 글자 수로 치면 소설책 ${fmt(bases / 300000)}권 분량</div></div>
      <div class="vcard"><div class="vk">다양성 · Variety</div>
        <div class="chips2">${['바이러스 유전체', '환자 유전형', '중증 여부', '혈중 산소', '체온', '혈류 속도', '바이러스 농도', '면역 반응'].map(v => `<span>${v}</span>`).join('')}</div>
        <div class="vs" style="margin-top:8px">환자 진료 기록 <b>${fmt(recs)}건</b> (감염 세포 근처 데이터 저장 장치에서 복구)</div></div>
      <div class="vcard"><div class="vk">속도 · Velocity</div><div class="vbig mono">0.5<small>초</small></div><div class="vs">마다 몸 센서 1행 · 지금까지 ${fmt(A.rows)}행</div>
        <div class="vnote">사람이 유전체 글자를 1초에 1개씩 읽으면 쉬지 않고 읽어도 약 <b>${bases / 86400 >= 365 ? (bases / 86400 / 365).toFixed(1) + '년' : fmt(bases / 86400) + '일'}</b>이 걸려요! (사람 유전체 1개는 약 95년)</div></div>
    </div>`;
  countUp($('c1'), n); countUp($('c2'), bases);
  showNext('다음: 치료제 표적 찾기 ▶');
}
// 구역별 변이율 = 다수(기준) 염기와 다른 유전체의 비율
function variability(gs) {
  const R = GENOME.regions, out = new Float32Array(R);
  for (let r = 0; r < R; r++) { const c = [0, 0, 0, 0]; gs.forEach(g => c[g[r]]++); out[r] = gs.length ? 1 - Math.max(...c) / gs.length : 0; }
  return out;
}
const BASE_COL = ['#5dff8a', '#5ff2ff', '#ffd66b', '#ff6b8a'];
function gConserved() {
  $('an-body').innerHTML = `
    <div class="an-grid">
      <div><div class="ctitle">바이러스 X 유전체 비교 · 변하지 않는 구역 찾기</div>
        <canvas id="barcode"></canvas><canvas id="varcv"></canvas>
        <div class="slider">비교할 유전체 수 <input type="range" id="g-n" min="0" max="100" value="100"><b id="g-nv" class="mono"></b></div></div>
      <div><div class="guide"><b>이렇게 보세요</b><ol>
        <li>위 <b>바코드</b>의 한 줄 = 바이러스 유전체 1개, 한 칸 = 유전체의 한 구역이에요. 색이 다르면 그 구역이 변이된 거예요.</li>
        <li>아래 막대 = 각 구역의 <b>변이율</b>이에요. 막대가 낮을수록 잘 변하지 않는 구역이에요.</li>
        <li>슬라이더로 비교할 유전체 수를 바꿔 보세요.</li></ol></div><div id="qbox"></div></div>
    </div>`;
  const all = A.genomes;
  const draw = () => {
    const k = +$('g-n').value / 100, n = Math.max(4, Math.round(4 * Math.pow(all.length / 4, k))), gs = all.slice(0, n);
    $('g-nv').textContent = `${fmt(n)}개`;
    // 바코드
    const cv = $('barcode'), g = sizeCanvas(cv, 0.32), W = cv.clientWidth, H = W * 0.32, R = GENOME.regions, L = 44, cw = (W - L - 8) / R, rowsShown = Math.min(gs.length, 18), rh = (H - 18) / rowsShown;
    g.fillStyle = '#8fb3c2'; g.font = '11px "Noto Sans KR"'; g.textAlign = 'right';
    for (let i = 0; i < rowsShown; i++) { for (let r = 0; r < R; r++) { g.fillStyle = BASE_COL[gs[i][r]]; g.globalAlpha = 0.85; g.fillRect(L + r * cw, 4 + i * rh, cw - 0.6, rh - 0.6); } }
    g.globalAlpha = 1; g.fillStyle = '#8fb3c2'; g.fillText('유전체', L - 6, 14); g.fillText(gs.length > rowsShown ? `+${fmt(gs.length - rowsShown)}` : '', L - 6, H - 8);
    // 변이율 막대
    const v = variability(gs), cv2 = $('varcv'), g2 = sizeCanvas(cv2, 0.38), W2 = cv2.clientWidth, H2 = W2 * 0.38, T = 16, B = 26, ph = H2 - T - B;
    g2.strokeStyle = 'rgba(255,255,255,.08)'; g2.fillStyle = '#8fb3c2'; g2.font = '11px "JetBrains Mono"'; g2.textAlign = 'right';
    [0, 0.25, 0.5].forEach(t => { const y = T + ph * (1 - t / 0.5); g2.beginPath(); g2.moveTo(L, y); g2.lineTo(W2 - 8, y); g2.stroke(); g2.fillText(Math.round(t * 100) + '%', L - 6, y + 4); });
    for (let r = 0; r < R; r++) { const h = ph * clamp(v[r] / 0.5, 0, 1), x = L + r * cw; g2.fillStyle = v[r] < 0.04 ? '#5dff8a' : '#ff8a5b'; g2.fillRect(x, T + ph - h, cw - 1.5, Math.max(1.5, h)); }
    g2.fillStyle = '#e8f6fb'; g2.textAlign = 'center'; g2.font = '11px "Noto Sans KR"';
    for (let r = 0; r < R; r += 5) g2.fillText(r + '번', L + r * cw + cw / 2, H2 - 8);
    g2.textAlign = 'left'; g2.fillStyle = '#5dff8a'; g2.fillText('초록 = 변이율 4% 미만 (거의 안 변함)', L + 4, T - 3);
  };
  $('g-n').oninput = draw; draw(); A.redraw = draw;
  questions($('qbox'), [
    { q: '유전체를 <b>몇 개만</b> 비교할 때와 <b>전체</b>를 비교할 때, 어느 쪽이 정말로 변하지 않는 구역을 정확히 찾나요?', opts: ['몇 개만 비교할 때', '전체(빅데이터)를 비교할 때', '차이가 없다'], a: 1, ok: '맞아요! 유전체를 몇 개만 보면 우연히 같아 보이는 구역이 초록색으로 많이 나타나요. 데이터가 많아야 진짜 “보존 구역”만 남아요.', no: '슬라이더를 왼쪽 끝으로 옮겼을 때 초록 막대가 몇 개인지, 오른쪽 끝일 때와 비교해 보세요.' },
    { q: '치료제는 바이러스의 어느 부분을 노려야 할까요?', opts: [`변이가 거의 없는 보존 구역 (${GENOME.targetName})`, '변이가 가장 많은 구역', '아무 곳이나 상관없다'], a: 0, ok: '정답! 보존 구역은 바이러스가 세포에 들어가는 데 꼭 필요해서 거의 바뀌지 않아요. 여기를 노리면 바이러스가 변이해도 치료제가 계속 효과를 낼 수 있어요.', no: '바이러스가 변이할 때마다 치료제가 안 듣게 되면 곤란하겠죠? 잘 변하지 않는 곳을 떠올려 보세요.' },
  ], () => showNext('다음: 개인 위험 예측 ▶'));
}
function gRisk() {
  const P = A.patients, types = ['AA', 'AG', 'GG'];
  const st = types.map(t => { const ps = P.filter(p => p.g === t); return { t, n: ps.length, rate: ps.length ? ps.filter(p => p.severe).length / ps.length : 0 }; });
  $('an-body').innerHTML = `
    <div class="an-grid">
      <div><div class="ctitle">환자 ${fmt(P.length)}명의 유전체와 진료 기록 비교 · 면역 유전자 IFN-7</div><canvas id="riskcv"></canvas>
        <div class="mycard"><div class="vk">박사님의 유전체 카드</div><div class="geno"><span>IFN-7 유전형</span><b class="mono">GG</b></div><div class="vs">나노 로봇에 연결할 때 측정한 박사님의 유전 정보예요.</div></div></div>
      <div><div class="guide"><b>이렇게 보세요</b><ol><li>막대 하나 = 같은 유전형을 가진 환자 그룹이에요.</li><li>막대 높이 = 그 그룹에서 <b>중증으로 진행된 비율</b>이에요.</li><li>막대 아래 숫자는 그 그룹의 환자 수예요.</li></ol></div><div id="qbox"></div></div>
    </div>`;
  const cv = $('riskcv'), draw = () => {
    const g = sizeCanvas(cv, 0.62), W = cv.clientWidth, H = W * 0.62, L = 46, B = 48, T = 26, mx = 0.5, bw = (W - L - 20) / 3;
    g.font = '12px "Noto Sans KR"'; g.textAlign = 'right'; g.fillStyle = '#8fb3c2';
    [0, 0.25, 0.5].forEach(v => { const y = T + (H - T - B) * (1 - v / mx); g.fillText(Math.round(v * 100) + '%', L - 6, y + 4); g.strokeStyle = 'rgba(255,255,255,.07)'; g.beginPath(); g.moveTo(L, y); g.lineTo(W - 10, y); g.stroke(); });
    st.forEach((s, i) => {
      const x = L + i * bw + bw * 0.2, w = bw * 0.6, h = (H - T - B) * clamp(s.rate / mx, 0, 1), y = H - B - h;
      g.fillStyle = s.t === 'GG' ? '#ff6b7a' : s.t === 'AG' ? '#ffb547' : '#5dff8a'; g.fillRect(x, y, w, h);
      g.fillStyle = '#fff'; g.textAlign = 'center'; g.font = '700 15px "JetBrains Mono"'; g.fillText(Math.round(s.rate * 100) + '%', x + w / 2, y - 6);
      g.font = '700 13px "JetBrains Mono"'; g.fillStyle = '#e8f6fb'; g.fillText(s.t + ' 형', x + w / 2, H - B + 18);
      g.font = '11px "Noto Sans KR"'; g.fillStyle = '#8fb3c2'; g.fillText(`${fmt(s.n)}명`, x + w / 2, H - B + 34);
    });
  };
  draw(); A.redraw = draw;
  const gg = st[2];
  questions($('qbox'), [
    { q: '데이터로 볼 때, 유전형이 <b>GG</b>인 박사님이 바이러스 X에 감염되면 중증이 될 위험은?', opts: ['낮다 (AA 그룹과 비슷하다)', '중간이다', '높다 (가장 위험한 그룹이다)'], a: 2, ok: `맞아요. GG 그룹은 ${Math.round(gg.rate * 100)}%가 중증으로 진행됐어요. 이렇게 유전체 분석으로 <b>개인에게 발생 가능한 질병 위험을 예측</b>하면, 위험이 높은 사람에게 먼저 백신과 치료제를 주는 <b>맞춤 의료</b>가 가능해요.`, no: '세 막대 중 GG 막대의 높이를 다른 막대와 비교해 보세요.' },
  ], () => showNext('다음: 데이터 공유 결정 ▶'));
}
function gVote() {
  $('an-body').innerHTML = `<div class="votebox"><div class="lead">${VOTE.q}</div>
    <div class="opts">${VOTE.opts.map((o, k) => `<button class="opt" data-k="${k}">${'①②③'[k]} ${o.t}</button>`).join('')}</div>
    <div class="fbx"></div><div class="note">정답이 없는 질문이에요. 반 친구들과 이유를 이야기해 보세요. (빅데이터의 문제점: 사생활 침해 가능성)</div></div>`;
  $('an-body').querySelectorAll('.opt').forEach(b => b.onclick = () => {
    const k = +b.dataset.k; A.vote = k; A.sfx('click');
    $('an-body').querySelectorAll('.opt').forEach(x => x.classList.toggle('right', x === b));
    $('an-body').querySelector('.fbx').innerHTML = `<div class="fb ok">선택을 기록했어요. 이 선택은 엔딩에서 결과로 이어져요.</div>`;
    showNext('AI 신약 설계실로 ▶', () => { $('analysis').classList.add('hidden'); A.onDone(A.vote); });
  });
}

/* =========================================================
   ② AI 신약 설계실
   ========================================================= */
const FILTERS = [
  { t: '표적(보존 구역)에 꼭 맞는 모양인가?', n: 12400, why: '유전체 분석으로 찾은 스파이크 결합 부위의 3D 모양과 비교' },
  { t: '사람 몸에 독성이 낮은가?', n: 830, why: '과거 약물 실험 데이터 2억 건으로 학습한 AI가 예측' },
  { t: '몸속에서 오래 버티는가?', n: 41, why: '혈류 속도·간 대사 데이터로 지속 시간 계산' },
  { t: '알려진 부작용과 비슷하지 않은가?', n: 3, why: '전 세계 부작용 보고 기록 수천만 건과 비교' },
];
const CANDS = [
  { name: '후보 A · XR-112', bind: 93, tox: 72, dur: 58 },
  { name: '후보 B · XR-207', bind: 88, tox: 12, dur: 76 },
  { name: '후보 C · XR-350', bind: 41, tox: 8, dur: 90 },
];
export function openDrug(ctx) { setup(ctx, 'AI 신약 설계실', [['① 후보 물질 거르기', dFunnel], ['② 치료제 고르기', dChoose]]); }
function dFunnel() {
  let i = 0, n = 1000000;
  $('an-body').innerHTML = `<div class="lead">AI가 화합물 데이터베이스에서 치료제 후보 <b>100만 개</b>를 불러왔어요. 버튼을 순서대로 눌러 조건에 맞지 않는 후보를 걸러 보세요.</div>
    <div class="funnel"><div class="fcount"><span class="mono" id="fnum">1,000,000</span><small>개 남음</small></div><div class="fbar"><i id="fbar"></i></div>
    <div id="flist"></div><button class="btn" id="fbtn"></button></div><div id="fdone"></div>`;
  const upd = () => {
    $('flist').innerHTML = FILTERS.slice(0, i).map(f => `<div class="fstep">✔ ${f.t} <span class="mono">→ ${fmt(f.n)}개</span><small>${f.why}</small></div>`).join('');
    if (i < FILTERS.length) $('fbtn').textContent = `조건 ${i + 1}: ${FILTERS[i].t}`;
    else { $('fbtn').classList.add('hidden'); $('fdone').innerHTML = `<div class="aiuse">AI가 걸린 시간 <b>약 18시간</b> · 사람이 후보를 하루에 1개씩 실험했다면 <b>약 2,740년</b>! 빅데이터와 AI 덕분에 신약 개발 기간을 크게 줄일 수 있어요.</div>`; showNext('다음: 치료제 고르기 ▶'); }
  };
  $('fbtn').onclick = () => {
    const from = n, to = FILTERS[i].n, t0 = performance.now(); A.sfx('click'); i++;
    const tick = () => { const k = Math.min(1, (performance.now() - t0) / 900); n = Math.round(from - (from - to) * (1 - Math.pow(1 - k, 3))); $('fnum').textContent = fmt(n); $('fbar').style.width = (Math.log10(Math.max(1, n)) / 6 * 100) + '%'; if (k < 1) requestAnimationFrame(tick); else upd(); };
    tick();
  };
  $('fbar').style.width = '100%'; upd();
}
function dChoose() {
  $('an-body').innerHTML = `<div class="an-grid"><div><div class="ctitle">마지막 후보 3개 비교</div><canvas id="candcv"></canvas>
    <div class="note">결합력·지속 시간은 높을수록, 독성은 낮을수록 좋아요.</div></div><div><div id="qbox"></div></div></div>`;
  const cv = $('candcv'), draw = () => {
    const g = sizeCanvas(cv, 0.62), W = cv.clientWidth, H = W * 0.62, L = 110, R = 50, keys = [['bind', '결합력', '#5ff2ff'], ['tox', '독성', '#ff6b7a'], ['dur', '지속 시간', '#ffd66b']], rh = (H - 10) / CANDS.length;
    CANDS.forEach((c, i) => {
      const y0 = 6 + i * rh; g.fillStyle = '#e8f6fb'; g.font = '700 13px "Noto Sans KR"'; g.textAlign = 'left'; g.fillText(c.name, 0, y0 + 16);
      keys.forEach(([k, n, col], j) => { const y = y0 + 26 + j * 18, w = (W - L - R) * c[k] / 100; g.fillStyle = '#8fb3c2'; g.font = '11.5px "Noto Sans KR"'; g.fillText(n, 8, y + 10); g.fillStyle = col; g.fillRect(L, y, w, 12); g.fillStyle = '#fff'; g.font = '11px "JetBrains Mono"'; g.fillText(c[k], L + w + 6, y + 10); });
    });
  };
  draw(); A.redraw = draw;
  questions($('qbox'), [
    { q: '세 후보 중 하나의 몸에 넣을 치료제로 가장 알맞은 것은?', opts: CANDS.map(c => c.name), a: 1, ok: '정답! 후보 B는 표적에 잘 결합하면서 독성이 낮고 오래 버텨요. 후보 A는 효과는 좋지만 독성이 너무 높고, 후보 C는 안전하지만 바이러스에 잘 붙지 못해요.', no: '효과(결합력)만 보지 말고, 몸에 해로운 정도(독성)도 함께 비교해 보세요.' },
  ], () => showNext('치료제 탑재! 몸속으로 ▶', () => { $('analysis').classList.add('hidden'); A.onDone(); }));
}
addEventListener('resize', () => { if (A && A.redraw && !$('analysis').classList.contains('hidden')) A.redraw(); });
