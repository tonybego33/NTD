
window.cartoState = {
  map: null,
  layers: {},     
  contourLayer: null,
};

function openCartographie(e) {
  e?.preventDefault();
  const overlay = document.getElementById('view-cartographie');
  overlay.classList.add('is-open');
  document.body.style.overflow = 'hidden';
  
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('is-active'));
  e?.currentTarget?.classList?.add('is-active');
  
  if (!window.cartoState.map) {
    initCartoMap();
  }
  
  if (state.territoire?.code) {
    syncCartoToTerritoire(state.territoire.code);
  }
  
  setTimeout(() => window.cartoState.map?.invalidateSize(), 200);
}

function closeCartographie(e) {
  e?.preventDefault();
  const overlay = document.getElementById('view-cartographie');
  overlay.classList.remove('is-open');
  document.body.style.overflow = '';
  
  document.querySelectorAll('.nav-link').forEach((l, i) => {
    l.classList.toggle('is-active', i === 0);
  });
}

function initCartoMap() {
  const M = L.map('cartoMap', {
    zoomControl: true, scrollWheelZoom: true, dragging: true,
  }).setView([46.8, 2.5], 6);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png', {
    attribution: '© OpenStreetMap © CARTO',
    subdomains: 'abcd', maxZoom: 19,
  }).addTo(M);
  window.cartoState.map = M;
}

async function syncCartoToTerritoire(code) {
  if (!code) return;
  const M = window.cartoState.map;
  if (!M) return;
  
  const lbl = document.getElementById('cartoTerritoire');
  if (lbl && state.territoire?.nom) {
    lbl.textContent = `${state.territoire.nom} · ${state.territoire.type}`;
  }
  
  await loadCartoContour(code);
  await loadCommunesContours(code);
  
  for (const cat of Object.keys(window.cartoState.layers)) {
    const cb = document.getElementById(`cartoLayer-${cat}`);
    if (cb?.checked && cat !== 'contour') {
      await toggleCartoLayer(cat, cb, true);
    }
  }
  // Recharger aussi la densité si une est active
  const densiteRadio = document.querySelector('input[name="densite"]:checked');
  if (densiteRadio && densiteRadio.value) {
    await setDensiteLayer(densiteRadio.value);
  }
}

async function loadCartoContour(code) {
  const M = window.cartoState.map;
  if (!M) return;
  if (window.cartoState.contourLayer) {
    M.removeLayer(window.cartoState.contourLayer);
    window.cartoState.contourLayer = null;
  }
  const cb = document.getElementById('cartoLayer-contour');
  if (cb && !cb.checked) return;
  try {
    // Le contour est dans /territoire/{code}, pas dans /carto
    const t = await fetchTerritoire(code);
    const gj = t?.contour;
    if (!gj) {
      setStatus('error', 'Contour indisponible');
      return;
    }
    const layer = L.geoJSON(gj, {
      style: { color: '#c1623a', weight: 2, fillColor: '#c1623a', fillOpacity: 0.12 },
    }).addTo(M);
    window.cartoState.contourLayer = layer;
    M.fitBounds(layer.getBounds(), { padding: [40, 40] });
    setStatus('ok', 'Contour chargé');
  } catch (e) {
    console.error('Erreur contour carto', e);
    setStatus('error', 'Contour : ' + (e.message || 'erreur'));
  }
}

