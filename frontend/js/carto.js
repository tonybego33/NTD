/* ============================================================
   Cartographie « Empreintes » — 5 angles de lecture (lentilles)
   Branché sur les endpoints réels :
     /territoire/{code}        -> contour EPCI/commune
     /densite/{code}?type=...  -> choroplèthe par commune (pop|equip|sante|artif)
     /carto/{code}?layers=...  -> POI (ecoles|sante|commerces|tc|velo|gares)
   Dépend de app.js : apiGet, fetchTerritoire, state, setStatus.
   ============================================================ */

window.cartoState = {
  map: null, baseLayer: null, basemap: 'light',
  contourLayer: null,
  communesData: null, communesLayer: null, communesLabels: null,
  choroLayer: null, poiLayers: {}, poiFeatures: {}, bufferLayer: null,
  couche: null, angle: 'demo',
  sub: {
    enseignement: new Set(),
    equipements: new Set(),
    mobilite: new Set(),
  },
  buffer: { enseignement: 0, equipements: 0, mobilite: 0 },
  toggles: { communes: true, names: false },
  epciVals: [],
  code: null, _zoomBound: false, _wired: false,
};

/* ───── Bascule de vue (sous le même header, pas de page séparée) ───── */
function openCartographie(e) {
  e?.preventDefault();
  const overlay = document.getElementById('view-cartographie');
  if (!overlay) return;
  overlay.classList.add('is-open');
  document.body.style.overflow = 'hidden';
  document.querySelectorAll('.site-header .nav-link').forEach((l, i) => l.classList.toggle('is-active', i === 1));
  setCartoNavActive('cartographie');

  if (!window.cartoState.map) initCartoMap();

  const code = state?.territoire?.code;
  if (code && code !== window.cartoState.code) {
    syncCartoToTerritoire(code);
  } else if (code) {
    applyLens();
  }
  setTimeout(() => window.cartoState.map?.invalidateSize(), 180);
}

function closeCartographie(e) {
  e?.preventDefault();
  const overlay = document.getElementById('view-cartographie');
  if (overlay) overlay.classList.remove('is-open');
  document.body.style.overflow = '';
  document.querySelectorAll('.site-header .nav-link').forEach((l, i) => l.classList.toggle('is-active', i === 0));
}

function cartoGoMethodo(e) {
  closeCartographie(e);
  if (typeof openMethodologie === 'function') openMethodologie(e);
}

function setCartoNavActive(key) {
  document.querySelectorAll('.carto-hdr-nav a').forEach(a => a.classList.toggle('active', a.dataset.nav === key));
}

