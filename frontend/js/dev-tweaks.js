
const TWEAK_DEFAULTS = {
  "typo": "newsreader",
  "palette": "argile",
  "intro": "always"
};

const tweakState = { ...TWEAK_DEFAULTS };

function applyTweaks() {
  document.documentElement.setAttribute("data-typo", tweakState.typo);
  document.documentElement.setAttribute("data-palette", tweakState.palette);
  
  document.querySelectorAll("[data-tweak]").forEach(group => {
    const key = group.dataset.tweak;
    group.querySelectorAll(".tweak-option").forEach(opt => {
      opt.classList.toggle("is-active", opt.dataset.value === tweakState[key]);
    });
  });
}
applyTweaks();

document.querySelectorAll("[data-tweak]").forEach(group => {
  const key = group.dataset.tweak;
  group.addEventListener("click", e => {
    const btn = e.target.closest(".tweak-option");
    if (!btn) return;
    tweakState[key] = btn.dataset.value;
    applyTweaks();
    window.parent.postMessage({ type: "__edit_mode_set_keys", edits: { [key]: btn.dataset.value } }, "*");
  });
});

window.addEventListener("message", e => {
  const d = e.data;
  if (!d || typeof d !== "object") return;
  if (d.type === "__activate_edit_mode") document.getElementById("tweaks").classList.add("is-open");
  if (d.type === "__deactivate_edit_mode") document.getElementById("tweaks").classList.remove("is-open");
});
window.parent.postMessage({ type: "__edit_mode_available" }, "*");

function closeTweaks() {
  document.getElementById("tweaks").classList.remove("is-open");
  window.parent.postMessage({ type: "__edit_mode_dismissed" }, "*");
}

(() => {
  const panel = document.getElementById("tweaks");
  const handle = panel.querySelector(".tweaks-head");
  let drag = null;
  handle.addEventListener("pointerdown", e => {
    if (e.target.closest(".tweaks-close")) return;
    const rect = panel.getBoundingClientRect();
    drag = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
    panel.style.right = "auto"; panel.style.bottom = "auto";
    handle.setPointerCapture(e.pointerId);
  });
  handle.addEventListener("pointermove", e => {
    if (!drag) return;
    panel.style.left = (e.clientX - drag.dx) + "px";
    panel.style.top = (e.clientY - drag.dy) + "px";
  });
  handle.addEventListener("pointerup", () => { drag = null; });
})();

let DIMS = [
  { num: "01", key: "struct", name: "Structure urbaine",         score: null, peer: 50, w: "20 %", source: "INSEE · IGN",       zone: null,    delta: "à charger",   pending: true },
  { num: "02", key: "access", name: "Accessibilité équipements", score: null, peer: 50, w: "20 %", source: "BPE INSEE",        zone: null,    delta: "à charger",   pending: true },
  { num: "03", key: "mob",    name: "Mobilité",                  score: null, peer: 50, w: "15 %", source: "INSEE MOBPRO 2021", zone: null,    delta: "à charger",   pending: true },
  { num: "04", key: "env",    name: "Environnement",             score: null, peer: 50, w: "30 %", source: "ADEME · IGN",      zone: null,    delta: "à charger",   pending: true },
  { num: "05", key: "socio",  name: "Socio-économique",          score: null, peer: 50, w: "10 %", source: "INSEE Filosofi",   zone: null,    delta: "à charger",   pending: true },
  { num: "06", key: "gouv",   name: "Gouvernance",               score: null, peer: 50, w: "10 %", source: "RNA Waldec + saisie", zone: null,    delta: "à charger",   pending: true },
];

function zoneFor(score) {
  if (score == null) return null;
  if (score >= 70) return "high";
  if (score >= 55) return "mid-h";
  if (score >= 40) return "mid-l";
  return "low";
}

