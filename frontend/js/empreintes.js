// empreintes.js — module de rendu du diagnostic territorial (GT BDDe / Empreintes)
// Usage : renderEmpreintes(element, indicateurs, references, {type:'epci'|'commune', dens7:'1'..'7', nom, sousTitre})
//   - indicateurs : payload de /indicateurs/{code} (format {code:{valeur,...}})
//   - references  : contenu de references.json
(function(){
'use strict';
var EMP_CSS = `.dim-section-grid.emp-has{max-height:8000px}
.dim-section.is-collapsed .dim-section-grid.emp-has{max-height:0}
.emp-inject.emp-root{padding:0;background:transparent}
.emp-inject .sec-kicker{display:none}
.emp-root{
    --bg:#f3ece0; --bg-soft:#ebe3d4; --bg-card:#fdf8ed; --bg-deep:#e7ddc8;
    --ink:#1a1814; --ink-2:#322e26; --ink-3:#5d574c; --ink-4:#918a7d; --ink-5:#c0b8a8; --ref2:#6e7e88;
    --accent:#b85a36; --accent-2:#8e3a18; --accent-soft:#e8c2ab; --accent-tint:#f4ddc6;
    --line:#ddd2bf;
    --font-ui:"Segoe UI", system-ui, -apple-system, Roboto, sans-serif;
    --font-strong:"Segoe UI Semibold","Segoe UI", system-ui, sans-serif;
  }
.emp-root *{box-sizing:border-box}
.emp-root{margin:0;background:var(--bg);color:var(--ink);font-family:var(--font-ui);-webkit-font-smoothing:antialiased;padding:30px 24px;line-height:1.45}
.emp-root .wrap{max-width:1240px;margin:0 auto}
.emp-root .card{background:var(--bg-card);border:1px solid var(--line);border-radius:14px;padding:16px 18px;animation:fadeup .5s ease-out both}
.emp-root .sec{margin-bottom:34px}
.emp-root .sec-kicker{font-family:var(--font-strong);font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-3);margin:0 0 13px;display:flex;align-items:center;gap:10px;font-weight:600}
.emp-root .sec-kicker .num{color:var(--accent)}
.emp-root .sec-kicker::after{content:"";flex:1;height:1px;background:var(--line)}
.emp-root .subk{font-family:var(--font-strong);font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-4);margin:0 0 10px;font-weight:600}
.emp-root .card-title{font-family:var(--font-strong);font-size:12.5px;letter-spacing:.04em;text-transform:uppercase;color:var(--ink-2);font-weight:600}
.emp-root .card-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-bottom:4px}
.emp-root .badge{font-size:10.5px;color:var(--ink-4);background:var(--accent-tint);border:1px solid var(--accent-soft);border-radius:20px;padding:3px 9px;white-space:nowrap}
.emp-root .card-sub{font-size:12px;color:var(--ink-3);margin:0 0 10px}
.emp-root .big{font-family:var(--font-strong);font-weight:600;font-size:34px;line-height:1;color:var(--ink);letter-spacing:-.01em}
.emp-root .unit{font-size:13px;color:var(--ink-3);margin-left:5px}
.emp-root svg{display:block;width:100%;height:auto}
.emp-root .bloc{display:grid;grid-template-columns:1.5fr 1fr;gap:16px;align-items:stretch}
@media(max-width:840px){.emp-root .bloc{grid-template-columns:1fr}
}
.emp-root .stack{display:flex;flex-direction:column;gap:13px;height:100%}
.emp-root .legend{display:flex;flex-wrap:wrap;gap:14px;margin-top:10px;font-size:11.5px;color:var(--ink-3)}
.emp-root .legend i{display:inline-block;vertical-align:middle;margin-right:6px}
.emp-root .lg-bar{width:13px;height:13px;border-radius:3px;background:var(--accent)}
.emp-root .lg-nat{width:18px;height:0;border-top:2px solid var(--ink)}
.emp-root .lg-typo{width:18px;height:0;border-top:2px dashed var(--ink-3)}
.emp-root .lecture{margin-top:12px;padding:11px 13px;background:var(--bg-deep);border-radius:9px;font-size:12.5px;color:var(--ink-2);line-height:1.5}
.emp-root .lecture b{font-family:var(--font-strong);font-weight:600;color:var(--accent-2)}
.emp-root /* animations */
  @keyframes growX{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@keyframes growY{from{transform:scaleY(0)}to{transform:scaleY(1)}}
@keyframes draw{to{stroke-dashoffset:0}}
@keyframes pop{from{opacity:0;transform:scale(.4)}to{opacity:1;transform:scale(1)}}
@keyframes fadeup{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@keyframes fillw{from{width:0}}
@keyframes slidein{from{opacity:0}to{opacity:1}}
.emp-root svg .gbar{transform-box:fill-box;transform-origin:left center;animation:growX .8s cubic-bezier(.2,.75,.25,1) both}
.emp-root svg .vbar{transform-box:fill-box;transform-origin:50% 100%;animation:growY .75s cubic-bezier(.2,.75,.25,1) both}
.emp-root svg .pline{stroke-dasharray:760;stroke-dashoffset:760;animation:draw 1.6s ease-out .15s forwards}
.emp-root svg .stp{transform-box:fill-box;transform-origin:center;opacity:0;animation:pop .4s ease-out both}
.emp-root svg .mk{opacity:0;animation:slidein .4s ease-out .9s forwards}
.emp-root .fillanim{animation:fillw 1s cubic-bezier(.2,.75,.25,1) both}
.emp-root /* composant POPULATION */
  .pop .kick{font-family:var(--font-strong);font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-4);font-weight:600}
.emp-root .pop-big{font-family:var(--font-strong);font-weight:600;font-size:38px;line-height:1.05;color:var(--ink);letter-spacing:-.01em;margin-top:4px}
.emp-root .pop-big small{font-size:14px;color:var(--ink-3);font-weight:400;margin-left:6px}
.emp-root .pop-sub{display:flex;align-items:center;gap:12px;margin:8px 0 4px;flex-wrap:wrap}
.emp-root .pop-tcam{font-family:var(--font-strong);font-weight:600;font-size:12.5px;color:var(--accent-2);background:var(--accent-tint);border-radius:7px;padding:4px 9px}
.emp-root .pop-vs{font-size:11.5px;color:var(--ink-4)}
.emp-root /* bandeau identité */
  .ident{display:grid;grid-template-columns:1.25fr 1.2fr 1fr;gap:18px;align-items:start;margin-bottom:14px}
.emp-root .ident .ttl{font-family:var(--font-strong);font-weight:600;font-size:30px;line-height:1.05;color:var(--ink)}
.emp-root .ident .meta{font-size:13px;color:var(--ink-3);margin-top:6px}
.emp-root .ident .meta b{color:var(--ink-2);font-family:var(--font-strong);font-weight:600}
.emp-root .typo-box .lab{font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-4);margin-bottom:4px;font-family:var(--font-strong);font-weight:600}
.emp-root .typo-box .v{font-family:var(--font-strong);font-weight:600;font-size:19px;color:var(--accent-2);line-height:1.15}
.emp-root .typo-box .ech{font-size:11.5px;color:var(--ink-4);margin-top:5px}
.emp-root .centralite{display:grid;grid-template-columns:0.85fr 1.25fr 1.25fr;gap:13px}
@media(max-width:840px){.emp-root .ident, .emp-root .centralite{grid-template-columns:1fr}
}
.emp-root .cbloc{background:var(--bg-soft);border:1px solid var(--line);border-radius:12px;padding:13px 15px}
.emp-root .cbloc .ct{font-family:var(--font-strong);font-size:10px;letter-spacing:.05em;text-transform:uppercase;color:var(--ink-4);font-weight:600;margin-bottom:10px;display:flex;align-items:center;gap:6px}
.emp-root .cbloc.todo{opacity:.62}
.emp-root .cbloc.todo .tag{font-size:8.5px;letter-spacing:.04em;text-transform:uppercase;color:var(--ink-4);background:var(--bg-deep);border-radius:5px;padding:2px 6px;margin-left:auto}
.emp-root /* réglette qualitative (socle, .emp-root densité) */
  .rq-big{font-family:var(--font-strong);font-weight:600;font-size:30px;line-height:1;color:var(--ink);margin:2px 0}
.emp-root .rq-big small{font-size:11px;color:var(--ink-3);font-weight:400;margin-left:3px}
.emp-root .rq-track{position:relative;height:7px;border-radius:5px;background:linear-gradient(90deg,#e7ddc8,#cdb695);margin-top:22px}
.emp-root .rq-cur{position:absolute;top:-5px;width:3px;height:17px;background:var(--ink);border-radius:2px;transform:translateX(-50%);z-index:3}
.emp-root .rq-mk{position:absolute;top:-3px;height:13px;transform:translateX(-50%);z-index:2}
.emp-root .rq-nat{border-left:2px solid var(--ink)}
.emp-root .rq-typo{border-left:2px dashed var(--ink-3)}
.emp-root .rq-mk b{position:absolute;top:-15px;left:50%;transform:translateX(-50%);font-size:8.5px;font-family:var(--font-strong);font-weight:600;color:var(--ink-4);white-space:nowrap}
.emp-root .rq-labels{display:flex;justify-content:space-between;margin-top:7px;font-size:8.5px;color:var(--ink-4);text-transform:uppercase;letter-spacing:.02em;gap:2px;text-align:center}
.emp-root .rq-labels span{flex:1}
.emp-root .rq-labels .on{color:var(--accent-2);font-family:var(--font-strong);font-weight:600}
.emp-root .rq-grad{display:flex;justify-content:space-between;margin-top:3px;font-size:8px;color:var(--ink-5);font-family:var(--font-strong)}
.emp-root /* mini réglette (école / gare) */
  .mini{margin-bottom:11px}
.emp-root .mini:last-child{margin-bottom:0}
.emp-root .mini-top{display:flex;justify-content:space-between;align-items:baseline}
.emp-root .mini-lab{font-size:11px;color:var(--ink-3)}
.emp-root .mini-val{font-family:var(--font-strong);font-weight:600;font-size:17px;color:var(--ink)}
.emp-root .mini-track{position:relative;height:6px;border-radius:4px;background:var(--bg-deep);margin-top:5px}
.emp-root .mini-fill{position:absolute;left:0;top:0;height:100%;border-radius:4px;background:var(--accent);opacity:.55}
.emp-root .mini-cur{position:absolute;top:-4px;width:2.5px;height:14px;background:var(--ink);border-radius:2px;transform:translateX(-50%)}
.emp-root .mini-mk{position:absolute;top:-2px;height:10px;transform:translateX(-50%)}
.emp-root .mini-nat{border-left:2px solid var(--ink)}
.emp-root .mini-typo{border-left:2px dashed var(--ink-3)}
.emp-root .mini-leg{font-size:9px;color:var(--ink-4);margin-top:5px}
.emp-root .mini-leg b{color:var(--ink-3);font-family:var(--font-strong)}
.emp-root .mini.empty .mini-val{color:var(--ink-5)}
.emp-root .hl{background:linear-gradient(180deg,var(--accent-tint),var(--bg-card));border:1px solid var(--accent-soft)}
.emp-root .hl-row{display:flex;align-items:center;gap:16px}
.emp-root .hl-x{font-family:var(--font-strong);font-weight:600;font-size:58px;line-height:.85;color:var(--accent-2);letter-spacing:-.02em;white-space:nowrap}
.emp-root .hl-txt{font-size:12.5px;color:var(--ink-2);line-height:1.45}
.emp-root .hl-txt b{font-family:var(--font-strong);font-weight:600}
.emp-root .superf{display:flex;gap:18px;font-size:11px;margin-top:12px}
.emp-root .superf .k{text-transform:uppercase;letter-spacing:.03em;color:var(--ink-4)}
.emp-root .superf .v{font-family:var(--font-strong);font-weight:600;font-size:15px;color:var(--ink-3)}
.emp-root .placeholder{border:1px dashed var(--ink-5);border-radius:11px;padding:14px;text-align:center;color:var(--ink-4);font-size:11.5px;background:repeating-linear-gradient(45deg,transparent,transparent 8px,rgba(0,0,0,.015) 8px,rgba(0,0,0,.015) 16px)}
.emp-root .vbloc{margin-bottom:15px}
.emp-root .vbloc .lab{font-size:11px;letter-spacing:.03em;text-transform:uppercase;color:var(--ink-4);margin-bottom:4px}
.emp-root .vbloc .v{font-family:var(--font-strong);font-weight:600;font-size:28px;color:var(--ink)}
.emp-root .vbloc .cmp{font-size:11px;color:var(--ink-4);margin-top:3px}
.emp-root .vbloc .minibar{height:6px;border-radius:4px;background:var(--bg-deep);margin-top:7px;position:relative;overflow:hidden}
.emp-root .vbloc .minibar i{position:absolute;left:0;top:0;height:100%;border-radius:4px;background:var(--accent);opacity:.85}
.emp-root .stat{padding:12px 0;border-bottom:1px solid var(--line)}
.emp-root .stat:last-child{border-bottom:0}
.emp-root .stat .lab{font-size:12px;color:var(--ink-3);margin-bottom:3px}
.emp-root .stat .v{font-family:var(--font-strong);font-weight:600;font-size:26px;color:var(--ink)}
.emp-root .stat .cmp{font-size:11px;color:var(--ink-4);margin-top:2px}
.emp-root .tag-malus{font-size:9px;letter-spacing:.04em;text-transform:uppercase;color:var(--accent-2);background:var(--accent-tint);border-radius:5px;padding:2px 6px;margin-left:7px}
.emp-root .note{font-size:11.5px;color:var(--ink-4);padding-top:12px;border-top:1px solid var(--line)}
.emp-root .stade-cap{font-size:11px;color:var(--ink-4);margin-top:8px}`;
function injectEmpCss(){ if(document.getElementById('emp-css'))return; var s=document.createElement('style'); s.id='emp-css'; s.textContent=EMP_CSS; document.head.appendChild(s); }
const F='font-family="Segoe UI, system-ui, sans-serif"';

function renderPop(elId,years,vals,estim){
  estim=estim||years.map(function(){return false;});
  const W=300,H=84,x0=8,x1=W-8,yTop=20,yBot=54;
  const mn=Math.min.apply(null,vals),mx=Math.max.apply(null,vals),rng=Math.max(mx-mn,mx*0.01||1);
  const X=i=>x0+i*(x1-x0)/(vals.length-1),Y=v=>yBot-((v-mn)/rng)*(yBot-yTop);
  const d=vals.map((v,i)=>`${i===0?'M':'L'} ${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join(' ');
  const area=`${d} L ${X(vals.length-1).toFixed(1)} ${H-22} L ${X(0).toFixed(1)} ${H-22} Z`;
  let dots='',vlab='',ylab='';
  vals.forEach((v,i)=>{const es=estim[i],anc=i===0?'start':(i===vals.length-1?'end':'middle'),tx=i===0?X(i)-1:(i===vals.length-1?X(i)+1:X(i));
    dots+=`<circle cx="${X(i).toFixed(1)}" cy="${Y(v).toFixed(1)}" r="${es?2:3}" fill="var(--accent)" ${es?'opacity="0.5"':''}/>`;
    const k=(v>=1000?Math.round(v/1000)+'k':Math.round(v));
    vlab+=`<text x="${tx.toFixed(1)}" y="${(Y(v)-7).toFixed(1)}" text-anchor="${anc}" ${F} font-size="9.5" font-weight="${es?'400':'600'}" fill="${es?'var(--ink-4)':'var(--ink-2)'}">${k}</text>`;
    ylab+=`<text x="${tx.toFixed(1)}" y="${H-5}" text-anchor="${anc}" ${F} font-size="9" fill="var(--ink-4)">${years[i]}</text>`;});
  document.getElementById(elId).innerHTML=`<svg viewBox="0 0 ${W} ${H}"><defs><linearGradient id="${elId}-pg" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="var(--accent)" stop-opacity="0.16"/><stop offset="100%" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs><path d="${area}" fill="url(#${elId}-pg)"/><path class="pline" d="${d}" fill="none" stroke="var(--accent)" stroke-width="1.8" stroke-linejoin="round"/>${dots}${vlab}${ylab}</svg>`;
}

// réglette qualitative % (socle)
function regletteQpct(elId,big,sub,val,nat,typo,labels){
  const onIdx=Math.min(labels.length-1,Math.floor(val/100*labels.length));
  const lbls=labels.map((l,i)=>`<span class="${i===onIdx?'on':''}">${l}</span>`).join('');
  document.getElementById(elId).innerHTML=`<div class="rq-big">${big}<small>${sub}</small></div>
    <div class="rq-track"><span class="rq-mk rq-nat" style="left:${nat}%"><b>Fr ${Math.round(nat)}</b></span><span class="rq-mk rq-typo" style="left:${typo}%"><b>pairs ${Math.round(typo)}</b></span><span class="rq-cur" style="left:${val}%"></span></div>
    <div class="rq-labels">${lbls}</div>`;
}

// réglette densité (échelle à seuils + graduation chiffrée)
function regletteDensite(elId,val,nat,typo,seuils,labels){
  // 5 segments égaux, bornes = seuils (len 4)
  const segs=[[0,seuils[0]],[seuils[0],seuils[1]],[seuils[1],seuils[2]],[seuils[2],seuils[3]],[seuils[3],seuils[3]*3.75]];
  const pos=v=>{for(let i=0;i<5;i++){const[a,b]=segs[i];if(v<b||i===4){return (i+Math.min(1,(v-a)/(b-a)))*20;}}return 100;};
  const onIdx=segs.findIndex(([a,b],i)=>val<b||i===4);
  const lbls=labels.map((l,i)=>`<span class="${i===onIdx?'on':''}">${l}</span>`).join('');
  const grad=`<span>0</span>`+seuils.map(s=>`<span>${s}</span>`).join('')+`<span></span>`;
  document.getElementById(elId).innerHTML=`<div class="rq-big">${val}<small>hab/km²</small></div>
    <div class="rq-track"><span class="rq-mk rq-nat" style="left:${pos(nat).toFixed(1)}%"><b>Fr ${nat}</b></span><span class="rq-mk rq-typo" style="left:${pos(typo).toFixed(1)}%"><b>pairs ${typo}</b></span><span class="rq-cur" style="left:${pos(val).toFixed(1)}%"></span></div>
    <div class="rq-grad">${grad}</div><div class="rq-labels">${lbls}</div>`;
}

// mini réglette (école/gare) %
function regletteMini(elId,lab,val,nat,typo){
  document.getElementById(elId).innerHTML=`<div class="mini"><div class="mini-top"><span class="mini-lab">${lab}</span><span class="mini-val">${(+val).toFixed(1).replace('.',',')} %</span></div>
    <div class="mini-track"><span class="mini-fill fillanim" style="width:${val}%"></span><span class="mini-mk mini-nat" style="left:${nat}%"></span><span class="mini-mk mini-typo" style="left:${typo}%"></span><span class="mini-cur" style="left:${val}%"></span></div>
    <div class="mini-leg">France <b>${Math.round(nat)}</b> · pairs <b>${Math.round(typo)}</b></div></div>`;
}

function renderPyramideAges(elId,data){
  const {labels,territoire,national,typo}=data,n=labels.length;
  const W=500,H=340,padL=52,padR=18,padT=8,padB=28,x0=padL,x1=W-padR,y0=padT,y1=H-padB;
  const bandH=(y1-y0)/n,barH=Math.min(23,bandH*0.58),valMax=Math.ceil(Math.max(...territoire,...national,...typo)/5)*5+2;
  const X=v=>x0+(v/valMax)*(x1-x0),Yc=i=>y1-(i+0.5)*bandH;
  let grid='',axis='';
  for(let g=0;g<=valMax;g+=5){const x=X(g);grid+=`<line x1="${x.toFixed(1)}" y1="${y0}" x2="${x.toFixed(1)}" y2="${y1}" stroke="var(--line)" stroke-width="1" ${g===0?'':'stroke-dasharray="2 3"'}/>`;axis+=`<text x="${x.toFixed(1)}" y="${y1+14}" text-anchor="middle" ${F} font-size="9" fill="var(--ink-4)">${g}%</text>`;}
  let bars='',lbls='',vals='';
  for(let i=0;i<n;i++){const yc=Yc(i),w=X(territoire[i])-x0;
    bars+=`<rect class="gbar" style="animation-delay:${(i*0.06).toFixed(2)}s" x="${x0}" y="${(yc-barH/2).toFixed(1)}" width="${Math.max(0,w).toFixed(1)}" height="${barH.toFixed(1)}" rx="3" fill="var(--accent)" opacity="0.9"/>`;
    lbls+=`<text x="${x0-8}" y="${(yc+3.5).toFixed(1)}" text-anchor="end" ${F} font-size="10.5" fill="var(--ink-3)">${labels[i]}</text>`;
    vals+=`<text class="mk" x="${(X(territoire[i])+5).toFixed(1)}" y="${(yc+3.5).toFixed(1)}" ${F} font-size="10.5" font-weight="600" fill="var(--ink-2)">${territoire[i].toFixed(1).replace('.',',')}%</text>`;}
  const path=a=>a.map((v,i)=>`${i===0?'M':'L'} ${X(v).toFixed(1)} ${Yc(i).toFixed(1)}`).join(' ');
  const dots=national.map((v,i)=>`<circle class="mk" cx="${X(v).toFixed(1)}" cy="${Yc(i).toFixed(1)}" r="2.3" fill="var(--ink)"/>`).join('');
  document.getElementById(elId).innerHTML=`<svg viewBox="0 0 ${W} ${H}">${grid}${bars}<path class="pline" d="${path(typo)}" fill="none" stroke="var(--ink-3)" stroke-width="1.6" stroke-dasharray="5 4" stroke-linejoin="round" opacity="0.9"/><path class="pline" d="${path(national)}" fill="none" stroke="var(--ink)" stroke-width="2" stroke-linejoin="round"/>${dots}${lbls}${vals}${axis}</svg>`;
}

// barres graduées avec VALEUR TERRITOIRE en gros
function renderGradBars(elId,rows,opt){
  const max=opt.max,suf=opt.suffix||'',ticks=opt.ticks,unit=opt.unit||'',W=520,padL=178,padR=42,rowH=54,padT=30,padB=8;
  const H=padT+padB+rows.length*rowH,x0=padL,x1=W-padR,X=v=>x0+(v/max)*(x1-x0);
  const dec=opt.dec!=null?opt.dec:1;
  const fmt=v=>{if(v==null||isNaN(v))return '—';return (+(+v).toFixed(dec)).toLocaleString('fr-FR')+(suf==='%'?' %':'');};
  const top=unit?`<text x="${W-2}" y="12" text-anchor="end" ${F} font-size="9.5" fill="var(--ink-4)">${unit}</text>`:'';
  let grid='';ticks.forEach(t=>{const x=X(t);grid+=`<line x1="${x.toFixed(1)}" y1="${padT-4}" x2="${x.toFixed(1)}" y2="${H-padB}" stroke="var(--line)" stroke-width="1" stroke-dasharray="2 3"/><text x="${x.toFixed(1)}" y="${padT-9}" text-anchor="middle" ${F} font-size="9" fill="var(--ink-4)">${suf==='%'?t+'%':t}</text>`;});
  let out='';rows.forEach((r,i)=>{const yc=padT+i*rowH+rowH/2,bw=X(r.val)-x0,bh=17;
    out+=`<text x="4" y="${(yc-8).toFixed(1)}" ${F} font-size="11.5" fill="var(--ink-3)">${r.label}</text>`;
    out+=`<text x="4" y="${(yc+15).toFixed(1)}" ${F} font-size="22" font-weight="700" fill="var(--accent-2)">${fmt(r.val)}</text>`;
    out+=`<rect class="gbar" style="animation-delay:${(i*0.08).toFixed(2)}s" x="${x0}" y="${(yc-bh/2).toFixed(1)}" width="${Math.max(0,bw).toFixed(1)}" height="${bh}" rx="3" fill="var(--accent)" opacity="0.85"/>`;
    out+=`<line class="mk" x1="${X(r.nat).toFixed(1)}" y1="${(yc-bh/2-6).toFixed(1)}" x2="${X(r.nat).toFixed(1)}" y2="${(yc+bh/2+6).toFixed(1)}" stroke="var(--ink)" stroke-width="2"/>`;
    out+=`<text class="mk" x="${X(r.nat).toFixed(1)}" y="${(yc-bh/2-9).toFixed(1)}" text-anchor="middle" ${F} font-size="9" font-weight="600" fill="var(--ink)">${fmt(r.nat)}</text>`;
    out+=`<line class="mk" x1="${X(r.typo).toFixed(1)}" y1="${(yc-bh/2-6).toFixed(1)}" x2="${X(r.typo).toFixed(1)}" y2="${(yc+bh/2+6).toFixed(1)}" stroke="var(--ink-3)" stroke-width="1.8" stroke-dasharray="3 2"/>`;
    out+=`<text class="mk" x="${X(r.typo).toFixed(1)}" y="${(yc+bh/2+17).toFixed(1)}" text-anchor="middle" ${F} font-size="9" font-weight="600" fill="var(--ink-3)">${fmt(r.typo)}</text>`;});
  document.getElementById(elId).innerHTML=`<svg viewBox="0 0 ${W} ${H}">${top}${grid}${out}</svg>`;
}

function renderRadar(elId,axes){
  const cx=120,cy=112,R=80,n=axes.length,ang=i=>-Math.PI/2+i*2*Math.PI/n,pt=(i,r)=>[cx+R*r*Math.cos(ang(i)),cy+R*r*Math.sin(ang(i))];
  let grid='';[0.25,0.5,0.75,1].forEach(r=>{const p=axes.map((_,i)=>pt(i,r).map(x=>x.toFixed(1)).join(',')).join(' ');grid+=`<polygon points="${p}" fill="none" stroke="var(--line)" stroke-width="1"/>`;});
  let axL='';axes.forEach((a,i)=>{const[x,y]=pt(i,1);axL+=`<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="var(--line)" stroke-width="1"/>`;const[lx,ly]=pt(i,1.16);axL+=`<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="middle" dominant-baseline="middle" ${F} font-size="9.5" fill="var(--ink-3)">${a.label}</text>`;});
  const poly=key=>axes.map((a,i)=>pt(i,Math.min(1,a[key]/a.max)).map(x=>x.toFixed(1)).join(',')).join(' ');
  document.getElementById(elId).innerHTML=`<svg viewBox="0 0 240 224">${grid}${axL}<polygon points="${poly('typo')}" fill="none" stroke="var(--ink-3)" stroke-width="1.6" stroke-dasharray="5 4" opacity="0.9"/><polygon points="${poly('nat')}" fill="none" stroke="var(--ink)" stroke-width="2"/><polygon class="mk" points="${poly('val')}" fill="var(--accent)" fill-opacity="0.22" stroke="var(--accent)" stroke-width="2"/></svg>`;
}

// pictogrammes SVG mobilité
function picto(kind,cx,by,col){
  const t=`translate(${(cx-11).toFixed(1)},${by})`;const s=`stroke="${col}" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"`;
  if(kind==='walk')return `<g transform="${t}"><circle cx="12" cy="3" r="2" fill="${col}" stroke="none"/><path d="M12 6 L12 13 M12 13 L9 19 M12 13 L15 18 M12 8.5 L8.5 11 M12 8.5 L15.5 10.5" ${s}/></g>`;
  if(kind==='bike')return `<g transform="${t}"><circle cx="5" cy="15" r="4" ${s}/><circle cx="18" cy="15" r="4" ${s}/><path d="M5 15 L10 7 L15 7 M10 15 L13.5 7.5 L18 15 M14 7 L16 7" ${s}/></g>`;
  if(kind==='bus')return `<g transform="${t}"><rect x="3" y="3" width="16" height="12.5" rx="2.5" ${s}/><line x1="3" y1="9" x2="19" y2="9" ${s}/><circle cx="7" cy="18" r="1.8" fill="${col}"/><circle cx="15" cy="18" r="1.8" fill="${col}"/></g>`;
  return `<g transform="${t}"><path d="M2 14 L4 9.5 Q4.7 8 7 8 L14 8 Q16.5 8 17.5 10.5 L19.5 11.5 Q21 12 21 13.5 L21 14" ${s}/><line x1="2" y1="14" x2="21" y2="14" ${s}/><circle cx="7" cy="15" r="2" fill="${col}"/><circle cx="16" cy="15" r="2" fill="${col}"/></g>`;
}
function renderModal(elId,items,sepAfter){
  const W=480,H=224,padL=8,padR=8,padT=22,padB=52,x0=padL,x1=W-padR,y0=padT,y1=H-padB;
  const max=Math.max(...items.flatMap(d=>[d.val,d.nat,d.typo]))*1.15,n=items.length,slot=(x1-x0)/n,bw=Math.min(46,slot*0.5),Y=v=>y1-(v/max)*(y1-y0);
  let out='';
  items.forEach((d,i)=>{const cx=x0+slot*(i+0.5),bx=cx-bw/2;
    out+=`<rect class="vbar" style="animation-delay:${(i*0.09).toFixed(2)}s" x="${bx.toFixed(1)}" y="${Y(d.val).toFixed(1)}" width="${bw}" height="${(y1-Y(d.val)).toFixed(1)}" rx="4" fill="var(--accent)" opacity="0.9"/>`;
    out+=`<text class="mk" x="${cx.toFixed(1)}" y="${(Y(d.val)-6).toFixed(1)}" text-anchor="middle" ${F} font-size="12" font-weight="700" fill="var(--accent-2)">${d.val.toFixed(1).replace('.',',')}%</text>`;
    out+=`<line class="mk" x1="${(cx-bw/2-3).toFixed(1)}" y1="${Y(d.nat).toFixed(1)}" x2="${(cx+bw/2+3).toFixed(1)}" y2="${Y(d.nat).toFixed(1)}" stroke="var(--ink)" stroke-width="2"/>`;
    out+=`<line class="mk" x1="${(cx-bw/2-3).toFixed(1)}" y1="${Y(d.typo).toFixed(1)}" x2="${(cx+bw/2+3).toFixed(1)}" y2="${Y(d.typo).toFixed(1)}" stroke="var(--ink-3)" stroke-width="1.8" stroke-dasharray="3 2"/>`;
    out+=picto(d.icon,cx,y1+8,'var(--ink-3)');
    out+=`<text x="${cx.toFixed(1)}" y="${(y1+44).toFixed(1)}" text-anchor="middle" ${F} font-size="10" fill="var(--ink-3)">${d.label}</text>`;});
  const sx=x0+slot*(sepAfter+1);
  out+=`<line x1="${sx.toFixed(1)}" y1="${y0-4}" x2="${sx.toFixed(1)}" y2="${y1+4}" stroke="var(--ink-4)" stroke-width="1.5" stroke-dasharray="4 3"/>`;
  document.getElementById(elId).innerHTML=`<svg viewBox="0 0 ${W} ${H}">${out}</svg>`;
}

// stadomètre : vrais pictos terrain, dernier partiel si fraction
function renderStade(elId,n){
  const W=480,nbFull=Math.floor(n),frac=+(n-nbFull).toFixed(2),total=nbFull+(frac>0.05?1:0);
  const gap=3,cols=Math.max(10,Math.floor((W+gap)/(18+gap))),rows=Math.ceil(total/cols);
  const cell=(W-(cols-1)*gap)/cols,ch=cell*0.64;
  const pitch=(x,y)=>{const cx=x+cell/2,cy=y+ch/2,sw=cell*0.15,tn='var(--accent-tint)';
    let g=`<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${cell.toFixed(1)}" height="${ch.toFixed(1)}" rx="1.5" fill="var(--accent)"/>`;
    if(cell>9){g+=`<line x1="${cx.toFixed(1)}" y1="${(y+1.2).toFixed(1)}" x2="${cx.toFixed(1)}" y2="${(y+ch-1.2).toFixed(1)}" stroke="${tn}" stroke-width="0.7" opacity="0.9"/>`+
      `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${(ch*0.17).toFixed(1)}" fill="none" stroke="${tn}" stroke-width="0.7" opacity="0.9"/>`+
      `<rect x="${(x+0.9).toFixed(1)}" y="${(cy-ch*0.27).toFixed(1)}" width="${sw.toFixed(1)}" height="${(ch*0.54).toFixed(1)}" fill="none" stroke="${tn}" stroke-width="0.6" opacity="0.8"/>`+
      `<rect x="${(x+cell-0.9-sw).toFixed(1)}" y="${(cy-ch*0.27).toFixed(1)}" width="${sw.toFixed(1)}" height="${(ch*0.54).toFixed(1)}" fill="none" stroke="${tn}" stroke-width="0.6" opacity="0.8"/>`;}
    return g;};
  let out='';
  for(let i=0;i<total;i++){const r=Math.floor(i/cols),c=i%cols,x=c*(cell+gap),y=r*(ch+gap),dl=(i*0.004).toFixed(3);
    const partial=(i===nbFull&&frac>0.05);
    if(partial){out+=`<clipPath id="clp${i}"><rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${(cell*frac).toFixed(1)}" height="${ch.toFixed(1)}"/></clipPath>`+
      `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${cell.toFixed(1)}" height="${ch.toFixed(1)}" rx="1.5" fill="none" stroke="var(--accent-soft)" stroke-width="0.8" stroke-dasharray="2 2"/>`+
      `<g class="stp" style="animation-delay:${dl}s" clip-path="url(#clp${i})">${pitch(x,y)}</g>`;}
    else out+=`<g class="stp" style="animation-delay:${dl}s">${pitch(x,y)}</g>`;}
  const H=rows*(ch+gap);
  document.getElementById(elId).innerHTML=`<svg viewBox="0 0 ${W} ${H.toFixed(0)}">${out}</svg>`;
}

function renderDonut(elId,legId,segs,ctop,cbot){
  const r=52,cx=68,cy=68,C=2*Math.PI*r,tot=segs.reduce((s,x)=>s+x.val,0);let off=0,arcs='';
  segs.forEach(s=>{const len=C*s.val/tot;arcs+=`<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${s.color}" stroke-width="21" stroke-dasharray="${len.toFixed(2)} ${(C-len).toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}" transform="rotate(-90 ${cx} ${cy})"/>`;off+=len;});
  const ctr=ctop?`<text x="${cx}" y="${cy-1}" text-anchor="middle" ${F} font-size="14" font-weight="600" fill="var(--ink)">${ctop}</text><text x="${cx}" y="${cy+12}" text-anchor="middle" ${F} font-size="8" fill="var(--ink-4)">${cbot||''}</text>`:'';
  document.getElementById(elId).innerHTML=`<svg viewBox="0 0 136 136" class="mk" style="animation-delay:.2s">${arcs}${ctr}</svg>`;
  if(legId)document.getElementById(legId).innerHTML=segs.map(s=>`<div style="display:flex;align-items:center;justify-content:space-between;font-size:11.5px;color:var(--ink-3);margin-bottom:5px"><span style="display:inline-flex;align-items:center"><i style="width:10px;height:10px;border-radius:2px;background:${s.color};margin-right:7px;display:inline-block"></i>${s.label}</span><b style="font-family:var(--font-strong);color:var(--ink-2)">${Math.round(100*s.val/tot)} %</b></div>`).join('');
}

function empNice(maxv){
  if(!isFinite(maxv)||maxv<=0)return {max:1,ticks:[0,1]};
  var raw=maxv/4, mag=Math.pow(10,Math.floor(Math.log(raw)/Math.LN10)), n=raw/mag;
  var step=(n<=1?1:n<=2?2:n<=5?5:10)*mag;
  var max=Math.ceil(maxv/step)*step, ticks=[];
  for(var t=0;t<=max+1e-9;t+=step)ticks.push(+t.toFixed(4));
  return {max:max,ticks:ticks};
}
function renderEmpreintes(container, ind, refs, opts){
  injectEmpCss(); opts=opts||{}; ind=ind||{}; refs=refs||{};
  var type=opts.type==='commune'?'commune':'epci';
  var dens7=String(opts.dens7||'');
  var meta=refs._meta||{}, nat=refs.national||{};
  var pairs=((type==='commune'?refs.dens7_commune:refs.dens7_epci)||{})[dens7]||{};
  var counts=((type==='commune'?meta.counts_commune:meta.counts_epci)||{});
  var labels=meta.dens7_labels||{};
  function V(c){return (ind[c]&&ind[c].valeur!=null)?ind[c].valeur:null;}
  function fr(v,d){if(v==null||isNaN(v))return '—';return Number(v).toLocaleString('fr-FR',{minimumFractionDigits:d||0,maximumFractionDigits:d||0});}
  function g(a,b){return a!=null?a:b;}
  var pop=V('population_2021')||0;
  function e10k(c){var x=V(c);return (x!=null&&pop)?x/pop*10000:null;}
  function perHab(c){var x=V(c);return (x!=null&&pop)?x/pop:null;}

  var ageCodes=['pop_0_14','pop_15_29','pop_30_44','pop_45_59','pop_60_74','pop_75_89','pop_90_plus'];
  var ageCounts=ageCodes.map(V);
  var ageTot=ageCounts.reduce(function(s,x){return s+(x||0);},0);
  var ageT=(ageTot>0&&ageCounts.every(function(x){return x!=null;}))?ageCounts.map(function(x){return +(100*x/ageTot).toFixed(2);}):null;

  var densBrute=V('densite_brute'), densBatie=V('dens_popclc');
  var ratio=(densBrute&&densBatie)?densBatie/densBrute:null;
  var showRatio=ratio!=null&&ratio>1.2&&ratio<40;

  var radarLab=['Services','Santé','Commerces','Sport','Enseign.'];
  var eqRows=[
    {label:'Services',val:e10k('bpe_services'),nat:(nat.equip_10k||{}).services,typo:(pairs.equip_10k||{}).services},
    {label:'Santé',val:e10k('bpe_sante'),nat:(nat.equip_10k||{}).sante,typo:(pairs.equip_10k||{}).sante},
    {label:'Commerces',val:e10k('bpe_commerces'),nat:(nat.equip_10k||{}).commerces,typo:(pairs.equip_10k||{}).commerces},
    {label:'Sport, loisir, culture',val:e10k('bpe_sport_culture'),nat:(nat.equip_10k||{}).sport_culture,typo:(pairs.equip_10k||{}).sport_culture},
    {label:'Enseignement',val:e10k('bpe_enseignement'),nat:(nat.equip_10k||{}).enseignement,typo:(pairs.equip_10k||{}).enseignement}
  ].map(function(r){return {label:r.label,val:r.val||0,nat:r.nat||0,typo:r.typo||0};});
  var eqTotal=eqRows.reduce(function(s,r){return s+r.val;},0);
  var eqT=empNice(Math.max.apply(null,eqRows.map(function(r){return Math.max(r.val,r.nat,r.typo);})));

  var variete=V('variete_equip'), socle=V('taux_couverture_socle');
  var habEc=V('pct_habitat_zone_ecole_15'), eqEc=V('pct_equipements_zone_ecole_15');

  var modalItems=[
    {label:'Marche',icon:'walk',val:V('part_marche'),nat:(nat.modal||{}).marche,typo:(pairs.modal||{}).marche},
    {label:'Vélo',icon:'bike',val:V('part_velo'),nat:(nat.modal||{}).velo,typo:(pairs.modal||{}).velo},
    {label:'Transports',icon:'bus',val:V('part_tc'),nat:(nat.modal||{}).tc,typo:(pairs.modal||{}).tc},
    {label:'Voiture',icon:'car',val:V('part_voiture'),nat:(nat.modal||{}).voiture,typo:(pairs.modal||{}).voiture}
  ].map(function(r){return {label:r.label,icon:r.icon,val:r.val||0,nat:r.nat||0,typo:r.typo||0};});
  var travailC=V('part_travail_commune'), vSurPlace=V('part_voiture_sur_place'), dbl=V('taux_double_motorisation');

  var gesTotH=g(V('ges_total_par_hab'),perHab('ges_total')), transH=g(V('ges_transport_par_hab'),perHab('ges_route'));
  var gesRows=[
    {label:'Total',val:gesTotH,nat:(nat.ges_hab||{}).total,typo:(pairs.ges_hab||{}).total},
    {label:'Transport routier',val:transH,nat:(nat.ges_hab||{}).route,typo:(pairs.ges_hab||{}).route},
    {label:'Résidentiel',val:perHab('ges_resid'),nat:(nat.ges_hab||{}).resid,typo:(pairs.ges_hab||{}).resid},
    {label:'Tertiaire',val:perHab('ges_tertiaire'),nat:(nat.ges_hab||{}).tertiaire,typo:(pairs.ges_hab||{}).tertiaire},
    {label:'Industrie',val:perHab('ges_industrie'),nat:(nat.ges_hab||{}).industrie,typo:(pairs.ges_hab||{}).industrie}
  ].map(function(r){return {label:r.label,val:r.val||0,nat:r.nat||0,typo:r.typo||0};});
  var gesT=empNice(Math.max.apply(null,gesRows.map(function(r){return Math.max(r.val,r.nat,r.typo);})));
  var gesSegs=[
    {label:'Transport routier',val:V('ges_route'),color:'#8e3a18'},
    {label:'CO₂ biomasse',val:V('co2_biomasse'),color:'#a8693f'},
    {label:'Résidentiel',val:V('ges_resid'),color:'#b85a36'},
    {label:'Tertiaire',val:V('ges_tertiaire'),color:'#cb7a52'},
    {label:'Industrie',val:V('ges_industrie'),color:'#d9a173'},
    {label:'Autres',val:(V('ges_energie')||0)+(V('ges_dechets')||0)+(V('ges_agri')||0),color:'#e3c39a'}
  ].filter(function(s){return s.val!=null&&s.val>0;});

  var consoTotH=V('conso_energie_par_hab');
  var consoRows=[
    {label:'Total (élec+gaz)',val:consoTotH,nat:(nat.conso_hab||{}).total,typo:(pairs.conso_hab||{}).total},
    {label:'Électricité',val:perHab('conso_elec'),nat:(nat.conso_hab||{}).elec,typo:(pairs.conso_hab||{}).elec},
    {label:'Gaz',val:perHab('conso_gaz'),nat:(nat.conso_hab||{}).gaz,typo:(pairs.conso_hab||{}).gaz}
  ].map(function(r){return {label:r.label,val:r.val||0,nat:r.nat||0,typo:r.typo||0};});
  var consoT=empNice(Math.max.apply(null,consoRows.map(function(r){return Math.max(r.val,r.nat,r.typo);})));

  var artifM2=V('artif_15_21'), artifHab=V('artif_par_hab');
  var terrains=artifM2!=null?artifM2/7140:null;
  var hab09=V('artif_habitat_09_23'), infra09=V('artif_infra_09_23'), naf09=V('artif_naf09_23');
  var naf09Ha=naf09!=null?naf09/10000:null;
  var artifSegs=naf09?[
    {label:'Activité économique',val:naf09-(hab09||0)-(infra09||0),color:'#8e3a18'},
    {label:'Habitat',val:hab09,color:'#cb7a52'},
    {label:'Infrastructures',val:infra09,color:'#e3c39a'}
  ].filter(function(s){return s.val!=null&&s.val>0;}):[];

  var solKw=V('puis_solaire_kw_par_hab'), solInst=V('nb_install_par_1000hab'), hasSol=solKw!=null;

  var nom=opts.nom||(ind.libepci&&ind.libepci.valeur)||'Territoire';
  var sousTitre=opts.sousTitre||'';
  var typeLabel=labels[dens7]||(type==='commune'?'Commune':'Agglomération');
  var nbType=counts[dens7];
  var nbTypeTxt=nbType!=null?(fr(nbType)+(type==='commune'?' communes':' agglomérations')+' de ce type'):'';
  var tcam=V('tcam_pop'), P15=(pop&&tcam!=null)?pop/Math.pow(1+tcam/100,6):null;

  container.className=((container.className||'')+' emp-root').trim();
  container.innerHTML=`
  <section class="sec" data-empdim="band"><div class="card">
    <div class="ident">
      <div><div class="ttl">${nom}</div><div class="meta">${sousTitre}</div></div>
      <div class="pop"><div class="kick">Population</div><div class="pop-big">${fr(pop)}<small>hab · 2021</small></div>
        <div class="pop-sub">${tcam!=null?`<span class="pop-tcam">${tcam>=0?'+':''}${fr(tcam,2)} %/an (2015→2021)</span>`:''}<span class="pop-vs">vs France métro. +0,3 %/an</span></div>
        <div id="emp-popspark"></div></div>
      <div class="typo-box"><div class="lab">Type de territoire</div><div class="v">${typeLabel}</div><div class="ech">${nbTypeTxt}</div></div>
    </div>
    <div class="centralite">
      <div class="cbloc"><div class="ct">Socle d'équipements</div><div id="emp-socle"></div></div>
      ${type==='commune'
        ? `<div class="cbloc todo"><div class="ct">À moins d'1,5 km d'une école<span class="tag">recalcul en cours</span></div>
        <div class="mini empty"><div class="mini-top"><span class="mini-lab">Habitants</span><span class="mini-val">—</span></div><div class="mini-track"></div></div>
        <div class="mini empty" style="margin-top:11px"><div class="mini-top"><span class="mini-lab">Équipements</span><span class="mini-val">—</span></div><div class="mini-track"></div></div></div>`
        : `<div class="cbloc"><div class="ct">À moins d'1,5 km d'une école</div><div id="emp-ecole_hab"></div><div id="emp-ecole_eq"></div></div>`}
      <div class="cbloc todo"><div class="ct">À moins de 3 km d'une gare<span class="tag">à brancher</span></div>
        <div class="mini empty"><div class="mini-top"><span class="mini-lab">Habitants</span><span class="mini-val">—</span></div><div class="mini-track"></div></div>
        <div class="mini empty" style="margin-top:11px"><div class="mini-top"><span class="mini-lab">Équipements</span><span class="mini-val">—</span></div><div class="mini-track"></div></div></div>
    </div>
  </div></section>

  <section class="sec" data-empdim="struct"><p class="sec-kicker"><span class="num">01</span> Structure démographique</p>
    <div class="bloc">
      <div class="card"><div class="card-head"><span class="card-title">Répartition par âge</span><span class="badge">INSEE · Recensement 2021</span></div>
        <p class="card-sub">Part de la population par tranche d'âge, comparée aux moyennes de référence.</p>
        <div id="emp-pyramide"></div>
        <div class="legend"><span><i class="lg-bar"></i>${nom}</span><span><i class="lg-nat"></i>Moyenne nationale</span><span><i class="lg-typo"></i>${typeLabel}</span></div>
        <div class="lecture" id="emp-lecture"></div></div>
      <div class="stack">
        ${showRatio?`<div class="card hl"><div class="hl-row"><div class="hl-x">${fr(ratio,1)}×</div><div class="hl-txt">Sur la surface réellement bâtie, la densité atteint <b>${fr(densBatie)} hab/km²</b>, soit <b>${fr(ratio,1)} fois</b> la densité brute (${fr(densBrute)}). Habitat concentré.</div></div>
          <div class="superf"><div><div class="k">Surface totale</div><div class="v">${fr(V('superficie_km2'))} km²</div></div></div></div>`:''}
        <div class="card"><div class="card-head"><span class="card-title">Densité de population</span><span class="badge">INSEE · IGN</span></div><div id="emp-densite"></div></div>
        <div class="placeholder">Bloc Logements (nb pers./logement, collectif, propriétaires / locataires / HLM) — à venir</div>
      </div>
    </div>
  </section>

  <section class="sec" data-empdim="access"><p class="sec-kicker"><span class="num">02</span> Accessibilité aux équipements</p>
    <div class="bloc" style="grid-template-columns:1.75fr 0.6fr 0.95fr">
      <div class="card"><div class="card-head"><span class="card-title">Équipements pour 10 000 habitants</span><span class="badge">INSEE · BPE 2023</span></div>
        <div id="emp-equiptop"></div><div class="legend"><span><i class="lg-bar"></i>${nom}</span><span><i class="lg-nat"></i>France</span><span><i class="lg-typo"></i>${typeLabel}</span></div></div>
      <div class="card stack">
        <div class="vbloc"><div class="lab">Variété d'équipements</div><div class="v">${fr(variete)}<small style="font-size:13px;color:var(--ink-4);font-weight:400"> / panier</small></div><div class="minibar"><i class="fillanim" style="width:${Math.min(100,(variete||0))}%"></i></div><div class="cmp">France ${fr(nat.variete_equip)} · pairs ${fr(pairs.variete_equip)}</div></div>
        <div class="vbloc"><div class="lab">Couverture du socle</div><div class="v">${fr(socle,1)} %</div><div class="minibar"><i class="fillanim" style="width:${Math.min(100,(socle||0))}%"></i></div><div class="cmp">France ${fr(nat.couverture_socle,0)} % · pairs ${fr(pairs.couverture_socle,0)} %</div></div></div>
      <div class="card"><div class="card-head"><span class="card-title">Profil d'équipements</span></div><div id="emp-radar" style="max-width:300px;margin:4px auto 0"></div>
        <div class="legend" style="justify-content:center"><span><i class="lg-nat"></i>France</span><span><i class="lg-typo"></i>Pairs</span></div></div>
    </div>
  </section>

  <section class="sec" data-empdim="mob"><p class="sec-kicker"><span class="num">03</span> Mobilité</p>
    <div class="bloc">
      <div class="card"><div class="card-head"><span class="card-title">Parts modales domicile-travail</span><span class="badge">INSEE · MOBPRO 2021</span></div>
        <p class="card-sub">Du mode le plus sobre au plus émetteur.</p><div id="emp-modalbars"></div>
        <div class="legend"><span><i class="lg-bar"></i>${nom}</span><span><i class="lg-nat"></i>France</span><span><i class="lg-typo"></i>${typeLabel}</span></div></div>
      <div class="stack">
        <div class="card"><div class="card-head"><span class="card-title">Travail et voiture</span></div>
          <div class="stat"><div class="lab">Actifs travaillant dans leur commune</div><div class="v">${fr(travailC,1)} %</div><div class="cmp">France ${fr(nat.travail_commune,1)} % · pairs ${fr(pairs.travail_commune,1)} %</div></div>
          <div class="stat"><div class="lab">Parmi eux, usage de la voiture<span class="tag-malus">futur malus</span></div><div class="v">${fr(vSurPlace,1)} %</div><div class="cmp">France ${fr(nat.voiture_sur_place,1)} % · pairs ${fr(pairs.voiture_sur_place,1)} %</div></div></div>
        <div class="card"><div class="card-head"><span class="card-title">Double motorisation</span><span class="badge">INSEE · MOBPRO 2021</span></div>
          <div class="vbloc" style="margin:8px 0 0"><div class="lab">Ménages à 2 voitures ou plus</div><div class="v">${fr(dbl,1)} %</div>
            <div class="mini-track" style="margin-top:12px;height:7px"><span class="mini-fill fillanim" style="width:${Math.min(100,(dbl||0))}%"></span><span class="mini-mk mini-nat" style="left:${Math.min(100,(nat.double_motorisation||0))}%;height:14px;top:-3.5px"></span><span class="mini-mk mini-typo" style="left:${Math.min(100,(pairs.double_motorisation||0))}%;height:14px;top:-3.5px"></span><span class="mini-cur" style="left:${Math.min(100,(dbl||0))}%;height:16px;top:-4.5px"></span></div>
            <div class="cmp" style="margin-top:10px">France <b style="font-family:var(--font-strong);color:var(--ink-3)">${fr(nat.double_motorisation,1)} %</b> · pairs <b style="font-family:var(--font-strong);color:var(--ink-3)">${fr(pairs.double_motorisation,1)} %</b></div></div></div>
      </div>
    </div>
  </section>

  <section class="sec" data-empdim="env"><p class="sec-kicker"><span class="num">04</span> Environnement</p>
    <p class="subk">Artificialisation des sols</p>
    <div class="bloc">
      <div class="card"><div class="card-head"><span class="card-title">Sols artificialisés 2015-2021</span><span class="badge">Artificialisation · DDT</span></div>
        <div><span class="big">${fr(artifM2)}</span><span class="unit">m²${artifM2!=null?' ('+fr(artifM2/10000)+' ha)':''}</span></div>
        ${terrains!=null?`<div style="font-family:var(--font-strong);font-weight:600;font-size:14.5px;color:var(--accent-2);margin-top:10px">soit ≈ ${fr(terrains)} terrains de foot</div>`:''}
        <div id="emp-stade" style="margin-top:8px"></div><div class="stade-cap">1 terrain de foot = 7 140 m²</div>
        <div style="border-top:1px dashed var(--line);margin-top:14px;padding-top:12px"><div class="vbloc" style="margin:0"><div class="lab">Par habitant</div><div class="v">${fr(artifHab,1)} m²</div><div class="cmp">consommés entre 2015 et 2021</div></div></div></div>
      <div class="card"><div class="card-head"><span class="card-title">Répartition par usage</span><span class="badge">2009-2023</span></div>
        <div id="emp-artifdonut" style="max-width:185px;margin:6px auto 0"></div><div id="emp-artifleg" style="margin-top:12px"></div>
        <p style="margin:12px 0 0;font-size:11px;color:var(--ink-4);line-height:1.45">À quoi servent les sols artificialisés : part dédiée à l'habitat, à l'activité économique et aux infrastructures. Détail sur 2009-2023 uniquement.</p></div>
    </div>

    <p class="subk" style="margin-top:24px">Émissions de gaz à effet de serre</p>
    <div class="bloc">
      <div class="card"><div class="card-head"><span class="card-title">Émissions par habitant · tCO₂eq</span><span class="badge">ADEME · IGT</span></div>
        <div id="emp-gesreg"></div><div class="legend"><span><i class="lg-nat"></i>France</span><span><i class="lg-typo"></i>${typeLabel}</span></div></div>
      <div class="card"><div class="card-head"><span class="card-title">Répartition des GES</span></div><div id="emp-gesdonut" style="max-width:175px;margin:4px auto 0"></div><div id="emp-gesleg" style="margin-top:10px"></div></div>
    </div>

    <p class="subk" style="margin-top:24px">Consommation d'énergie</p>
    <div class="bloc">
      <div class="card"><div class="card-head"><span class="card-title">Consommation par habitant · MWh</span><span class="badge">RTE · GRDF</span></div>
        <div id="emp-consoreg"></div><div class="legend"><span><i class="lg-nat"></i>France</span><span><i class="lg-typo"></i>${typeLabel}</span></div></div>
      <div class="card stack">
        ${hasSol?`<div class="vbloc" style="margin:0"><div class="lab">Puissance solaire installée</div><div class="v">${fr(solKw,2)}<small style="font-size:13px;color:var(--ink-4);font-weight:400"> kW/hab</small></div><div class="minibar"><i class="fillanim" style="width:${Math.min(100,(solKw||0)*100)}%"></i></div><div class="cmp">France ${fr(nat.solaire&&nat.solaire.kw_hab,2)} · pairs ${fr(pairs.solaire&&pairs.solaire.kw_hab,2)} kW/hab</div></div>
        <div class="vbloc" style="margin:0"><div class="lab">Installations solaires</div><div class="v">${fr(solInst,1)}<small style="font-size:13px;color:var(--ink-4);font-weight:400"> / 1000 hab</small></div></div>`:`<div class="placeholder">Données solaire disponibles au niveau agglomération</div>`}
      </div>
    </div>
  </section>`;

  // --- rendus ---
  var rPop=1+(tcam||0)/100;
  function spop(n){return isFinite(n)&&n>0?n:pop;}
  var popPts=opts.popPoints||[[2011,spop(pop/Math.pow(rPop,10)),true],[2015,spop(pop/Math.pow(rPop,6)),false],[2018,spop(pop/Math.pow(rPop,3)),true],[2021,pop,false]];
  if(popPts&&popPts.length>=2) renderPop('emp-popspark',popPts.map(function(p){return p[0];}),popPts.map(function(p){return p[1];}),popPts.map(function(p){return p[2]||false;}));
  if(socle!=null) regletteQpct('emp-socle',fr(socle,1),'% du socle',socle,nat.couverture_socle||0,pairs.couverture_socle||0,["très sous-éq.","sous-éq.","bien éq.","très bien éq."]);
  if(habEc!=null && type!=='commune') regletteMini('emp-ecole_hab','Habitants',habEc,g(nat.centralite_habitat_ecole,0),g(pairs.centralite_habitat_ecole,nat.centralite_habitat_ecole));
  if(eqEc!=null && type!=='commune') regletteMini('emp-ecole_eq','Équipements',eqEc,g(nat.centralite_equip_ecole,0),g(pairs.centralite_equip_ecole,nat.centralite_equip_ecole));
  if(densBrute!=null) regletteDensite('emp-densite',Math.round(densBrute),Math.round(nat.densite||0),Math.round(pairs.densite||0),[30,80,200,800],["très peu","peu","moyenne","dense","très dense"]);
  if(ageT) renderPyramideAges('emp-pyramide',{labels:["0–14","15–29","30–44","45–59","60–74","75–89","90 +"],territoire:ageT,national:nat.age_profil||ageT,typo:pairs.age_profil||nat.age_profil||ageT});
  if(ageT){var rp=pairs.age_profil||nat.age_profil||ageT;document.getElementById('emp-lecture').innerHTML=`<b>Lecture.</b> ${(ageT[0]+ageT[1]).toFixed(0)} % de moins de 30 ans (vs ${(rp[0]+rp[1]).toFixed(0)} % pour ce type de territoire) et ${(ageT[4]+ageT[5]+ageT[6]).toFixed(0)} % de 60 ans et plus (vs ${(rp[4]+rp[5]+rp[6]).toFixed(0)} %).`;}
  document.getElementById('emp-equiptop').innerHTML=`<div style="display:flex;align-items:baseline;justify-content:space-between"><span class="card-sub" style="margin:0">Total / 10k hab</span><span class="big" style="font-size:26px">${fr(eqTotal,1)}</span></div><div style="font-size:11px;color:var(--ink-4);text-align:right;margin-bottom:10px">France ${fr((nat.equip_10k||{}).total,0)} · pairs ${fr((pairs.equip_10k||{}).total,0)}</div><div style="border-top:1px solid var(--line);margin-bottom:8px"></div><div id="emp-eqgrad"></div>`;
  renderGradBars('emp-eqgrad',eqRows,{max:eqT.max,ticks:eqT.ticks,unit:'équipements / 10 000 hab',dec:1});
  renderRadar('emp-radar',eqRows.map(function(r,i){return {label:radarLab[i],val:r.val,nat:r.nat,typo:r.typo,max:Math.max(r.val,r.nat,r.typo)*1.15||1};}));
  renderModal('emp-modalbars',modalItems,2);
  if(terrains!=null) renderStade('emp-stade',terrains);
  if(artifSegs.length) renderDonut('emp-artifdonut','emp-artifleg',artifSegs,naf09Ha!=null?fr(naf09Ha)+' ha':'','2009-23');
  renderGradBars('emp-gesreg',gesRows,{max:gesT.max,ticks:gesT.ticks,unit:'tCO₂eq / habitant',dec:2});
  if(gesSegs.length) renderDonut('emp-gesdonut','emp-gesleg',gesSegs,fr(gesTotH,2),'tCO₂/hab');
  renderGradBars('emp-consoreg',consoRows,{max:consoT.max,ticks:consoT.ticks,unit:'MWh / habitant',dec:1});
}
if(typeof window!=='undefined') window.renderEmpreintes=renderEmpreintes;

})();