async function toggleCartoLayer(cat, checkbox, forceReload = false) {
  const M = window.cartoState.map;
  if (!M) return;
  if (!state.territoire?.code) {
    setStatus('error', 'Sélectionne d\'abord un territoire');
    if (checkbox) checkbox.checked = false;
    return;
  }
  
  if (cat === 'contour') {
    return loadCartoContour(state.territoire.code);
  }
  
  if (window.cartoState.layers[cat]) {
    M.removeLayer(window.cartoState.layers[cat]);
    delete window.cartoState.layers[cat];
  }
  // Retire aussi les buffers associés et cache le slider
  if (window.cartoState.buffers?.[cat]) {
    M.removeLayer(window.cartoState.buffers[cat]);
    delete window.cartoState.buffers[cat];
  }
  const bufferCtrl = document.getElementById(`bufferCtrl-${cat}`);
  if (bufferCtrl && !checkbox.checked) bufferCtrl.hidden = true;
  if (!checkbox.checked && !forceReload) return;
  
  try {
    setStatus('loading', `Chargement ${cat}…`);
    const data = await apiGet(`/carto/${encodeURIComponent(state.territoire.code)}?layers=${cat}`);
    const gj = data?.[cat];
    if (!gj?.features?.length) {
      setStatus('error', `Aucun ${cat} sur ce territoire`);
      return;
    }
    const colorMap = {
      ecoles: '#c1623a', velo: '#4a6b3a', tc: '#5b7da6',
      sante: '#c1623a', commerces: '#a35d2a',
    };
    const color = colorMap[cat] || '#777';
    const group = L.layerGroup();

    // Stocke les features pour pouvoir redessiner les buffers à la volée
    if (!window.cartoState.features) window.cartoState.features = {};
    window.cartoState.features[cat] = gj.features;

    gj.features.forEach(f => {
      if (f.geometry?.type === 'Point') {
        const [lon, lat] = f.geometry.coordinates;
        L.circleMarker([lat, lon], { radius: 4, color, weight: 1.5, fillColor: '#fff', fillOpacity: 1 })
          .bindTooltip(`<strong>${f.properties?.type || f.properties?.nom || ''}</strong><br>${f.properties?.libcom || ''}`, { direction: 'top', offset: [0, -4] })
          .addTo(group);
      } else if (f.geometry?.type === 'LineString' || f.geometry?.type === 'MultiLineString') {
        L.geoJSON(f, { style: { color, weight: 2, opacity: 0.7 } }).addTo(group);
      }
    });

    // Affiche/cache le slider buffer associé à ce calque (ecoles, tc, sante, commerces)
    const bufferCtrl = document.getElementById(`bufferCtrl-${cat}`);
    if (bufferCtrl) {
      bufferCtrl.hidden = !checkbox.checked;
    }
    // Si un buffer était déjà actif (slider > 0), on le redessine
    const slider = document.getElementById(`bufferSlider-${cat}`);
    if (slider && checkbox.checked && parseInt(slider.value) > 0) {
      updateBuffer(cat, slider.value);
    }
    group.addTo(M);
    window.cartoState.layers[cat] = group;
    setStatus('ok', `${gj.features.length} ${cat}`);
  } catch (e) {
    console.error(`Erreur ${cat}`, e);
    setStatus('error', e.message || 'Erreur');
  }
}





// PARTIE : CARTOGRAPHIE CONTOURS + LABELS COMMUNES
async function loadCommunesContours(code) {
  // Charge les données GeoJSON des communes (centroïdes + contours) en cache.
  // NE DESSINE RIEN automatiquement. Le rendu se fait via toggleCommunesContour
  // et toggleCommunesNames quand l'utilisateur coche les cases.
  const M = window.cartoState.map;
  if (!M) return;

  // Reset les couches précédentes (changement de territoire)
  if (window.cartoState.communesLayer) {
    M.removeLayer(window.cartoState.communesLayer);
    window.cartoState.communesLayer = null;
  }
  if (window.cartoState.communesLabels) {
    window.cartoState.communesLabels.forEach(l => M.removeLayer(l));
    window.cartoState.communesLabels = null;
  }
  if (!window.cartoState._zoomHandlerBound) {
    M.on('zoomend', updateCommuneLabelsVisibility);
    window.cartoState._zoomHandlerBound = true;
  }

  try {
    const data = await apiGet(`/densite/${encodeURIComponent(code)}?type=pop`);
    window.cartoState.communesData = data;

    // Redessiner UNIQUEMENT les couches dont le toggle est coché
    const cbContour = document.getElementById('cartoLayer-communes');
    const cbNames = document.getElementById('cartoLayer-communesNames');
    if (cbContour?.checked) drawCommunesContour();
    if (cbNames?.checked) drawCommunesNames();
  } catch (e) {
    console.warn('Erreur chargement communes', e);
  }
}

