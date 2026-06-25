
const BACKEND_URL = (() => {

  const url = new URL(window.location.href);
  if (url.port === '5500') return 'http://localhost:8000';
  if (url.protocol === 'file:') return localStorage.getItem('backendUrl') || 'http://localhost:8000';
  return window.location.origin;
})();

const state = {
  territoire: null,
  indicateurs: null,
  isLoading: false,
};

async function apiGet(path) {
  const r = await fetch(BACKEND_URL + path);
  if (!r.ok) {
    let detail = '';
    try { detail = (await r.json()).detail || ''; } catch (_) {}
    throw new Error(detail || `HTTP ${r.status}`);
  }
  return r.json();
}

async function fetchTerritoire(code) {
  return apiGet(`/territoire/${encodeURIComponent(code)}`);
}

async function fetchIndicateurs(code) {
  return apiGet(`/indicateurs/${encodeURIComponent(code)}`);
}

function gradeFromScore(score) {
  if (score === null || score === undefined) return { label: '—', class: 'is-na' };
  if (score >= 70) return { label: 'Élevé', class: 'is-high' };
  if (score >= 55) return { label: 'Intermédiaire', class: 'is-mid-h' };
  if (score >= 40) return { label: 'Modéré', class: 'is-mid-l' };
  return { label: 'Faible', class: 'is-low' };
}

function updateScoreGlobal(scoreGlobal, typologie) {
  return; // V3 : le score est gere par loadNotation (jauge). Ancien score /100 desactive.
  
  const numEl = document.querySelector('.diag-score-num[data-counter]');
  if (numEl) {
    const val = Math.round(scoreGlobal?.valeur ?? 0);
    numEl.setAttribute('data-target', val);
    numEl.dataset.counterDone = '0';
    numEl.textContent = '0';
    animateCounter(numEl);
  }
  
  const fillEl = document.querySelector('.diag-score-bar-fill');
  if (fillEl) {
    fillEl.style.setProperty('--w', `${Math.round(scoreGlobal?.valeur ?? 0)}%`);
  }
  
  const gradeEl = document.querySelector('.diag-score-grade');
  if (gradeEl) {
    const g = gradeFromScore(scoreGlobal?.valeur);
    gradeEl.textContent = g.label;
  }
  
  const rankEl = document.querySelector('.diag-score-rank-inline');
  if (rankEl && typologie) {
    rankEl.innerHTML = `<strong>${typologie}</strong>`;
  }
  
  const metaEl = document.querySelector('.diag-head-meta');
  if (metaEl && typologie) {
    metaEl.innerHTML = `
      <span>typologie · <strong>${typologie}</strong></span>
      <span>·</span>
      <span>màj <strong>mai 2026</strong></span>
    `;
  }
}

const DIM_LABELS = {
  struct: 'Structure urbaine',
  access: 'Accessibilité équipements',
  mob:    'Mobilité',
  env:    'Environnement',
  socio:  'Socio-économique',
  gouv:   'Gouvernance',
};

function updateDimensionsFromAPI(dimensions) {
  
  for (const dim of DIMS) {
    const d = dimensions?.[dim.key];
    if (!d) {
      dim.score = null;
      dim.pending = true;
      dim.delta = dim.key === 'mob' ? 'à brancher' : (dim.key === 'gouv' ? 'à saisir' : 'indispo');
      continue;
    }
    const sc = d.score;
    if (sc === null || sc === undefined) {
      dim.score = null;
      dim.pending = true;
      dim.delta = 'indispo';
    } else {
      dim.score = Math.round(sc);
      dim.pending = false;
      const diff = Math.round(sc - 50); 
      dim.delta = diff >= 0 ? `+${diff} vs pairs` : `−${Math.abs(diff)} vs pairs`;
      dim.peer = 50;
    }
  }
  
  if (typeof renderDims === 'function') renderDims();
  if (typeof renderRadar === 'function') renderRadar();
}

function findIndicateur(indicateursPayload, code) {
  
  if (!indicateursPayload?.dimensions) return null;
  for (const dim of Object.values(indicateursPayload.dimensions)) {
    if (!dim.indicateurs) continue;
    const ind = dim.indicateurs.find(i => i.code === code);
    if (ind) return ind;
  }
  return null;
}

function findScoringIndicateur(indicateursPayload, code) {

  if (!indicateursPayload?.dimensions) return null;
  for (const dim of Object.values(indicateursPayload.dimensions)) {
    if (!dim.indicateurs) continue;
    const ind = dim.indicateurs.find(i => i.code === code);
    if (ind && ind.score != null) {
      return {
        score: ind.score,
        score_national: ind.score_national,
        rang_typo: ind.rang_typo,
        rang_national: ind.rang_national,
        n_typo: ind.n_typo,
        n_national: ind.n_national,
        quantiles: ind.quantiles,
        sens: ind.sens,
        libelle_typo: ind.libelle_typo,
      };
    }
  }
  return null;
}

function rangAbsoluFromScore(score, n) {
  if (score == null || !n || n <= 0) return null;
  
  return Math.max(1, Math.round(((100 - score) / 100) * (n - 1)) + 1);
}

function rangAbsoluFromRangPercentile(rang, n, sens) {

  if (rang == null || !n) return null;
  const goodFraction = sens > 0 ? rang : (100 - rang);
  return Math.max(1, Math.round(((100 - goodFraction) / 100) * (n - 1)) + 1);
}