function renderDims() {
  const host = document.getElementById("diagDims");
  if (!host) return;
  host.innerHTML = "";
  DIMS.forEach((d, i) => {
    const row = document.createElement("div");
    row.className = "dim-row";
    const isPending = d.pending;
    const deltaClass = isPending ? "" : (d.delta.startsWith("+") ? "is-pos" : (d.delta.startsWith("−") ? "is-neg" : ""));
    row.innerHTML = `
      <div class="dim-row-head">
        <span class="dim-row-num">${d.num}</span>
        <span class="dim-row-name">${d.name}</span>
        <span class="dim-row-score ${isPending ? "is-pending" : ""}">${isPending ? "—" : d.score}</span>
      </div>
      <div class="dim-row-bar">
        <div class="dim-row-fill ${isPending ? "is-pending" : ""}" data-z="${zoneFor(d.score) || ''}" style="--w: ${isPending ? 100 : d.score}%; --d: ${0.3 + i * 0.08}s"></div>
        ${isPending ? "" : `<div class="dim-row-peer" style="left: ${d.peer}%"></div>`}
      </div>
      <div class="dim-row-meta ${deltaClass}">
        <span>${d.delta}</span>
        <span>poids ${d.w}</span>
      </div>
    `;
    host.appendChild(row);
  });
}
renderDims();

function renderRadar() {
  const svg = document.getElementById('radarSvg');
  if (!svg) return;
  const R = 160;  
  const N = 6;
  const angleStep = (2 * Math.PI) / N;
  const startAngle = -Math.PI / 2;  

  const axes = svg.querySelector('#radarAxes');
  const poly = svg.querySelector('#radarPoly');
  const polyMed = svg.querySelector('#radarMedian');
  const points = svg.querySelector('#radarPoints');
  const labels = svg.querySelector('#radarLabels');

  let axesHtml = '';
  for (let i = 0; i < N; i++) {
    const a = startAngle + i * angleStep;
    const x = R * Math.cos(a);
    const y = R * Math.sin(a);
    axesHtml += `<line class="radar-axis" x1="0" y1="0" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}"/>`;
  }
  axes.innerHTML = axesHtml;

  const territoryPts = [];
  const medianPts = [];
  DIMS.forEach((d, i) => {
    const a = startAngle + i * angleStep;
    const s = d.score == null ? 0 : d.score;
    const sMed = d.peer == null ? 50 : d.peer;
    const r1 = (s / 100) * R;
    const r2 = (sMed / 100) * R;
    territoryPts.push(`${(r1 * Math.cos(a)).toFixed(1)},${(r1 * Math.sin(a)).toFixed(1)}`);
    medianPts.push(`${(r2 * Math.cos(a)).toFixed(1)},${(r2 * Math.sin(a)).toFixed(1)}`);
  });
  poly.setAttribute('points', territoryPts.join(' '));
  polyMed.setAttribute('points', medianPts.join(' '));

  let ptsHtml = '';
  let peerPtsHtml = '';
  let lblsHtml = '';
  DIMS.forEach((d, i) => {
    const a = startAngle + i * angleStep;
    const s = d.score == null ? 0 : d.score;
    const sMed = d.peer == null ? 50 : d.peer;
    const r1 = (s / 100) * R;
    const r2 = (sMed / 100) * R;
    const px = r1 * Math.cos(a);
    const py = r1 * Math.sin(a);
    const ppx = r2 * Math.cos(a);
    const ppy = r2 * Math.sin(a);

    const lblR = R + 28;
    const lbx = lblR * Math.cos(a);
    const lby = lblR * Math.sin(a);

    if (!d.pending) {
      ptsHtml += `<circle class="radar-point" cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="4.5" style="animation-delay: ${0.9 + i * 0.08}s"/>`;
      peerPtsHtml += `<circle class="radar-point-peer" cx="${ppx.toFixed(1)}" cy="${ppy.toFixed(1)}" r="2.5"/>`;
    }

    let anchor = 'middle';
    if (Math.abs(Math.cos(a)) > 0.3) anchor = Math.cos(a) > 0 ? 'start' : 'end';
    const shortName = d.name.length > 14 ? d.name.split(' ')[0] : d.name;

    const numDy = (Math.sin(a) < -0.5) ? -16 : (Math.sin(a) > 0.5 ? 18 : 16);

    lblsHtml += `
      <g style="animation-delay: ${1.0 + i * 0.08}s">
        <text class="radar-axis-label-num ${d.pending ? 'is-pending' : ''}" x="${lbx.toFixed(1)}" y="${lby.toFixed(1)}" text-anchor="${anchor}" dy="0.32em">${d.pending ? '—' : d.score}</text>
        <text class="radar-axis-label" x="${lbx.toFixed(1)}" y="${lby.toFixed(1)}" text-anchor="${anchor}" dy="${numDy}">${shortName}</text>
      </g>
    `;
  });
  points.innerHTML = ptsHtml;
  const peerEl = svg.querySelector('#radarPeerPoints');
  if (peerEl) peerEl.innerHTML = peerPtsHtml;
  labels.innerHTML = lblsHtml;
}
renderRadar();