function drawCommunesContour() {
  const M = window.cartoState.map;
  const data = window.cartoState.communesData;
  if (!M || !data) return;
  if (window.cartoState.communesLayer) {
    M.removeLayer(window.cartoState.communesLayer);
  }
  const layer = L.geoJSON(data, {
    style: {
      color: '#5a5e68',
      weight: 0.35,
      opacity: 0.45,
      fillColor: 'transparent',
      fillOpacity: 0,
      interactive: false,
    },
  });
  layer.addTo(M);
  window.cartoState.communesLayer = layer;
}

function drawCommunesNames() {
  const M = window.cartoState.map;
  const data = window.cartoState.communesData;
  if (!M || !data) return;
  if (window.cartoState.communesLabels) {
    window.cartoState.communesLabels.forEach(l => M.removeLayer(l));
  }
  const labels = [];
  (data.features || []).forEach(f => {
    const nom = f.properties?.nom;
    if (!nom || !f.geometry) return;
    const tempLayer = L.geoJSON(f);
    const center = tempLayer.getBounds().getCenter();
    const marker = L.marker(center, {
      interactive: false,
      keyboard: false,
      icon: L.divIcon({
        className: 'commune-label',
        html: `<span>${nom}</span>`,
        iconSize: null,
      }),
    });
    marker.addTo(M);
    labels.push(marker);
  });
  window.cartoState.communesLabels = labels;
  updateCommuneLabelsVisibility();
}

function toggleCommunesContour(checkbox) {
  const M = window.cartoState.map;
  if (!M) return;
  if (checkbox.checked) {
    if (window.cartoState.communesData) {
      drawCommunesContour();
    } else if (state.territoire?.code) {
      loadCommunesContours(state.territoire.code);
    }
  } else {
    if (window.cartoState.communesLayer) {
      M.removeLayer(window.cartoState.communesLayer);
      window.cartoState.communesLayer = null;
    }
  }
}

function toggleCommunesNames(checkbox) {
  const M = window.cartoState.map;
  if (!M) return;
  if (checkbox.checked) {
    if (window.cartoState.communesData) {
      drawCommunesNames();
    } else if (state.territoire?.code) {
      loadCommunesContours(state.territoire.code);
    }
  } else {
    if (window.cartoState.communesLabels) {
      window.cartoState.communesLabels.forEach(l => M.removeLayer(l));
      window.cartoState.communesLabels = null;
    }
  }
}

function updateCommuneLabelsVisibility() {
  const M = window.cartoState.map;
  if (!M) return;
  const z = M.getZoom();
  const labels = window.cartoState.communesLabels || [];
  labels.forEach(l => {
    const el = l.getElement();
    if (el) el.style.display = z >= 11 ? '' : 'none';
  });
}

// PARTIE : CARTOGRAPHIE DENSITE
const DENSITE_META = {
  pop:   { label: 'Population',   unit: 'hab/km²',     colors: ['#fef3e8', '#b85a36'] },
  equip: { label: 'Équipements',  unit: 'équip/km²',   colors: ['#f0ece2', '#5b7da6'] },
  sante: { label: 'Santé',        unit: 'équip santé/km²', colors: ['#f4ece4', '#a04020'] },
  artif: { label: 'Artificialisé', unit: '%',           colors: ['#f0ede5', '#4a4f58'] },
};

function _hexToRgb(hex) {
  const m = hex.replace('#', '').match(/.{2}/g);
  return m.map(x => parseInt(x, 16));
}

function _interpolateColor(c1, c2, t) {
  const a = _hexToRgb(c1);
  const b = _hexToRgb(c2);
  const r = Math.round(a[0] + (b[0] - a[0]) * t);
  const g = Math.round(a[1] + (b[1] - a[1]) * t);
  const bl = Math.round(a[2] + (b[2] - a[2]) * t);
  return `rgb(${r},${g},${bl})`;
}

function _colorForValue(value, min, max, colors) {
  if (value == null || !isFinite(value)) return '#e8e3d6';
  const t = max === min ? 0.5 : (value - min) / (max - min);
  return _interpolateColor(colors[0], colors[1], Math.max(0, Math.min(1, t)));
}

