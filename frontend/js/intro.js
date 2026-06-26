
const INTRO_KEY = "empreintes_intro_seen_v1";

function buildIntroTitle() {
  const el = document.getElementById("introTitle");
  if (!el) return;
  const word = "Empreintes";
  el.innerHTML = "";
  for (let i = 0; i < word.length; i++) {
    const span = document.createElement("span");
    span.className = "intro-title-char";
    span.textContent = word[i];
    span.style.animationDelay = (1.55 + i * 0.07) + "s";
    el.appendChild(span);
  }
}
buildIntroTitle();

function buildFingerprint() {
  const svg = document.querySelector('.intro-rings-bottom');
  if (!svg) return;
  const ns = 'http://www.w3.org/2000/svg';
  svg.innerHTML = '';
  const cx = 3, cy = -2;
  
  for (let i = 0; i < 9; i++) {
    const baseR = 410 - i * 34;
    const segments = 90;
    let d = '';
    for (let j = 0; j <= segments; j++) {
      const t = j / segments;
      const angle = t * Math.PI * 2;
      const p1 = Math.sin(angle * 2 + i * 0.7) * 4.5;
      const p2 = Math.cos(angle * 3 + i * 1.3) * 3;
      const p3 = Math.sin(angle * 5 + i * 0.4) * 1.6;
      const yScale = 1.02 + i * 0.003 + (Math.sin(angle) > 0 ? 0 : 0.015);
      const r = baseR + p1 + p2 + p3;
      const x = cx + Math.cos(angle) * r;
      const y = cy + Math.sin(angle) * r * yScale;
      d += (j === 0 ? 'M ' : ' L ') + x.toFixed(1) + ' ' + y.toFixed(1);
    }
    d += ' Z';
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', d);
    let cls = 'ring';
    if (i < 2) cls += ' ring-outer';
    else if (i >= 6) cls += ' ring-inner';
    path.setAttribute('class', cls);
    path.setAttribute('pathLength', '100');
    svg.appendChild(path);
  }
  
  const spiralPath = document.createElementNS(ns, 'path');
  spiralPath.setAttribute('class', 'ring ring-core-spiral');
  spiralPath.setAttribute('pathLength', '100');
  let spiral = '';
  const turns = 1.7;
  for (let j = 0; j <= 90; j++) {
    const t = j / 90;
    const angle = t * turns * Math.PI * 2 - Math.PI / 2;
    const r = 26 * (1 - t * 0.92);
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    spiral += (j === 0 ? 'M ' : ' L ') + x.toFixed(1) + ' ' + y.toFixed(1);
  }
  spiralPath.setAttribute('d', spiral);
  svg.appendChild(spiralPath);
}
buildFingerprint();

function dismissIntro(immediate = false) {
  const overlay = document.getElementById("intro");
  if (!overlay) return;
  overlay.classList.add("is-dismissing");
  sessionStorage.setItem(INTRO_KEY, "1");
  setTimeout(() => overlay.remove(), 1100);
}

function replayIntro() {
  sessionStorage.removeItem(INTRO_KEY);
  
  const oldOverlay = document.getElementById("intro");
  if (oldOverlay) oldOverlay.remove();
  
  const div = document.createElement("div");
  div.innerHTML = window.__introHTML;
  document.body.prepend(div.firstElementChild);
  buildIntroTitle();
  buildFingerprint();
  startIntroTimer();
}

function startIntroTimer() {
  
  document.addEventListener("keydown", function onkey(e) {
    if (e.key === "Escape" || e.key === "Enter") {
      dismissIntro(true);
      document.removeEventListener("keydown", onkey);
    }
  });
}

window.__introHTML = document.getElementById("intro").outerHTML;
startIntroTimer();

