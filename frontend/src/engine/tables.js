// Moved from frontend_src/letter-tagger.html — see tests_ui/legacy for the reference page. No DOM rendering in this module.
import { FX } from './catalog.js'
import { identifiersIn } from './checks.js'
import { setPreserve } from './docx.js'
import { W, ancestor, childW, cleanCondExpr, isW, norm, snake, straighten } from './helpers.js'
import { buildTag, dashTag, houseTag, wrapper } from './rows.js'
import { state } from './state.js'

/* ======================= salary tables (empty cells, tagged cell by cell) ======================= */
export const MONTH_SFX=['_monthly','_month','_mnth','_mo','_pm','_m'];
export const YEAR_SFX=['_annual','_annum','_yearly','_pa','_yr','_py','_a'];
export function cellParas(tc){ return [...tc.getElementsByTagNameNS(W,'p')].filter(p=>ancestor(p,['tc'])===tc); }
export function tableGrid(tbl, an){
  const rows=[];
  for (const tr of tbl.childNodes){ if (!isW(tr,'tr')) continue; const cells=[]; let ci=0;
    for (const tc of tr.childNodes){ if (!isW(tc,'tc')) continue;
      const tcPr=childW(tc,'tcPr'); const gs=tcPr&&childW(tcPr,'gridSpan'); const span=gs?(+gs.getAttributeNS(W,'val')||1):1;
      const vm=tcPr&&childW(tcPr,'vMerge'); const vcont=!!(vm && (vm.getAttributeNS(W,'val')||'continue')!=='restart');
      const ps=cellParas(tc); const text=ps.map(p=>an.byEl.get(p)?.model.text||'').join(' ').replace(/\s+/g,' ').trim();
      cells.push({tc, ci, span, text, vcont, nested:tc.getElementsByTagNameNS(W,'tbl').length>0, ps}); ci+=span; }
    rows.push({tr, cells}); }
  return rows;
}
export const cellAt=(row,ci)=>row && row.cells.find(c=>c.ci===ci);
export const cleanLabel=s=>String(s).replace(/[\*†‡#^]+/g,'').replace(/\s+/g,' ').replace(/[:\-–]\s*$/,'').trim();
export function topTables(doc){ return [...doc.getElementsByTagNameNS(W,'tbl')].filter(t=>!ancestor(t,['tc'])); }
export const isMonthlyHeader=h=>/month|(^| )pm( |$)|p m|mthly|per mon/.test(norm(h));
export const tagKeyOf=h=>/^[A-Za-z_][\w.]*$/.test(h.trim()) ? h.trim() : snake(h);
export function labelBases(label){
  const all=snake(label).split('_').filter(Boolean);
  const w=all.filter(x=>x!=='total'); const out=[];
  const push=x=>{ if (x && !out.includes(x)) out.push(x); };
  push(all.join('_')); push(w.join('_')); push(w.slice(0,2).join('_')); push(w[0]);
  if (w.length>1){ push(w.map(x=>x[0]).join('')); push(w.slice(0,2).map(x=>x[0]).join('')); }
  return out;
}
export function splitHeader(h){
  const s=snake(h);
  const m=MONTH_SFX.find(x=>s.endsWith(x) && s.length>x.length); if (m) return {base:s.slice(0,-m.length), monthly:true};
  const y=YEAR_SFX.find(x=>s.endsWith(x) && s.length>x.length); if (y) return {base:s.slice(0,-y.length), monthly:false};
  return {base:s, monthly:false};
}
export function matchCsvHeader(label, monthly){
  const heads=state.csvHeaders.map(h=>({h, ...splitHeader(h)})).filter(x=>x.monthly===monthly);
  const bases=labelBases(label);
  for (const b of bases){ const hit=heads.filter(x=>x.base===b); if (hit.length===1) return hit[0].h; }
  const first=bases[1]||bases[0];
  if (first){ const hit=heads.filter(x=>x.base.startsWith(first+'_')); if (hit.length===1) return hit[0].h; }
  return '';
}
export const cellMemKey=(label,header)=>norm(label)+'|'+norm(header);
export function detectTables(){
  state.tables=[]; state.ghostMap=new Map();
  const doc=state.an.docs[state.mainPath];
  topTables(doc).forEach((tbl, ti)=>{
    const g=tableGrid(tbl, state.an); if (g.length<3) return;
    const hdr=g[0];
    const data=g.map((r,ri)=>({r,ri})).slice(1).filter(x=>x.r.cells[0] && x.r.cells[0].text && !x.r.cells[0].vcont);
    const colEmpty={};
    for (const {r} of data) for (const c of r.cells.slice(1)) if (!c.text && !c.vcont && !c.nested) colEmpty[c.ci]=(colEmpty[c.ci]||0)+1;
    const vcols=Object.keys(colEmpty).map(Number).filter(ci=>colEmpty[ci]>=2).sort((a,b)=>a-b);
    const total=vcols.reduce((s,ci)=>s+colEmpty[ci],0);
    if (!vcols.length || total<3) return;
    const id='t'+ti; const ed=state.tableEdits[id]||{};
    const cols=vcols.map(ci=>{ const h=cellAt(hdr,ci)?.text||''; return {ci, header:h||`Column ${ci+1}`, monthly:isMonthlyHeader(h), fmt:'auto', div12:false, ...((ed.cols||{})[ci]||{})}; });
    const rows=data.map(x=>{
      const empties=vcols.filter(ci=>{ const c=cellAt(x.r,ci); return c && !c.text && !c.vcont && !c.nested; });
      if (!empties.length) return null;
      const label=cleanLabel(x.r.cells[0].text);
      const cells={};
      for (const ci of empties){
        const col=cols.find(c=>c.ci===ci);
        const e=(ed.cells||{})[x.ri+':'+ci];
        if (e){ cells[ci]={...e}; continue; }
        const mem=state.learnedCells[cellMemKey(label,col.header)];
        const tm=state.team && state.team.use!==false && state.team.cells ? state.team.cells[cellMemKey(label,col.header)] : null;
        const csv=matchCsvHeader(label, col.monthly);
        cells[ci] = tm ? {key:tm, override:null, src:'team'} : csv ? {key:tagKeyOf(csv), override:null, src:'csv'} : mem ? {key:mem, override:null, src:'memory'} : {key:'', override:null, src:''};
      }
      return {ri:x.ri, label, empties, cells};
    }).filter(Boolean);
    if (!rows.length) return;
    for (const r of rows){ const rh=(ed.rowHide||{})[r.ri]; r.hide = rh!=null ? rh : !/^(total|sub ?total|gross|net)( |$)|(^| )ctc( |$)|cost to company/.test(norm(r.label)); }
    const hide={on:true, ci:cols[cols.length-1].ci, pattern:state.settings.hidePattern||HIDE_PATTERN, ...(ed.hide||{})};
    const t={id, ti, n:state.tables.length+1, cols, rows, hide, enabled: ed.enabled!==false, corner: hdr.cells[0]?.text||''};
    state.tables.push(t);
    for (const row of rows) for (const ci of row.empties){ const c=cellAt(g[row.ri],ci); if (c && c.ps[0]) state.ghostMap.set(c.ps[0], {t, row, col:cols.find(x=>x.ci===ci)}); }
  });
}
export const HIDE_PATTERN="{key} | default(0) | string | replace(',', '') | float(0)";
export function rowCondKey(t,row){
  const order=[t.cols.find(c=>c.ci===t.hide.ci), ...t.cols].filter(Boolean);
  for (const col of order){
    if (!row.empties.includes(col.ci)) continue;
    const cell=row.cells[col.ci]; const k=(cell&&cell.key||'').trim();
    if (k && /^[A-Za-z_][\w.]*$/.test(k) && !FX[k]) return k;
    const tag=tCellTag(t,row,col); if (!tag) continue;
    const ids=identifiersIn(tag.replace(/^\{\{-?|-?\}\}$/g,'')).filter(x=>x!=='currentDatetime'); if (ids.length) return ids[0];
  }
  return '';
}
export function rowCondExpr(t,row){ const k=rowCondKey(t,row); if (!k) return ''; const pat=cleanCondExpr(t.hide.pattern||HIDE_PATTERN); return pat.includes('{key}') ? pat.split('{key}').join(k) : `${k} and (${pat})`; }
export function lastCellPara(tr){ const tcs=[...tr.childNodes].filter(n=>isW(n,'tc')); const tc=tcs[tcs.length-1]; if (!tc) return null; const kids=[...tc.childNodes].filter(n=>n.nodeType===1 && !isW(n,'tcPr')); const last=kids[kids.length-1]; return isW(last,'p') ? last : null; }
export function tEditHide(t,patch){ const ed=(state.tableEdits[t.id] ||= {}); ed.hide={...(ed.hide||{}), ...patch}; Object.assign(t.hide, patch); }
export function tEditRowHide(t,row,v){ const ed=(state.tableEdits[t.id] ||= {}); ed.rowHide ||= {}; ed.rowHide[row.ri]=v; row.hide=v; }
export function tEditCell(t,row,ci,patch){
  const ed=(state.tableEdits[t.id] ||= {}); ed.cells ||= {};
  row.cells[ci]={...row.cells[ci], ...patch, src:'you'}; ed.cells[row.ri+':'+ci]={...row.cells[ci]};
}
export function tEditCol(t,ci,patch){ const ed=(state.tableEdits[t.id] ||= {}); ed.cols ||= {}; ed.cols[ci]={...(ed.cols[ci]||{}), ...patch}; Object.assign(t.cols.find(c=>c.ci===ci), patch); }
export function tCellTag(t,row,col){
  if (!t.enabled || !row.empties.includes(col.ci)) return '';
  const cell=row.cells[col.ci]; if (!cell) return '';
  if (cell.override!=null && cell.override!=='') return straighten(cell.override);
  const key=(cell.key||'').trim(); if (!key) return '';
  if (/\{\{|\{%/.test(key) || FX[key]) return buildTag(key,'none');
  const fmt = col.fmt==='auto' ? state.settings.money : col.fmt;
  if (!col.div12) return buildTag(key, fmt);
  const g=state.settings.guard?' | default(0, true)':'';
  const num=`((${key}${g} | float) / 12)`;
  const w=wrapper();
  if (fmt==='house') return houseTag(key, `(${key} | float) / 12`);
  if (fmt==='dash') return dashTag(key, `(${key} | float) / 12`);
  if (fmt==='dec0') return w(`'{:.0f}'.format(${num}) | indian_comma`);
  if (fmt==='intl') return w(`${num} | round(0) | int | int_comma`);
  if (fmt==='none') return w(`${num} | round(0) | int`);
  if (fmt==='dec2') return w(`'{:,.2f}'.format(${num})`);
  return w(`${num} | round(0) | int | indian_comma`);
}
export function tableCounts(t){ let all=0, done=0; for (const r of t.rows) for (const ci of r.empties){ all++; if (tCellTag(t,r,t.cols.find(c=>c.ci===ci))) done++; } return {all, done}; }
export function fillCell(doc, tc, text){
  let p=[...tc.childNodes].find(n=>isW(n,'p'));
  if (!p){ p=doc.createElementNS(W,'w:p'); tc.appendChild(p); }
  appendTagRun(doc, p, text);
}
export function appendTagRun(doc, p, text){
  const r=doc.createElementNS(W,'w:r');
  const pPr=childW(p,'pPr'); const mark=pPr&&childW(pPr,'rPr');
  if (mark){ const c=mark.cloneNode(true); for (const n of [...c.childNodes]) if (n.nodeType===1 && ['ins','del','moveFrom','moveTo','rPrChange'].includes(n.localName)) c.removeChild(n); if (c.childNodes.length) r.appendChild(c); }
  const t=doc.createElementNS(W,'w:t'); setPreserve(t); t.textContent=text; r.appendChild(t); p.appendChild(r);
}
export const COL_FMTS=[['auto','Auto (tag settings)'],['house','House style · blank when empty or 0'],['dash','House style · “-” when empty or 0'],['indian','Indian commas'],['dec0',"No decimals · '{:.0f}'.format"],['indian_round','Rounded, Indian commas'],['intl','International commas'],['dec2','2 decimals'],['none','As is']];
export const SRC_LABEL={csv:'Matched a CSV column', memory:'Used last time', team:'From the team library', you:'', '':''};
export function tableAction(t, act){
  let n=0;
  for (const r of t.rows) for (const ci of r.empties){
    const col=t.cols.find(c=>c.ci===ci); const cell=r.cells[ci];
    if (act==='clear'){ tEditCell(t,r,ci,{key:'',override:null}); r.cells[ci].src=''; n++; continue; }
    if (cell.key || (cell.override!=null && cell.override!=='')) continue;
    let k='';
    if (act==='csv') k = matchCsvHeader(r.label, col.monthly) ? tagKeyOf(matchCsvHeader(r.label, col.monthly)) : '';
    if (act==='comp'){ const n2=norm(r.label); k = /(^| )ctc( |$)|cost to company/.test(n2) ? 'ctc' : /variable pay/.test(n2) ? 'variable_pay' : `${snake(r.label)}_current_amount`; if (col.monthly && !col.div12) tEditCol(t,ci,{div12:true}); }
    if (k){ tEditCell(t,r,ci,{key:k,override:null}); r.cells[ci].src = act==='csv'?'csv':'you'; n++; }
  }
  return n;
}

/* ======================= data for the salary tables screen (new: pure helpers, no DOM) ======================= */
// all tables' cell counts: {all, done}
export function tablesOverview(){ return state.tables.reduce((s,t)=>{ const c=tableCounts(t); return {all:s.all+c.all, done:s.done+c.done}; },{all:0,done:0}); }
// the one-line summaries of a table's options: the formats ("Indian commas ÷ 12") and the row hiding ("hides empty rows (checks Annual)")
export function tableSummary(t){
  const fmt=[...new Set(t.cols.map(c=>(COL_FMTS.find(f=>f[0]===c.fmt)||COL_FMTS[0])[1].replace(/ \(tag settings\)/,'')+(c.div12?' ÷ 12':'')))].join(', ');
  const hide=t.hide.on ? `hides empty rows (checks ${(t.cols.find(c=>c.ci===t.hide.ci)||t.cols[0]).header})` : 'shows every row';
  return {fmt, hide};
}
// an example of the condition the row hiding writes: {label, expr}, or null
export function tableHideExample(t){ const ex=t.rows.find(r=>r.hide && rowCondExpr(t,r)); return ex ? {label:ex.label, expr:rowCondExpr(t,ex)} : null; }
// the row's "Hide if 0 / Always show" switch: {on, text, title}
export function tableRowHide(t,r){
  const expr=r.hide ? rowCondExpr(t,r) : '';
  return {on:!!r.hide, text: r.hide ? (rowCondKey(t,r) ? 'Hide if 0' : 'Hide if 0 (no tag yet)') : 'Always show', title: expr ? `{% if ${expr} %}` : 'Always shown'};
}
// one cell of a table row as the screen shows it: {na:true} (the cell has text) or its key, tag and where the key came from
export function tableCellView(t,row,col){
  if (!row.empties.includes(col.ci)) return {na:true};
  const cell=row.cells[col.ci]||{}; const tag=tCellTag(t,row,col);
  return {na:false, key:cell.key||'', tag, edited: cell.override!=null && cell.override!=='', needs:!tag, src:SRC_LABEL[cell.src]||''};
}
