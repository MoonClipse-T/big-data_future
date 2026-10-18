/* =========================================================
   분석실 — 실제 유전체 분석·신약 개발 과정을 그대로 따라 해 봐요 (단계별 안내형)
   ① 혈관 뒤: 바이러스 정체 밝히기 (유전체 조립 → 데이터베이스 비교 → 변이 위치)
   ② 심장 뒤: 누가 위험할까 (데이터 정제 → 중증·경증 비교 → 개인 위험 예측 → 공유 결정)
   ③ 뇌 뒤:   치료제 개발 (표적 정하기 → AI 가상 실험 → 임상 시험 데이터)
   ========================================================= */
import { VOTE } from './content.js';

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
const finish = (...args) => { $('analysis').classList.add('hidden'); A.onDone(...args); };
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
const BASE_COL = { A: '#5dff8a', T: '#ff6b8a', G: '#ffd66b', C: '#5ff2ff' };
const seqHTML = (s, ref) => [...s].map((c, i) => `<span style="color:${ref ? (ref[i] === c ? BASE_COL[c] : '#ff3b55') : BASE_COL[c]};${ref && ref[i] !== c ? 'background:rgba(255,59,85,.25);border-radius:3px' : ''}">${c}</span>`).join('');

/* =========================================================
   ① 바이러스 X의 정체 (혈관 작전 뒤)
   ========================================================= */