function formatNumber(value, decimals = 0) {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

function updateKpiCard(kpiKey, indicateurCode, formatOpts, indPayload) {
  const card = document.querySelector(`[data-kpi="${kpiKey}"]`);
  if (!card) return;
  const ind = findIndicateur(indPayload, indicateurCode);
  const valEl = card.querySelector('.kpi-val');
  const deltaEl = card.querySelector(`[data-bind="kpi-${kpiKey}-delta"]`);
  const noteEl = card.querySelector(`[data-bind="kpi-${kpiKey}-note"]`);
  const markerEl = card.querySelector('.kpi-scale-marker');

  if (!ind || ind.valeur === null || ind.valeur === undefined) {
    if (valEl) valEl.textContent = '—';
    if (deltaEl) { deltaEl.textContent = 'Indisponible'; deltaEl.className = 'kpi-delta'; }
    if (noteEl) noteEl.textContent = '';
    return;
  }

  if (valEl) {
    valEl.setAttribute('data-target', ind.valeur);
    valEl.dataset.counterDone = '0';
    valEl.textContent = '0';
    animateCounter(valEl);
  }

  const scoring = findScoringIndicateur(indPayload, indicateurCode);
  if (scoring && scoring.score !== null && scoring.score !== undefined) {
    const sc = scoring.score;
    const isGood = sc >= 50;

    let deltaText = null;
    if (scoring.quantiles && scoring.quantiles.length >= 2 && ind.valeur != null) {
      const q = scoring.quantiles;
      
      let mediane;
      if (q.length >= 4) mediane = (q[1] + q[2]) / 2;
      else if (q.length === 2) mediane = (q[0] + q[1]) / 2;
      else mediane = q[Math.floor(q.length / 2)];

      if (mediane && mediane !== 0) {
        const deltaPct = ((ind.valeur - mediane) / Math.abs(mediane)) * 100;
        const sign = deltaPct >= 0 ? '+' : '−';
        deltaText = `${sign} ${Math.abs(deltaPct).toFixed(1).replace('.', ',')} % vs médiane pairs`;
      }
    }
    if (!deltaText) {
      
      const delta = Math.round(sc - 50);
      const sign = delta >= 0 ? '+' : '−';
      deltaText = `${sign} ${Math.abs(delta)} pts vs pairs`;
    }

    if (deltaEl) {
      deltaEl.textContent = deltaText;
      deltaEl.className = 'kpi-delta ' + (isGood ? 'is-pos' : 'is-neg');
    }

    if (noteEl) {
      const rangAbs = rangAbsoluFromScore(sc, scoring.n_typo);
      if (rangAbs != null && scoring.n_typo) {
        
        const tType = indPayload?.territoire?.type;
        const groupLbl = tType === 'commune' ? 'communes' : 'agglos';
        noteEl.innerHTML = `${rangAbs}<sup>e</sup> / ${scoring.n_typo} ${groupLbl}`;
      } else if (scoring.rang_typo != null) {
        noteEl.innerHTML = `P${Math.round(scoring.rang_typo)}<sup>e</sup> pairs`;
      } else if (scoring.rang_national != null) {
        noteEl.innerHTML = `P${Math.round(scoring.rang_national)}<sup>e</sup> national`;
      } else {
        noteEl.textContent = '';
      }
    }
    
    if (markerEl && scoring.rang_national != null) {
      markerEl.style.left = `${Math.round(scoring.rang_national)}%`;
    }
  } else {
    if (deltaEl) { deltaEl.textContent = ''; deltaEl.className = 'kpi-delta'; }
    if (noteEl) noteEl.textContent = '';
  }
  
  if (markerEl && (!scoring || scoring.rang_national == null) && ind.valeur != null && ind.unite === '%' && ind.valeur >= 0 && ind.valeur <= 100) {
    markerEl.style.left = `${Math.round(ind.valeur)}%`;
  }
}

function updateKpiBand(indPayload) {
  updateKpiCard('pop',    'population_2021',    { decimals: 0 }, indPayload);
  updateKpiCard('ges',    'ges_total_par_hab',  { decimals: 2 }, indPayload);
  updateKpiCard('artif',  'artif_par_hab',      { decimals: 1 }, indPayload);
  updateKpiCard('revenu', 'revenu_median',      { decimals: 0 }, indPayload);
  updateKpiCard('habitat-compact', 'pct_habitat_zone_ecole_15',     { decimals: 1 }, indPayload);
  updateKpiCard('equip-compact',   'pct_equipements_zone_ecole_15', { decimals: 1 }, indPayload);
  updateKpiCard('socle-equip',     'taux_couverture_socle',        { decimals: 1 }, indPayload);
  
  updateKpiPopDelta(indPayload);
  
  updatePopSparkline(indPayload);
  updateRevenuSparkline(indPayload);
}

function updateRevenuSparkline(indPayload) {
  const card = document.querySelector('[data-kpi="revenu"]');
  if (!card) return;
  const sparkEl = card.querySelector('.kpi-spark');
  if (!sparkEl) return;
  const ind17 = findIndicateur(indPayload, 'revenu_median_2017');
  const ind19 = findIndicateur(indPayload, 'revenu_median_2019');
  const ind21 = findIndicateur(indPayload, 'revenu_median');
  const v17 = ind17?.valeur;
  const v19 = ind19?.valeur;
  const v21 = ind21?.valeur;

  if (v21 == null) return;

  const points = [];
  if (v17 != null) points.push({ year: 2017, val: v17 });
  if (v19 != null) points.push({ year: 2019, val: v19 });
  points.push({ year: 2021, val: v21 });

  if (points.length < 2) {
    const formatted = new Intl.NumberFormat('fr-FR').format(Math.round(v21)) + ' €';
    sparkEl.innerHTML = `
      <svg viewBox="0 0 280 56" preserveAspectRatio="none">
        <line x1="20" y1="28" x2="260" y2="28" stroke="#4a6b3a" stroke-width="1" stroke-dasharray="2 3" opacity="0.35"/>
        <circle cx="260" cy="28" r="4" fill="#4a6b3a"/>
      </svg>
      <div class="kpi-spark-values">
        <span class="is-estim">—</span><span class="is-estim">—</span><span>${formatted}</span>
      </div>
      <div class="kpi-spark-axis">
        <span>2017</span><span>2019</span><span>2021</span>
      </div>
    `;
    return;
  }

  const xMin = 4, xMax = 276, yTop = 14, yBottom = 50;
  const min = Math.min(...points.map(p => p.val));
  const max = Math.max(...points.map(p => p.val));
  const range = Math.max(max - min, max * 0.01);
  const yearMin = 2017, yearMax = 2021;
  const positions = points.map(p => ({
    ...p,
    x: xMin + ((p.year - yearMin) / (yearMax - yearMin)) * (xMax - xMin),
    y: yBottom - ((p.val - min) / range) * (yBottom - yTop),
  }));

  const linePath = positions.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const fillPath = linePath + ` L ${positions[positions.length-1].x.toFixed(1)} 56 L ${positions[0].x.toFixed(1)} 56 Z`;
  const dots = positions.map(p =>
    `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3" fill="#4a6b3a"/>`
  ).join('');

  const fmt = v => new Intl.NumberFormat('fr-FR').format(Math.round(v)) + ' €';
  const labels = [2017, 2019, 2021].map(yr => {
    const p = positions.find(p => p.year === yr);
    if (!p) return `<span class="is-estim">—</span>`;
    return `<span>${fmt(p.val)}</span>`;
  }).join('');

  sparkEl.innerHTML = `
    <svg viewBox="0 0 280 56" preserveAspectRatio="none">
      <defs>
        <linearGradient id="sparkGradRev" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color="#4a6b3a" stop-opacity="0.18"/>
          <stop offset="100%" stop-color="#4a6b3a" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <path d="${fillPath}" fill="url(#sparkGradRev)"/>
      <path d="${linePath}" fill="none" stroke="#4a6b3a" stroke-width="1.5"/>
      ${dots}
    </svg>
    <div class="kpi-spark-values">${labels}</div>
    <div class="kpi-spark-axis">
      <span>2017</span><span>2019</span><span>2021</span>
    </div>
  `;
}

function updateKpiPopDelta(indPayload) {
  const card = document.querySelector('[data-kpi="pop"]');
  if (!card) return;
  const indTcam = findIndicateur(indPayload, 'tcam_pop');
  const deltaEl = card.querySelector('[data-bind="kpi-pop-delta"]');
  const noteEl = card.querySelector('[data-bind="kpi-pop-note"]');
  if (!indTcam || indTcam.valeur == null) {
    if (deltaEl) { deltaEl.textContent = ''; deltaEl.className = 'kpi-delta'; }
    if (noteEl) noteEl.textContent = '';
    return;
  }
  const tcam = indTcam.valeur;
  const sign = tcam >= 0 ? '+' : '−';
  if (deltaEl) {
    deltaEl.textContent = `${sign} ${Math.abs(tcam).toFixed(2).replace('.', ',')} % / an (2015→2021)`;
    deltaEl.className = 'kpi-delta ' + (tcam >= 0 ? 'is-pos' : 'is-neg');
  }
  if (noteEl) {
    
    noteEl.innerHTML = `vs France métro. + 0,3 % / an`;
  }
}

function formatPopShort(n) {
  if (n == null || isNaN(n)) return '—';
  if (n >= 1000000) return (n / 1000000).toFixed(1).replace('.', ',') + 'M';
  if (n >= 100000) return Math.round(n / 1000) + 'k';
  if (n >= 10000) return (n / 1000).toFixed(1).replace('.', ',') + 'k';
  return new Intl.NumberFormat('fr-FR').format(Math.round(n));
}

function updatePopSparkline(indPayload) {
  const card = document.querySelector('[data-kpi="pop"]');
  if (!card) return;
  const sparkEl = card.querySelector('.kpi-spark');
  if (!sparkEl) return;

  const indPop = findIndicateur(indPayload, 'population_2021');
  const indTcam = findIndicateur(indPayload, 'tcam_pop');
  const p21 = indPop?.valeur;
  const tcam = indTcam?.valeur ?? 0;
  if (p21 == null) return;

  const r = 1 + tcam / 100;
  const safePow = (n) => isFinite(n) && n > 0 ? n : p21;
  const p18 = safePow(p21 / Math.pow(r, 3));
  const p15 = safePow(p21 / Math.pow(r, 6));
  const p11 = safePow(p21 / Math.pow(r, 10));

  const points = [
    { year: 2011, val: p11, estimated: true },
    { year: 2015, val: p15, estimated: false },
    { year: 2018, val: p18, estimated: true },
    { year: 2021, val: p21, estimated: false },
  ];

  const xMin = 4, xMax = 276, yTop = 14, yBottom = 50;
  const min = Math.min(...points.map(p => p.val));
  const max = Math.max(...points.map(p => p.val));
  const range = Math.max(max - min, max * 0.01); 
  const positions = points.map((p, i) => ({
    ...p,
    x: xMin + (i / (points.length - 1)) * (xMax - xMin),
    y: yBottom - ((p.val - min) / range) * (yBottom - yTop),
  }));

  const linePath = positions.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const fillPath = linePath + ` L ${positions[positions.length-1].x.toFixed(1)} 56 L ${positions[0].x.toFixed(1)} 56 Z`;
  const dots = positions.map(p =>
    `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${p.estimated ? 2 : 3}" fill="var(--accent)" ${p.estimated ? 'opacity="0.55"' : ''}/>`
  ).join('');

  sparkEl.innerHTML = `
    <svg viewBox="0 0 280 56" preserveAspectRatio="none">
      <defs>
        <linearGradient id="sparkGradPop" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color="var(--accent)" stop-opacity="0.18"/>
          <stop offset="100%" stop-color="var(--accent)" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <path d="${fillPath}" fill="url(#sparkGradPop)"/>
      <path d="${linePath}" fill="none" stroke="var(--accent)" stroke-width="1.5" class="kpi-spark-line"/>
      ${dots}
    </svg>
    <div class="kpi-spark-values">
      ${positions.map(p =>
        `<span class="${p.estimated ? 'is-estim' : ''}" title="${p.estimated ? 'Estimation via TCAM' : 'Donnée INSEE'}">${formatPopShort(p.val)}</span>`
      ).join('')}
    </div>
    <div class="kpi-spark-axis">
      <span>2011</span><span>2015</span><span>2018</span><span>2021</span>
    </div>
  `;
}

const DIM_META = {
  struct: { num: '01', name: 'Structure démographique',  poids: '20 %', source: 'INSEE · IGN' },
  access: { num: '02', name: 'Accessibilité équipements', poids: '20 %', source: 'BPE INSEE' },
  mob:    { num: '03', name: 'Mobilité',                  poids: '15 %', source: 'INSEE MOBPRO 2021' },
  env:    { num: '04', name: 'Environnement',             poids: '30 %', source: 'ADEME · IGN' },
  socio:  { num: '05', name: 'Socio-économique',          poids: '10 %', source: 'INSEE Filosofi' },
  gouv:   { num: '06', name: 'Gouvernance',               poids: '10 %', source: 'RNA Waldec + saisie' },
};

function formatValeur(ind) {
  
  if (ind.valeur_formatee !== null && ind.valeur_formatee !== undefined && ind.valeur_formatee !== '') {
    return ind.valeur_formatee;
  }
  if (ind.valeur === null || ind.valeur === undefined) return '—';
  if (typeof ind.valeur !== 'number') return String(ind.valeur);
  
  if (Math.abs(ind.valeur) >= 1000) {
    return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(ind.valeur);
  }
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(ind.valeur);
}

function gradeClassFromScore(score) {
  if (score === null || score === undefined) return 'is-na';
  if (score >= 70) return 'is-high';
  if (score >= 55) return 'is-mid-h';
  if (score >= 40) return 'is-mid-l';
  return 'is-low';
}

function renderDimPave(ind, scoring, terrType) {
  const hasValue = ind.valeur !== null && ind.valeur !== undefined;
  
  const sc = ind.score;
  const isScored = sc !== null && sc !== undefined;
  const cls = !hasValue ? 'dim-pave is-na' : 'dim-pave';

  let barHtml = '';
  let footHtml = '';
  if (isScored) {
    const rang = ind.rang_typo != null ? Math.round(ind.rang_typo) : null;
    const rangNat = ind.rang_national != null ? Math.round(ind.rang_national) : null;
    const fillCls = gradeClassFromScore(sc);
    const rangAbs = rangAbsoluFromScore(sc, ind.n_typo);
    const groupLbl = terrType === 'commune' ? 'communes' : 'agglos';
    barHtml = `
      <div class="dim-pave-bar">
        <div class="dim-pave-bar-fill ${fillCls}" style="--w: ${rangNat ?? Math.round(sc)}%"></div>
        <div class="dim-pave-bar-peer" style="left: 50%"></div>
      </div>`;
    let rangLabel;
    if (rangAbs != null && ind.n_typo) {
      rangLabel = `<strong>${rangAbs}<sup>e</sup></strong> / ${ind.n_typo} ${groupLbl}`;
    } else if (rang != null) {
      rangLabel = `<strong>P${rang}</strong> pairs`;
    } else if (rangNat != null) {
      rangLabel = `<strong>P${rangNat}</strong> national`;
    } else {
      rangLabel = '—';
    }
    footHtml = `
      <div class="dim-pave-foot">
        <span>${rangLabel}</span>
        <span class="dim-pave-source" title="${ind.source || ''}">${ind.source || ''}</span>
      </div>`;
  } else {
    
    footHtml = `
      <div class="dim-pave-foot">
        <span></span>
        <span class="dim-pave-source" title="${ind.source || ''}">${ind.source || ''}</span>
      </div>`;
  }

  return `
    <div class="${cls}">
      <div class="dim-pave-label">${ind.libelle || ind.code || '—'}</div>
      <div class="dim-pave-val">
        <span class="dim-pave-num">${formatValeur(ind)}</span>
        ${ind.unite ? `<span class="dim-pave-unit">${ind.unite}</span>` : ''}
      </div>
      ${barHtml}
      ${footHtml}
    </div>`;
}

function renderDimSection(dimKey, dimData, terrType) {
  const meta = DIM_META[dimKey] || { num: '??', name: dimKey, poids: '—' };
  const score = dimData?.score;
  const isPending = meta.pending || !dimData?.indicateurs?.length;
  const gradeCls = gradeClassFromScore(score);
  const gradeLabel = (() => {
    if (score == null) return meta.pending ? (dimKey === 'mob' ? 'À brancher' : 'À saisir') : 'Indispo';
    if (score >= 70) return 'Élevé';
    if (score >= 55) return 'Intermédiaire';
    if (score >= 40) return 'Modéré';
    return 'Faible';
  })();

  const indicateurs = dimData?.indicateurs || [];
  const EMP_GRAPH_DIMS = ['struct', 'access', 'mob', 'env'];
  const pavesHtml = EMP_GRAPH_DIMS.includes(dimKey)
    ? ''
    : (indicateurs.length
        ? indicateurs.map(ind => renderDimPave(ind, null, terrType)).join('')
        : `<div class="dim-section-empty">Aucun indicateur disponible pour cette dimension sur ce territoire.</div>`);

  return `
    <section class="dim-section ${isPending ? 'is-pending' : ''}" data-dim="${dimKey}">
      <div class="dim-section-head">
        <div class="dim-section-head-left">
          <span class="dim-section-num">${meta.num}</span>
          <h3 class="dim-section-title">${meta.name}</h3>
        </div>
        <div class="dim-section-head-right">
          <span class="dim-section-score">${score != null ? Math.round(score) : '—'}</span>
          <span class="dim-section-grade ${gradeCls}">${gradeLabel}</span>
          <span class="dim-section-weight">poids ${meta.poids}</span>
        </div>
      </div>
      <div class="dim-section-grid">${pavesHtml}</div>
    </section>`;
}

function renderDetailedSections(indPayload) {
  const host = document.getElementById('dimSections');
  if (!host) return;
  if (!indPayload?.dimensions) {
    host.innerHTML = '<div class="dim-section-empty">Aucun indicateur disponible.</div>';
    return;
  }
  const terrType = indPayload?.territoire?.type;
  
  const order = ['struct', 'access', 'mob', 'env', 'socio'];
  const html = order
    .map(dimKey => renderDimSection(dimKey, indPayload.dimensions[dimKey], terrType))
    .join('');
  host.innerHTML = html;
}

function getContourBounds(geojson) {
  
  if (!geojson || !geojson.coordinates) return null;
  let minLat = 90, maxLat = -90, minLon = 180, maxLon = -180;
  function walk(coords) {
    if (typeof coords[0] === 'number') {
      const [lon, lat] = coords;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
    } else {
      coords.forEach(walk);
    }
  }
  walk(geojson.coordinates);
  return [[minLat, minLon], [maxLat, maxLon]];
}

function updateMapContour(territoire) {
  const M = window.empreintesMap;
  if (!M || !M.instance || !window.L) return;
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#b85a36';

  if (M.contourLayer) { M.instance.removeLayer(M.contourLayer); M.contourLayer = null; }
  if (M.markerLayer) { M.instance.removeLayer(M.markerLayer); M.markerLayer = null; }

  if (territoire?.contour) {
    M.contourLayer = L.geoJSON(territoire.contour, {
      style: {
        color: accent,
        weight: 2,
        fillOpacity: 0.18,
        fillColor: accent,
      }
    }).addTo(M.instance);

    const bounds = getContourBounds(territoire.contour);
    if (bounds) M.instance.fitBounds(bounds, { padding: [20, 20] });
  }

  if (territoire?.centre?.coordinates) {
    const [lon, lat] = territoire.centre.coordinates;
    const icon = L.divIcon({
      className: 'ca-marker',
      html: `<div style="background:${accent};color:#fff;font-family:'Inter Tight',sans-serif;font-size:12px;font-weight:600;padding:5px 10px;border-radius:4px;white-space:nowrap;box-shadow:0 4px 10px rgba(20,22,26,.15);">${territoire.nom || ''}</div>`,
      iconAnchor: [60, 12],
    });
    M.markerLayer = L.marker([lat, lon], { icon }).addTo(M.instance);
  }

  if (M.activeLayers.tc) loadOSMLayer('tc');
  if (M.activeLayers.velo) loadOSMLayer('velo');
  if (M.activeLayers.ecoles) {
    
    if (M.ecolesLayer) { M.instance.removeLayer(M.ecolesLayer); M.ecolesLayer = null; }
    M.activeLayers.ecoles = false;
    loadEcolesLayer();
  }
}

async function toggleEquipementLayer(cat, color, icon) {
  const M = window.empreintesMap;
  if (!M || !state.territoire?.code) return;
  const layerName = `${cat}Layer`;
  const btnId = `toggle${cat.charAt(0).toUpperCase() + cat.slice(1)}`;
  const btn = document.getElementById(btnId);
  
  if (M[layerName]) {
    M.instance.removeLayer(M[layerName]);
    M[layerName] = null;
    M.activeLayers[cat] = false;
    if (btn) btn.classList.remove('is-active');
    setStatus('ok', `${icon} masqués`);
    return;
  }
  
  try {
    setStatus('loading', `Chargement ${icon}…`);
    const data = await apiGet(`/carto/${encodeURIComponent(state.territoire.code)}?layers=${cat}`);
    const gj = data?.[cat];
    if (!gj || !gj.features?.length) {
      setStatus('error', `Aucun équipement ${icon} sur ce territoire`);
      return;
    }
    const group = L.layerGroup();
    gj.features.forEach(f => {
      const [lon, lat] = f.geometry.coordinates;
      L.circleMarker([lat, lon], {
        radius: 4.5,
        color: color,
        weight: 1.5,
        fillColor: color,
        fillOpacity: 0.7,
      }).bindTooltip(`<strong>${f.properties?.type || ''}</strong><br>${f.properties?.nom || ''}<br>${f.properties?.libcom || ''}`,
                     { direction: 'top', offset: [0, -4] })
        .addTo(group);
    });
    group.addTo(M.instance);
    M[layerName] = group;
    M.activeLayers[cat] = true;
    if (btn) btn.classList.add('is-active');
    setStatus('ok', `${gj.features.length} ${icon}`);
  } catch (e) {
    console.error(`Erreur ${cat}`, e);
    setStatus('error', e.message || 'Erreur');
  }
}
async function toggleSante()     { return toggleEquipementLayer('sante',     '#c1623a', '🏥 santé'); }
async function toggleCommerces() { return toggleEquipementLayer('commerces', '#a35d2a', '🛒 commerces'); }

async function toggleArretsTC() {
  const M = window.empreintesMap;
  if (!M) return;
  const btn = document.getElementById('toggleTC');
  if (M.tcLayer) {
    M.instance.removeLayer(M.tcLayer); M.tcLayer = null;
    M.activeLayers.tc = false;
    if (btn) btn.classList.remove('is-active');
    setStatus('ok', 'Arrêts TC masqués');
    return;
  }
  M.activeLayers.tc = true;
  await loadOSMLayer('tc');
  if (btn && M.tcLayer) btn.classList.add('is-active');
}

async function togglePistesCyclables() {
  const M = window.empreintesMap;
  if (!M) return;
  const btn = document.getElementById('togglePistes');
  
  if (M.veloLayer) {
    M.instance.removeLayer(M.veloLayer);
    M.veloLayer = null;
    M.activeLayers.velo = false;
    if (btn) btn.classList.remove('is-active');
    setStatus('ok', 'Pistes cyclables masquées');
    return;
  }
  
  M.activeLayers.velo = true;
  await loadOSMLayer('velo');
  if (btn && M.veloLayer) btn.classList.add('is-active');
}

async function loadEcolesLayer() {
  const M = window.empreintesMap;
  if (!M || !state.territoire?.code) return;
  
  if (M.ecolesLayer) {
    M.instance.removeLayer(M.ecolesLayer);
    M.ecolesLayer = null;
    M.activeLayers.ecoles = false;
    const btn = document.getElementById('toggleEcoles');
    if (btn) btn.classList.remove('is-active');
    return;
  }
  
  try {
    setStatus('loading', 'Chargement des écoles…');
    const data = await apiGet(`/carto/${encodeURIComponent(state.territoire.code)}?layers=ecoles`);
    const gj = data?.ecoles;
    if (!gj || !gj.features?.length) {
      setStatus('error', "Aucune école sur ce territoire");
      return;
    }
    const buffersGroup = L.layerGroup();
    const accent = '#c1623a';
    gj.features.forEach(f => {
      const [lon, lat] = f.geometry.coordinates;
      
      L.circle([lat, lon], {
        radius: 1500,
        color: accent,
        weight: 1,
        fillColor: accent,
        fillOpacity: 0.04,
        opacity: 0.4,
      }).addTo(buffersGroup);
      
      L.circleMarker([lat, lon], {
        radius: 3,
        color: accent,
        weight: 1.5,
        fillColor: '#fff',
        fillOpacity: 1,
      }).bindTooltip(f.properties?.nom || 'École', { direction: 'top', offset: [0, -4] })
        .addTo(buffersGroup);
    });
    buffersGroup.addTo(M.instance);
    M.ecolesLayer = buffersGroup;
    M.activeLayers.ecoles = true;
    const btn = document.getElementById('toggleEcoles');
    if (btn) btn.classList.add('is-active');
    setStatus('ok', `${gj.features.length} écoles affichées`);
  } catch (e) {
    console.error('Erreur chargement écoles', e);
    setStatus('error', e.message || 'Erreur écoles');
  }
}

async function loadOSMLayer(layerKey) {
  const M = window.empreintesMap;
  if (!M || !state.territoire?.code) return;
  
  const old = M[`${layerKey}Layer`];
  if (old) { M.instance.removeLayer(old); M[`${layerKey}Layer`] = null; }

  try {
    setStatus('loading', `Chargement ${layerKey === 'tc' ? 'transports' : 'cyclables'}…`);
    const data = await apiGet(`/carto/${encodeURIComponent(state.territoire.code)}?layers=${layerKey}`);
    const gj = data?.[layerKey];
    if (!gj || !gj.features?.length) {
      setStatus('error', `Aucune donnée ${layerKey === 'tc' ? 'TC' : 'cyclable'} sur ce territoire`);
      return;
    }
    const color = layerKey === 'tc' ? '#4a6b3a' : '#b58832';
    if (layerKey === 'tc') {
      M.tcLayer = L.geoJSON(gj, {
        pointToLayer: (feat, latlng) => L.circleMarker(latlng, {
          radius: 3, color: color, weight: 1, fillColor: color, fillOpacity: 0.7
        })
      }).addTo(M.instance);
    } else {
      M.veloLayer = L.geoJSON(gj, {
        style: { color: color, weight: 2, opacity: 0.7 }
      }).addTo(M.instance);
    }
    setStatus('ok', 'API connectée');
  } catch (e) {
    console.error(`Erreur chargement layer ${layerKey}`, e);
    setStatus('error', e.message);
  }
}

function toggleMapLayer(layerKey) {
  const M = window.empreintesMap;
  if (!M) return;
  if (layerKey === 'contour') {
    
    if (M.activeLayers.contour && M.contourLayer) {
      M.instance.removeLayer(M.contourLayer);
      M.activeLayers.contour = false;
    } else if (state.territoire?.contour) {
      M.activeLayers.contour = true;
      updateMapContour(state.territoire);
    }
    return;
  }
  
  M.activeLayers[layerKey] = !M.activeLayers[layerKey];
  if (M.activeLayers[layerKey]) {
    loadOSMLayer(layerKey);
  } else {
    const layer = M[`${layerKey}Layer`];
    if (layer) { M.instance.removeLayer(layer); M[`${layerKey}Layer`] = null; }
  }
}

function setBind(key, value) {
  document.querySelectorAll(`[data-bind="${key}"]`).forEach(el => {
    el.textContent = value;
  });
}

function formatInt(n) {
  if (n === null || n === undefined) return '—';
  return new Intl.NumberFormat('fr-FR').format(Math.round(n));
}

const TYPE_EPCI_LIBELLE = {
  'CA': "Communauté d'agglomération",
  'CC': "Communauté de communes",
  'CU': "Communauté urbaine",
  'METRO': "Métropole",
  'METRO69': "Métropole de Lyon",
};

function renderIdentity(t) {
  
  let typeLbl;
  if (t.type === 'epci') {
    typeLbl = TYPE_EPCI_LIBELLE[t.type_epci] || 'EPCI';
  } else {
    typeLbl = 'Commune';
  }
  setBind('type-libelle', typeLbl);

  const codePrefix = t.type === 'epci' ? 'SIREN' : 'INSEE';
  setBind('code-prefix', codePrefix);
  setBind('code', t.code || '—');

  setBind('typo-libelle', '');

  setBind('title', t.nom || '—');

  const meta = document.querySelector('[data-bind="meta-container"]');
  if (meta) {
    const items = [];
    if (t.type === 'epci' && t.nb_communes && t.nb_communes > 1) {
      items.push(`<span>${t.nb_communes} communes</span>`);
    }
    if (t.superficie_km2) {
      items.push(`<span>${formatInt(t.superficie_km2)} km²</span>`);
    }
    if (t.population) {
      items.push(`<span>${formatInt(t.population)} hab.</span>`);
    }

    meta.innerHTML = items.join('') || '<span>—</span>';
  }
}

function setStatus(state, text) {
  const chip = document.getElementById('statusChip');
  const txt = document.getElementById('statusText');
  if (!chip || !txt) return;
  chip.classList.remove('is-loading', 'is-error');
  if (state === 'loading') chip.classList.add('is-loading');
  if (state === 'error') chip.classList.add('is-error');
  txt.textContent = text;
}


// ===== Notation V3 (systeme points Fabien) : score principal + criteres =====
const V3_LIBELLES = {
  "1A_densite": "Densité de population",
  "1B_compacite": "Compacite habitat + equipements",
  "1C_variete_equip": "Variete des equipements",
  "1D_gare": "Desserte par la gare",
  "1E_emploi_commune": "Emploi dans la commune",
  "2A_pression_demo": "Pression demographique",
};

async function loadNotation(code) {
  try {
    const data = await apiGet(`/notation/${encodeURIComponent(code)}`);
    if (!data || data.score_global == null) return;
    const score = Math.round(data.score_global);

    // Grand score
    const numEl = document.getElementById('v3Num');
    const bubbleEl = document.getElementById('v3Bubble');
    const markerEl = document.getElementById('v3Marker');
    const gradeEl = document.getElementById('v3Grade');
    const typoEl = document.getElementById('v3Typo');
    const phraseEl = document.getElementById('v3Phrase');
    if (numEl) numEl.textContent = score;
    if (bubbleEl) bubbleEl.textContent = score;
    if (markerEl) setTimeout(() => { markerEl.style.left = Math.max(6, Math.min(94, score)) + '%'; }, 80);

    // Grade + couleur
    let gradeLabel, gradeCls;
    if (score >= 65) { gradeLabel = 'Potentiel eleve'; gradeCls = 'is-high'; }
    else if (score >= 50) { gradeLabel = 'Potentiel intermediaire'; gradeCls = 'is-mid'; }
    else { gradeLabel = 'Potentiel a renforcer'; gradeCls = 'is-low'; }
    if (gradeEl) { gradeEl.textContent = gradeLabel; gradeEl.className = 'v3-hero-grade ' + gradeCls; }

    // Typologie
    const typoLib = {
      grand_pole: 'Grand pole urbain', moyen_pole: 'Pole moyen',
      multipol: 'Commune multipolarisee', hors_influence: 'Hors influence urbaine',
    };
    if (typoEl) typoEl.textContent = typoLib[data.typologie] || data.typologie || '';

    // Phrase de lecture
    const pressionForte = (data.pression || 0) >= 9;
    let phrase;
    if (score >= 65) {
      phrase = pressionForte
        ? "Ce territoire possede de solides atouts pour decarboner le quotidien, malgre une pression demographique notable."
        : "Ce territoire possede de solides atouts structurels pour decarboner le quotidien.";
    } else if (score >= 50) {
      phrase = "Ce territoire dispose d atouts reels pour decarboner, avec des marges de progression sur certaines dimensions.";
    } else {
      phrase = pressionForte
        ? "Ce territoire est sous pression et devra surmonter plusieurs handicaps pour se diriger vers un fonctionnement plus sobre."
        : "Ce territoire devra renforcer plusieurs leviers structurels pour ameliorer son potentiel de decarbonation.";
    }
    if (phraseEl) phraseEl.textContent = phrase;

    // Les 6 criteres (5 capital + 1 pression)
    const grid = document.getElementById('v3CriteresGrid');
    if (grid && Array.isArray(data.blocs)) {
      grid.innerHTML = data.blocs.map(b => {
        const pts = (b.points != null) ? b.points : 0;
        const isPression = b.type === 'pression';
        const pct = Math.max(0, Math.min(100, (pts / 10) * 100));
        const label = V3_LIBELLES[b.code] || b.libelle || b.code;
        return `
          <div class="v3-crit ${isPression ? 'is-pression' : ''}">
            <div class="v3-crit-label">${label}</div>
            <div class="v3-crit-val">
              <span class="v3-crit-num">${pts != null ? (Number.isInteger(pts) ? pts : pts.toFixed(1)) : '--'}</span>
              <span class="v3-crit-max">/ 10</span>
            </div>
            <div class="v3-crit-bar"><div class="v3-crit-bar-fill" style="width: 0%"></div></div>
          </div>`;
      }).join('');
      // Animer les barres
      setTimeout(() => {
        grid.querySelectorAll('.v3-crit').forEach((el, i) => {
          const b = data.blocs[i];
          const pts = (b && b.points != null) ? b.points : 0;
          const fill = el.querySelector('.v3-crit-bar-fill');
          if (fill) fill.style.width = Math.max(0, Math.min(100, (pts/10)*100)) + '%';
        });
      }, 120);
    }
  } catch (e) {
    console.warn('Notation V3 indisponible', e);
  }
}

function setupDimAccordion() {
  const sections = document.querySelectorAll('#dimSections .dim-section');
  sections.forEach((sec, i) => {
    if (i > 0) sec.classList.add('is-collapsed');
    const head = sec.querySelector('.dim-section-head');
    if (head && !head.dataset.accBound) {
      head.dataset.accBound = '1';
      head.addEventListener('click', () => sec.classList.toggle('is-collapsed'));
    }
  });
}

function updateDimsRecap(scoreGlobal) {
  const recap = document.getElementById('dimsRecap');
  if (!recap || !scoreGlobal || scoreGlobal.valeur == null) return;
  const v = Math.round(scoreGlobal.valeur);
  recap.hidden = false;
  const numEl = document.getElementById('dimsRecapNum');
  const markerEl = document.getElementById('dimsRecapMarker');
  const footEl = document.getElementById('dimsRecapFoot');
  if (numEl) numEl.textContent = v;
  if (markerEl) setTimeout(() => { markerEl.style.left = Math.max(2, Math.min(98, v)) + '%'; }, 100);
  // Texte avec la typologie de comparaison
  const typo = scoreGlobal.libelle_typo || 'territoires comparables';
  let niveau;
  if (v >= 65) niveau = 'Bien positionne';
  else if (v >= 45) niveau = 'Dans la moyenne';
  else niveau = 'En retrait';
  if (footEl) footEl.textContent = niveau + ' parmi les ' + typo.toLowerCase() + '. Moyenne ponderee des 6 dimensions, a titre indicatif.';
}

// === Bloc Empreintes (diagnostic territorial detaille) ===
let EMP_REFS = null, EMP_DENS7 = null, EMP_PENDING = null;
Promise.all([
  fetch('/js/references.json').then(r => r.json()),
  fetch('/js/dens7_communes.json').then(r => r.json())
]).then(([refs, d7]) => {
  EMP_REFS = refs; EMP_DENS7 = d7;
  if (EMP_PENDING) { mqRender(EMP_PENDING[0], EMP_PENDING[1]); EMP_PENDING = null; }
}).catch(e => console.warn('Références Empreintes indisponibles', e));

function flattenIndic(payload) {
  const flat = {};
  if (payload && payload.dimensions)
    Object.values(payload.dimensions).forEach(dim =>
      (dim.indicateurs || []).forEach(it => { flat[it.code] = it; }));
  return flat;
}

function empDeriveDep(t) {
  let c = t.type === 'commune' ? t.code : (t.codes_communes && t.codes_communes[0]);
  if (!c) return '';
  c = String(c);
  if (c.startsWith('97') || c.startsWith('98')) return c.slice(0, 3);
  return c.slice(0, 2);
}
function empSousTitre(t, type, dep) {
  const parts = [];
  if (type === 'epci') {
    if (t.code) parts.push('SIREN ' + t.code);
    if (t.nb_communes) parts.push(t.nb_communes + ' communes');
    if (dep) parts.push('Dép. ' + dep);
  } else {
    if (t.code) parts.push('INSEE ' + t.code);
    if (dep) parts.push('Dép. ' + dep);
    if (t.epci && t.epci.nom) parts.push(t.epci.nom);
  }
  return parts.join(' · ');
}
function renderEmpreintesBlock(t, ind) {
  const el = document.getElementById('empreintes');
  if (!el || !t || !ind || typeof renderEmpreintes !== 'function') return;
  if (!EMP_REFS) { EMP_PENDING = [t, ind]; return; }
  const type = t.type === 'commune' ? 'commune' : 'epci';
  const dens7 = type === 'commune'
    ? (EMP_DENS7 && EMP_DENS7[t.code])
    : (EMP_REFS.epci_dens7 && EMP_REFS.epci_dens7[t.code]);
  const dep = empDeriveDep(t);
  renderEmpreintes(el, flattenIndic(ind), EMP_REFS, {
    type, dens7: String(dens7 || ''), nom: t.nom || '', sousTitre: empSousTitre(t, type, dep)
  });
  // distribuer chaque section de graphiques dans l'accordeon de sa dimension
  ['struct', 'access', 'mob', 'env'].forEach(dim => {
    const sec = el.querySelector(`[data-empdim="${dim}"]`);
    const grid = document.querySelector(`.dim-section[data-dim="${dim}"] .dim-section-grid`);
    if (sec && grid) {
      grid.classList.add('emp-has');
      let wrap = grid.querySelector(':scope > .emp-inject');
      if (!wrap) {
        wrap = document.createElement('div');
        wrap.className = 'emp-root emp-inject';
        wrap.style.gridColumn = '1 / -1';
        grid.appendChild(wrap);
      }
      wrap.innerHTML = '';
      wrap.appendChild(sec);
    }
  });
}

async function loadTerritoire(code) {
  if (state.isLoading) return;
  state.isLoading = true;
  setStatus('loading', 'Chargement…');
  try {
    
    const [t, ind] = await Promise.all([
      fetchTerritoire(code),
      fetchIndicateurs(code).catch(e => {
        console.warn('Indicateurs indisponibles', e);
        return null;
      }),
    ]);
    state.territoire = t;
    state.indicateurs = ind;

    mqRender(t, ind);

    setStatus('ok', 'API connectée');
  } catch (e) {
    console.error('Échec chargement territoire', e);
    setStatus('error', e.message || 'Erreur API');
    setBind('title', 'Territoire introuvable');
    setBind('type-libelle', '—');
    setBind('code', code);
  } finally {
    state.isLoading = false;
  }
}

async function searchByName(q) {
  return apiGet(`/search?q=${encodeURIComponent(q)}`);
}

function renderDropdown(results) {
  const dropdown = document.getElementById('searchDropdown');
  if (!dropdown) return;
  if (!results || !results.length) {
    dropdown.innerHTML = '<div class="search-empty">Aucun territoire trouvé</div>';
    dropdown.hidden = false;
    return;
  }
  dropdown.innerHTML = results.map(r => `
    <div class="search-result" data-code="${r.code}" data-type="${r.type}">
      <div class="search-result-main">
        <span class="search-result-badge ${r.type === 'commune' ? 'is-commune' : ''}">${r.type === 'epci' ? 'EPCI' : 'Commune'}</span>
        <span>${r.libelle || r.nom}</span>
      </div>
      <div class="search-result-sub">${r.sublibelle || ''} · ${r.code}</div>
    </div>
  `).join('');
  dropdown.hidden = false;
}

function closeDropdown() {
  const dropdown = document.getElementById('searchDropdown');
  if (dropdown) dropdown.hidden = true;
}

function debounce(fn, wait) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

const debouncedSearch = debounce(async (q) => {
  if (q.length < 2) { closeDropdown(); return; }
  try {
    const data = await searchByName(q);
    renderDropdown(data.results || []);
  } catch (e) {
    console.error('Search failed', e);
    closeDropdown();
  }
}, 300);

function wireSearchInput(inputId, dropdownId, containerId) {
  const input = document.getElementById(inputId);
  const dropdown = document.getElementById(dropdownId);
  const container = document.getElementById(containerId);
  if (!input) return;

  const closeDD = () => { if (dropdown) dropdown.hidden = true; };
  const renderDD = (results) => {
    if (!dropdown) return;
    if (!results || !results.length) {
      dropdown.innerHTML = '<div class="search-empty">Aucun territoire trouvé</div>';
    } else {
      dropdown.innerHTML = results.map(r => `
        <div class="search-result" data-code="${r.code}" data-type="${r.type}">
          <div class="search-result-main">
            <span class="search-result-badge ${r.type === 'commune' ? 'is-commune' : ''}">${r.type === 'epci' ? 'EPCI' : 'Commune'}</span>
            <span>${r.libelle || r.nom}</span>
          </div>
          <div class="search-result-sub">${r.sublibelle || ''} · ${r.code}</div>
        </div>
      `).join('');
    }
    dropdown.hidden = false;
  };

  const dbSearch = debounce(async (q) => {
    if (q.length < 2) { closeDD(); return; }
    try {
      const data = await searchByName(q);
      renderDD(data.results || []);
    } catch (e) {
      console.error('Search failed', e);
      closeDD();
    }
  }, 300);

  const handleSubmit = () => {
    const q = (input.value || '').trim();
    if (!q) return;
    if (/^\d{5}$|^\d{9}$/.test(q)) {
      closeDD();
      
      document.querySelector('[data-screen-label="02 Diagnostic"]')?.scrollIntoView({ behavior: 'smooth' });
      loadTerritoire(q);
    } else if (q.length >= 2) {
      searchByName(q).then(data => {
        if (data.results && data.results.length) {
          const first = data.results[0];
          input.value = first.libelle || first.nom;
          closeDD();
          document.querySelector('[data-screen-label="02 Diagnostic"]')?.scrollIntoView({ behavior: 'smooth' });
          loadTerritoire(first.code);
        } else {
          setStatus('error', `Aucun résultat pour "${q}"`);
        }
      }).catch(e => setStatus('error', e.message));
    } else {
      setStatus('error', 'Tape au moins 2 caractères');
    }
  };

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); handleSubmit(); }
    if (e.key === 'Escape') { closeDD(); input.blur(); }
  });
  input.addEventListener('input', e => {
    const q = e.target.value.trim();
    if (/^\d+$/.test(q)) { closeDD(); return; }
    dbSearch(q);
  });
  dropdown?.addEventListener('click', e => {
    const item = e.target.closest('.search-result');
    if (!item) return;
    const code = item.dataset.code;
    const label = item.querySelector('.search-result-main span:last-child')?.textContent || '';
    input.value = label;
    closeDD();
    document.querySelector('[data-screen-label="02 Diagnostic"]')?.scrollIntoView({ behavior: 'smooth' });
    loadTerritoire(code);
  });
  document.addEventListener('click', e => {
    if (container && !container.contains(e.target)) closeDD();
  });

  return { handleSubmit, closeDD };
}