(function initGlobe() {
  let attempts = 0;
  function wait() {
    if (window.d3 && window.topojson) { boot(); return; }
    if (++attempts > 80) { console.warn('Globe: D3/topojson never loaded'); return; }
    setTimeout(wait, 100);
  }
  function boot() {
    const svg = d3.select('#globeSvg');
    if (svg.empty()) return;

    const cx = 400, cy = 400, R = 2500;  
    
    let rotation = [-2, -46, 0];

    const projection = d3.geoOrthographic()
      .scale(R)
      .translate([cx, cy])
      .rotate(rotation)
      .clipAngle(90);
    const path = d3.geoPath(projection);

    svg.insert('path', '#globeGraticule')
      .attr('class', 'globe-ocean')
      .datum({ type: 'Sphere' })
      .attr('d', path);

    svg.select('#globeGraticule')
      .append('path')
      .attr('class', 'globe-graticule')
      .datum(d3.geoGraticule().step([5, 5])());  

    svg.select('#globeGraticule')
      .append('path')
      .attr('class', 'globe-equator')
      .datum({ type: 'LineString', coordinates: [[-180, 0], [-90, 0], [0, 0], [90, 0], [180, 0]] });

    svg.select('#globeGraticule')
      .append('path')
      .attr('class', 'globe-meridian-zero')
      .datum({ type: 'LineString', coordinates: [[0, -90], [0, 0], [0, 90]] });

    const countriesG = svg.select('#globeCountries');

    function update() {
      svg.select('.globe-ocean').attr('d', path);
      countriesG.selectAll('path').attr('d', path);
      svg.select('#globeGraticule').selectAll('path').attr('d', path);
    }

    d3.json('https://unpkg.com/world-atlas@2/countries-110m.json')
      .then(world => {
        const countries = topojson.feature(world, world.objects.countries);
        countriesG.selectAll('path')
          .data(countries.features)
          .enter().append('path')
          .attr('class', d => (String(d.id) === '250' ? 'globe-country is-france' : 'globe-country'))
          .attr('d', path);
        update();
      })
      .catch(err => { console.warn('Globe data failed to load:', err); });

    const INITIAL_ROTATION = [-2, -46, 0];
    const stage = document.getElementById('globeStage');
    let drag = null;
    let hintEl = document.getElementById('globeHint');
    let hintHidden = false;
    let inertiaRAF = null;
    let returnRAF = null;
    
    let vel = [0, 0];
    let lastMove = null;

    function cancelAnims() {
      if (inertiaRAF) { cancelAnimationFrame(inertiaRAF); inertiaRAF = null; }
      if (returnRAF)  { cancelAnimationFrame(returnRAF);  returnRAF  = null; }
    }
    function hideHint() {
      if (hintHidden || !hintEl) return;
      hintHidden = true;
      hintEl.classList.add('is-fading');
    }

    stage.addEventListener('pointerdown', (e) => {
      cancelAnims();
      drag = { x: e.clientX, y: e.clientY, rot: [...rotation] };
      lastMove = { x: e.clientX, y: e.clientY, t: performance.now() };
      vel = [0, 0];
      stage.setPointerCapture(e.pointerId);
      hideHint();
      e.preventDefault();
    });
    stage.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      const k = 0.32;
      rotation = [
        drag.rot[0] + dx * k,
        Math.max(-89, Math.min(89, drag.rot[1] - dy * k)),
        0
      ];
      projection.rotate(rotation);
      update();
      
      const now = performance.now();
      const dt = Math.max(8, now - lastMove.t);
      const vx = ((e.clientX - lastMove.x) * k) / dt;     
      const vy = (-(e.clientY - lastMove.y) * k) / dt;
      
      vel = [vel[0] * 0.4 + vx * 0.6, vel[1] * 0.4 + vy * 0.6];
      lastMove = { x: e.clientX, y: e.clientY, t: now };
    });

    function startInertia() {
      
      const speed = Math.hypot(vel[0], vel[1]);
      if (speed < 0.05) { startReturn(); return; }

      const maxSpeed = 1.2;  
      if (speed > maxSpeed) { vel = [vel[0] * maxSpeed / speed, vel[1] * maxSpeed / speed]; }

      let prev = performance.now();
      function tick(now) {
        const dt = now - prev; prev = now;
        rotation[0] += vel[0] * dt;
        rotation[1] = Math.max(-89, Math.min(89, rotation[1] + vel[1] * dt));
        projection.rotate(rotation);
        update();
        
        const decay = Math.exp(-dt / 280);
        vel[0] *= decay; vel[1] *= decay;
        if (Math.hypot(vel[0], vel[1]) < 0.004) {
          inertiaRAF = null;
          startReturn();
          return;
        }
        inertiaRAF = requestAnimationFrame(tick);
      }
      inertiaRAF = requestAnimationFrame(tick);
    }

    function startReturn() {
      const start = performance.now();
      const fromRot = [...rotation];
      
      const dLon = ((INITIAL_ROTATION[0] - fromRot[0]) % 360 + 540) % 360 - 180;
      const dLat = INITIAL_ROTATION[1] - fromRot[1];
      
      if (Math.abs(dLon) < 0.2 && Math.abs(dLat) < 0.2) {
        rotation = [...INITIAL_ROTATION];
        projection.rotate(rotation);
        update();
        return;
      }
      const duration = 1500;
      function tick(now) {
        const t = Math.min(1, (now - start) / duration);
        
        const e = t < 0.5
          ? 4 * t * t * t
          : 1 - Math.pow(-2 * t + 2, 3) / 2;
        rotation = [
          fromRot[0] + dLon * e,
          fromRot[1] + dLat * e,
          0
        ];
        projection.rotate(rotation);
        update();
        if (t < 1) {
          returnRAF = requestAnimationFrame(tick);
        } else {
          returnRAF = null;
        }
      }
      returnRAF = requestAnimationFrame(tick);
    }

    function endDrag() {
      if (!drag) return;
      drag = null;
      startInertia();
    }
    stage.addEventListener('pointerup', endDrag);
    stage.addEventListener('pointercancel', endDrag);
    stage.addEventListener('pointerleave', () => { if (drag) endDrag(); });
  }
  wait();
})();