export function openIdentify(ctx) {
  setup(ctx, '유전체 분석실 · 바이러스 X의 정체', [['① 유전체 조립', iAssemble], ['② 데이터베이스 비교', iCompare], ['③ 무엇이 바뀌었나', iMutation]]);
}
// 실제 조각: ATGCCGTT + GTTAGGAC + GACTTCAG → ATGCCGTTAGGACTTCAG (겹치는 글자 GTT, GAC)
const FRAGS = ['GTTAGGAC', 'GACTTCAG', 'ATGCCGTT'], ORDER = [2, 0, 1], OVER = [0, 3, 3];
function iAssemble() {
  $('an-body').innerHTML = `
    <div class="lead">바이러스 샘플을 기계로 읽으면(<b>시퀀싱</b>) 긴 유전체가 짧은 <b>조각</b>으로 잘려 나와요. 조각끼리 <b>겹치는 글자</b>를 찾아 이어 붙이면 전체 유전체가 완성돼요.</div>
    <div class="v3">
      <div class="vcard"><div class="vk">박사님이 모은 데이터</div><div class="vbig mono" id="c1">0</div><div class="vs">개의 유전체 조각 (조각 하나 = 150글자)</div>
        <div class="vbig2 mono" id="c2">0</div><div class="vs">글자 (바이러스 X 유전체 하나 = 약 30,000글자)</div></div>
      <div class="vcard" style="grid-column:span 2"><div class="vk">직접 해 보기 · 조각 이어 붙이기</div>
        <div class="vs">유전체는 <b class="mono">ATG</b>로 시작해요. 첫 조각을 고르고, <b>앞 조각의 끝 글자로 시작하는 조각</b>을 차례로 눌러 보세요.</div>
        <div class="asm mono" id="asm"></div>
        <div class="frags">${FRAGS.map((f, i) => `<button class="frag-b mono" data-i="${i}">${seqHTML(f)}</button>`).join('')}</div>
        <div id="asmfb"></div></div>
    </div>`;
  countUp($('c1'), A.reads); countUp($('c2'), A.reads * 150);
  let k = 0, built = '';
  const draw = () => { $('asm').innerHTML = built ? seqHTML(built) : '<span class="dim">여기에 유전체가 만들어져요</span>'; };
  draw();
  $('an-body').querySelectorAll('.frag-b').forEach(b => b.onclick = () => {
    const i = +b.dataset.i;
    if (i !== ORDER[k]) { b.classList.add('wrong'); setTimeout(() => b.classList.remove('wrong'), 400); A.sfx('wrong'); $('asmfb').innerHTML = `<div class="fb no">${k === 0 ? '첫 조각은 ATG로 시작해요.' : `지금 유전체의 끝 글자는 <b class="mono">${built.slice(-3)}</b>예요. 이 글자로 시작하는 조각을 찾아요.`}</div>`; return; }
    A.sfx('correct'); built += FRAGS[i].slice(OVER[k]); k++; b.disabled = true; b.classList.add('right'); draw();
    if (k === ORDER.length) {
      $('asmfb').innerHTML = `<div class="fb ok">완성! 겹치는 글자(GTT, GAC)를 찾아 3조각을 이었어요. 실제로는 이 일을 <b>조각 ${fmt(A.reads)}개</b>로 해야 해요. 사람이 손으로 하면 수십 년, <b>컴퓨터는 몇 분</b>이면 끝나요. 그래서 유전체 분석에는 빅데이터 기술이 꼭 필요해요.</div>`;
      showNext('다음: 데이터베이스 비교 ▶');
    } else $('asmfb').innerHTML = '';
  });
}
const X_SEQ = 'TTGCAGTAACCGTATCGGAAGT';
const DB = [
  { n: '박쥐 코로나바이러스 BtCoV-27', s: 'TTGCAGTAACCGTTTCGGAAGT', p: 96, from: '박쥐 (동굴, 2179년 채집)' },
  { n: '천산갑 코로나바이러스', s: 'TTGCAATAACCGTTTCAGAAGA', p: 88, from: '천산갑' },
  { n: '사람 감기 코로나바이러스 HCoV', s: 'TAGCTGTCACAGTTTCAGTCGT', p: 54, from: '사람' },
  { n: '독감 바이러스 H5N1', s: 'GCTAGCATCAAGCTTAACTCGA', p: 21, from: '새' },
];
function iCompare() {
  $('an-body').innerHTML = `
    <div class="an-grid">
      <div><div class="ctitle">바이러스 X 유전체 ↔ 바이러스 데이터베이스 (유전체 2,400,000개)</div>
        <div class="dbrow head"><b>바이러스 X</b><span class="seq mono">${seqHTML(X_SEQ)}</span><i></i></div>
        <div id="dbrows"><div class="scan"><div class="vs">AI가 데이터베이스의 유전체 <b id="dbn" class="mono">0</b>개와 비교하는 중…</div><div class="fbar"><i id="dbbar" style="width:0"></i></div></div></div>
        <div class="note">글자 색이 빨간 칸 = 바이러스 X와 다른 글자 · 오른쪽 % = 유전체 전체에서 같은 글자의 비율</div></div>
      <div><div class="guide"><b>이렇게 하는 거예요</b><ol>
        <li>새 바이러스의 유전체를, 이미 알려진 모든 바이러스의 유전체와 한 글자씩 비교해요.</li>
        <li>같은 글자가 많을수록(%가 높을수록) 가까운 친척이에요.</li>
        <li>가장 가까운 친척이 어디에 살던 바이러스인지 보면 <b>어디서 왔는지(원인)</b>를 알 수 있어요.</li></ol></div><div id="qbox"></div></div>
    </div>`;
  const t0 = performance.now();
  const tick = () => {
    const k = Math.min(1, (performance.now() - t0) / 1600); $('dbn').textContent = fmt(2400000 * k); $('dbbar').style.width = k * 100 + '%';
    if (k < 1) return requestAnimationFrame(tick);
    A.sfx('probe');
    $('dbrows').innerHTML = DB.map(d => `<div class="dbrow"><b>${d.n}<small>${d.from}</small></b><span class="seq mono">${seqHTML(d.s, X_SEQ)}</span><i class="mono" style="--p:${d.p}%">${d.p}%</i></div>`).join('');
    questions($('qbox'), [
      { q: '바이러스 X와 가장 가까운 친척은?', opts: DB.map(d => d.n), a: 0, ok: '맞아요! 같은 글자가 96%나 돼요. 이렇게 유전체를 데이터베이스와 비교하면 처음 보는 바이러스도 몇 시간 만에 정체를 알 수 있어요.', no: '오른쪽 %가 가장 높은 바이러스를 찾아보세요.' },
      { q: '이 결과로 알 수 있는 바이러스 X의 <b>원인</b>은?', opts: ['박쥐의 바이러스가 변해서 사람에게 옮겨 왔다', '사람의 감기 바이러스가 심해졌다', '독감 바이러스의 한 종류다'], a: 0, ok: '정답! 실제로 코로나19도 유전체가 공개된 지 며칠 만에 박쥐 코로나바이러스와 가깝다는 것이 밝혀졌어요.', no: '가장 가까운 친척 바이러스가 원래 어떤 동물에게 있던 바이러스인지 보세요.' },
    ], () => showNext('다음: 무엇이 바뀌었나 ▶'));
  };
  tick();
}
const GENES = [['복제 효소', 0.62, 3], ['스파이크 (열쇠)', 0.14, 19], ['외피', 0.03, 0], ['막', 0.05, 1], ['뉴클레오캡시드', 0.08, 2], ['기타', 0.08, 1]];
function iMutation() {
  $('an-body').innerHTML = `
    <div class="an-grid">
      <div><div class="ctitle">바이러스 X와 박쥐 바이러스 BtCoV-27, 어디가 달라졌을까?</div><canvas id="mutcv"></canvas>
        <div class="note">긴 띠 = 유전체 전체 30,000글자 · 칸 = 유전자 · 빨간 선 하나 = 박쥐 바이러스와 다른 글자</div>
        <div class="keylock"><div><b>🔑 스파이크</b><span>바이러스 표면의 가시. 세포에 꽂는 “열쇠”</span></div><div><b>🔒 수용체</b><span>사람 세포 표면의 “자물쇠”</span></div></div></div>
      <div><div id="qbox"></div></div>
    </div>`;
  const cv = $('mutcv'), draw = () => {
    const g = sizeCanvas(cv, 0.46), W = cv.clientWidth, H = W * 0.46, L = 8, R = W - 8, y = H * 0.24, h = H * 0.24;
    let x = L; const rnd = (i => () => (i = (i * 9301 + 49297) % 233280) / 233280)(7);
    GENES.forEach(([n, w, m], k) => {
      const gw = (R - L) * w; g.fillStyle = k === 1 ? 'rgba(255,214,107,.22)' : 'rgba(95,242,255,.12)'; g.fillRect(x, y, gw - 2, h);
      g.strokeStyle = k === 1 ? '#ffd66b' : 'rgba(95,242,255,.4)'; g.strokeRect(x, y, gw - 2, h);
      g.strokeStyle = '#ff3b55'; g.lineWidth = 2; for (let i = 0; i < m; i++) { const xx = x + 3 + rnd() * (gw - 8); g.beginPath(); g.moveTo(xx, y + 3); g.lineTo(xx, y + h - 3); g.stroke(); }
      g.lineWidth = 1; g.fillStyle = '#e8f6fb'; g.font = `${k === 1 ? 700 : 400} 12px "Noto Sans KR"`; g.textAlign = 'center';
      const small = w < 0.1; if (small) g.font = '11px "Noto Sans KR"';
      g.fillText(n, x + gw / 2, y + h + 16 + (small ? (k % 2) * 15 + 14 : 0));
      g.fillStyle = '#ff8a95'; g.font = '700 12px "JetBrains Mono"'; g.fillText(m + '곳', x + gw / 2, y - 8);
      x += gw;
    });
  };
  draw(); A.redraw = draw;
  questions($('qbox'), [
    { q: '박쥐 바이러스와 비교했을 때 <b>가장 많이 달라진 유전자</b>는?', opts: ['복제 효소', '스파이크 (열쇠)', '외피'], a: 1, ok: '맞아요! 짧은 스파이크 유전자에 다른 글자가 19곳이나 몰려 있어요. 복제 효소는 훨씬 길지만 3곳뿐이에요.', no: '띠 위의 숫자(다른 글자 수)와, 유전자의 길이를 함께 보세요.' },
    { q: '스파이크가 바뀐 것이 왜 중요할까요?', opts: ['열쇠 모양이 바뀌어 사람 세포의 자물쇠(수용체)에 맞게 되었다', '바이러스의 색이 바뀌었다', '바이러스가 더 커졌다'], a: 0, ok: '정답! 이것이 박쥐 바이러스가 사람을 감염시키게 된 <b>원인</b>이에요. 그리고 이 열쇠의 끝을 막으면 바이러스가 세포에 못 들어가겠죠? 이게 나중에 치료제의 표적이 돼요.', no: '스파이크는 세포에 꽂는 열쇠라고 했어요.' },
  ], () => showNext('분석 완료 · 다음 장소로 ▶', () => finish()));
}

