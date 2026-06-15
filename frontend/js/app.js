
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
  struct: { num: '01', name: 'Structure urbaine',         poids: '20 %', source: 'INSEE · IGN' },
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
  const pavesHtml = indicateurs.length
    ? indicateurs.map(ind => renderDimPave(ind, null, terrType)).join('')
    : `<div class="dim-section-empty">Aucun indicateur disponible pour cette dimension sur ce territoire.</div>`;

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
  
  const order = ['struct', 'access', 'mob', 'env', 'socio', 'gouv'];
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

    renderIdentity(t);

    if (ind) {
      updateScoreGlobal(ind.score_global, ind.score_global?.libelle_typo);
      updateDimensionsFromAPI(ind.dimensions);
      updateDimsRecap(ind.score_global);
      
      if (ind.score_global?.libelle_typo) {
        setBind('typo-libelle', ind.score_global.libelle_typo);
      }
      
      updateKpiBand(ind);
      
      renderDetailedSections(ind);
      setupDimAccordion();
    }

    loadNotation(code);

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