// ---- Rendu maquette Claude Design (hero + diagnostic), branche sur l'API ----
// Prefixe mq* pour cohabiter avec les fonctions existantes. Reutilise EMP_REFS,
// EMP_DENS7, flattenIndic, empDeriveDep, empSousTitre deja definis plus haut.
let mqD = null;

// Pictogrammes SVG, recolorables via currentColor
const mqPICTO = {
  Marche: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="13" cy="4" r="1.6" fill="currentColor" stroke="none"/><path d="M11.5 21l1-5-2.5-2.5L8 17"/><path d="M12.5 16 16 18.5"/><path d="M8.5 9.5 12.5 8l2.5 3 2.5 1"/></svg>',
  "Vélo": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18.5" cy="17.5" r="3.3"/><circle cx="5.5" cy="17.5" r="3.3"/><circle cx="15" cy="5" r="1" fill="currentColor" stroke="none"/><path d="M12 17.5V14l-3-3 4-3 2 3h2"/></svg>',
  Transports: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11h16"/><path d="M5 18V7a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v11"/><circle cx="8" cy="15" r="1" fill="currentColor" stroke="none"/><circle cx="16" cy="15" r="1" fill="currentColor" stroke="none"/><path d="M7 18l-1.5 2.5M17 18l1.5 2.5"/></svg>',
  Voiture: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l1.6-4.4A2 2 0 0 1 8.5 7.3h7a2 2 0 0 1 1.9 1.3L19 13"/><path d="M4 17v-2.6a2 2 0 0 1 1.3-1.8l.7-.3h12l.7.3A2 2 0 0 1 20 14.4V17a1 1 0 0 1-1 1h-1.4a1 1 0 0 1-1-1H7.4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z"/><path d="M6.5 15h.4M17.1 15h.4"/></svg>',
  Autre: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="2"/><circle cx="5" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>',
};
const mqEQICON = {
  services: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="7" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/><path d="M2 12h20"/></svg>',
  sante: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 2a1 1 0 0 0-1 1v5H5a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h5v5a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1v-5h5a1 1 0 0 0 1-1V9a1 1 0 0 0-1-1h-5V3a1 1 0 0 0-1-1z"/></svg>',
  commerces: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.5 3h2l2.2 12.2a2 2 0 0 0 2 1.6h9.3a2 2 0 0 0 2-1.6L21.5 8H6"/></svg>',
  sport: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.7V18c0 .6-.5 1-1 1.2-1.2.5-2 1.8-2 3.8"/><path d="M14 14.7V18c0 .6.5 1 1 1.2 1.2.5 2 1.8 2 3.8"/><path d="M18 2H6v7a6 6 0 0 0 12 0z"/></svg>',
  enseignement: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/></svg>',
};