/* =========================================================
   ② 누가 위험할까? (심장 작전 뒤)
   ========================================================= */
export function openRisk(ctx) {
  setup(ctx, '유전체 분석실 · 누가 위험할까?', [['① 데이터 정제', rClean], ['② 중증 vs 경증 비교', rCompare], ['③ 하나의 위험 예측', rPredict], ['④ 데이터 공유 결정', rVote]]);
}
const ROWS = [
  ['P-03117', 34, 37.9, 'AG', '경증'], ['P-03118', 71, 39.4, 'GG', '중증'], ['P-03119', 214, 38.1, 'AA', '경증', '나이가 214세? 사람이 살 수 없는 나이예요'],
  ['P-03120', 16, 38.6, 'AA', '경증'], ['P-03121', 45, 52.0, 'AG', '중증', '체온 52℃? 측정 오류예요'], ['P-03122', 58, 39.8, 'GG', '중증'],
  ['P-03122', 58, 39.8, 'GG', '중증', '같은 환자가 두 번 기록됐어요 (중복)'], ['P-03123', 27, 37.6, 'AA', '경증'], ['P-03124', 63, 38.9, 'AG', '경증'],
];
function rClean() {
  $('an-body').innerHTML = `
    <div class="lead">의료 칩으로 되찾은 환자 기록 <b>${fmt(A.records)}건</b>이에요. 그런데 데이터에는 실수가 섞여 있어요. 분석하기 전에 <b>이상한 기록을 먼저 지워야</b> 해요 — 이것을 <b>데이터 정제</b>라고 해요.</div>
    <div class="an-grid"><div><div class="ctitle">환자 기록 일부 · 이상한 기록 3개를 찾아 눌러 지우세요 <span class="mono" id="cln">0 / 3</span></div>
      <table class="land rec"><tr><th>환자 번호</th><th>나이</th><th>최고 체온</th><th>IFN-7 유전형</th><th>결과</th></tr>
      ${ROWS.map((r, i) => `<tr data-i="${i}"><td class="mono">${r[0]}</td><td>${r[1]}세</td><td>${r[2].toFixed(1)}℃</td><td class="mono">${r[3]}</td><td>${r[4]}</td></tr>`).join('')}</table></div>
      <div><div class="guide"><b>힌트</b><ol><li>사람에게 불가능한 숫자가 있나요?</li><li>똑같은 기록이 두 번 있나요?</li></ol></div><div id="clnfb"></div></div></div>`;
  let n = 0;
  $('an-body').querySelectorAll('tr[data-i]').forEach(tr => tr.onclick = () => {
    const r = ROWS[+tr.dataset.i];
    if (tr.classList.contains('gone')) return;
    if (!r[5]) { tr.classList.add('nope'); setTimeout(() => tr.classList.remove('nope'), 400); A.sfx('wrong'); $('clnfb').innerHTML = '<div class="fb no">이 기록은 정상이에요. 숫자가 이상하거나 겹치는 기록을 찾아보세요.</div>'; return; }
    tr.classList.add('gone'); A.sfx('correct'); n++; $('cln').textContent = `${n} / 3`;
    $('clnfb').innerHTML = `<div class="fb ok">${r[5]}</div>`;
    if (n === 3) {
      $('clnfb').innerHTML += `<div class="aiuse">AI가 같은 방법으로 기록 ${fmt(A.records)}건을 모두 검사해 <b>오류 287건</b>을 지웠어요. <b>검증되지 않은 데이터</b>를 그대로 쓰면 분석 결과가 틀려져요 — 빅데이터의 문제점 중 하나예요.</div>`;
      showNext('다음: 중증 vs 경증 비교 ▶');
    }
  });
}
const GWAS = [['ACE-R', 31, 29], ['IFN-7', 68, 19], ['HLA-B', 22, 24], ['TLR-3', 40, 37], ['APO-E', 15, 14], ['CYP-2', 27, 28]];
function rCompare() {
  $('an-body').innerHTML = `
    <div class="an-grid">
      <div><div class="ctitle">유전자 변이가 있는 사람의 비율 · <span style="color:#ff6b7a">■ 중증 환자 1,214명</span> vs <span style="color:#5ff2ff">■ 경증 환자 8,499명</span></div><canvas id="gwcv"></canvas></div>
      <div><div class="guide"><b>이렇게 하는 거예요</b><ol>
        <li>많이 아팠던 사람(중증)과 덜 아팠던 사람(경증)의 유전체를 나란히 비교해요.</li>
        <li>어떤 유전자 변이가 <b>중증 환자에게만 유독 많다면</b>, 그 변이가 병을 심하게 만드는 데 관련 있다고 볼 수 있어요.</li>
        <li>이 방법을 <b>전장 유전체 연관 분석(GWAS)</b>이라고 해요. 수천~수만 명의 데이터가 있어야 우연이 아닌지 알 수 있어요.</li></ol></div><div id="qbox"></div></div>
    </div>`;
  const cv = $('gwcv'), draw = () => {
    const g = sizeCanvas(cv, 0.62), W = cv.clientWidth, H = W * 0.62, L = 38, B = 30, T = 14, ph = H - T - B, gw = (W - L - 8) / GWAS.length;
    g.font = '11px "JetBrains Mono"'; g.textAlign = 'right';
    [0, 25, 50, 75].forEach(v => { const y = T + ph * (1 - v / 80); g.fillStyle = '#8fb3c2'; g.fillText(v + '%', L - 5, y + 4); g.strokeStyle = 'rgba(255,255,255,.07)'; g.beginPath(); g.moveTo(L, y); g.lineTo(W - 8, y); g.stroke(); });
    GWAS.forEach(([n, a, b], i) => {
      const x = L + i * gw + gw * 0.14, w = gw * 0.34;
      [[a, '#ff6b7a'], [b, '#5ff2ff']].forEach(([v, c], j) => { const h = ph * v / 80; g.fillStyle = c; g.fillRect(x + j * (w + 2), T + ph - h, w, h); g.fillStyle = '#fff'; g.textAlign = 'center'; g.font = '700 11px "JetBrains Mono"'; g.fillText(v, x + j * (w + 2) + w / 2, T + ph - h - 4); });
      g.fillStyle = '#e8f6fb'; g.font = '700 12px "JetBrains Mono"'; g.textAlign = 'center'; g.fillText(n, x + w + 1, H - 10);
    });
  };
  draw(); A.redraw = draw;
  questions($('qbox'), [
    { q: '중증 환자에게 <b>특히 많은</b> 유전자 변이는?', opts: ['ACE-R', 'IFN-7', 'TLR-3'], a: 1, ok: '맞아요! IFN-7 변이는 중증 환자의 68%가 가지고 있지만 경증 환자는 19%뿐이에요. 다른 유전자들은 두 그룹이 거의 같아서 관련이 없어 보여요.', no: '빨간 막대와 파란 막대의 높이 차이가 가장 큰 유전자를 찾아보세요.' },
  ], () => showNext('다음: 하나의 위험 예측 ▶'));
}
function rPredict() {
  $('an-body').innerHTML = `
    <div class="an-grid">
      <div><div class="ctitle">IFN-7 유전형별 중증으로 진행된 비율 (환자 ${fmt(A.records - 287)}명)</div><canvas id="riskcv"></canvas>
        <div class="mycard"><div class="vk">하나의 유전체 카드</div><div class="geno"><span>IFN-7 유전형</span><b class="mono">GG</b></div><div class="vs">G = 변이. 하나는 부모님께 변이를 하나씩, 모두 2개 물려받았어요.</div></div></div>
      <div><div id="qbox"></div></div>
    </div>`;
  const st = [['AA', 6, 5120, '#5dff8a'], ['AG', 15, 3305, '#ffb547'], ['GG', 38, 1001, '#ff6b7a']];
  const cv = $('riskcv'), draw = () => {
    const g = sizeCanvas(cv, 0.58), W = cv.clientWidth, H = W * 0.58, L = 44, B = 46, T = 24, mx = 50, bw = (W - L - 20) / 3;
    g.font = '12px "Noto Sans KR"'; g.textAlign = 'right';
    [0, 25, 50].forEach(v => { const y = T + (H - T - B) * (1 - v / mx); g.fillStyle = '#8fb3c2'; g.fillText(v + '%', L - 6, y + 4); g.strokeStyle = 'rgba(255,255,255,.07)'; g.beginPath(); g.moveTo(L, y); g.lineTo(W - 10, y); g.stroke(); });
    st.forEach(([t, r, n, c], i) => {
      const x = L + i * bw + bw * 0.2, w = bw * 0.6, h = (H - T - B) * r / mx, y = H - B - h;
      g.fillStyle = c; g.fillRect(x, y, w, h); g.fillStyle = '#fff'; g.textAlign = 'center'; g.font = '700 15px "JetBrains Mono"'; g.fillText(r + '%', x + w / 2, y - 6);
      g.font = '700 13px "JetBrains Mono"'; g.fillStyle = '#e8f6fb'; g.fillText(t + ' 형', x + w / 2, H - B + 18); g.font = '11px "Noto Sans KR"'; g.fillStyle = '#8fb3c2'; g.fillText(`${fmt(n)}명`, x + w / 2, H - B + 34);
    });
  };
  draw(); A.redraw = draw;
  questions($('qbox'), [
    { q: '유전형이 <b>GG</b>인 하나가 바이러스 X에 감염되면 중증이 될 위험은?', opts: ['낮다 (AA형과 비슷하다)', '높다 (AA형의 약 6배)', '알 수 없다'], a: 1, ok: '맞아요. 같은 GG형 환자 1,001명 중 38%가 중증이 됐어요. 이렇게 유전체로 <b>개인에게 발생 가능한 질병을 예측</b>할 수 있어요.', no: 'GG 막대를 AA 막대와 비교해 보세요.' },
    { q: '이 예측을 가장 올바르게 쓰는 방법은?', opts: ['위험이 높은 사람에게 먼저 백신과 치료제를 준다 (맞춤 의료)', '위험이 높은 사람은 보험 가입을 거절한다', '위험한 사람의 명단을 인터넷에 공개한다'], a: 0, ok: '정답! 하지만 ②, ③처럼 유전 정보가 잘못 쓰이면 차별과 <b>사생활 침해</b>가 생길 수 있어요. 그래서 데이터를 어떻게 다룰지 정하는 것도 중요해요.', no: '데이터는 사람을 돕는 데 써야 해요.' },
  ], () => showNext('다음: 데이터 공유 결정 ▶'));
}
function rVote() {
  $('an-body').innerHTML = `<div class="votebox"><div class="lead">${VOTE.q}</div>
    <div class="opts">${VOTE.opts.map((o, k) => `<button class="opt" data-k="${k}">${'①②③'[k]} ${o.t}</button>`).join('')}</div>
    <div class="fbx"></div><div class="note">정답이 없는 질문이에요. 반 친구들과 이유를 이야기해 보세요. (빅데이터의 문제점: 사생활 침해 가능성)</div></div>`;
  $('an-body').querySelectorAll('.opt').forEach(b => b.onclick = () => {
    const k = +b.dataset.k; A.vote = k; A.sfx('click');
    $('an-body').querySelectorAll('.opt').forEach(x => x.classList.toggle('right', x === b));
    $('an-body').querySelector('.fbx').innerHTML = `<div class="fb ok">선택을 기록했어요. 이 선택은 엔딩에서 결과로 이어져요.</div>`;
    showNext('분석 완료 · 다음 장소로 ▶', () => finish(A.vote));
  });
}