/* ───── Carte + fonds ───── */
const CARTO_TILES = {
  light:     { url: 'https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png', opt: { attribution: '\u00a9 OpenStreetMap \u00a9 CARTO', subdomains: 'abcd', maxZoom: 19 } },
  plan:      { url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', opt: { attribution: '\u00a9 OpenStreetMap \u00a9 CARTO', subdomains: 'abcd', maxZoom: 19 } },
  relief:    { url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', opt: { attribution: '\u00a9 OpenTopoMap (CC-BY-SA)', subdomains: 'abc', maxZoom: 17 } },
  satellite: { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', opt: { attribution: '\u00a9 Esri, Maxar, Earthstar Geographics', maxZoom: 19 } },
};
function _makeBaseLayer(b) {
  const t = CARTO_TILES[b] || CARTO_TILES.light;
  return L.tileLayer(t.url, t.opt);
}

function initCartoMap() {
  const M = L.map('cartoMap', { zoomControl: true, scrollWheelZoom: true, dragging: true })
    .setView([46.8, 2.5], 6);
  const base = _makeBaseLayer('light').addTo(M);
  window.cartoState.map = M;
  window.cartoState.baseLayer = base;
  M.on('zoomend', updateCommuneLabelsVisibility);
  buildLensRail();
  buildToggles();
  wireCartoUI();
}

function setBasemap(b) {
  const M = window.cartoState.map;
  if (!M) return;
  if (window.cartoState.baseLayer) M.removeLayer(window.cartoState.baseLayer);
  const base = _makeBaseLayer(b).addTo(M);
  base.bringToBack();
  window.cartoState.baseLayer = base;
  window.cartoState.basemap = b;
  document.querySelectorAll('.basemap-switch button').forEach(x => x.classList.toggle('on', x.dataset.base === b));
}

/* ───── Définition des lentilles ───── */
const CARTO_ICON = {
  enseignement: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10 12 5 2 10l10 5 10-5z"/><path d="M6 12v5c0 1 2.6 2.5 6 2.5s6-1.5 6-2.5v-5"/></svg>',
  demo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="7" r="3"/><circle cx="17" cy="9" r="2.2"/><path d="M3 20v-1a5 5 0 0 1 9-3"/><path d="M14 20v-.5a4 4 0 0 1 7-2.6"/></svg>',
  equipements: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2 2 7l10 5 10-5z"/><path d="m2 17 10 5 10-5M2 12l10 5 10-5"/></svg>',
  equipdens: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2 2 7l10 5 10-5z"/><path d="m2 17 10 5 10-5M2 12l10 5 10-5"/></svg>',
  mobilite: '<img class="lens-png" alt="" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEgAAABICAYAAABV7bNHAAAfy0lEQVR42o2ceZAd1X3vP+ec7r7LrNo1oxVJoAWQhAQCsdlsxgZsvMXEJgHbefZ7mBRVz5RfXh6Viu1XSTmLU5WkHql4X+MNGztgbFaHVYCEhJCE8GjfNdKMZr1zl+5zzvujl9vd9w54KDFz+/Zy+rf/vr/f74harWpBAIC1CCGwWNLHAIQQGGsRIjxkrUGI6JzU+Ta+RoCI75E5I7qXSV8fP6p5fyFl8uzweosUAmOiNVqLkAJrLFJKjDEgwida2zyWPkdrjecVaNTruJ5HEARIKRBCEPgBhWKRWrVKqVxmqlKhWCwiqtWqDRcav4KN/oxXGh4LFwBKOEihUFKFi4yvjBYtE0KK5vfRgrUxSCmT4xG1MoSIj9nomJQ5omRXmhBbCokQRESRCbONCQkZ6ACpBPVGDakkRluUUiHprUVKReD7eIUmAXUQIGq1qrVNGcosUAqBNholFZ4qgIBKY4KJ+ghVv9KUDCHQWqMcBxNopAq55TguWgcoxyEIfJRS6EAjlcJGHE8kV8qIOSFTEq4bjRQqkdiYZ9ZYpFIhcWRIJBARA0xCQgtgLKVCB11uD51eL0JCw68T2AAlVXhuRNDwPVST6LVq1WY42fyFwVByy/i6wZ6zW3nt+HMcnzzAeHUU3zaaJyaaGEuCICMg0VexipI6Nfksov/ZpkLa+KTUbQUiq4pZSwAyVrNIMaMlusqlw+tmce8KLpx1GRsWXEPJ7aDaqCBTRLLY0DRE6ipqtZrN6n9TnItuiTfPvMaj+77PgeE9IASu9FBSIYVsvgtNVYwXKnK2xaZoQE6j4i8y19Ce4FmKpW5g8xS3CcFt/J/V+NoHAX2dS/jAqrvY0HcNtUa1SZCUicDayAa1SJCl4JR4bOA/eGTgu2Ch6JYzBlOkWBd/TqTIiojbzaWGnMm+W9aW5EiQkZrssTy50swRaS7YVkJLIQGBr2v4psFNy/+Ij6z5DI2gjhChYXeUItAaJWVeggTGaIpemV/u+RaP7vs+nV53eKE1KWaHCxBpNUjpvMiKRnbxltw1bycp00hcTivTkgoiZfdtC9FDLw1SCCSSsdowNyz/MJ9Ydx/V2hSu4xJojeMotDZIMq5XUyqUeeno4/zmwA/p8noBkRCHtoIupiFJWrRJvIXNLNrmXsK2kiklNWlzJaYlmU05RZH5JxLGhsTUVtNTnMUzB3/JU/t+QbnUQd2v4zhOFAJIZKxr1ho8p8DQ5CCPDHwHT5aSF0wTMfZwWc9sSclzytimbFR8ik3/nf3dVGDb7rUzKpklfuo55H7bPBOyImmsoex28ejADzh+7jAdpU4ajXrkgTUydI/hA5VUbDnxOEOTp3GU10YV4k8iCQtDYuW5Rou9aWG7aP3T2qw05QlF9Cyi59kU8e109jtn1ETu4RaLIx0qjTFeOP5rhBa4nofv+zhKRRIEKBTVoMKrx56h4JQwVmcWK1LBW6tLTr9pxDHRJGDWnoqMgE2jK6nbZQnVjmU2raoZVymacYbI0695jcFQdMvsPL2FST2O8Q2u64TBJViMNXhugUPDA5yrnsWRXnuXKpoGtrls0e7pWamybWyXzRmVjKMX7a9LzEmrlNrMK2dX1i6lsTbLVEe6jFSH2HdmN8VSkYbfwFEOMu1Hh2onI3cnaPPGkWC0SQ3SHLStX9vm5Rn/LphOBW3zfJENCZKML2V/rc1TSOTUqFXqwncUKYEXaO1ztnYCNDgqMtRYG4b9EkamhkDYFs6JvGiKNtJl24h77iZiGmmLrZrIReDkCdvejbbRUttMM0SbYGIatRZCMFYdAQVBlCJJIUSYBxlA2iTqjX+3cuAdLG0ufov/tY3tclYkf4/IXLUJJEQSXYqIAuFzRPv7trduictPP0BIIglSGK2RMTEQYLRJHiLE2wX47c+xGVkQTTFOeb1kUW10y9o2DIgCO5t3U23FwLa6S5tlsGhLKJHc01gLkgR5cOIslhRk0SIvKRQkDTnk0wIhkoQiCflFYjbb2LW2+VcbUbJMyyo7zWvbnMzZ6dxlNmlMDH9MC6eVMaK9GojQPNEGAkvgpGZ0BDabiGS4K2gPpOU+25TNS8ugeJvIu62dsa33zsp86tqsJceJsZWsORHTGsT8shLutLnetjX1YlrFaJ93NWEIKSUyyo5EGwkw1oI1bYjcnmhtoZkYH4l+O+lgSrSNbltRBDFNJhXTyaa/FDnVtTbDreReQmTJKLIOVSDwdYOGrjdZJIBmOokrPVxVwFqNtWLad0kv2EZZtIy+l5HDilFJhxSGbHNBFzYNw7aqRntVTqUhIqvbNo3y5a+M9V7YFqGTQhJon3mdi9iw4OomwUWT2fWgyp7BbZycOELJKWMwMB2sK2jJAiwgpMBoAwqMb3CUExEokiAp5bSW0eYdiG0DO0RQhhIqE3W3gydspAr5CDcdNcdBs0RSD6pcv/x2rjnvlmlTk/evvouvb/1bdp9+haJbxmLSYXo2PxRtvKYFqSQEoCI4tylBErTWrXd5m4RJpDUppQ4VfzKXQ7WiRAWnhBQqkxyI1Kc0w62wKOWwa/BVrl76PkaqZ/nPN7+boIDaBMztWsgtKz/OH6/9HP936A1MUnWx+Xwmw2lBNm0zxoIDwZSP5xZwklzFgHJUAioJK1rVqIl4ZbDmtD/wtc/1yz7IspmrE/BcRAFdHGXXgiq/Hfgx4/VRlFBNQiYq0wwPQuOrKToldp9+lSOj+1jUs4xTE0fYe/Z1Sm4ZLEz5kyzsXsb6/iuZWZ7L4OQxPFVo40VzDM7lj1IKCMCJgbMkcZOEZY5p4nCRRteFbXGn6Qe967zb6OtezNv97DjxPOemzuC45ayty8QtNtE3ISW+bvDswUe4e+P93Ljioxwe3Uen1422AV2FXpb0XoCxhpo/lWDmNlXXa0LEaYdkMz5eBxpcCCqxBMUGz4BynDAvs+3innzuZFvx46iO9W+vfJG5nQuw1iCFw53r76Oz0MNPdv4/zlROYqzm8Lnf4yoPbYJEMq1N289sDGWNoeAU2XHqRd4/dRfr+jczp6OPkepZHOlghWGsfo49Z7YxUj1LwS1lYOJsncQ2NSU+Gmf1jgM+OI6DNgbHxG8nIfBzEpRmYiriziJU2cxHCYfhqUEGJ48jkUw2JljaewG3rr6TWeV5PLn/53R63TjSbeLUsS1I7ESUzSfV0nAhSjlM1Md44fBv+MCau9jYfy2PDfyQgtNLQ9f56gv3g7F4TiGso6VfwqbSaJt1NCKV22mjQxtU1biOF0qQRIIOLXeGwu3cuH0H4C7CVjxVAASOctly9Enetez93HzBHVy28DqkUDlArm0eSWtxLfucK5fczLOHH0GbACWdUBJUdpHtwLYMhJKKX+MKcAx3GK3DXMzYyPcbkwlmbRt0L2vgbGtpIVq8wYS5jHQ5PXmcgaFdbFhwFTNKs6O6unyHfKvVmgoR2iHPKWCMYV7XAtbM3cj2k89RdrvQVk9T7pkuZrORQ8i9kwTtaxzl4iQibKI4yLYv1Nl2CYjIh+rNiNlai0Qy1ZjivBmrWD13PQDDU2d48OW/IjBBa7IX89uSzbwESKGYrI+xefFNfPiiP0sIcNWS97L9xPPNYgCppDqJ4ptIXhNhsFnANsGsm7QI46AUzmwjAD+LlYppU7y4CBc/RMbQRKzzNiTrHWvvoeR2MFkfZ05nH/1dS3n52FOUvZjrTS9jW6QUlFTU/CoLe5Zz8wV3IIXi29v/gRuXf5jVczewoHsZg5VjeKqIsUFSkw7XF9s0m7gWkTLSmbTYhlqEBOsbpHSQGf1OV2taSjtNJyyFJDA+lcYElcY4VX+Kul9lqj7BZH2Mul9FCUXFn+Ca825hxewLeevM63xv+z8BcMOKj1Bwyijp4EoXV3o40sWRLq7ywn/SxZEenvIAQVehl89s+j90FXp4fOCnPDHwU7affAEpJJsWXsdYdZipxgT1oIavfRpBnUpjnEpjHG38MCiN3rWlmSSHZqa1yMl6q6bLEzYf4zZzorquMaejn5Wz13HejFXMKs9DyVAFjo8fYmDoDQ4M72FmaR4fWHMX2mge3fsD3hx8jWOrD7Js1mrOn3URbw29TsntCA22FW201oKQ1P0qd2+6n/7uJew89TK/2P1NZpf72HLkSW5c8WEuX3IDo/VhlvSuYGZpHp4qUNd1zlZOcGB4D3vP7GB46jRFtxw5CJNod0vaFCfuUjST1XSKn3V/zeRTCsWUX6GnMIsPrvk0m5fcRIfX1WIAL+XdAOw8uQUhJF2FHp47+CgDZ3fiKJdnDjzM3Rvv513L3s/eszsyCa7NQR8Sh/HaCLet+hMuXfguBieO873tX8VVHg3dwA1qnK2cYumMC7hj7T0ta1k5Zy1XL30f47URnjv4KE/t/zmNoB4a+ZhINt8uERpp0zA4jhsSqEk1mUsdSIhTaUywas4G7trweWZ3zANg1+lX+f3Z1zkzeZLA+HR63Zw3cxXr+jazrn8zABP1MR558/u4jocUih0nX+S2VX/C2r7NLOpZzqmJI3hOMXQDtmmkpXSo1MdZ33clt6+5m3pQ5dvb/p5qYxJtDefPXsvdG/4nczr7ARirneM3b/2Iwcnj+Man4BTp61rERfMvZ9Wc9dy25k+5aP4mvr3t7xicPJEks3kUM512GWNQDzzwwBfB4roue0+/xoGR3SGmEl2qpEPFn+Ti+Vdw7+Yv0lXoYffprXxz61d4cv9D7B/ezWDlOGcrJzk2eoCdp7aw89QWNvZfS8ktU3CKeKrIG6dfpuAUmaiP4jklLpy3EW0CXj+1hYJTCvM2EeZtUioaQY3ZHX3cs/mLlNwOfrjjX3jj9MsIIbm473Lu3fwluoq97Dr9KmDpcLv5ya4HOTCyl/H6CIOTx9k/vIetx3/HgeE9LOxZxuIZ57N2/hXsPPUSFX88jMCTRFUSmDrLetdwYd+lNBp1lHKaldUk1YhxFhHanHpQo79rKX926V/gKo8n9z3Ev255gCOjAxSdMmWvi5LbQdHpoLs4AyVdLl90IzPKszkwvJeR6lnevfz93LLyE0w2xii7nbx6/GmmGpNcsfhG5nT00dD1pN4mCJsoBIpPbvwCvcWZPLXvYZ4/9BieKrCwZ1m0FpcnBx7iH577PM8d/DVFt8R1y27HEQ5Ft0zJ7aDD66LgFNlzZhv/9PwX2HtmO7M65vHpy/532LWGyVRObAR32BTcIa1Jpxp+FsOIJO/j6/6cstfJ84ce48c7H6TolCk4ZbTVGGsSfZ7yJ1nUs5xbVn6celDlG1v/lq+9/Dc0dJ1bV9/JsplrMDZguDLIS0efoOx1smnhddSDKaR0kgLelF/hYxf/D1bMupC9gzt4aNe/U3I7AMGd6++j6Jb53YFf8ZNdD9JdmMHrp16iHtTYtOg6Or0uAt3AWIM2GmM1HV43dV3j66/+DSfHD7N81hpuWP4hpvwKQqhm/5IIATPhhHWxsLtDpiTITYVFQlL1J1k7/wpWzlnL6YljPLTra5TdjigM0Km6V9NFfvTiz+I5BR5760cMV06zb3gXTwz8DEc63LLyE2irKThFXjz8WwLtc+15t9HhdlPzp0BIJupjXLfsdq5ddivDU4N8Z/s/4iiHuq6yccE1LJ25kmOjB3l4zzfp8LrwHI8zlRNsO/EsvaXZrJl3WZjNhyAqFos2Pp5ToOKP87NdX8NYw/UrPkRvcTba+EnAaq0NATMdJqtG66iyGoXXRpuWutTmxe8B4Ml9DzHZGEcpN9WIIpBCIRCM1Ua4cvHNrJ57CUdH9/P0gYcpumWKbplnDz3CeH2Ei+ZvYkH3UgBOjB/h9VNbmNUxj0sXvpuy14UUgpVz1vPRiz9LoH2++9pXGamexVUFpFRcueRmAB4f+AnVYAopQ5ftSIeXjjwBwLVLb0FEFXUpZBLfaBNQcjvZe+Y1BobeoKc4kzVzN1ILqshUNUZHkGsQBCilwkBRCpEkqzHIrk3AjPIcLpi9llowxZ7BbRScEtropDdHIKj5VQCWzVzN7Ws+ibWGn73x7/i6jhQSV7mM1c+x4+SLKKk4f/bF+LqOKx1+d+BXBNrnj9b+d75y8w954LoH+eymB/BUgZ/v/gZ7BrfR4XVR11XmdPSxfOYaxmujvDW0g6JbxliDJYRBDo+8xcHhvVwwex2r521kqjEZqn6uNqttwLbjz2KxrJqzviW/VBHk6jhu2GGbSFBEtTgqCYzPnHI/JbfM0ZH9jNaGcaQTGlLbNOCr52zkL9/9r3zhmq/SXezldwcfYdfpV3ClR0PX8Y1PoBsMnH0DgAXdy/B1gLaamp7CWEPRKTFaG2JmaS49xZm8fnILT+57iM5CNxaNNj5zOxbgKJdDI3uZiJFIG6MOIWa99cSzIODezV/insv/Oqpw2Exy6kiXY2P7EAj6upakPLZIbBAOSduykyRvke+Pe4GMNXQVeqIEcxBtfaAIIuqGxeI5Re5Ydw/zOhdgTGgUV85exxdv/DpCyFwXVwfWWi7pv5qFNywHLN3FGXhOgaf3P8xP3/g3Lpx3GZ/b/CW6Ct0UnOjlov7I7mJv2IFSOY22QQ4GMzjS4/xZF4f1MxSXLLiagaE3eOrAz+nwuqNSUMjYifo42gR0FnpwlYeNyswh4BeWfZRSGG1CyDU2KbENirPfONnTNkiVY5slAVd5lN3OROWUVCzoWTotamGtpbPQTWehO3XMsG9oF6O1YQ4Ov4kxmpmluSjhRJh2tHCaaxFxb0A6uAN6ijPDNhYb4OBQipiSGZNAYK3BRGhD2A9OZj2JwRYyhDviH6VkBLNaBJJqMAVAZ6EndMOp7ExKRaUxzhP7fsaHLvw0SipeO/4cj+z9HkpFLydAoqj6k1w0/3I+vu7P2X7ieX6x+xuA4OK+y7lj7T3cvuZuHOmytu8KPKfA1uPbqQbV0GNGKlTxJwDoLc5qZuk5TO23Az/iUxv/F2WvkxNjh3j52FOZbjkpBH7Uk+gql0l/DN/4KOlkmydSpUAnbaTiso8FHBlCp8YaFvUsp+SW0UYnoJLBUHBKPL3/F+wbfoOCU+Lg8JsEJkhgjzjBnaiPcenC6wA4MjLAsbEDdBV6efbgo1wwey2X9F/Ff9v0lwnnXjn6dBJqWAxKOgxVBgFY3Ht+M/JOqXDBKbJ78FW+8ux9zCrP49jYfqb8Cq70khKQkAptA/p7lgKWUxPHaOg6HcrLdNW0JKtZ/DH84CqP4cppjo8dZHHvChb3nM/A0M7Ee8RCW3CKHBvdHxJMlXCUm+llFFbQ5fWwccG1ABweHaDkdeKqAtoEfGvb37Ox/2pmd/TRWejhXctu4/JF17N78FXqwVQEfXicmTzBqfGjzO9axOLe8zlwbg9FVYoqqCEKUXBKDE8NcqZyAk8V8JSXG38I1e2S/qsBwe/P7kyA/XyDWNhQ7oapRhwHyUxnh6QWVHntxPMAXL/sdozVqdgidpsaVxUoqnKk26F+G2uQSCqNCVbP3cji3hWcGj/KoXN78VQhtCVSoKTkhSO/4en9DzO/cxECwZVLb+bL7/kWf3rJ5xPbVvUn2XbiWYQQ3LDsQwQ6iBxBE/APYyKXolNOxrriNhwlJNVGhfNmrGLt/E1UGpO8ObiNgiqGRIpssRRNI22tCRuoYsud/jFGU1BFXj76JBP1Udb1X8mmhTcwXhsJ3X26sGc02uoMF6RQNHSDstvFB9d8CoBnDv6SalCJbEizA7bolpnb2c+i3uVM1MeYqI8yr3Mhczv7kxcvuiW2HHmcyfoY6/uv4qrFNzNWO4cjnFw+bjFWZ5BJKcKpISEUH7noMzjS5flDv2aocioJBeIbGBMGijrQCCFDFTPagBdjZk3Y1FUe56bO8J9vfo87L7mPP153L6PVIfYO7UjcbjzIZpM6ugCpqPtVhBDcden9LOhZyv6h3bx05AnKbleUJIbXGGtQwuHE+CH+6olP4SovMap1XUtVSjyGpk7zq73f5c7193HHus8xXh9l56mX6Cr2oIQKCwXYpJ4nkEghqQU1jNHcveF+Lph9MYMTx3l84CcU3Y5wLakyR5xqqLgFD2KDFKmYbfY5h4leJ88depQXDz9OZ6Gbe6/8MtcseR+1RpWpxgSB9aMmgZBz1aDKRH2M2eU+7t38ZTb0X8VIdYjvbP9qeJ7IDqWIpIndwbcNKv441aBCNahkXLixmrLXxXOHfs1zhx6j5HZwzxV/zXvO/xiBDpioj9LQdbQJwkTVamr+FOO1UWaW5nLv5i+zeclNVP0K39r2d1SDSuS9bKYFIUk1dIBMAsX0mECu0GAJx6J++Po/o23Atefdyicv/QJXLL6RLUef5MjoAJON8cSTzOnoY+28zVy99L0U3TKDE8f5+ta/YahyMjLwuqX5UyStfSJqaBBJnSoJLUQIuZe8Mv+x818IdIPrV3yQO9bdw+WLruelo49z4NybTNTHQrsoPeZ29HHx/Mu5asl7KXudjFaH+MbWr3Bo5C3KXmfrWqwNU404WTUax2idwB2Z0kdmeicsAP5gxz9z8Nxebl15J6vmXsKquZdgrWW8PoI2AWW3MxmbstbywuHf8Ks3v8tkY5Si24GJSj2ipdlMhP2NaRzc2oyMpVuUCk6RH7/xIPvP7ebWlXeydOZKls5cGXaWNCYItE/RKVFwS8m7bz3+X/xyz7c5WzkVEsfo1uqWaPYHBY0Az/FwlKPC+CcCzDI9zbY5nikQdHidvHTkcXadfoX1fVexdv7lLOpdTlehFykUtWCKQ+feYmBoJ9tPvsDhkbdwVSEK1oL0TFIOLbcJkZrMTI9cpWcywnM7Cp1sO/Esbw6+xkXzL2Pt/CtYMuMCegqzwsFdXef0yAD7hnez4+QL7B/ejaNcyl5H6LWEaDMulYU7tNY4Rtuk9dVv+C2FwHRHR2wHGrrGc4cf5cUjj4WIotOJFIK6roelF13FkR4ltzO0TZEhtGK6icR4HqR9KTtpl0vKlxZtNGU3VJNXjz/Dq8eeoeR2UHI7UMLBNz5TflgGclSUdkRjF81KjmgZhdBxsjoVSVDYC2hT/UG2fXNlikhSqDDTtpbA+IzVh5MHOMrBdXrCaNua5iBMrhrYbkDJZlqSm1KUbiu2qaZJE3nDDq8La8M8baIxlsRFSkbrjKe20525ZPsfk6EeKbFJd4eO2oAjYNZo3TILn56DJ2kWCTkYH4lzGZLRKJ2pjacTRtGu1znVQ5idDhL8IT8m6WwVONJJ5k3jMCKRTiuy46RtumqttQgFuqabZZ909Jzp5BQ20wUf24j8VGHLlEpGAlJnZlpo2g2ovk3DuG2dHSNGF9JSaW3uFNvS5UHSx02mLp/pVYzm+6V4m77hlsFamxuVaBk1Eu84Omnbzk+IFtuXLwfbaelnc8NyJEN+kJ64FrnBJZsZvEmPeaUXLW0c8gsoOuVpudtuVKLtPF3rqESbF2/XjpJrlRPTzcqId+iZEbnZITEtW9o5hIIqNlWNqJFcRAlaX/fi0EilegZtvpVfTN9IZXNN28k7CpHxVu0WlhTwbOur2GnGDrINgTbn98S07cytZroZ/83p6E/gjhCdjN2b1fR3nEen14s2wTSNnO3HSaYTfZsbqMscs80OEpsafbJimnnT1ACwpXWu5G1nJ3JtZe2aq4zRlNwyC7uWR8luaJNlbEcaus6crvmsnr2BWlBtfXiy60t7mzrdeIKlTVd7figmZTPibSHyr9k6WCdS/sT+gURqf1ggqesqS3tXsWjGcup+HSXjymqU7wghMYHhxhUfCYFsa1vm1wXt5shExsRljL2gZawluYcQbUcnm8N8qblT0byXyNzTvsN80zRDflnehM3o1nD98g9BYKPdYXS0+UDKcDZsnSVd53PT8o9GpRWn1Ui3mTuE3J4LqWG7/OCvzXVSJMTKd5jlpmTkdKOLbSLy9kSymcG55gCMy0RjjE0Lr+fi2Zvw8ZOtc0LQz6biExsS6X3LP8GG/msYrQ2jpJtVn1Q7rRCtA1Rt5zjaKp5tQ/bsoJXlbVKP9oPRb9u8mTfKSjlMNMZY2ruKj625BystQeAneZiK5+bjjYikVGgd4DgOn1r/F1y28DrGasPoGGqdloPNPTNali3ytuntHK7ING21HZxL797QOv/2jrF3CKk4UU/RCMtnXsQ9l36R7lIv9UYt3Lsj3utI6+buLyLapEhJRaADXCeEGH93+Jc8PvBTRutDYR+h8pq4tGgXrdtUx1huUMW2GvQ/zBOl9xLKDaJMM2KTn3eM0c/ABPimQdnt5Nolt3HLik9Q9ErUGlXcaDuKmDhKqebuL/FNjTVhU0CUlxXcIkOTp9l68r/YfeYVTk0cpW5qxFtaxNmJTW2tI0V6UNfkGsFtFiVIG/e098ptxpTs6ZOfec1tHWRtVvWT+1hBwSkysziXNXM3csXim1jYeR6+aYQj4FHjeLyrlYr3QKtVqxaRzqRFZmcpYwyu8sJBexP29ozXz+Fbv93EQuLShZDRtloyB1qIZC+huBXXWNMkalgfxhqbbOxm0/MDNts/nc/NWiTaNvfn6C7MoLcwh1KxhPY1gW1g4jKz0YlgKKWSrclatuhKyiU0d8NLinQWPLeI9jWuF05zat+EMKUAayKJin4TTREZbZGOwAYgFFgdfp8c1+FxE1ikKzB+fL5FKIHV4W+jLVKJ8P4qVzNOjxSY1HMUmACkG6KESEvdr+M6XqJGJqdW6X3MIhWzSS06UTGjo8/RlnvRRfV6Ha9QQOsAayye5+EHPtaErjEU1/AhruPi+41wN5VGI0T6/Aau6+I3fFzPpVFv4BU8GtH3fiPcgS787CXf+w0f13Vp+M3zHNdNZv2tNclWgCoytK7jhvcphOd7hSKNep2CVwh3d3HdyGu5BH54fz/6rHW4Adz/BwmbrET4219QAAAAAElFTkSuQmCC">',
  environnement: '<img class="lens-png" alt="" src="data:image/png;base64,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">',
  emissions: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8h11a3 3 0 1 0-3-3"/><path d="M3 13h15a3 3 0 1 1-3 3"/><path d="M3 18h8"/></svg>',
  ges_total: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 18a4 4 0 1 0-4-4"/><path d="M3 8h9a3 3 0 1 0-3-3"/><path d="M3 13h6"/></svg>',
  seniors: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="6" r="3"/><path d="M9 21v-6l-1.5-3a3 3 0 0 1 9 0L15 15v6"/><path d="M19 14v7"/></svg>',
  jeunes: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="6" r="2.6"/><path d="M9 12a3 3 0 0 1 6 0v4h-1.5v5h-3v-5H9z"/></svg>',
  revenu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M15 9.5a3.5 3.5 0 1 0 0 5"/><path d="M8 11h5M8 13h4"/></svg>',
  commerces: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8h12l-1 12H7z"/><path d="M9 8a3 3 0 0 1 6 0"/></svg>',
};
const CARTO_LENSES = [
  // ─── Couches à cocher par thématique (POI) ───
  { id: 'enseignement', n: 'Écoles', d: 'Crèche, maternelle, élémentaire, collège, lycée, université', c: '#1971c2', type: 'poi', g: 'theme' },
  { id: 'mobilite', n: 'Mobilité', d: 'Transports collectifs, vélo, gares', c: 'var(--vegetal)', type: 'poi', g: 'theme' },
  { id: 'equipements', n: 'Équipements', d: 'Santé, commerces', c: 'var(--soleil)', type: 'poi', g: 'theme' },
  // ─── Angles de lecture (choroplèthes) ───
  { id: 'demo', n: 'Densité de population', d: 'Habitants par km²', c: 'var(--eau)', type: 'choro', metric: 'pop', g: 'lecture' },
  { id: 'seniors', n: 'Part des seniors', d: '60 ans et plus (%)', c: 'var(--ardoise)', type: 'choro', metric: 'seniors', g: 'lecture' },
  { id: 'jeunes', n: 'Part des jeunes', d: 'Moins de 15 ans (%)', c: 'var(--vegetal)', type: 'choro', metric: 'jeunes', g: 'lecture' },
  { id: 'revenu', n: 'Revenu médian', d: 'Revenu disponible médian', c: 'var(--soleil)', type: 'choro', metric: 'revenu', g: 'lecture' },
  { id: 'equipdens', n: 'Densité d\'équipements', d: 'Équipements BPE par km²', c: 'var(--soleil)', type: 'choro', metric: 'equip', g: 'lecture' },
  { id: 'commerces', n: 'Densité de commerces', d: 'Commerces par km²', c: 'var(--terre)', type: 'choro', metric: 'commerces', g: 'lecture' },
  { id: 'emissions', n: 'Émissions transport', d: 'GES routiers par habitant', c: 'var(--ardoise)', type: 'choro', metric: 'ges', g: 'lecture' },
  { id: 'ges_total', n: 'Émissions GES totales', d: 'tCO₂ par habitant', c: 'var(--terre)', type: 'choro', metric: 'ges_total', g: 'lecture' },
  { id: 'environnement', n: 'Artificialisation', d: 'Part de sols artificialisés', c: 'var(--terre)', type: 'choro', metric: 'artif', g: 'lecture' },
];
const CARTO_RAMP = {
  pop: ['#eaf0f0', '#9cc1c9', '#16798c', '#0d5160'],
  artif: ['#f3ece4', '#d8b48f', '#b5642f', '#7d3f17'],
  ges: ['#f4ece6', '#e0a878', '#c8632f', '#8f3d18'],
  ges_total: ['#f6ece9', '#e0a08a', '#c85a3f', '#8f3018'],
  equip: ['#fbf3e3', '#e7c97e', '#d79a1c', '#9c6f12'],
  commerces: ['#f4ece6', '#dcae8a', '#b5703f', '#7d4a22'],
  seniors: ['#eef2f6', '#b9c6d6', '#6b86a6', '#3b5170'],
  jeunes: ['#eef5ee', '#aacdb4', '#4e9e6c', '#1f6b43'],
  revenu: ['#f3eee6', '#dcc28a', '#b58a3c', '#7d5a18'],
};
const CARTO_METRIC_META = {
  pop: { label: 'Densité', unit: 'hab/km²', lo: 'Peu dense', hi: 'Très dense' },
  artif: { label: 'Sols artificialisés', unit: '%', lo: 'Naturel', hi: 'Artificialisé' },
  ges: { label: 'GES routiers', unit: 'tCO₂/hab', lo: 'Faibles', hi: 'Élevées' },
  ges_total: { label: 'GES totales', unit: 'tCO₂/hab', lo: 'Faibles', hi: 'Élevées' },
  equip: { label: 'Densité d\'équipements', unit: '/km²', lo: 'Peu dense', hi: 'Très dense' },
  commerces: { label: 'Commerces', unit: '/km²', lo: 'Peu dense', hi: 'Dense' },
  seniors: { label: '60 ans et +', unit: '%', lo: 'Jeune', hi: 'Âgée' },
  jeunes: { label: 'Moins de 15 ans', unit: '%', lo: 'Peu', hi: 'Beaucoup' },
  revenu: { label: 'Revenu médian', unit: '€', lo: 'Modeste', hi: 'Aisé' },
};
const POICOLOR = { ecoles: 'var(--soleil)', creche: '#e64980', maternelle: '#f08c00', elementaire: '#1971c2', college: '#7048e8', lycee: '#343a40', universite: '#0ca678', sante: 'var(--red)', commerces: 'var(--terre)', tc: 'var(--vegetal)', gares: 'var(--eau)', velo: '#1f9d55' };
const POIHEX = { ecoles: '#d79a1c', creche: '#e64980', maternelle: '#f08c00', elementaire: '#1971c2', college: '#7048e8', lycee: '#343a40', universite: '#0ca678', sante: '#e2001a', commerces: '#b5642f', tc: '#3c8a5e', gares: '#16798c', velo: '#1f9d55' };
const POINAME = { ecoles: 'Écoles', creche: 'Crèches', maternelle: 'Maternelles', elementaire: 'Élémentaires', college: 'Collèges', lycee: 'Lycées', universite: 'Universités', sante: 'Santé', commerces: 'Commerces', tc: 'Arrêts TC', velo: 'Pistes cyclables', gares: 'Gares' };
// Couleur + libellé par type d'arrêt TC (le backend renvoie properties.type)
const TC_TYPE = {
  bus: { hex: '#2563eb', lab: 'Arrêt de bus' },
  tram: { hex: '#9333ea', lab: 'Arrêt de tram' },
  gare_routiere: { hex: '#ea580c', lab: 'Gare routière' },
};

/* ───── Helpers couleur / stats ───── */
function _hexToRgb(hex) { return hex.replace('#', '').match(/.{2}/g).map(x => parseInt(x, 16)); }
function _rampColor(stops, t) {
  t = Math.max(0, Math.min(1, t));
  const n = stops.length - 1, i = Math.min(n - 1, Math.floor(t * n)), f = t * n - i;
  const a = _hexToRgb(stops[i]), b = _hexToRgb(stops[i + 1]);
  return `rgb(${Math.round(a[0] + (b[0] - a[0]) * f)},${Math.round(a[1] + (b[1] - a[1]) * f)},${Math.round(a[2] + (b[2] - a[2]) * f)})`;
}
function _median(arr) {
  const s = arr.filter(v => v != null && isFinite(v)).sort((a, b) => a - b);
  if (!s.length) return null;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function _fr(n, dec) { return Number(n).toLocaleString('fr-FR', { minimumFractionDigits: dec || 0, maximumFractionDigits: dec || 0 }); }

/* ───── Rail de lentilles + toggles ───── */
function buildLensRail() {
  const host = document.getElementById('lensList');
  if (!host) return;
  host.innerHTML = '';
  const GROUPS = [
    { g: 'theme', title: 'Couches à cocher' },
    { g: 'lecture', title: 'Angles de lecture' },
  ];
  GROUPS.forEach(grp => {
    const lenses = CARTO_LENSES.filter(L0 => (L0.g || 'lecture') === grp.g);
    if (!lenses.length) return;
    const box = document.createElement('div');
    box.className = 'lens-box';
    box.style.cssText = 'background:var(--surface,#fff);border:1px solid var(--line,#e7e7e1);border-radius:14px;padding:6px 6px 8px;margin-bottom:14px;box-shadow:0 1px 2px rgba(20,20,20,.04);';
    const h = document.createElement('div');
    h.className = 'lens-group-title';
    h.textContent = grp.title;
    h.style.cssText = 'font:600 11px/1.4 system-ui,sans-serif;letter-spacing:.07em;text-transform:uppercase;color:var(--ink-3,#8a8f88);padding:9px 8px 6px;';
    box.appendChild(h);
    lenses.forEach(L0 => {
      const active = grp.g === 'theme' ? window.cartoState.couche : window.cartoState.angle;
      const b = document.createElement('button');
      b.className = 'lens' + (L0.id === active ? ' on' : '');
      b.dataset.id = L0.id;
      b.dataset.g = grp.g;
      b.innerHTML = `<span class="lens-ic" style="background:${L0.c}">${CARTO_ICON[L0.id] || ''}</span>
        <span class="lens-tx"><span class="n">${L0.n}</span><span class="d">${L0.d}</span></span>
        <span class="lens-chk"></span>`;
      b.onclick = () => (grp.g === 'theme' ? selectCouche(L0.id) : selectAngle(L0.id));
      box.appendChild(b);
    });
    host.appendChild(box);
  });
}
function buildToggles() {
  const host = document.getElementById('baseToggles');
  if (!host) return;
  host.innerHTML = '';
  [['communes', 'Tracé des communes'], ['names', 'Noms des communes']].forEach(([k, lab]) => {
    const d = document.createElement('div');
    d.className = 'tg' + (window.cartoState.toggles[k] ? ' on' : '');
    d.dataset.k = k;
    d.innerHTML = `<span class="tg-box"></span><span class="tg-lab">${lab}</span>`;
    d.onclick = () => {
      window.cartoState.toggles[k] = !window.cartoState.toggles[k];
      d.classList.toggle('on', window.cartoState.toggles[k]);
      drawCommunesBase();
    };
    host.appendChild(d);
  });
}
function wireCartoUI() {
  if (window.cartoState._wired) return;
  window.cartoState._wired = true;
  document.querySelectorAll('.basemap-switch button').forEach(b => {
    b.onclick = () => setBasemap(b.dataset.base);
  });
  const inp = document.getElementById('cartoSearchInput');
  if (inp) inp.addEventListener('input', cartoSearch);
}

function refreshLensHighlight() {
  document.querySelectorAll('.lens').forEach(b => {
    const active = b.dataset.g === 'theme' ? window.cartoState.couche : window.cartoState.angle;
    b.classList.toggle('on', b.dataset.id === active);
  });
}
function selectCouche(id) {
  const cur = window.cartoState.couche;
  window.cartoState.couche = (cur === id) ? null : id; // reclic = referme le panneau
  refreshLensHighlight();
  renderCtrl();
  applyLens();
}
function selectAngle(id) {
  const cur = window.cartoState.angle;
  window.cartoState.angle = (cur === id) ? null : id; // reclic = masque le choroplèthe
  refreshLensHighlight();
  applyLens();
}

/* sous-contrôles : couches POI + rayon (lentilles équipements / mobilité) */
function renderCtrl() {
  const ctrl = document.getElementById('lensCtrl'), div = document.getElementById('ctrlDiv');
  if (!ctrl || !div) return;
  const L0 = CARTO_LENSES.find(l => l.id === window.cartoState.couche);
  if (!L0 || L0.type !== 'poi') { ctrl.classList.remove('show'); div.hidden = true; ctrl.innerHTML = ''; return; }
  div.hidden = false;
  ctrl.classList.add('show');
  const LENS_POI = {
    enseignement: [['creche', 'Crèches'], ['maternelle', 'Maternelles'], ['elementaire', 'Élémentaires'], ['college', 'Collèges'], ['lycee', 'Lycées'], ['universite', 'Universités']],
    equipements: [['sante', 'Santé'], ['commerces', 'Commerces']],
    mobilite: [['tc', 'Arrêts TC'], ['velo', 'Pistes cyclables'], ['gares', 'Gares']],
  };
  const opts = LENS_POI[window.cartoState.couche] || [];
  const sub = window.cartoState.sub[window.cartoState.couche];
  const buf = window.cartoState.buffer[window.cartoState.couche] || 0;
  const km = (buf / 1000).toFixed(1).replace('.', ',');
  ctrl.innerHTML = `<div class="sub-title">Couches</div>
    <div class="chips">${opts.map(([k, lab]) => `<button class="chip${sub.has(k) ? ' on' : ''}" data-cat="${k}"><span class="sw" style="background:${POICOLOR[k] || 'var(--vegetal)'}"></span>${lab}</button>`).join('')}</div>
    <div class="buffer">
      <div class="buffer-top"><span class="bl">Rayon d'accessibilité</span><span class="bv">${buf ? km : '0'}<small> km</small></span></div>
      <input type="range" min="0" max="3000" step="250" value="${buf}" id="bufRange">
      ${buf ? `<div class="buffer-read"><span class="pct">${km} km</span><span class="tx">autour des points affichés · <b>zones d'accessibilité</b></span></div>` : ''}
    </div>`;
  ctrl.querySelectorAll('.chip').forEach(ch => ch.onclick = () => {
    const cat = ch.dataset.cat;
    if (sub.has(cat)) sub.delete(cat); else sub.add(cat);
    drawPoi(allActivePoi()).then(() => { drawBuffer(); renderCtrl(); updateInsight(); });
  });
  const range = ctrl.querySelector('#bufRange');
  if (range) range.oninput = e => {
    window.cartoState.buffer[window.cartoState.couche] = +e.target.value;
    drawBuffer(); renderCtrl(); updateInsight();
  };
}

/* ───── Synchronisation territoire ───── */
async function syncCartoToTerritoire(code) {
  const M = window.cartoState.map;
  if (!M || !code) return;
  window.cartoState.code = code;
  if (state?.territoire?.nom) {
    const lbl = document.getElementById('cartoTerritoireLabel');
    if (lbl) lbl.textContent = state.territoire.nom;
  }
  // reset des couches de l'ancien territoire
  ['choroLayer', 'communesLayer', 'bufferLayer'].forEach(k => {
    if (window.cartoState[k]) { M.removeLayer(window.cartoState[k]); window.cartoState[k] = null; }
  });
  if (window.cartoState.communesLabels) { window.cartoState.communesLabels.forEach(l => M.removeLayer(l)); window.cartoState.communesLabels = null; }
  Object.values(window.cartoState.poiLayers).forEach(l => M.removeLayer(l));
  window.cartoState.poiLayers = {}; window.cartoState.poiFeatures = {};

  await loadCartoContour(code);
  await loadCommunesData(code);
  await applyLens();
}

async function loadCartoContour(code) {
  const M = window.cartoState.map;
  if (!M) return;
  if (window.cartoState.contourLayer) { M.removeLayer(window.cartoState.contourLayer); window.cartoState.contourLayer = null; }
  try {
    const t = await fetchTerritoire(code);
    const gj = t?.contour;
    if (!gj) { setStatus('error', 'Contour indisponible'); return; }
    const layer = L.geoJSON(gj, { interactive: false, style: { color: 'var(--red)', weight: 2.4, fill: false } });
    window.cartoState.contourLayer = layer;
    layer.addTo(M);
    M.fitBounds(layer.getBounds(), { padding: [48, 48] });
  } catch (e) {
    console.error('Contour carto', e);
    setStatus('error', 'Contour : ' + (e.message || 'erreur'));
  }
}

async function loadCommunesData(code) {
  try {
    const data = await apiGet(`/densite/${encodeURIComponent(code)}?type=pop`);
    window.cartoState.communesData = data;
    updateLegendPill();
  } catch (e) {
    console.warn('Communes indisponibles', e);
    window.cartoState.communesData = null;
  }
}

/* ───── Nettoyage ───── */
function _clearChoro() { const M = window.cartoState.map; if (window.cartoState.choroLayer) { M.removeLayer(window.cartoState.choroLayer); window.cartoState.choroLayer = null; } }
function _clearPoi() { const M = window.cartoState.map; Object.values(window.cartoState.poiLayers).forEach(l => M.removeLayer(l)); window.cartoState.poiLayers = {}; window.cartoState.poiFeatures = {}; }
function _clearBuffer() { const M = window.cartoState.map; if (window.cartoState.bufferLayer) { M.removeLayer(window.cartoState.bufferLayer); window.cartoState.bufferLayer = null; } }
function _clearCommunesBase() {
  const M = window.cartoState.map;
  if (window.cartoState.communesLayer) { M.removeLayer(window.cartoState.communesLayer); window.cartoState.communesLayer = null; }
  if (window.cartoState.communesLabels) { window.cartoState.communesLabels.forEach(l => M.removeLayer(l)); window.cartoState.communesLabels = null; }
}

/* tracé communes (fond) + noms, pilotés par les toggles */
function drawCommunesBase() {
  const M = window.cartoState.map, data = window.cartoState.communesData;
  _clearCommunesBase();
  if (!M || !data) return;
  const lens = CARTO_LENSES.find(l => l.id === window.cartoState.angle);
  const isChoro = lens && lens.type === 'choro';
  // tracé gris seulement hors choroplèthe (la choroplèthe dessine déjà les limites)
  if (window.cartoState.toggles.communes && !isChoro) {
    window.cartoState.communesLayer = L.geoJSON(data, {
      style: { color: '#5a5e68', weight: 0.6, opacity: 0.5, fillColor: 'transparent', fillOpacity: 0, interactive: false },
    }).addTo(M);
  }
  if (window.cartoState.toggles.names) {
    const labels = [];
    (data.features || []).forEach(f => {
      const nom = f.properties?.nom;
      if (!nom || !f.geometry) return;
      const center = L.geoJSON(f).getBounds().getCenter();
      const marker = L.marker(center, { interactive: false, keyboard: false, icon: L.divIcon({ className: 'commune-label', html: `<span>${nom}</span>`, iconSize: null }) });
      marker.addTo(M);
      labels.push(marker);
    });
    window.cartoState.communesLabels = labels;
    updateCommuneLabelsVisibility();
  }
}
function updateCommuneLabelsVisibility() {
  const M = window.cartoState.map;
  if (!M) return;
  const z = M.getZoom();
  (window.cartoState.communesLabels || []).forEach(l => { const el = l.getElement(); if (el) el.style.display = z >= 11 ? '' : 'none'; });
}

/* ───── Application d'une lentille ───── */
async function applyLens() {
  const M = window.cartoState.map;
  if (!M || !window.cartoState.code) return;
  const angleL = CARTO_LENSES.find(l => l.id === window.cartoState.angle);
  _clearChoro(); _clearBuffer(); _clearCommunesBase();

  drawCommunesBase();
  if (angleL && angleL.type === 'choro') {
    await drawChoro(angleL.metric);
  }
  // Les couches cochées restent affichées quelle que soit la lentille active.
  await drawPoi(allActivePoi());
  if (window.cartoState.couche) {
    drawBuffer();
  }
  // L0 absent => aucune couche, on ne garde que le tracé des communes
  if (window.cartoState.contourLayer) window.cartoState.contourLayer.bringToFront();
  updateInsight();
  updateLegendPill();
}

async function drawChoro(metric) {
  const M = window.cartoState.map;
  window.cartoState.epciVals = [];
  try {
    setStatus('loading', `Choroplèthe ${metric}…`);
    let data = window.cartoState.communesData;
    if (metric !== 'pop' || !data) data = await apiGet(`/densite/${encodeURIComponent(window.cartoState.code)}?type=${metric}`);
    const features = data?.features || [];
    const epciVals = features.map(f => f.properties?.valeur).filter(v => v != null && isFinite(v));
    if (!epciVals.length) { setStatus('error', 'Aucune donnée'); return; }
    window.cartoState.epciVals = epciVals;
    const mn = Math.min(...epciVals), mx = Math.max(...epciVals);
    const stops = CARTO_RAMP[metric] || CARTO_RAMP.pop;
    const meta = CARTO_METRIC_META[metric];
    const tip = (f) => {
      const v = f.properties?.valeur, nom = f.properties?.nom || '';
      const val = v == null ? 'n/d' : (metric === 'pop' ? _fr(v) : String(v).replace('.', ',')) + ' ' + meta.unit;
      return `<span class="tt-k">${meta.label}</span><span class="tt-v">${val}<small></small></span><br><span style="opacity:.75">${nom}</span>`;
    };
    const layer = L.geoJSON(data, {
      style: f => ({ fillColor: f.properties?.valeur == null ? '#e6e8e3' : _rampColor(stops, (f.properties.valeur - mn) / (mx - mn || 1)), weight: 0.8, color: '#fff', fillOpacity: f.properties?.valeur == null ? 0.35 : 0.85 }),
      onEachFeature: (f, lyr) => {
        lyr.bindTooltip(tip(f), { direction: 'top', sticky: true, className: 'cc-tip' });
        lyr.on('mouseover', () => lyr.setStyle({ weight: 2.4, fillOpacity: 0.96 }));
        lyr.on('mouseout', () => lyr.setStyle({ weight: 0.8, fillOpacity: f.properties?.valeur == null ? 0.35 : 0.85 }));
      },
    }).addTo(M);
    window.cartoState.choroLayer = layer;
    setStatus('ok', `${features.length} communes`);
  } catch (e) {
    console.error('Choroplèthe', e);
    setStatus('error', e.message || 'Erreur');
  }
}

// Ensemble des couches POI cochées, toutes lentilles confondues.
// La carte affiche cet ensemble : changer de lentille ne fait plus disparaître
// ce qu'on a coché ailleurs (ex : santé reste visible sous la lentille mobilité).
function allActivePoi() {
  const out = new Set();
  Object.values(window.cartoState.sub).forEach(s => s.forEach(c => out.add(c)));
  return [...out];
}

let _poiGen = 0;
async function drawPoi(cats) {
  const M = window.cartoState.map;
  if (!M || !window.cartoState.code) return;
  const gen = ++_poiGen;
  _clearPoi();
  // chargement en parallèle (plus rapide)
  const results = await Promise.all(cats.map(async cat => {
    try {
      const data = await apiGet(`/carto/${encodeURIComponent(window.cartoState.code)}?layers=${cat}`);
      return { cat, feats: (data && data[cat] && data[cat].features) || [] };
    } catch (e) { console.warn(`POI ${cat}`, e); return { cat, feats: [] }; }
  }));
  if (gen !== _poiGen) return; // un toggle plus récent a pris la main : on n'ajoute rien
  _clearPoi();
  results.forEach(({ cat, feats }) => {
    window.cartoState.poiFeatures[cat] = feats;
    const group = L.layerGroup();
    feats.forEach(f => {
      const g = f.geometry;
      if (!g) return;
      if (g.type === 'Point') {
        const [lon, lat] = g.coordinates;
        const lib = f.properties && f.properties.libcom ? f.properties.libcom : '';
        const nm = f.properties && f.properties.nom ? f.properties.nom : '';
        if (cat === 'gares') {
          // gare : picto carré
          L.marker([lat, lon], { icon: L.divIcon({ className: 'gare-marker', html: '<span style="display:block;width:11px;height:11px;background:#16798c;border:2px solid #fff;box-shadow:0 0 0 1px #16798c"></span>', iconSize: [13, 13], iconAnchor: [7, 7] }) })
            .bindTooltip(`<span class="tt-k">Gare</span><span class="tt-v" style="font-size:13px">${nm}</span><br><span style="opacity:.75">${lib}</span>`, { direction: 'top', offset: [0, -7], className: 'cc-tip' })
            .addTo(group);
        } else if (cat === 'tc') {
          // arrêt TC : couleur + libellé selon le type (bus / tram / gare routière)
          const ty = TC_TYPE[f.properties && f.properties.type] || { hex: '#3c8a5e', lab: 'Arrêt TC' };
          L.circleMarker([lat, lon], { radius: 4, color: ty.hex, weight: 1.6, fillColor: '#fff', fillOpacity: 1 })
            .bindTooltip(`<span class="tt-k">${ty.lab}</span><span class="tt-v" style="font-size:13px">${nm}</span><br><span style="opacity:.75">${lib}</span>`, { direction: 'top', offset: [0, -4], className: 'cc-tip' })
            .addTo(group);
        } else {
          const hex = POIHEX[cat] || '#777';
          L.circleMarker([lat, lon], { radius: 4, color: hex, weight: 1.5, fillColor: '#fff', fillOpacity: 1 })
            .bindTooltip(`<span class="tt-k">${POINAME[cat] || cat}</span><span class="tt-v" style="font-size:13px">${nm}</span><br><span style="opacity:.75">${lib}</span>`, { direction: 'top', offset: [0, -4], className: 'cc-tip' })
            .addTo(group);
        }
      } else if (g.type === 'LineString' || g.type === 'MultiLineString') {
        const hex = cat === 'velo' ? '#1f9d55' : (POIHEX[cat] || '#777');
        L.geoJSON(f, { style: { color: hex, weight: 3, opacity: 0.85 } }).addTo(group);
      }
    });
    group.addTo(M);
    window.cartoState.poiLayers[cat] = group;
  });
}

function drawBuffer() {
  const M = window.cartoState.map;
  _clearBuffer();
  if (!M) return;
  const lens = window.cartoState.couche;
  const radius = window.cartoState.buffer[lens] || 0;
  if (!radius) return;
  const cats = [...(window.cartoState.sub[lens] || [])].filter(c => c !== 'velo');
  const group = L.layerGroup();
  cats.forEach(cat => {
    const hex = POIHEX[cat] || '#777';
    (window.cartoState.poiFeatures[cat] || []).forEach(f => {
      if (f.geometry?.type === 'Point') {
        const [lon, lat] = f.geometry.coordinates;
        L.circle([lat, lon], { radius, color: hex, weight: 1, fillColor: hex, fillOpacity: 0.05, opacity: 0.35 }).addTo(group);
      }
    });
  });
  group.addTo(M);
  group.eachLayer(l => l.bringToBack && l.bringToBack());
  if (window.cartoState.baseLayer) window.cartoState.baseLayer.bringToBack();
  window.cartoState.bufferLayer = group;
}

/* ───── Encart insight (stats réelles, pas de % inventé) ───── */
function updateInsight() {
  const el = document.getElementById('cartoInsight');
  if (!el) return;
  const _angleL = CARTO_LENSES.find(l => l.id === window.cartoState.angle);
  const _coucheL = CARTO_LENSES.find(l => l.id === window.cartoState.couche);
  const L0 = (_angleL && _angleL.type === 'choro') ? _angleL : ((_coucheL && _coucheL.type === 'poi') ? _coucheL : null);
  if (!L0) {
    const nb = (window.cartoState.communesData?.features || []).length;
    el.innerHTML = cardCount('Tracé des communes', 'var(--ink-3)', nb || '—', 'communes', 'Aucun indicateur affiché. Clique un angle de lecture pour en afficher un ; reclique dessus pour le masquer.');
    return;
  }
  let html = '';

  if (L0.type === 'choro') {
    const metric = L0.metric;
    const meta = CARTO_METRIC_META[metric];
    const values = window.cartoState.epciVals && window.cartoState.epciVals.length
      ? window.cartoState.epciVals
      : ((window.cartoState.communesData?.features) || []).map(f => f.properties?.valeur).filter(v => v != null && isFinite(v));
    const med = _median(values), mx = values.length ? Math.max(...values) : null;
    const stops = CARTO_RAMP[metric];
    const dec = (v) => metric === 'pop' ? _fr(Math.round(v)) : _fr(v, v < 10 ? 1 : 0);
    const vTxt = med == null ? '—' : dec(med);
    const mxTxt = mx == null ? '—' : dec(mx);
    let tx;
    if (metric === 'pop') tx = `Densité médiane de <b>${vTxt} hab/km²</b> sur les ${values.length} communes. Le cœur urbain culmine à <b>${mxTxt} hab/km²</b>.`;
    else if (metric === 'artif') tx = `Médiane de <b>${vTxt} %</b> de sols artificialisés ; la commune la plus artificialisée atteint <b>${mxTxt} %</b>.`;
    else if (metric === 'ges') tx = `Émissions routières médianes de <b>${vTxt} tCO₂/hab</b>, jusqu'à <b>${mxTxt}</b> sur la commune la plus émettrice. Marqueur de dépendance automobile.`;
    else tx = `Médiane de <b>${vTxt} ${meta.unit}</b> sur les ${values.length} communes (max <b>${mxTxt}</b>).`;
    html = cardScale(meta.label + ' · médiane communale', L0.c, vTxt, meta.unit, tx, stops, meta.lo, meta.hi, '');

  } else {
    const sub = [...(window.cartoState.sub[L0.id] || [])];
    const ptCats = sub.filter(c => c !== 'velo');
    const n = ptCats.reduce((s, c) => s + (window.cartoState.poiFeatures[c]?.length || 0), 0);
    const buf = window.cartoState.buffer[L0.id] || 0;
    const km = (buf / 1000).toFixed(1).replace('.', ',');
    const veloN = (window.cartoState.poiFeatures.velo || []).length;
    const garesN = (window.cartoState.poiFeatures.gares || []).length;
    let tx;
    if (L0.id === 'equipements') {
      const parts = ptCats.map(c => `${window.cartoState.poiFeatures[c]?.length || 0} ${POINAME[c].toLowerCase()}`);
      tx = buf
        ? `Rayon de <b>${km} km</b> tracé autour des ${n} points : zones d'accessibilité piétonne/vélo.`
        : `${parts.join(' · ') || 'Aucun point'}. Active un rayon ci-contre pour visualiser les zones d'accessibilité.`;
    } else {
      const tcN = window.cartoState.poiFeatures.tc?.length || 0;
      tx = `<b>${tcN} arrêts</b>${garesN ? ` · <b>${garesN} gares</b>` : ''} · <b>${veloN}</b> tronçons cyclables.${buf ? ` Rayon de <b>${km} km</b> tracé.` : ''}`;
    }
    html = cardCount(L0.id === 'equipements' ? 'Équipements affichés' : 'Desserte mobilité', L0.c, _fr(n), 'points', tx);
  }
  el.innerHTML = html;
}
function cardScale(t, col, v, u, tx, stops, lo, hi, extra) {
  return `<div class="insight-h"><span class="insight-dot" style="background:${col}"></span><span class="t">${t}</span></div>
    <div class="insight-big"><span class="v">${v}</span><span class="u">${u}</span></div>
    <div class="insight-tx">${tx}</div>
    ${extra || ''}
    <div class="insight-legend"><div class="scale-bar" style="background:linear-gradient(90deg,${stops.join(',')})"></div>
    <div class="scale-lab"><b>${lo}</b><span>échelle communale</span><b>${hi}</b></div></div>`;
}
function cardCount(t, col, v, u, tx) {
  return `<div class="insight-h"><span class="insight-dot" style="background:${col}"></span><span class="t">${t}</span></div>
    <div class="insight-big"><span class="v">${v}</span><span class="u">${u}</span></div>
    <div class="insight-tx">${tx}</div>`;
}

function updateLegendPill() {
  const epci = (window.cartoState.communesData?.features || []).length;
  const elN = document.getElementById('lpCount');
  if (elN) elN.textContent = epci || '—';
  const elL = document.getElementById('lpLab');
  if (elL) elL.textContent = 'communes affichées';
}

/* ───── Recherche territoire dans la carto ───── */
let cartoSearchTimer = null;
function cartoSearch() {
  const input = document.getElementById('cartoSearchInput');
  if (!input) return;
  const q = input.value.trim();
  const dd = document.getElementById('cartoSearchDropdown');
  if (!q) { if (dd) dd.hidden = true; return; }
  clearTimeout(cartoSearchTimer);
  cartoSearchTimer = setTimeout(async () => {
    try {
      const data = await apiGet(`/search?q=${encodeURIComponent(q)}`);
      if (!dd) return;
      const results = data?.results || data || [];
      if (!results.length) { dd.hidden = true; return; }
      dd.innerHTML = results.slice(0, 8).map(r => `
        <div class="search-result" onclick="selectCartoTerritoire('${r.code}','${(r.nom || r.libelle || '').replace(/'/g, "\\'")}','${r.type || 'commune'}')">
          <div class="search-result-main"><span class="search-result-badge ${r.type === 'commune' ? 'is-commune' : ''}">${r.type === 'epci' ? 'EPCI' : 'Commune'}</span><span>${r.nom || r.libelle || '?'}</span></div>
          <div class="search-result-sub">${r.sublibelle || ''} · ${r.code}</div>
        </div>`).join('');
      dd.hidden = false;
    } catch (e) { console.error(e); }
  }, 250);
}
async function selectCartoTerritoire(code, nom, type) {
  state.territoire = { code, nom, type };
  const dd = document.getElementById('cartoSearchDropdown');
  if (dd) dd.hidden = true;
  const inp = document.getElementById('cartoSearchInput');
  if (inp) inp.value = nom;
  const lbl = document.getElementById('cartoTerritoireLabel');
  if (lbl) lbl.textContent = nom;
  await syncCartoToTerritoire(code);
}