// Helpers de formatage
function mqFmt(n, dec) {
  if (n == null || isNaN(n)) return '—';
  return Number(n).toLocaleString('fr-FR', { minimumFractionDigits: dec || 0, maximumFractionDigits: dec || 0 });
}
function mqComma(n) { return String(n).replace('.', ','); }
// Puce de classement (1 = le plus favorable). rang = { nat:{rk,n}, prs:{rk,n} }
function mqRankChip(rang) {
  if (!rang) return '';
  const segs = [];
  if (rang.nat && rang.nat.rk != null && rang.nat.n) segs.push(`<span class="rc-seg"><span class="rc-scope">national</span><strong>${mqFmt(rang.nat.rk)}<sup>e</sup></strong><span class="rc-of">/ ${mqFmt(rang.nat.n)}</span></span>`);
  if (rang.prs && rang.prs.rk != null && rang.prs.n) segs.push(`<span class="rc-seg"><span class="rc-scope">pairs</span><strong>${mqFmt(rang.prs.rk)}<sup>e</sup></strong><span class="rc-of">/ ${mqFmt(rang.prs.n)}</span></span>`);
  if (!segs.length) return '';
  const ico = `<svg class="rc-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="13" width="5" height="8"/><rect x="9.5" y="8" width="5" height="13"/><rect x="16" y="16" width="5" height="5"/></svg>`;
  return `<span class="rank-chip" title="Classement du territoire sur cet indicateur. 1 = la situation la plus favorable. National = parmi tous les territoires français de même maille ; pairs = parmi les territoires de même densité (grille INSEE)."><span class="rc-head">${ico}Classement</span><span class="rc-rows">${segs.join('')}</span></span>`;
}
// Rang compact sur une ligne, pour les listes denses (familles d'équipements).
function mqRankInline(rang) {
  if (!rang) return '';
  const parts = [];
  if (rang.nat && rang.nat.rk != null && rang.nat.n) parts.push(`national <strong>${mqFmt(rang.nat.rk)}<sup>e</sup></strong> <span class="ri-of">/ ${mqFmt(rang.nat.n)}</span>`);
  if (rang.prs && rang.prs.rk != null && rang.prs.n) parts.push(`pairs <strong>${mqFmt(rang.prs.rk)}<sup>e</sup></strong> <span class="ri-of">/ ${mqFmt(rang.prs.n)}</span>`);
  if (!parts.length) return '';
  return `<div class="rank-inline" title="Classement du territoire. 1 = situation la plus favorable.">${parts.join('<span class="ri-sep">·</span>')}</div>`;
}
// Valeurs flottantes au-dessus des traits France / pairs.
// frPos / prPos = position en % sur le track (0-100). Si les deux traits sont
// trop proches, on monte le plus à gauche d'un cran pour éviter le chevauchement.
function mqTickVals(frPos, frVal, prPos, prVal) {
  const fp = +frPos, pp = +prPos;
  const close = Math.abs(fp - pp) < 12;
  let frUp = '', prUp = '';
  if (close) { if (fp <= pp) frUp = ' up'; else prUp = ' up'; }
  const cl = x => Math.min(94, Math.max(6, +x)).toFixed(1);
  return `<div class="tick-val-line">`
    + `<span class="tick-val fr${frUp}" style="left:${cl(fp)}%">${frVal}</span>`
    + `<span class="tick-val pr${prUp}" style="left:${cl(pp)}%">${prVal}</span>`
    + `</div>`;
}
function mqFlatten(payload) {
  const f = {};
  if (payload && payload.dimensions)
    Object.values(payload.dimensions).forEach(dim => (dim.indicateurs || []).forEach(it => { f[it.code] = it; }));
  return f;
}
function mqDeriveDep(t) {
  let c = t.type === 'commune' ? t.code : (t.codes_communes && t.codes_communes[0]);
  if (!c) return '';
  c = String(c);
  return (c.startsWith('97') || c.startsWith('98')) ? c.slice(0, 3) : c.slice(0, 2);
}
function mqSousTitre(t, type, dep) {
  const p = [];
  if (type === 'epci') {
    if (t.code) p.push('SIREN ' + t.code);
    if (t.nb_communes) p.push(t.nb_communes + ' communes');
    if (dep) p.push('Dép. ' + dep);
  } else {
    if (t.code) p.push('INSEE ' + t.code);
    if (dep) p.push('Dép. ' + dep);
    if (t.epci && t.epci.nom) p.push(t.epci.nom);
  }
  return p.join(' · ');
}
function mqLevel(score) {
  if (score == null) return { c: 'mid', l: '—' };
  if (score >= 67) return { c: 'high', l: 'Élevé' };
  if (score >= 45) return { c: 'mid', l: 'Intermédiaire' };
  return { c: 'low', l: 'Faible' };
}
function mqDensPos(v) {
  const lo = Math.log10(10), hi = Math.log10(2500);
  const p = (Math.log10(Math.max(10, v || 10)) - lo) / (hi - lo);
  return Math.max(2, Math.min(98, p * 100));
}
function mqPopPoints(pop, tcam) {
  const r = (tcam != null) ? (1 + tcam / 100) : 1;
  const k = x => Math.max(1, Math.round(x / 1000));
  return {
    v: [k(pop / Math.pow(r, 10)), k(pop / Math.pow(r, 6)), k(pop / Math.pow(r, 3)), k(pop)],
    y: ['2011', '2015', '2018', '2021'],
  };
}