(function forceGlobeSquare() {
  function resize() {
    const wrap = document.querySelector('.intro-globe-wrap');
    const stage = document.querySelector('.globe-stage');
    const svg = document.getElementById('globeSvg');
    if (!wrap || !stage || !svg) return;

    const vmin = Math.min(window.innerWidth, window.innerHeight);
    const target = Math.min(0.64 * vmin, 720);

    wrap.style.setProperty('width', target + 'px', 'important');
    wrap.style.setProperty('height', target + 'px', 'important');
    wrap.style.setProperty('aspect-ratio', '1 / 1', 'important');

    const stageSize = Math.round(target * 0.76);
    stage.style.setProperty('width', stageSize + 'px', 'important');
    stage.style.setProperty('height', stageSize + 'px', 'important');
    stage.style.setProperty('aspect-ratio', '1 / 1', 'important');

    svg.style.setProperty('width', stageSize + 'px', 'important');
    svg.style.setProperty('height', stageSize + 'px', 'important');
    svg.style.setProperty('aspect-ratio', '1 / 1', 'important');
  }

  resize();
  window.addEventListener('load', resize);
  window.addEventListener('resize', resize);
  setTimeout(resize, 100);
  setTimeout(resize, 500);
  setTimeout(resize, 1500);
  setTimeout(resize, 3000);

  const wrap = document.querySelector('.intro-globe-wrap');
  if (wrap) {
    const obs = new MutationObserver(resize);
    obs.observe(wrap, { attributes: true, attributeFilter: ['style', 'class'] });
  }
})();

window.addEventListener('DOMContentLoaded', () => {
  setTimeout(async () => {
    if (typeof loadNotation === 'function') loadNotation('241700434');
    // Score multidimensionnel indicatif pour le territoire par defaut
    if (typeof apiGet === 'function' && typeof updateDimsRecap === 'function') {
      try {
        const ind = await apiGet('/indicateurs/241700434');
        if (ind && ind.score_global) updateDimsRecap(ind.score_global);
      } catch (e) { console.warn('recap initial indispo', e); }
    }
  }, 500);
});


// ===== Page Methodologie =====
function openMethodologie(e) {
  e?.preventDefault();
  const overlay = document.getElementById('view-methodologie');
  if (!overlay) return;
  overlay.classList.add('is-open');
  document.body.style.overflow = 'hidden';
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('is-active'));
  e?.currentTarget?.classList?.add('is-active');
  // animer les barres de ponderation
  setTimeout(() => {
    overlay.querySelectorAll('.methodo-weight-fill').forEach(f => {
      const w = f.style.getPropertyValue('--w');
      f.style.width = '0%';
      setTimeout(() => { f.style.width = w; }, 50);
    });
  }, 100);
  setupMethodoScrollSpy();
}

function closeMethodologie(e) {
  e?.preventDefault();
  const overlay = document.getElementById('view-methodologie');
  if (!overlay) return;
  overlay.classList.remove('is-open');
  document.body.style.overflow = '';
  document.querySelectorAll('.nav-link').forEach((l, i) => l.classList.toggle('is-active', i === 0));
}

function openBiblio(e) {
  e?.preventDefault();
  if (typeof closeMethodologie === 'function') closeMethodologie();
  if (typeof closeCartographie === 'function') closeCartographie();
  const overlay = document.getElementById('view-biblio');
  if (!overlay) return;
  overlay.classList.add('is-open');
  document.body.style.overflow = 'hidden';
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('is-active'));
  e?.currentTarget?.classList?.add('is-active');
  overlay.querySelector('.biblio-scroll')?.scrollTo(0, 0);
}

function closeBiblio(e) {
  e?.preventDefault();
  const overlay = document.getElementById('view-biblio');
  if (!overlay) return;
  overlay.classList.remove('is-open');
  document.body.style.overflow = '';
  document.querySelectorAll('.nav-link').forEach((l, i) => l.classList.toggle('is-active', i === 0));
}

function setupMethodoScrollSpy() {
  const scroll = document.querySelector('.methodo-scroll');
  const links = document.querySelectorAll('.methodo-toc-link');
  const sections = document.querySelectorAll('.methodo-section');
  if (!scroll || !links.length) return;

  // Clic sur le sommaire : scroll doux
  links.forEach(link => {
    if (link.dataset.bound) return;
    link.dataset.bound = '1';
    link.addEventListener('click', (ev) => {
      ev.preventDefault();
      const id = link.getAttribute('href').slice(1);
      const target = document.getElementById(id);
      if (target) scroll.scrollTo({ top: target.offsetTop - 24, behavior: 'smooth' });
    });
  });

  // Surbrillance au scroll
  if (scroll.dataset.spyBound) return;
  scroll.dataset.spyBound = '1';
  scroll.addEventListener('scroll', () => {
    let current = '';
    sections.forEach(sec => {
      if (scroll.scrollTop >= sec.offsetTop - 80) current = sec.id;
    });
    links.forEach(l => l.classList.toggle('is-active', l.getAttribute('href') === '#' + current));
  });
}