/* =========================================================
   ③ 치료제 개발 (뇌 작전 뒤)
   ========================================================= */
export function openDrug(ctx) { setup(ctx, 'AI 신약 설계실', [['① 표적 정하기', dTarget], ['② AI 가상 실험', dFunnel], ['③ 임상 시험 데이터', dTrial]]); }
function dTarget() {
  $('an-body').innerHTML = `
    <div class="an-grid">
      <div><div class="ctitle">뇌에서 스캔한 3D 구조 · 바이러스가 신경 세포에 붙는 순간</div><canvas id="lockcv"></canvas>
        <div class="note">스캔 데이터 ${fmt(A.structs)}개의 원자 위치를 합쳐 만든 모형이에요.</div></div>
      <div><div id="qbox"></div></div>
    </div>`;
  const cv = $('lockcv'), draw = () => {
    const g = sizeCanvas(cv, 0.56), W = cv.clientWidth, H = W * 0.56, cy = H * 0.52;
    // 세포막과 수용체(자물쇠)
    g.fillStyle = 'rgba(255,170,190,.18)'; g.fillRect(W * 0.62, 0, W * 0.38, H); g.fillStyle = '#ffb3c6'; g.font = '700 13px "Noto Sans KR"'; g.textAlign = 'center'; g.fillText('신경 세포', W * 0.84, 22);
    g.fillStyle = '#7dd3ff'; g.beginPath(); g.moveTo(W * 0.62, cy - 46); g.lineTo(W * 0.72, cy - 46); g.lineTo(W * 0.72, cy - 14); g.lineTo(W * 0.66, cy - 14); g.lineTo(W * 0.66, cy + 14); g.lineTo(W * 0.72, cy + 14); g.lineTo(W * 0.72, cy + 46); g.lineTo(W * 0.62, cy + 46); g.closePath(); g.fill();
    g.fillStyle = '#e8f6fb'; g.fillText('🔒 수용체 (자물쇠)', W * 0.8, cy + 70);
    // 바이러스와 스파이크(열쇠)
    g.fillStyle = '#c58bff'; g.beginPath(); g.arc(W * 0.2, cy, H * 0.26, 0, 7); g.fill();
    g.fillStyle = '#ffd66b'; g.fillRect(W * 0.2 + H * 0.24, cy - 10, W * 0.18, 20); g.beginPath(); g.moveTo(W * 0.56, cy - 12); g.lineTo(W * 0.6, cy); g.lineTo(W * 0.56, cy + 12); g.closePath(); g.fillRect(W * 0.52, cy - 12, 0.04 * W, 24); g.fill();
    g.strokeStyle = '#ff3b55'; g.setLineDash([5, 4]); g.lineWidth = 2; g.strokeRect(W * 0.5, cy - 20, W * 0.12, 40); g.setLineDash([]);
    g.fillStyle = '#ff8a95'; g.font = '700 12px "Noto Sans KR"'; g.fillText('결합 부위', W * 0.56, cy - 28);
    g.fillStyle = '#e8f6fb'; g.font = '700 13px "Noto Sans KR"'; g.fillText('바이러스 X', W * 0.2, cy + 5); g.fillText('🔑 스파이크 (열쇠)', W * 0.4, cy + 70);
  };
  draw(); A.redraw = draw;
  questions($('qbox'), [
    { q: '치료제를 어디에 붙여야 바이러스가 세포에 <b>들어가지 못할까요?</b>', opts: ['스파이크 끝의 결합 부위를 덮어서, 열쇠가 자물쇠에 못 꽂히게 한다', '사람 세포의 수용체(자물쇠)를 없앤다', '바이러스의 가운데(몸통)를 크게 만든다'], a: 0, ok: '정답! 이렇게 치료제가 붙을 곳을 <b>표적</b>이라고 해요. 수용체를 없애면 사람 세포가 제 일을 못 하게 되니 위험해요. 환자 몸속 바이러스 수천 개를 비교해 보니 이 결합 부위는 거의 변하지 않아서, 변이가 생겨도 치료제가 잘 들어요.', no: '사람 세포를 망가뜨리지 않고 바이러스만 막는 방법을 생각해 보세요.' },
  ], () => showNext('다음: AI 가상 실험 ▶'));
}
const FILTERS = [
  { t: '표적(스파이크 결합 부위)에 꼭 맞는 모양인가?', n: 12400, why: '뇌에서 스캔한 3D 구조와 화합물 100만 개의 모양을 컴퓨터로 하나씩 맞춰 봄 (가상 결합 실험)' },
  { t: '사람 몸에 독성이 낮은가?', n: 830, why: '과거 약물 실험 데이터 2억 건으로 학습한 AI가 예측' },
  { t: '뇌까지 전달될 수 있는가?', n: 41, why: '혈관-뇌 장벽을 통과한 약물 기록과 비교' },
  { t: '알려진 부작용과 비슷하지 않은가?', n: 3, why: '전 세계 부작용 보고 기록 수천만 건과 비교' },
];
function dFunnel() {
  let i = 0, n = 1000000;
  $('an-body').innerHTML = `<div class="lead">실험실에서 화합물을 하나씩 시험하면 너무 오래 걸려요. 그래서 AI가 컴퓨터 속에서 먼저 실험해요(<b>가상 실험</b>). 버튼을 순서대로 눌러 후보 <b>100만 개</b>를 걸러 보세요.</div>
    <div class="funnel"><div class="fcount"><span class="mono" id="fnum">1,000,000</span><small>개 남음</small></div><div class="fbar"><i id="fbar"></i></div>
    <div id="flist"></div><button class="btn" id="fbtn"></button></div><div id="fdone"></div>`;
  const upd = () => {
    $('flist').innerHTML = FILTERS.slice(0, i).map(f => `<div class="fstep">✔ ${f.t} <span class="mono">→ ${fmt(f.n)}개</span><small>${f.why}</small></div>`).join('');
    if (i < FILTERS.length) $('fbtn').textContent = `조건 ${i + 1}: ${FILTERS[i].t}`;
    else { $('fbtn').classList.add('hidden'); $('fdone').innerHTML = `<div class="aiuse">AI가 걸린 시간 <b>약 18시간</b> · 사람이 후보를 하루에 1개씩 실험했다면 <b>약 2,740년</b>! 빅데이터와 AI 덕분에 신약 개발 기간을 크게 줄일 수 있어요.</div>`; showNext('다음: 임상 시험 데이터 ▶'); }
  };
  $('fbtn').onclick = () => {
    const from = n, to = FILTERS[i].n, t0 = performance.now(); A.sfx('click'); i++;
    const tick = () => { const k = Math.min(1, (performance.now() - t0) / 900); n = Math.round(from - (from - to) * (1 - Math.pow(1 - k, 3))); $('fnum').textContent = fmt(n); $('fbar').style.width = (Math.log10(Math.max(1, n)) / 6 * 100) + '%'; if (k < 1) requestAnimationFrame(tick); else upd(); };
    tick();
  };
  $('fbar').style.width = '100%'; upd();
}
const TRIAL = [
  { name: '후보 A · XR-112', cure: 81, placebo: 40, side: 34 },
  { name: '후보 B · XR-207', cure: 78, placebo: 40, side: 4 },
  { name: '후보 C · XR-350', cure: 44, placebo: 40, side: 2 },
];
function dTrial() {
  $('an-body').innerHTML = `
    <div class="an-grid">
      <div><div class="ctitle">임상 시험 결과 · 후보마다 환자 3,000명 참여</div><canvas id="trialcv"></canvas>
        <div class="legend3"><span style="color:#5dff8a">■ 약을 먹은 그룹 회복률</span><span style="color:#8fb3c2">■ 가짜 약(위약) 그룹 회복률</span><span style="color:#ff6b7a">■ 부작용 비율</span></div></div>
      <div><div class="guide"><b>이렇게 하는 거예요</b><ol>
        <li>환자를 두 그룹으로 나눠, 한쪽엔 진짜 약을, 다른 쪽엔 <b>가짜 약(위약)</b>을 줘요. 누가 어떤 약을 받았는지는 환자도 의사도 몰라요.</li>
        <li>진짜 약 그룹이 위약 그룹보다 <b>훨씬 많이</b> 나아야 효과가 있는 거예요.</li>
        <li><b>부작용</b>이 적은지도 함께 봐요.</li></ol></div><div id="qbox"></div></div>
    </div>`;
  const cv = $('trialcv'), draw = () => {
    const g = sizeCanvas(cv, 0.66), W = cv.clientWidth, H = W * 0.66, L = 118, R = 40, rh = (H - 8) / TRIAL.length;
    TRIAL.forEach((c, i) => {
      const y0 = 4 + i * rh; g.fillStyle = '#e8f6fb'; g.font = '700 13px "Noto Sans KR"'; g.textAlign = 'left'; g.fillText(c.name, 0, y0 + 16);
      [['cure', '약 그룹 회복', '#5dff8a'], ['placebo', '위약 그룹 회복', '#8fb3c2'], ['side', '부작용', '#ff6b7a']].forEach(([k, n, col], j) => {
        const y = y0 + 26 + j * 18, w = (W - L - R) * c[k] / 100; g.fillStyle = '#8fb3c2'; g.font = '11.5px "Noto Sans KR"'; g.fillText(n, 8, y + 10); g.fillStyle = col; g.fillRect(L, y, w, 12); g.fillStyle = '#fff'; g.font = '11px "JetBrains Mono"'; g.fillText(c[k] + '%', L + w + 6, y + 10);
      });
    });
  };
  draw(); A.redraw = draw;
  questions($('qbox'), [
    { q: '하나에게 쓸 치료제로 가장 알맞은 후보는?', opts: TRIAL.map(c => c.name), a: 1, ok: '정답! 후보 B는 위약보다 회복률이 38%p 높고 부작용은 4%뿐이에요. 후보 A는 효과는 좋지만 3명 중 1명이 부작용을 겪고, 후보 C는 위약과 거의 차이가 없어서 사실상 효과가 없어요.', no: '초록 막대가 회색 막대보다 얼마나 긴지, 그리고 빨간 막대(부작용)가 얼마나 짧은지 함께 보세요.' },
  ], () => showNext('치료제 XR-207 탑재! 최종 작전 ▶', () => finish()));
}
addEventListener('resize', () => { if (A && A.redraw && !$('analysis').classList.contains('hidden')) A.redraw(); });