// Mot animé du hero
(function () {
  const words = ["Mesurer", "Comprendre", "Comparer", "Décider"];
  const track = document.getElementById('rollerTrack');
  if (!track) return;
  words.forEach(w => { const el = document.createElement('div'); el.className = 'roller-word'; el.innerHTML = w + '<span class="dot">.</span>'; track.appendChild(el); });
  const els = [...track.children]; let i = 0;
  const EASE = 'cubic-bezier(.7,0,.2,1)';
  function show(idx, instant) {
    els.forEach((el, k) => {
      el.style.transition = instant ? 'none' : `transform .7s ${EASE}, opacity .5s ease`;
      if (k === idx) { el.style.transform = 'translateY(-7%)'; el.style.opacity = '1'; }
      else if (k === (idx - 1 + els.length) % els.length) { el.style.transform = 'translateY(-110%)'; el.style.opacity = '0'; }
      else { el.style.transform = 'translateY(110%)'; el.style.opacity = '0'; }
    });
  }
  show(0, true); setTimeout(() => show(0), 60);
  setInterval(() => { i = (i + 1) % els.length; show(i); }, 2600);
})();

// Compteur animé
function mqCountUp(el) {
  const target = parseFloat(el.dataset.count);
  if (isNaN(target)) { el.textContent = el.dataset.count; return; }
  const dec = (el.dataset.count.indexOf('.') > -1) ? (el.dataset.dec || 1) : 0;
  const dur = 1100, t0 = performance.now();
  function step(t) {
    const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3), v = target * e;
    el.textContent = v.toLocaleString('fr-FR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
    if (p < 1) requestAnimationFrame(step);
    else el.textContent = target.toLocaleString('fr-FR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  }
  requestAnimationFrame(step);
}

// Courbe de population
function mqDrawSpark(points) {
  const svg = document.getElementById('popSpark');
  if (!svg || !points || !points.length) return;
  const W = 400, H = 52, pad = 6;
  const mn = Math.min(...points), mx = Math.max(...points);
  const min = mn - (mx - mn) * 0.4 - 1, max = mx + (mx - mn) * 0.4 + 1;
  const x = i => pad + i * ((W - 2 * pad) / (points.length - 1));
  const y = v => H - pad - ((v - min) / (max - min)) * (H - 2 * pad);
  let d = '';
  points.forEach((v, i) => { d += (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1) + ' '; });
  const area = d + `L${x(points.length - 1)} ${H} L${x(0)} ${H} Z`;
  svg.innerHTML = `
    <path d="${area}" fill="rgba(60,138,94,.12)"/>
    <path d="${d}" fill="none" stroke="var(--vegetal)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
    ${points.map((v, i) => `<circle cx="${x(i)}" cy="${y(v)}" r="${i === points.length - 1 ? 4 : 2.5}" fill="var(--vegetal)"/>`).join('')}
    ${points.map((v, i) => `<text x="${x(i)}" y="${y(v) - 8}" font-size="9" font-family="var(--mono)" fill="var(--ink-4)" text-anchor="middle">${v}k</text>`).join('')}`;
}

// Construit les structures des graphiques à partir de la réponse API
function mqBuildData(t, payload) {
  const f = mqFlatten(payload);
  const V = c => { const it = f[c]; return it && it.valeur != null ? Number(it.valeur) : null; };
  const type = t.type === 'commune' ? 'commune' : 'epci';
  const dep = mqDeriveDep(t);
  const meta = (EMP_REFS && EMP_REFS._meta) || {};
  const nat = (EMP_REFS && EMP_REFS.national) || {};
  let niveau, pairs, pairsCount;
  if (type === 'epci') {
    niveau = (EMP_REFS && EMP_REFS.epci_dens7 && EMP_REFS.epci_dens7[t.code]) || 5;
    pairs = (EMP_REFS && EMP_REFS.dens7_epci && EMP_REFS.dens7_epci[niveau]) || {};
    pairsCount = (meta.counts_epci || {})[niveau];
  } else {
    niveau = (EMP_DENS7 && EMP_DENS7[t.code]) || 5;
    pairs = (EMP_REFS && EMP_REFS.dens7_commune && EMP_REFS.dens7_commune[niveau]) || {};
    pairsCount = (meta.counts_commune || {})[niveau];
  }
  const typeLabel = (meta.dens7_labels || {})[niveau] || '—';
  const pop = V('population_2021') || t.population || 0;
  const e10k = c => { const x = V(c); return (x != null && pop) ? x / pop * 10000 : null; };
  const perHab = c => { const x = V(c); return (x != null && pop) ? x / pop : null; };
  const dims = payload.dimensions || {};
  const sc = k => (dims[k] && dims[k].score != null) ? Math.round(dims[k].score) : null;
  // Rang national absolu (1 = le plus favorable sur l'indicateur), depuis le score national + l'effectif.
  const rankNat = code => {
    const it = f[code];
    if (!it || it.score_national == null || !it.n_national) return null;
    const n = it.n_national;
    const rk = Math.max(1, Math.min(n, Math.round(((100 - it.score_national) / 100) * (n - 1)) + 1));
    return { rk, n };
  };
  // Rang vs pairs dens7 (meme type de densite), depuis le percentile dens7 + le sens.
  const rankD7 = code => {
    const it = f[code];
    if (!it || it.rang_dens7 == null || !it.n_dens7) return null;
    const sens = it.sens != null ? it.sens : 1;
    const scoreD = sens === -1 ? 100 - it.rang_dens7 : it.rang_dens7;
    const n = it.n_dens7;
    const rk = Math.max(1, Math.min(n, Math.round(((100 - scoreD) / 100) * (n - 1)) + 1));
    return { rk, n };
  };
  const rank2 = code => ({ nat: rankNat(code), prs: rankD7(code) });

  // âge
  const ageCodes = ['pop_0_14', 'pop_15_29', 'pop_30_44', 'pop_45_59', 'pop_60_74', 'pop_75_89', 'pop_90_plus'];
  const counts = ageCodes.map(V), tot = counts.reduce((s, x) => s + (x || 0), 0);
  const prof = (tot > 0) ? counts.map(x => +(100 * (x || 0) / tot).toFixed(1)) : [0, 0, 0, 0, 0, 0, 0];
  const nA = nat.age_profil || [], pA = pairs.age_profil || [];
  const bands = ['0–14', '15–29', '30–44', '45–59', '60–74', '75–89', '90 +'];
  const age = bands.map((b, i) => ({ b, v: prof[i] || 0, nat: nA[i] || 0, typ: pA[i] || 0 }));

  // densité
  const densite = { v: V('densite_brute') || 0, fr: nat.densite || 0, pr: pairs.densite || 0, rang: rank2('densite_brute') };

  // équipements /10k
  const eqDefs = [
    { k: 'Services', code: 'bpe_services', ref: 'services', c: 'var(--eau)', i: 'services', s: null },
    { k: 'Santé', code: 'bpe_sante', ref: 'sante', c: 'var(--vegetal)', i: 'sante', s: 'bpe_sante_par_10k' },
    { k: 'Commerces', code: 'bpe_commerces', ref: 'commerces', c: 'var(--soleil)', i: 'commerces', s: 'bpe_commerces_par_10k' },
    { k: 'Sport · culture', code: 'bpe_sport_culture', ref: 'sport_culture', c: 'var(--terre)', i: 'sport', s: 'bpe_sport_culture_par_10k' },
    { k: 'Enseignement', code: 'bpe_enseignement', ref: 'enseignement', c: 'var(--ardoise)', i: 'enseignement', s: 'bpe_enseignement_par_10k' },
  ];
  const ne = nat.equip_10k || {}, pe = pairs.equip_10k || {};
  const cats = eqDefs.map(d => ({ k: d.k, v: +(e10k(d.code) || 0).toFixed(1), fr: ne[d.ref] || 0, pr: pe[d.ref] || 0, c: d.c, i: d.i, rang: d.s ? rank2(d.s) : null }));
  const eqTotal = +cats.reduce((s, c) => s + c.v, 0).toFixed(1);
  const equip = {
    cats, total: { v: eqTotal, fr: ne.total || 0, pr: pe.total || 0, rang: rank2('bpe_total_par_10k') },
    variete: { v: V('variete_equip') || 0, fr: nat.variete_equip || 0, pr: pairs.variete_equip || 0 },
    socle: { v: V('taux_couverture_socle') || 0, fr: nat.couverture_socle || 0, pr: pairs.couverture_socle || 0 },
  };

  // radar : normalisé par le max des trois séries sur chaque axe
  const maxAx = cats.map(c => Math.max(c.v, c.fr, c.pr, 1));
  const radar = {
    axes: ['Services', 'Santé', 'Commerces', 'Sport', 'Enseign.'],
    terr: cats.map((c, i) => +(c.v / maxAx[i]).toFixed(2)),
    fr: cats.map((c, i) => +(c.fr / maxAx[i]).toFixed(2)),
    pr: cats.map((c, i) => +(c.pr / maxAx[i]).toFixed(2)),
  };

  // mobilité
  const nm = nat.modal || {}, pm = pairs.modal || {};
  const ma = V('part_marche') || 0, ve = V('part_velo') || 0, tc = V('part_tc') || 0, vo = V('part_voiture') || 0;
  const au = Math.max(0, +(100 - ma - ve - tc - vo).toFixed(1));
  const modes = [
    { k: 'Marche', v: +ma.toFixed(1), c: 'var(--vegetal)' },
    { k: 'Vélo', v: +ve.toFixed(1), c: 'var(--eau)' },
    { k: 'Transports', v: +tc.toFixed(1), c: 'var(--soleil)' },
    { k: 'Voiture', v: +vo.toFixed(1), c: 'var(--red)' },
    { k: 'Autre', v: au, c: 'var(--ink-4)' },
  ];
  const cmp = [
    { k: 'Marche', v: +ma.toFixed(1), fr: nm.marche || 0, pr: pm.marche || 0, c: 'var(--vegetal)' },
    { k: 'Vélo', v: +ve.toFixed(1), fr: nm.velo || 0, pr: pm.velo || 0, c: 'var(--eau)' },
    { k: 'Transports', v: +tc.toFixed(1), fr: nm.tc || 0, pr: pm.tc || 0, c: 'var(--soleil)' },
  ];
  const mobil = {
    modes, cmp, voiturePart: +vo.toFixed(1), voiturePr: pm.voiture || 0, voitureNat: nm.voiture || 0,
    voitureRang: rank2('part_voiture'),
    travailCommune: { v: V('part_travail_commune') || 0, fr: nat.travail_commune || 0, pr: pairs.travail_commune || 0 },
    voitureSurPlace: { v: V('part_voiture_sur_place') || 0, fr: nat.voiture_sur_place || 0, pr: pairs.voiture_sur_place || 0 },
    doubleMotor: { v: V('taux_double_motorisation') || 0, fr: nat.double_motorisation || 0, pr: pairs.double_motorisation || 0, rang: rank2('taux_double_motorisation') },
  };

  // environnement
  const ng = nat.ges_hab || {}, pg = pairs.ges_hab || {};
  const gT = V('ges_total_par_hab') || perHab('ges_total') || 0;
  const gR = V('ges_transport_par_hab') || perHab('ges_route') || 0;
  const ges = [
    { k: 'Total', v: +gT.toFixed(2), fr: ng.total || 0, pr: pg.total || 0, big: true, rang: rank2('ges_total_par_hab') },
    { k: 'Transport routier', v: +gR.toFixed(2), fr: ng.route || 0, pr: pg.route || 0, rang: rank2('ges_transport_par_hab') },
    { k: 'Résidentiel', v: +(perHab('ges_resid') || 0).toFixed(2), fr: ng.resid || 0, pr: pg.resid || 0 },
    { k: 'Tertiaire', v: +(perHab('ges_tertiaire') || 0).toFixed(2), fr: ng.tertiaire || 0, pr: pg.tertiaire || 0 },
    { k: 'Industrie', v: +(perHab('ges_industrie') || 0).toFixed(2), fr: ng.industrie || 0, pr: pg.industrie || 0 },
  ];
  const route = V('ges_route') || 0, biom = V('co2_biomasse') || 0, resid = V('ges_resid') || 0,
    tert = V('ges_tertiaire') || 0, indus = V('ges_industrie') || 0,
    autres = (V('ges_energie') || 0) + (V('ges_dechets') || 0) + (V('ges_agri') || 0);
  const sT = route + biom + resid + tert + indus + autres;
  const gesSplit = sT > 0 ? [
    { k: 'Transport routier', v: Math.round(100 * route / sT), c: 'var(--red)' },
    { k: 'CO₂ biomasse', v: Math.round(100 * biom / sT), c: 'var(--vegetal)' },
    { k: 'Résidentiel', v: Math.round(100 * resid / sT), c: 'var(--terre)' },
    { k: 'Tertiaire', v: Math.round(100 * tert / sT), c: 'var(--soleil)' },
    { k: 'Industrie', v: Math.round(100 * indus / sT), c: 'var(--ardoise)' },
    { k: 'Autres', v: Math.round(100 * autres / sT), c: 'var(--ink-4)' },
  ].filter(s => s.v > 0) : [];
  const artifM2 = V('artif_15_21') || 0;
  const aHab = V('artif_habitat_09_23'), aInf = V('artif_infra_09_23'), aTot = V('artif_naf09_23');
  const artifInd = f['artif_par_hab'] || {};
  const env = {
    ges, gesSplit, gesTotPerHab: +gT.toFixed(2),
    artif: {
      m2: artifM2, ha: Math.round(artifM2 / 10000), terrains: +(artifM2 / 7140).toFixed(1), parHab: V('artif_par_hab') || 0,
      rangNat: artifInd.rang_national != null ? +artifInd.rang_national : null,
      rang: rank2('artif_par_hab'),
      nNat: artifInd.n_national != null ? +artifInd.n_national : null,
      frHab: nat.artif_par_hab != null ? +nat.artif_par_hab : null,
      prHab: pairs.artif_par_hab != null ? +pairs.artif_par_hab : null,
      stockHa: V('totalclc11') || 0, surfKm2: V('superficie_km2') || 0,
      usage: { habitat: aHab, infra: aInf, total: aTot, partHab: V('part_art_habitat') },
    },
  };

  // socio : lu directement depuis la dimension socio du payload
  const socioInds = (dims.socio && dims.socio.indicateurs) || [];
  const socio = { cards: socioInds.map(it => ({ l: it.libelle || it.label || it.code, v: it.valeur_formatee != null ? String(it.valeur_formatee) : '—', src: it.source || '', rang: rank2(it.code) })) };

  // population
  const tcam = V('tcam_pop');
  const pp = mqPopPoints(pop, tcam);

  return {
    type,
    identity: { nom: t.nom, mqSousTitre: mqSousTitre(t, type, dep), typeLabel, pairsCount, codeLabel: (type === 'epci' ? 'SIREN ' + t.code : 'INSEE ' + t.code) },
    pop: { value: pop, tcam, points: pp.v, years: pp.y },
    score: { global: payload.score_global?.valeur != null ? Math.round(payload.score_global.valeur) : null, struct: sc('struct'), access: sc('access'), mob: sc('mob'), env: sc('env'), socio: sc('socio') },
    centralite: {
      isCommune: type === 'commune',
      socle: { v: V('taux_couverture_socle') || 0, fr: nat.couverture_socle || 0, pr: pairs.couverture_socle || 0 },
      ecoleHab: { v: V('pct_habitat_zone_ecole_15'), fr: nat.centralite_habitat_ecole || 0, pr: pairs.centralite_habitat_ecole || 0 },
      ecoleEq: { v: V('pct_equipements_zone_ecole_15'), fr: nat.centralite_equip_ecole || 0, pr: pairs.centralite_equip_ecole || 0 },
      gareHab: { v: V('pct_habitat_gare_3'), fr: nat.centralite_habitat_gare || 0, pr: pairs.centralite_habitat_gare || 0 },
      gareEq: { v: V('pct_equipements_gare_3'), fr: nat.centralite_equip_gare || 0, pr: pairs.centralite_equip_gare || 0 },
    },
    age, densite, equip, radar, mobil, env, socio,
  };
}

// Rendu du bandeau d'identité
function mqRenderIdentity() {
  const host = document.getElementById('identity');
  if (!host) return;
  const id = mqD.identity, pop = mqD.pop, ce = mqD.centralite, dn = mqD.densite;
  const tcamTxt = pop.tcam != null ? (pop.tcam >= 0 ? '+' : '') + mqComma((+pop.tcam).toFixed(2)) + ' %/an' : '—';

  const socleColor = ce.socle.v >= 70 ? 'var(--vegetal)' : ce.socle.v >= 40 ? 'var(--soleil)' : 'var(--red)';
  const ecole = (k, o) => {
    const v = o.v != null ? +o.v : null;
    const valTxt = v != null ? mqComma(v.toFixed(1)) + ' %' : '—';
    return `
    <div class="dual-row dual-row-val">
      <div class="dual-rowlabel">${k}</div>
      <div class="dual-bigval">${valTxt}</div>
      ${mqTickVals(+o.fr, mqComma((+o.fr).toFixed(1)) + ' %', +o.pr, mqComma((+o.pr).toFixed(1)) + ' %')}
      <div class="track"><i data-w="${v != null ? v.toFixed(1) : 0}"></i><span class="tick fr" data-pos="${(+o.fr).toFixed(0)}"></span><span class="tick pr" data-pos="${(+o.pr).toFixed(0)}"></span></div>
    </div>`;
  };
  const barLegend = `<div class="bar-legend"><span class="bl-item"><i class="bl-tick fr"></i>France</span><span class="bl-item"><i class="bl-tick pr"></i>pairs</span></div>`;
  const ecoleBloc = `<div class="acc-head"><span class="acc-pic">${mqGareEcolePic('ecole')}</span><span class="acc-title">À moins d'1,5 km d'une école</span><span class="src">BPE 2024 · Filosofi 2021</span></div>
       <div class="dual">${ecole('Habitants', ce.ecoleHab)}${ecole('Équipements', ce.ecoleEq)}${barLegend}<div class="acc-note">Part des habitants (et des équipements du quotidien) situés à moins d'1,5 km d'une école élémentaire. Marqueur de compacité et de marchabilité du territoire.</div></div>`;

  host.innerHTML = `
  <div class="identity reveal">
    <div class="identity-top">
      <div class="identity-cell">
        <div class="identity-name">${id.nom}</div>
        <div class="identity-meta">${id.mqSousTitre}</div>
        <div class="type-box">
          <div class="cell-label">Type de territoire</div>
          <div class="type-name">${id.typeLabel}</div>
          <div class="type-sub">${id.pairsCount ? id.pairsCount + (mqD.type === 'epci' ? ' agglomérations' : ' communes') + ' comparables · « pairs »' : 'territoires comparables'}</div>
        </div>
      </div>
      <div class="identity-cell">
        <div class="cell-label">Population <span class="src">INSEE Recensement 2021</span></div>
        <div class="pop-row"><div class="v tabular" data-count="${pop.value}">0</div><div class="u">hab · 2021</div></div>
        <div><span class="pop-chip">${tcamTxt} <span class="x">2015 → 2021</span></span>
          <span style="font-size:12px;color:var(--ink-4);margin-left:8px">vs France métro. +0,3 %/an</span></div>
        <svg class="spark" id="popSpark" viewBox="0 0 400 52" preserveAspectRatio="none"></svg>
      </div>
      <div class="identity-cell">
        <div class="cell-label">Densité de population <span class="src">INSEE Recensement 2021</span></div>
        <div class="gauge-val"><span class="v tabular">${mqFmt(dn.v)}</span><span class="u">hab/km²</span></div>
        ${mqTickVals(mqDensPos(dn.fr), mqFmt(dn.fr), mqDensPos(dn.pr), mqFmt(dn.pr))}
        <div class="gauge">
          <span class="gauge-tick fr" style="left:${mqDensPos(dn.fr).toFixed(0)}%"></span>
          <span class="gauge-tick pr" style="left:${mqDensPos(dn.pr).toFixed(0)}%"></span>
          <div class="gauge-marker" id="densMarkerId" data-pos="${mqDensPos(dn.v).toFixed(0)}" style="left:0%"></div>
        </div>
        <div class="gauge-scale"><span>Très peu dense</span><span>Très dense</span></div>
        <div class="bar-legend" style="margin-top:12px"><span class="bl-item"><i class="bl-tick fr"></i>France</span><span class="bl-item"><i class="bl-tick pr"></i>pairs</span></div>
        <div style="margin-top:10px">${mqRankChip(dn.rang)}</div>
      </div>
    </div>
    <div class="identity-foot">
      <div class="acc-cell">
        <div class="acc-head"><span class="acc-pic">${mqGareEcolePic('socle')}</span><span class="acc-title">Socle d'équipements</span><span class="src">BPE 2024</span></div>
        <div class="acc-big"><span class="v tabular">${mqComma((+ce.socle.v).toFixed(1))}</span><span class="u">% du socle</span></div>
        ${mqTickVals(+ce.socle.fr, mqFmt(ce.socle.fr) + ' %', +ce.socle.pr, mqFmt(ce.socle.pr) + ' %')}
        <div class="track" style="margin-top:2px"><i data-w="${(+ce.socle.v).toFixed(1)}" style="background:${socleColor}"></i><span class="tick fr" data-pos="${(+ce.socle.fr).toFixed(0)}"></span><span class="tick pr" data-pos="${(+ce.socle.pr).toFixed(0)}"></span></div>
        ${barLegend}
        <div class="acc-note">Présence des 31 équipements essentiels du quotidien (mairie, médecin, école, boulangerie…), pondérés selon leur importance. Mesure la diversité des services présents, pas leur nombre.</div>
      </div>
      <div class="acc-cell">${ecoleBloc}</div>
      <div class="acc-cell">
        <div class="acc-head"><span class="acc-pic">${mqGareEcolePic('gare')}</span><span class="acc-title">À moins de 3 km d'une gare</span><span class="src">BPE 2024 · Filosofi 2021</span></div>
        <div class="dual">${ecole('Habitants', ce.gareHab)}${ecole('Équipements', ce.gareEq)}${barLegend}<div class="acc-note">Part des habitants (et des équipements du quotidien) situés à moins de 3 km d'une gare de voyageurs. Marqueur de desserte ferroviaire du territoire.</div></div>
      </div>
    </div>
  </div>`;
  mqDrawSpark(pop.points);
}
function mqGareEcolePic(kind) {
  const f = kind === 'socle' ? 'equipement-logo' : kind === 'ecole' ? 'ecole-logo' : 'train-logo';
  return `<img src="/assets/${f}.png" alt="" class="acc-img">`;
}
function mqModeImg(k) {
  const map = { 'Marche': 'marche-logo', 'Vélo': 'velo-logo', 'Transports': 'transport-logo', 'Voiture': 'voiture-logo' };
  const f = map[k];
  return f ? `<img src="/assets/${f}.png" alt="" class="mode-img">` : '';
}

// Sections : les cinq dimensions
const mqSECMETA = [
  { key: 'struct', num: '01', title: 'Structure démographique', render: mqRenderDemo },
  { key: 'access', num: '02', title: 'Accessibilité aux équipements', render: mqRenderEquip },
  { key: 'mob', num: '03', title: 'Mobilité', render: mqRenderMobil },
  { key: 'env', num: '04', title: 'Artificialisation & GES', render: mqRenderEnv },
  { key: 'socio', num: '05', title: 'Socio-économique', render: mqRenderSocio },
];
function mqRenderSections() {
  const cont = document.getElementById('sections');
  if (!cont) return;
  cont.innerHTML = '';
  mqSECMETA.forEach((s, idx) => {
    const sec = document.createElement('section');
    sec.className = 'section' + (idx > 0 ? ' collapsed' : '');
    sec.dataset.key = s.key;
    sec.innerHTML = `
      <div class="sec-head">
        <div class="sec-num">${s.num}</div>
        <div class="sec-title">${s.title}</div>
        <div class="sec-spacer"></div>
        <svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="m6 9 6 6 6-6"/></svg>
      </div>
      <div class="sec-body">${s.render()}</div>`;
    cont.appendChild(sec);
    sec.querySelector('.sec-head').addEventListener('click', () => {
      sec.classList.toggle('collapsed');
      if (!sec.classList.contains('collapsed')) mqAnimateSection(sec);
    });
  });
  document.querySelectorAll('.section').forEach(s => mqIo.observe(s));
  setTimeout(() => { const first = document.querySelector('.section'); if (first) mqAnimateSection(first); }, 360);
}

// Section 1 : structure démographique
function mqRenderDemo() {
  const a = mqD.age;
  const sen = k => (a[4]?.[k] || 0) + (a[5]?.[k] || 0) + (a[6]?.[k] || 0); // 60 ans et +
  const jeu = k => (a[0]?.[k] || 0);                                       // moins de 15 ans
  const ij   = jeu('v')   > 0 ? Math.round(jeu('v')   / sen('v')   * 100) : null;
  const ijFr = jeu('nat') > 0 ? Math.round(jeu('nat') / sen('nat') * 100) : null;
  const ijPr = jeu('typ') > 0 ? Math.round(jeu('typ') / sen('typ') * 100) : null;
  const ijMax = Math.max(20, ij || 0, ijFr || 0, ijPr || 0);
  const scl = Math.ceil(ijMax * 1.12 / 10) * 10;
  const pct = x => (x != null && scl > 0) ? Math.min(100, +(x / scl * 100).toFixed(1)) : 0;
  const labelPos = ij != null ? Math.min(92, Math.max(8, pct(ij))) : 50;
  let gloss = '';
  if (ij != null && ijPr != null) {
    gloss = ij > ijPr * 1.05 ? 'Population plus jeune que les territoires comparables'
          : ij < ijPr * 0.95 ? 'Population plus âgée que les territoires comparables'
          : "Structure d'âge proche des territoires comparables";
  }
  return `<div class="panels cols-2">
    <div class="panel">
      <div class="panel-head"><span class="panel-title">Répartition par âge</span><span class="src">INSEE Recensement 2021</span></div>
      <div class="panel-note">Part de la population par tranche d'âge, comparée aux références.</div>
      <div class="age-chart" id="ageChart"></div>
      <div class="age-axis"><span>0 %</span><span>10 %</span><span>20 %</span><span>30 %</span></div>
      <div class="legend">
        <span><i style="background:var(--eau)"></i>${mqD.identity.nom}</span>
        <span><i class="line"></i>Moyenne nationale</span>
        <span><i class="dash"></i>${mqD.identity.typeLabel}</span>
      </div>
    </div>
    <div class="panel">
      <div class="panel-head"><span class="panel-title">Indice de jeunesse</span><span class="src">INSEE Recensement 2021</span></div>
      <div class="panel-note">Nombre de jeunes de moins de 15 ans pour 100 personnes de 60 ans et plus. Plus l'indice est élevé, plus la population est jeune.</div>
      <div class="gauge-val"><span class="v tabular">${ij != null ? ij : '—'}</span><span class="u">jeunes (&lt;15 ans) pour 100 seniors (60+)</span></div>
      ${gloss ? `<div class="vieil-gloss">${gloss}</div>` : ''}
      <div style="margin-top:22px">${mqTickVals(pct(ijFr), ijFr != null ? ijFr : '—', pct(ijPr), ijPr != null ? ijPr : '—')}</div>
      <div class="track"><i data-w="${pct(ij).toFixed(1)}"></i><span class="tick fr" data-pos="${pct(ijFr).toFixed(1)}"></span><span class="tick pr" data-pos="${pct(ijPr).toFixed(1)}"></span></div>
      <div class="bar-legend" style="margin-top:14px"><span class="bl-item"><i class="bl-tick fr"></i>France</span><span class="bl-item"><i class="bl-tick pr"></i>pairs</span></div>
      <div class="placeholder-note">Bloc Logements (occupation, statut, collectif/individuel) — à venir.</div>
    </div>
  </div>`;
}

// Section 2 : accessibilité aux équipements
function mqRenderEquip() {
  const eq = mqD.equip, maxv = Math.max(700, ...eq.cats.map(c => Math.max(c.v, c.fr, c.pr)));
  const rows = eq.cats.map(c => `
    <div class="eq-row">
      <div class="eq-head"><span class="eq-pic" style="background:color-mix(in oklab,${c.c} 15%,transparent);color:${c.c}">${mqEQICON[c.i] || ''}</span><span class="eq-name">${c.k}</span><span class="eq-v tabular" style="color:${c.c}">${mqComma(c.v)}</span></div>
      <div class="eq-bar-wrap">
        <div class="eq-bar" data-w="${(c.v / maxv * 100).toFixed(1)}" style="background:${c.c}"></div>
        <span class="eq-tick" style="left:${(c.fr / maxv * 100).toFixed(1)}%;background:var(--ink)"></span>
        <span class="eq-tick" style="left:${(c.pr / maxv * 100).toFixed(1)}%;background:var(--pair)"></span>
      </div>
      <div class="eq-ref">France ${mqComma(c.fr)} · <span class="eq-ref-pr">pairs ${mqComma(c.pr)}</span></div>
    </div>`).join('');
  return `<div class="panels cols-3">
    <div class="panel">
      <div class="panel-head"><span class="panel-title">Équipements / 10 000 hab</span><span class="src">INSEE BPE 2024</span></div>
      <div style="font-size:11px;color:var(--ink-3);margin:-2px 0 6px;line-height:1.3">Y en a-t-il beaucoup ? Densité rapportée à la population.</div>
      <div class="eq-total-wrap"><div class="eq-total"><div><span class="v tabular">${mqFmt(eq.total.v, 1)}</span></div><div class="ref">France ${mqFmt(eq.total.fr)} · pairs ${mqFmt(eq.total.pr)}</div></div>${eq.total.rang ? `<div class="eq-total-rank">${mqRankChip(eq.total.rang)}</div>` : ''}</div>
      ${rows}
      <div class="legend"><span><i class="line"></i>France</span><span><i class="line pr"></i>Pairs</span></div>
    </div>
    <div class="panel" style="display:flex;flex-direction:column;justify-content:center">
      <div style="margin-bottom:12px">
        <div class="l" style="margin-bottom:6px">Familles présentes sur le territoire</div>
        <div style="display:flex;flex-wrap:wrap;gap:5px">
          ${eq.cats.map(c => { const on = (c.v || 0) > 0; return `<span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:600;padding:3px 8px;border-radius:999px;background:${on ? `color-mix(in oklab,${c.c} 14%,transparent)` : '#eef0ee'};color:${on ? c.c : '#9aa19a'}">${on ? '✓' : '✗'} ${c.k}</span>`; }).join('')}
        </div>
        <div style="font-size:11px;color:var(--ink-3);margin-top:6px;line-height:1.3">Ce qui est là, ce qui manque. Une famille absente est un angle mort de proximité.</div>
      </div>
      <div class="divider-h"></div>
      <div class="kpi-mini">
        <div class="v tabular">${mqComma((+eq.socle.v).toFixed(1))}<span class="u"> %</span></div><div class="l">Couverture du socle</div>
        <div style="font-size:11px;color:var(--ink-3);margin:1px 0 5px;line-height:1.3">Les essentiels sont-ils là ? Présence des 31 équipements de base, peu importe leur nombre.</div>
        <div class="bar"><i data-w="${(+eq.socle.v).toFixed(1)}" style="background:var(--vegetal)"></i></div>
        <div class="ref">France ${mqFmt(eq.socle.fr)} % · pairs ${mqFmt(eq.socle.pr)} %</div>
      </div>
      <div class="divider-h"></div>
      <div class="kpi-mini">
        <div class="v tabular">${mqFmt(eq.variete.v)}</div><div class="l">Variété de l'offre</div>
        <div style="font-size:11px;color:var(--ink-3);margin:1px 0 5px;line-height:1.3">L'offre est-elle diversifiée ? Nombre de types d'équipements différents présents.</div>
        <div class="bar"><i data-w="${Math.min(100, eq.variete.v / 72 * 100).toFixed(0)}"></i></div>
        <div class="ref">France ${mqFmt(eq.variete.fr)} · pairs ${mqFmt(eq.variete.pr)}</div>
      </div>
    </div>
    <div class="panel">
      <div class="panel-head"><span class="panel-title">Profil d'équipements</span><span class="src">INSEE BPE 2024</span></div>
      <div class="radar-wrap"><div class="radar" id="radar"></div></div>
      <div class="legend" style="justify-content:center"><span><i style="background:var(--eau)"></i>${mqD.identity.nom}</span><span><i class="line"></i>France</span><span><i class="dash"></i>Pairs</span></div>
    </div>
  </div>`;
}

// Section 3 : mobilité
function mqRenderMobil() {
  const m = mqD.mobil;
  const SC = Math.max(18, Math.ceil(Math.max(...m.cmp.flatMap(x => [x.v || 0, x.fr || 0, x.pr || 0])) / 5) * 5);
  const clamp = x => Math.min(100, Math.max(0, +(x / SC * 100).toFixed(1)));
  const seg = arr => arr.map((v, i) => `<div class="split-seg" data-w="${v}" style="background:${m.modes[i].c}"><span>${v > 6 ? mqComma(v) + '%' : ''}</span></div>`).join('');
  const ecart = (m.voiturePart - m.voiturePr).toFixed(1);
  const ecartNat = (m.voiturePart - m.voitureNat).toFixed(1);
  return `<div class="panels cols-2">
    <div class="panel">
      <div class="panel-head"><span class="panel-title">Parts modales domicile-travail</span><span class="src">INSEE MOBPRO 2021</span></div>
      <div class="modal-big"><div class="v tabular">${mqComma(m.voiturePart)} %</div><div class="cap">des trajets domicile-travail en <b>voiture</b>.${(m.voiturePr || m.voitureNat) ? `<span class="mob-ecarts">${m.voiturePr ? `<span class="mob-ecart ${ecart >= 0 ? 'neg' : 'pos'}">${ecart >= 0 ? '+' : ''}${mqComma(ecart)} pts</span> vs comparables` : ''}${(m.voiturePr && m.voitureNat) ? ' · ' : ''}${m.voitureNat ? `<span class="mob-ecart ${ecartNat >= 0 ? 'neg' : 'pos'}">${ecartNat >= 0 ? '+' : ''}${mqComma(ecartNat)} pts</span> vs national` : ''}</span>` : ''}</div></div>
      <div class="rl" style="margin-bottom:9px"><span class="k terr">Répartition modale · ${mqD.identity.nom}</span></div>
      <div class="split-bar" data-split>${seg(m.modes.map(x => x.v))}</div>
      <div class="modal-legend" style="margin-top:14px">${m.modes.map(x => `<span><i style="background:${x.c}"></i>${x.k}<b style="font-weight:800;margin-left:5px">${mqComma(x.v)}%</b></span>`).join('')}</div>
      <div style="font-weight:700;font-size:13px;margin:24px 0 14px;color:var(--ink-2);letter-spacing:-0.01em">Modes hors voiture <span style="color:var(--ink-4);font-weight:600">· part et écart aux références</span></div>
      <div class="mode-compare">
        ${m.cmp.map(x => `
          <div class="mc-row">
            <div class="mc-head"><span class="mode-img-wrap">${mqModeImg(x.k)}</span><span class="mc-name">${x.k}</span></div>
            <div>
              <div class="mc-track"><div class="mc-fill" data-w="${clamp(x.v)}" style="background:${x.c}"></div><span class="mc-tick" data-pos="${clamp(x.fr)}" style="background:var(--ink)"></span><span class="mc-tick" data-pos="${clamp(x.pr)}" style="background:var(--pair)"></span></div>
              <div class="mc-val"><b>${mqComma(x.v)} %</b>France ${mqComma(x.fr)} % · pairs ${mqComma(x.pr)} %</div>
            </div>
          </div>`).join('')}
      </div>
      <div class="legend" style="margin-top:4px"><span><i class="line"></i>France</span><span><i class="line pr"></i>Pairs</span></div>
    </div>
    <div class="panel" style="display:flex;flex-direction:column;justify-content:center">
      <div class="stat-block">
        <div class="sl">Actifs travaillant dans leur commune</div>
        <div class="sv tabular">${mqComma((+m.travailCommune.v).toFixed(1))} %</div>
        <div class="sref">France ${mqComma((+m.travailCommune.fr).toFixed(1))} % · pairs ${mqComma((+m.travailCommune.pr).toFixed(1))} %</div>
      </div>
      <div class="stat-block">
        <div class="sl">Parmi eux, usage de la voiture <span class="malus">futur malus</span></div>
        <div class="sv tabular">${mqComma((+m.voitureSurPlace.v).toFixed(1))} %</div>
        <div class="sref">France ${mqComma((+m.voitureSurPlace.fr).toFixed(1))} % · pairs ${mqComma((+m.voitureSurPlace.pr).toFixed(1))} %</div>
      </div>
      <div class="divider-h"></div>
      <div class="stat-block">
        <div class="sl">Double motorisation · ménages à 2 voitures ou +</div>
        <div class="sv tabular">${mqComma((+m.doubleMotor.v).toFixed(1))} %</div>
        <div class="track" style="margin-top:12px"><i data-w="${(+m.doubleMotor.v).toFixed(1)}" style="background:var(--terre)"></i><span class="tick fr" data-pos="${(+m.doubleMotor.fr).toFixed(0)}"></span><span class="tick pr" data-pos="${(+m.doubleMotor.pr).toFixed(0)}"></span></div>
        <div class="sref" style="margin-top:7px">France ${mqComma((+m.doubleMotor.fr).toFixed(1))} % · pairs ${mqComma((+m.doubleMotor.pr).toFixed(1))} %</div>
      </div>
    </div>
  </div>`;
}

// Section 4 : environnement
function mqRenderEnv() {
  const e = mqD.env, gmax = Math.max(8, ...e.ges.map(g => Math.max(g.v, g.fr, g.pr)));
  const gesTV = (frP, prP, frV, prV) => {
    const close = Math.abs(frP - prP) < 14;
    const cl = x => Math.min(93, Math.max(7, x)).toFixed(1);
    return `<div class="ges-tickvals"><span class="gtv fr${close && frP <= prP ? ' up' : ''}" style="left:${cl(frP)}%">${frV}</span><span class="gtv pr${close && prP < frP ? ' up' : ''}" style="left:${cl(prP)}%">${prV}</span></div>`;
  };
  const gesRows = e.ges.map(g => {
    const frP = g.fr / gmax * 100, prP = g.pr / gmax * 100;
    return `
    <div class="ges-row">
      <div class="gk">${g.k}<small class="tabular">${mqComma(g.v)}</small></div>
      <div class="ges-mid">
        ${gesTV(frP, prP, mqComma(g.fr), mqComma(g.pr))}
        <div class="ges-bar-wrap">
          <div class="ges-bar" data-w="${(g.v / gmax * 100).toFixed(1)}" style="${g.big ? 'background:var(--ink)' : ''}"></div>
          <span class="ges-tick" style="left:${frP.toFixed(1)}%;background:var(--ink)"></span>
          <span class="ges-tick" style="left:${prP.toFixed(1)}%;background:var(--pair)"></span>
        </div>
      </div>
      <div class="tabular" style="font-size:11px;color:var(--ink-4);text-align:right">${g.k === 'Total' ? 'tCO₂e' : ''}</div>
    </div>`;
  }).join('');
  const ar = e.artif, u = ar.usage || {};
  const uHab = u.habitat || 0, uInf = u.infra || 0;
  const uTot = Math.max(u.total || 0, uHab + uInf);
  const pH = uTot > 0 ? Math.round(100 * uHab / uTot) : 0;
  const pI = uTot > 0 ? Math.round(100 * uInf / uTot) : 0;
  const pA = Math.max(0, 100 - pH - pI);
  const hasVent = uTot > 0;
  const rN = ar.rangNat;
  const mailleLbl = mqD.type === 'commune' ? 'communes' : 'agglomérations';
  const refLine = (ar.frHab != null || ar.prHab != null)
    ? `<div class="dual-foot">${ar.frHab != null ? 'France ' + mqComma((+ar.frHab).toFixed(1)) : ''}${(ar.frHab != null && ar.prHab != null) ? ' · ' : ''}${ar.prHab != null ? 'pairs ' + mqComma((+ar.prHab).toFixed(1)) : ''} m²/hab</div>`
    : '';
  const stockPct = ar.surfKm2 > 0 ? Math.min(100, +(ar.stockHa / ar.surfKm2).toFixed(1)) : null;
  return `<div class="panels cols-2b">
    <div class="panel">
      <div class="panel-head"><span class="panel-title">Artificialisation des sols</span><span class="src">Corine Land Cover 2018 · ENAF 2009-2023</span></div>
      ${stockPct != null ? `
      <div class="cell-label">Part du territoire déjà artificialisée · Corine Land Cover</div>
      <div style="display:flex;align-items:baseline;gap:9px;margin-top:3px">
        <span class="tabular" style="font-size:40px;font-weight:800;letter-spacing:-.03em;color:var(--terre)">${mqComma(stockPct.toFixed(1))}<span style="font-size:21px"> %</span></span>
        <span style="font-size:13px;color:var(--ink-3);font-weight:600">soit ${mqFmt(Math.round(ar.stockHa))} ha sur ${mqComma((+ar.surfKm2).toFixed(0))} km²</span>
      </div>
      <div class="track" style="margin-top:11px;height:9px"><i data-w="${stockPct.toFixed(1)}" style="background:var(--terre)"></i></div>
      <div class="gauge-scale"><span>0 %</span><span>100 % du territoire</span></div>
      <div class="divider-h"></div>` : ''}
      <div class="cell-label">Consommé sur 2015–2021 · artificialisation nouvelle</div>
      <div class="waffle-head"><span class="v tabular">${mqFmt(ar.m2)}</span><span class="u">m² · ${mqFmt(ar.ha)} ha</span></div>
      <div class="waffle-eq">≈ ${mqComma(ar.terrains)} terrains de football consommés</div>
      <div class="pitch-grid" id="pitchGrid" data-terrains="${ar.terrains}"></div>
      <div class="waffle-foot">1 icône = 1 terrain de foot (7 140 m²) · la dernière marque la fraction</div>
      <div class="waffle-perhab">
        <div class="cell-label">Par habitant</div>
        <div style="display:flex;align-items:baseline;gap:8px"><span class="tabular" style="font-size:30px;font-weight:800;letter-spacing:-.03em">${mqComma((+ar.parHab).toFixed(1))}</span><span style="font-size:13px;color:var(--ink-3);font-weight:600">m² · 2015–2021</span></div>
        ${refLine}
      </div>
      ${rN != null ? `
      <div class="divider-h"></div>
      <div class="cell-label">Positionnement national · artif par habitant</div>
      <div class="pctl-bar"><span class="pctl-marker" style="left:${Math.max(3, Math.min(97, rN)).toFixed(0)}%"></span></div>
      <div class="pctl-scale"><span>moins artificialisé</span><span>plus artificialisé</span></div>
      <div style="margin-top:9px">${mqRankChip(ar.rang)}</div>` : ''}
      ${hasVent ? `
      <div class="divider-h"></div>
      <div class="panel-head" style="margin-top:2px"><span class="panel-title" style="font-size:14px">Ventilation par usage</span><span class="src">ENAF · 2009→2023</span></div>
      <div class="split-bar" data-split>
        <div class="split-seg" data-w="${pH}" style="background:var(--terre)"><span>${pH > 9 ? pH + '%' : ''}</span></div>
        <div class="split-seg" data-w="${pI}" style="background:var(--ardoise)"><span>${pI > 9 ? pI + '%' : ''}</span></div>
        <div class="split-seg" data-w="${pA}" style="background:var(--ink-4)"><span>${pA > 9 ? pA + '%' : ''}</span></div>
      </div>
      <div class="modal-legend" style="margin-top:14px">
        <span><i style="background:var(--terre)"></i>Habitat <b style="font-weight:800;margin-left:5px">${pH}%</b></span>
        <span><i style="background:var(--ardoise)"></i>Infrastructures <b style="font-weight:800;margin-left:5px">${pI}%</b></span>
        <span><i style="background:var(--ink-4)"></i>Autres <b style="font-weight:800;margin-left:5px">${pA}%</b></span>
      </div>` : ''}
    </div>
    <div class="panel">
      <div class="panel-head"><span class="panel-title">Émissions GES par habitant</span><span class="src">ADEME · inventaire territorial</span></div>
      <div style="margin-bottom:20px">${gesRows}</div>
      <div class="legend"><span><i class="line"></i>France</span><span><i class="line pr"></i>Pairs</span></div>
      <div class="divider-h"></div>
      <div class="panel-head"><span class="panel-title">Répartition des émissions</span><span class="src">ADEME · inventaire territorial</span></div>
      <div class="donut-wrap" id="gesDonut" data-total="${mqComma(e.gesTotPerHab)}"></div>
    </div>
  </div>`;
}

// Section 5 : socio-économique
function mqRenderSocio() {
  const cards = mqD.socio.cards.length ? mqD.socio.cards : [{ l: 'Données socio-économiques', v: '—', src: 'À brancher' }];
  const cardHtml = cards.map(c => `
    <div class="soc-card"><div class="soc-label">${c.l}</div><div class="soc-val tabular">${c.v}</div>
      <div class="soc-rank"><span>${c.src || ''}</span></div></div>`).join('');
  return `<div class="panel">
    <div class="panel-head"><span class="panel-title">Revenus, emploi &amp; cohésion sociale</span><span class="src">INSEE Filosofi 2021</span></div>
    <div class="soc-grid">${cardHtml}</div>
  </div>`;
}

// Dessins SVG : radar, terrains, donut, tracé des âges
function mqDrawRadar(el) {
  const R = 120, cx = 150, cy = 140, N = mqD.radar.axes.length;
  const ang = i => (-Math.PI / 2) + i * 2 * Math.PI / N;
  const pt = (i, v) => [cx + Math.cos(ang(i)) * R * v, cy + Math.sin(ang(i)) * R * v];
  const poly = arr => arr.map((v, i) => pt(i, v).map(n => n.toFixed(1)).join(',')).join(' ');
  let grid = '', spokes = '', labels = '';
  [0.25, 0.5, 0.75, 1].forEach(g => { grid += `<polygon points="${mqD.radar.axes.map((_, i) => pt(i, g).map(n => n.toFixed(1)).join(',')).join(' ')}" fill="none" stroke="var(--line)" stroke-width="1"/>`; });
  mqD.radar.axes.forEach((a, i) => {
    const [x, y] = pt(i, 1); spokes += `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="var(--line)" stroke-width="1"/>`;
    const [lx, ly] = pt(i, 1.14); labels += `<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" font-size="10" font-family="var(--mono)" fill="var(--ink-3)" text-anchor="middle" dominant-baseline="middle">${a}</text>`;
  });
  el.innerHTML = `<svg viewBox="-26 -20 352 330">
    ${grid}${spokes}
    <polygon points="${poly(mqD.radar.fr)}" fill="none" stroke="var(--ink)" stroke-width="1.5"/>
    <polygon points="${poly(mqD.radar.pr)}" fill="none" stroke="var(--ink-4)" stroke-width="1.5" stroke-dasharray="4 3"/>
    <polygon class="radar-poly" points="${poly(mqD.radar.terr)}" style="opacity:0;transform-origin:${cx}px ${cy}px;transform:scale(.3);transition:opacity .6s,transform .8s cubic-bezier(.2,.8,.2,1)"/>
    ${labels}
  </svg>`;
  const pg = el.querySelector('.radar-poly');
  requestAnimationFrame(() => { pg.style.opacity = '1'; pg.style.transform = 'scale(1)'; });
}
function mqBuildPitches(el) {
  const terrains = +(el.dataset.terrains || 0);
  const full = Math.floor(terrains), frac = +(terrains - full).toFixed(2);
  const P = '<svg viewBox="0 0 30 20" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="1" y="1" width="28" height="18" rx="1.5" fill="currentColor" fill-opacity="0.16"/><line x1="15" y1="1" x2="15" y2="19"/><circle cx="15" cy="10" r="3"/><rect x="1" y="6" width="3.5" height="8"/><rect x="25.5" y="6" width="3.5" height="8"/></svg>';
  // Taille des icônes adaptée au nombre : plus il y en a, plus elles rapetissent,
  // pour afficher le compte exact sans exploser la hauteur.
  const minPx = full <= 14 ? 56 : full <= 80 ? 28 : full <= 200 ? 19 : full <= 450 ? 14 : full <= 900 ? 11 : full <= 1500 ? 9 : 7;
  const gapPx = full <= 80 ? 7 : full <= 450 ? 3 : 2;
  el.style.setProperty('--pitch-min', minPx + 'px');
  el.style.setProperty('--pitch-gap', gapPx + 'px');
  const cap = Math.min(full, 2000); // garde-fou DOM ; le compte exact reste affiché en texte
  let html = '';
  for (let i = 0; i < cap; i++) html += `<div class="pitch">${P}</div>`;
  if (frac >= 0.08 && full < 2000) html += `<div class="pitch frac" style="--f:${frac}">${P}</div>`;
  el.innerHTML = html;
  const items = el.querySelectorAll('.pitch');
  if (items.length > 600) {
    items.forEach(p => { p.style.transform = 'scale(1)'; p.style.opacity = '1'; p.classList.add('on'); });
  } else {
    const stag = Math.max(2, Math.min(20, 1400 / Math.max(1, items.length)));
    items.forEach((p, i) => setTimeout(() => { p.style.transition = 'transform .4s cubic-bezier(.3,1.3,.5,1),opacity .3s,color .4s'; p.style.transform = 'scale(1)'; p.style.opacity = '1'; p.classList.add('on'); }, i * stag));
  }
}
function mqDrawDonut(el) {
  const segsData = mqD.env.gesSplit;
  const R = 58, r = 38, cx = 70, cy = 70, C = 2 * Math.PI * ((R + r) / 2), sw = R - r;
  let off = 0, segs = '';
  segsData.forEach(g => { const len = g.v / 100 * C; segs += `<circle cx="${cx}" cy="${cy}" r="${(R + r) / 2}" fill="none" stroke="${g.c}" stroke-width="${sw}" stroke-dasharray="0 ${C}" stroke-dashoffset="${-off}" data-len="${len}" style="transition:stroke-dasharray .9s cubic-bezier(.2,.8,.2,1)"/>`; off += len; });
  el.innerHTML = `<div class="donut"><svg width="140" height="140">${segs}</svg>
    <div class="donut-center"><div class="v tabular">${el.dataset.total}</div><div class="u">tCO₂e/hab</div></div></div>
    <div class="donut-legend">${segsData.map(g => `<div class="dl-row"><i style="background:${g.c}"></i><span class="dk">${g.k}</span><span class="dv tabular">${g.v} %</span></div>`).join('')}</div>`;
  const circles = el.querySelectorAll('circle');
  requestAnimationFrame(() => { setTimeout(() => circles.forEach(c => { c.setAttribute('stroke-dasharray', `${c.dataset.len} ${C - c.dataset.len}`); }), 80); });
}
function mqDrawAgeTrace(ac) {
  const maxAge = 30;
  const wraps = [...ac.querySelectorAll('.age-bar-wrap')];
  if (!wraps.length) return;
  const old = ac.querySelector('.age-trace'); if (old) old.remove();
  const ageRev = mqD.age.slice().reverse();
  const W = ac.clientWidth, H = ac.clientHeight;
  const xy = key => wraps.map((w, i) => [(w.offsetLeft + (ageRev[i][key] / maxAge) * w.offsetWidth), (w.offsetTop + w.offsetHeight / 2)]);
  const nat = xy('nat'), typ = xy('typ');
  const path = pts => pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'age-trace'); svg.setAttribute('width', W); svg.setAttribute('height', H); svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.innerHTML = `
    <path d="${path(typ)}" fill="none" stroke="var(--pair)" stroke-width="2" stroke-dasharray="5 4" stroke-linejoin="round" stroke-linecap="round"/>
    <path d="${path(nat)}" fill="none" stroke="var(--ink)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    ${typ.map(p => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="2.6" fill="var(--card-2)" stroke="var(--pair)" stroke-width="1.5"/>`).join('')}
    ${nat.map(p => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3" fill="var(--ink)"/>`).join('')}`;
  ac.appendChild(svg);
  requestAnimationFrame(() => svg.style.opacity = '1');
}

// Animations au défilement de section
function mqAnimateSection(sec) {
  sec.querySelectorAll('.track > i, .eq-bar, .ges-bar, .kpi-mini .bar > i, .mc-fill, .soc-rank .rb > i').forEach(el => {
    el.style.width = (el.dataset.w || 0) + '%';
    requestAnimationFrame(() => { el.style.transform = 'scaleX(1)'; });
  });
  sec.querySelectorAll('.tick, .eq-tick, .ges-tick, .mc-tick').forEach(t => { if (t.dataset.pos) t.style.left = t.dataset.pos + '%'; });
  const ac = sec.querySelector('#ageChart');
  if (ac && !ac.dataset.done) {
    ac.dataset.done = 1; const maxAge = 30;
    ac.innerHTML = mqD.age.slice().reverse().map(a => `
      <div class="age-row">
        <div class="age-band">${a.b}</div>
        <div class="age-bar-wrap"><div class="age-bar" data-w="${(a.v / maxAge * 100).toFixed(1)}" title="${a.b} : ${mqComma(a.v)} %"></div></div>
        <div class="age-val tabular">${mqComma(a.v)} %</div>
      </div>`).join('');
    const bars = ac.querySelectorAll('.age-bar');
    bars.forEach(b => { b.style.width = b.dataset.w + '%'; });
    requestAnimationFrame(() => bars.forEach(b => { b.style.transform = 'scaleX(1)'; }));
    setTimeout(() => mqDrawAgeTrace(ac), 80);
  }
  sec.querySelectorAll('[data-split]').forEach(bar => {
    bar.querySelectorAll('.split-seg').forEach(s => { requestAnimationFrame(() => { s.style.width = s.dataset.w + '%'; const sp = s.querySelector('span'); if (sp) sp.style.opacity = '1'; }); });
  });
  const r = sec.querySelector('#radar'); if (r && !r.dataset.done) { r.dataset.done = 1; mqDrawRadar(r); }
  const pg = sec.querySelector('#pitchGrid'); if (pg && !pg.dataset.done) { pg.dataset.done = 1; mqBuildPitches(pg); }
  const dn = sec.querySelector('#gesDonut'); if (dn && !dn.dataset.done) { dn.dataset.done = 1; mqDrawDonut(dn); }
}
const mqIo = new IntersectionObserver(entries => {
  entries.forEach(e => { if (e.isIntersecting) { if (e.target.classList.contains('section') && !e.target.classList.contains('collapsed')) mqAnimateSection(e.target); mqIo.unobserve(e.target); } });
}, { threshold: 0.12 });

// compteurs du hero et de l'identité
function mqFireTop() {
  document.querySelectorAll('.hero-stat [data-count], .identity [data-count]').forEach(mqCountUp);
  document.querySelectorAll('.identity .track > i').forEach(i => { i.style.width = (i.dataset.w || 0) + '%'; requestAnimationFrame(() => { i.style.transform = 'scaleX(1)'; }); });
  document.querySelectorAll('.identity .tick').forEach(t => { if (t.dataset.pos) t.style.left = t.dataset.pos + '%'; });
  document.querySelectorAll('.identity .gauge-marker').forEach(m => { if (m.dataset.pos) requestAnimationFrame(() => { m.style.left = m.dataset.pos + '%'; }); });
}

// Point d'entree : appele par loadTerritoire a la place de l'ancien rendu.
function mqRender(t, ind) {
  if (!EMP_REFS) { EMP_PENDING = [t, ind]; return; }
  if (!ind) return;
  mqD = mqBuildData(t, ind);
  mqRenderIdentity();
  mqRenderSections();
  setTimeout(mqFireTop, 120);
}

// Compteurs fixes du hero, anime une fois au chargement.
(function () {
  document.querySelectorAll('.hero-stat [data-count], .hero-stat-val[data-count]').forEach(mqCountUp);
})();


(function initL41() {
  
  document.getElementById('tweaks')?.remove();

  const headerSearch = wireSearchInput('searchInput', 'searchDropdown', 'headerSearch');
  const headerBtn = document.getElementById('searchBtn');
  headerBtn?.addEventListener('click', headerSearch?.handleSubmit);

  wireSearchInput('heroSearchInput', 'heroSearchDropdown', 'heroSearchCard');

  document.querySelectorAll('.search-hint[data-code]').forEach(btn => {
    btn.addEventListener('click', () => {
      const code = btn.dataset.code;
      const label = btn.textContent.trim();
      const heroInput = document.getElementById('heroSearchInput');
      if (heroInput) heroInput.value = label;
      document.querySelector('[data-screen-label="02 Diagnostic"]')?.scrollIntoView({ behavior: 'smooth' });
      loadTerritoire(code);
    });
  });

  const chips = document.querySelectorAll('.map-head-layers .layer-chip');
  chips.forEach((chip, i) => {
    const layerKey = ['contour', 'tc', 'velo'][i];
    if (!layerKey) return;
    chip.addEventListener('click', () => {
      chip.classList.toggle('is-active');
      toggleMapLayer(layerKey);
    });
  });

  loadTerritoire('241700434');
})();