(function setupVerbCycler() {
  const cycler = document.querySelector('.hero-verb-cycle');
  if (!cycler) return;
  const verbs = Array.from(cycler.querySelectorAll('.hero-verb'));
  if (verbs.length < 2) return;

  let active = 0;
  
  const measure = document.createElement('span');
  measure.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;font: inherit;font-style: inherit;letter-spacing: inherit;';
  document.body.appendChild(measure);
  let maxW = 0;
  verbs.forEach(v => {
    measure.textContent = v.textContent;
    const w = measure.getBoundingClientRect().width;
    if (w > maxW) maxW = w;
  });
  measure.remove();
  cycler.style.width = (maxW + 4) + 'px';

  function cycle() {
    const old = verbs[active];
    active = (active + 1) % verbs.length;
    const next = verbs[active];

    old.classList.remove('is-active');
    old.classList.add('is-leaving');
    next.classList.remove('is-leaving');
    next.classList.add('is-entering');

    void next.offsetWidth;
    next.classList.remove('is-entering');
    next.classList.add('is-active');

    setTimeout(() => {
      old.classList.remove('is-leaving');
    }, 600);
  }

  setInterval(cycle, 2400);
})();

(function setupReveal() {
  const els = document.querySelectorAll('[data-reveal]');
  if (!('IntersectionObserver' in window) || !els.length) {
    els.forEach(el => el.classList.add('is-revealed'));
    return;
  }
  const obs = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-revealed');
        
        entry.target.querySelectorAll('[data-counter]').forEach(animateCounter);
        obs.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15, rootMargin: '0px 0px -10% 0px' });
  els.forEach(el => obs.observe(el));
})();

function animateCounter(el) {
  if (el.dataset.counterDone === '1') return;
  el.dataset.counterDone = '1';
  const target = parseFloat(el.dataset.target);
  const decimals = parseInt(el.dataset.decimals || '0', 10);
  const format = el.dataset.format || 'plain';
  const duration = 1400;
  const startT = performance.now();
  const ease = (t) => 1 - Math.pow(1 - t, 3);  
  function frame(t) {
    const p = Math.min(1, (t - startT) / duration);
    const v = target * ease(p);
    let s = v.toFixed(decimals);
    if (format === 'space') s = parseFloat(s).toLocaleString('fr-FR').replace(/\u202f|,/g, m => m === ',' ? ',' : ' ');
    el.textContent = s.replace('.', ',');
    if (p < 1) requestAnimationFrame(frame);
    else {
      let final = target.toFixed(decimals);
      if (format === 'space') final = parseFloat(final).toLocaleString('fr-FR').replace(/\u202f/g, ' ');
      el.textContent = final.replace('.', ',');
    }
  }
  requestAnimationFrame(frame);
}

document.querySelectorAll('.hero [data-counter]').forEach(animateCounter);