async function setDensiteLayer(type) {
  const M = window.cartoState.map;
  if (!M) return;

  // Retirer ancienne couche choropleth/heatmap
  if (window.cartoState.densiteLayer) {
    M.removeLayer(window.cartoState.densiteLayer);
    window.cartoState.densiteLayer = null;
  }

  const legend = document.getElementById('densiteLegend');

  if (!type) {
    if (legend) legend.style.display = 'none';
    return;
  }

  if (!state.territoire?.code) {
    setStatus('error', 'Sélectionne d\'abord un territoire');
    const radio = document.querySelector('input[name="densite"][value=""]');
    if (radio) radio.checked = true;
    return;
  }

  // Branchement : choropleth (pop/artif) ou heatmap (heat-X)
  if (type === 'pop' || type === 'artif') {
    await _loadChoropleth(type);
  } else if (type.startsWith('heat-')) {
    const cat = type.replace('heat-', '');
    await _loadHeatmap(cat);
  }
}

async function _loadChoropleth(type) {
  const M = window.cartoState.map;
  const legend = document.getElementById('densiteLegend');
  try {
    setStatus('loading', `Chargement densité ${type}…`);
    const data = await apiGet(`/densite/${encodeURIComponent(state.territoire.code)}?type=${type}`);
    const features = data?.features || [];
    if (!features.length) {
      setStatus('error', 'Aucune commune trouvée');
      return;
    }
    const values = features.map(f => f.properties?.valeur).filter(v => v != null && isFinite(v));
    if (!values.length) {
      setStatus('error', 'Aucune donnée disponible');
      return;
    }
    const min = Math.min(...values);
    const max = Math.max(...values);
    const meta = DENSITE_META[type];

    const layer = L.geoJSON(data, {
      style: feature => ({
        fillColor: _colorForValue(feature.properties.valeur, min, max, meta.colors),
        weight: 0.8,
        color: '#fff',
        fillOpacity: 0.75,
      }),
      onEachFeature: (feature, lyr) => {
        const v = feature.properties.valeur;
        const nom = feature.properties.nom || '';
        const valStr = v != null ? v.toLocaleString('fr-FR') + ' ' + meta.unit : 'n/a';
        lyr.bindTooltip(`<strong>${nom}</strong><br>${meta.label}: ${valStr}`, {
          direction: 'top', sticky: true,
        });
      },
    }).addTo(M);
    window.cartoState.densiteLayer = layer;

    if (legend) {
      legend.style.display = 'block';
      document.getElementById('densiteLegendUnit').textContent = '(' + meta.unit + ')';
      document.getElementById('densiteLegendMin').textContent = min.toLocaleString('fr-FR');
      document.getElementById('densiteLegendMax').textContent = max.toLocaleString('fr-FR');
      document.getElementById('densiteLegendBar').style.background = `linear-gradient(90deg, ${meta.colors[0]}, ${meta.colors[1]})`;
    }
    setStatus('ok', `Densité ${meta.label} : ${features.length} communes`);
  } catch (e) {
    console.error('Erreur choropleth', e);
    setStatus('error', e.message || 'Erreur');
  }
}

async function _loadHeatmap(cat) {
  const M = window.cartoState.map;
  const legend = document.getElementById('densiteLegend');
  if (typeof L.heatLayer !== 'function') {
    setStatus('error', 'Plugin heatmap non chargé');
    return;
  }
  try {
    setStatus('loading', `Heatmap ${cat}…`);
    const data = await apiGet(`/carto/${encodeURIComponent(state.territoire.code)}?layers=${cat}`);
    const features = data?.[cat]?.features || [];
    if (!features.length) {
      setStatus('error', `Aucun ${cat} sur ce territoire`);
      return;
    }
    const points = features
      .filter(f => f.geometry?.type === 'Point')
      .map(f => {
        const [lon, lat] = f.geometry.coordinates;
        return [lat, lon, 1.0];
      });
    if (!points.length) {
      setStatus('error', `Aucun point ${cat} valide`);
      return;
    }
    const gradientMap = {
      equip:     { 0.2: '#fef3e8', 0.5: '#b58832', 1.0: '#c1623a' },
      sante:     { 0.2: '#fdf0e8', 0.5: '#d97a2e', 1.0: '#a04020' },
      commerces: { 0.2: '#fcf2e2', 0.5: '#c19828', 1.0: '#a35d2a' },
    };
    const labelMap = { equip: 'Équipements', sante: 'Santé', commerces: 'Commerces' };

    const heat = L.heatLayer(points, {
      radius: 22,
      blur: 18,
      maxZoom: 14,
      gradient: gradientMap[cat] || gradientMap.equip,
      minOpacity: 0.45,
    });
    heat.addTo(M);
    window.cartoState.densiteLayer = heat;

    if (legend) {
      legend.style.display = 'block';
      document.getElementById('densiteLegendUnit').textContent = '(densité)';
      document.getElementById('densiteLegendMin').textContent = 'Faible';
      document.getElementById('densiteLegendMax').textContent = 'Élevée';
      const g = gradientMap[cat] || gradientMap.equip;
      document.getElementById('densiteLegendBar').style.background = `linear-gradient(90deg, ${g[0.2]}, ${g[0.5]}, ${g[1.0]})`;
    }
    setStatus('ok', `Heatmap ${labelMap[cat]} : ${points.length} points`);
  } catch (e) {
    console.error('Erreur heatmap', e);
    setStatus('error', e.message || 'Erreur');
  }
}


// PARTIE : CARTOGRAPHIE BUFFER
function updateBuffer(cat, valueMeters) {
  const M = window.cartoState.map;
  if (!M) return;
  const radius = parseInt(valueMeters);
  const radiusKm = (radius / 1000).toFixed(1).replace('.', ',');

  // Met à jour le label
  const valEl = document.getElementById(`bufferVal-${cat}`);
  if (valEl) valEl.textContent = radius === 0 ? '0' : radiusKm;

  // Retire l'ancienne couche de buffers
  if (!window.cartoState.buffers) window.cartoState.buffers = {};
  if (window.cartoState.buffers[cat]) {
    M.removeLayer(window.cartoState.buffers[cat]);
    delete window.cartoState.buffers[cat];
  }

  // Si rayon 0 ou pas de features, on s'arrête
  if (radius === 0) return;
  const features = window.cartoState.features?.[cat];
  if (!features) return;

  const colorMap = {
    ecoles: '#c1623a', tc: '#5b7da6', sante: '#c1623a', commerces: '#a35d2a',
  };
  const color = colorMap[cat] || '#777';

  const group = L.layerGroup();
  features.forEach(f => {
    if (f.geometry?.type === 'Point') {
      const [lon, lat] = f.geometry.coordinates;
      L.circle([lat, lon], {
        radius: radius,
        color: color,
        weight: 1,
        fillColor: color,
        fillOpacity: 0.04,
        opacity: 0.4,
      }).addTo(group);
    }
  });
  group.addTo(M);
  window.cartoState.buffers[cat] = group;
}

let cartoSearchTimer = null;
function cartoSearch() {
  const input = document.getElementById('cartoSearchInput');
  if (!input) return;
  const q = input.value.trim();
  if (!q) return;
  clearTimeout(cartoSearchTimer);
  cartoSearchTimer = setTimeout(async () => {
    try {
      const data = await apiGet(`/search?q=${encodeURIComponent(q)}`);
      const dd = document.getElementById('cartoSearchDropdown');
      if (!dd) return;
      const results = data?.results || data || [];
      if (!results.length) { dd.hidden = true; return; }
      dd.innerHTML = results.slice(0, 8).map(r => `
        <div class="search-result" onclick="selectCartoTerritoire('${r.code}', '${(r.nom||'').replace(/'/g, "\\'")}', '${r.type||'commune'}')">
          <strong>${r.nom||r.libgeo||'?'}</strong>
          <span style="opacity:.6;font-size:11px">${r.code} · ${r.type||'commune'}</span>
        </div>
      `).join('');
      dd.hidden = false;
    } catch (e) { console.error(e); }
  }, 250);
}
async function selectCartoTerritoire(code, nom, type) {
  state.territoire = { code, nom, type };
  document.getElementById('cartoSearchDropdown').hidden = true;
  document.getElementById('cartoSearchInput').value = nom;
  await syncCartoToTerritoire(code);
}
document.addEventListener('DOMContentLoaded', () => {
  const inp = document.getElementById('cartoSearchInput');
  if (inp) inp.addEventListener('input', cartoSearch);
});
