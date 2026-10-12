// Moved from frontend_src/letter-tagger.html — see tests_ui/legacy for the reference page. No DOM rendering in this module.
import { parseTagCell, resolveContext, resolveLabel } from './alias.js'
import { KNOWN } from './catalog.js'
import { dataFiles, fileHeaders } from './data.js'
import { buildModel, parseAll, runFmt } from './docx.js'
import { findAll, indianFmt, intlFmt, norm, snake } from './helpers.js'
import { computeSourceMatches } from './rows.js'
import { state } from './state.js'
import { detectTables, tagKeyOf } from './tables.js'

/* ======================= detection ======================= */
export const RX_TAG = /\{\{[\s\S]*?\}\}|\{%[\s\S]*?%\}|\{#[\s\S]*?#\}/g;
export const RX_PH = [
  {kind:'Brackets', rx:/\[([^\[\]\n]{0,58}[A-Za-z][^\[\]\n]{0,58})\]/g, global:true},
  {kind:'Brackets', rx:/<<([^<>\n]{1,60})>>/g, global:true},
  {kind:'Merge field', rx:/«([^«»\n]{1,60})»/g, global:true},
  {kind:'Brackets', rx:/(?<!\{)\{(?![{%#])([A-Za-z][^{}\n]{0,59})\}(?!\})/g, global:true},
  {kind:'Blank', rx:/(?<![A-Za-z])[Xx]{2,}(?:[\/\-.][Xx]{2,})+(?![A-Za-z])|(?<![A-Za-z])[Xx]{3,}(?![A-Za-z])/g},
  {kind:'Blank', rx:/_{4,}/g},
  {kind:'Blank', rx:/\.{5,}|…{2,}/g},
];
export function overlaps(list,s,e){ return list.some(([a,b])=>s<b && e>a); }
export const untagged=t=>/\{[{%#]/.test(t) ? t.replace(RX_TAG, m=>' '.repeat(m.length)) : t;
// text inside tags never counts as letter text
export function countInDoc(find, skipTyped){ let c=0; for (const p of state.an.paras) if (!p.fallback && !(skipTyped && state.typed.has(p.pid))) c+=findAll(untagged(p.model.text), find).length; return c; }
export function analyze(){
  if (!state.srcBuf) return;   // no letter yet (a data file can be added first)
  const {docs, fields, joined} = parseAll();
  state.an = buildModel(docs); state.an.fields=fields; state.an.joined=joined;
  const rows=new Map(); let existing=0;
  const addRow = r => { if (!rows.has(r.id)) rows.set(r.id, r); return rows.get(r.id); };
  for (const p of state.an.paras){
    if (p.fallback) continue;
    const t=p.model.text; if (!t.trim()) continue;
    const taken=[];
    for (const m of t.matchAll(RX_TAG)){ taken.push([m.index, m.index+m[0].length]); existing++; }
    for (const def of RX_PH){
      def.rx.lastIndex=0;
      for (const m of t.matchAll(def.rx)){
        const s=m.index, e=s+m[0].length; if (overlaps(taken,s,e)) continue; taken.push([s,e]);
        if (def.global){
          const r=addRow({id:'g:'+m[0], scope:'all', find:m[0], label:(m[1]||'').trim(), kind:def.kind, first:p.order*1e5+s});
          r.first=Math.min(r.first, p.order*1e5+s);
        } else {
          addRow({id:`o:${p.pid}:${s}`, scope:'one', loc:{pid:p.pid,s,e}, find:m[0], label:'', kind:def.kind, ctx:t.slice(Math.max(0,s-70),s), after:t.slice(e,e+30), first:p.order*1e5+s});
        }
      }
    }
    // highlighted runs
    let seg=null; const segs=[];
    for (const it of p.model.nodes){
      const hl = runFmt(it.node).hl && it.len>0;
      if (hl){ if (seg && seg.e===it.start) seg.e=it.start+it.len; else { seg={s:it.start, e:it.start+it.len}; segs.push(seg); } } else seg=null;
    }
    for (const sg of segs){
      let s=sg.s, e=sg.e; while (s<e && /\s/.test(t[s])) s++; while (e>s && /[\s.,;:]/.test(t[e-1])) e--;
      if (e-s<1 || e-s>200 || overlaps(taken,s,e)) continue; taken.push([s,e]);
      addRow({id:`o:${p.pid}:${s}`, scope:'one', loc:{pid:p.pid,s,e}, find:t.slice(s,e), label:t.slice(s,e), kind:'Highlight', ctx:t.slice(Math.max(0,s-70),s), after:t.slice(e,e+30), first:p.order*1e5+s});
    }
  }
  state.an.existingTags=existing;

  // CSV
  state.csvAlias=new Map(); state.extraKeys=new Set(); const csvUse={used:0, alias:0, missing:[]};
  const csv=state.csv;
  state.csvHeaders = [...new Set(dataFiles().flatMap(fileHeaders))];
  state.csvHeaders.forEach(h=>state.extraKeys.add(tagKeyOf(h)));
  if (csv && csv.mode==='mapping'){
    for (const e of csv.entries){ const v=parseTagCell(e.tag); if (!v || !e.find) continue; state.csvAlias.set(norm(e.find), v); if (v.key) state.extraKeys.add(v.key); }
    for (const e of csv.entries){
      const v=parseTagCell(e.tag); if (!v || !e.find) continue;
      const n=norm(e.find);
      const hit=[...rows.values()].filter(r=>r.find===e.find || (r.scope==='all' && norm(r.label)===n));
      if (hit.length){ hit.forEach(r=>{ r.csv=v; }); csvUse.used++; continue; }
      const c=countInDoc(e.find);
      if (c>0){ const r=addRow({id:'g:'+e.find, scope:'all', find:e.find, label:e.find, kind:'CSV', first:firstPos(e.find)}); r.csv=v; csvUse.used++; }
      else csvUse.alias++;
    }
  }
  if (csv && csv.mode==='sample' && !csv.params){
    const row=csv.rows[csv.sampleIdx]||[];
    csv.headers.forEach((h,i)=>{
      const val=String(row[i]??'').trim(); if (!h) return;
      const v = parseTagCell(h);
      let key = v && v.override ? null : null, override = v && v.override ? v.override : null;
      if (!override){ const r=resolveLabel(h); key = r && r.conf>=0.5 ? r.key : (KNOWN.has(h.trim())?h.trim():'custom_schema.'+snake(h)); }
      state.extraKeys.add(key||'');
      if (val.length<3){ csvUse.missing.push(h); return; }
      if (csv.rows.length>=5){ const same=csv.rows.filter(r=>String(r[i]??'').trim()===val).length; if (same/csv.rows.length>0.2 || (/^[A-Za-z]+$/.test(val) && val.length<=4)){ csvUse.missing.push(h); return; } }
      let found=false;
      for (const vv of valueVariants(val)){
        const c=countInDoc(vv.text, true); if (!c) continue; found=true;
        const r=addRow({id:'g:'+vv.text, scope:'all', find:vv.text, label:h, kind:'Sample value', first:firstPos(vv.text, true)});
        r.csv = override ? {override} : {key, fmt:vv.fmt};
      }
      if (found) csvUse.used++; else csvUse.missing.push(h);
    });
  }
  if (csv && csv.mode==='keys'){ csv.keys.forEach(k=>state.extraKeys.add(k)); }
  state.csvUse=csvUse;

  // manual rows persisted in edits
  for (const [id,ed] of Object.entries(state.edits)){
    if (!ed.manual || rows.has(id)) continue;
    if (ed.occ){ const p=state.an.byPid.get(ed.occ.pid); if (p && p.model.text.slice(ed.occ.s, ed.occ.e)===ed.occ.find){ const t=p.model.text; addRow({id, scope:'one', loc:{pid:ed.occ.pid, s:ed.occ.s, e:ed.occ.e}, find:ed.occ.find, label:'', kind:'Added', ctx:t.slice(Math.max(0,ed.occ.s-70), ed.occ.s), after:t.slice(ed.occ.e, ed.occ.e+30), first:p.order*1e5+ed.occ.s}); } continue; }
    const c=countInDoc(ed.find); addRow({id, scope:'all', find:ed.find, label:ed.find, kind:'Added', first:c?firstPos(ed.find):9e15});
  }
  for (const r of rows.values()){ if (r.scope==='all') r.count=countInDoc(r.find, r.kind==='Sample value'); else r.count=1; }

  // resolve
  for (const r of rows.values()){
    r.enabled=true; r.format='auto'; r.override=null; r.key=''; r.conf=0; r.note='';
    if (r.csv){ r.key=r.csv.key||''; r.override=r.csv.override||null; r.conf=1; r.how='From your CSV.'; if (r.csv.fmt) r.format=r.csv.fmt; }
    else {
      let res=null;
      if (r.kind==='Highlight'){ res=resolveLabel(r.find,{fallback:false}); const c=resolveContext(r.ctx); if (c && (!res || c.conf>res.conf)) res=c; }
      else if (r.scope==='one') res=resolveContext(r.ctx);
      else if (r.kind==='Added') res=resolveLabel(r.find,{fallback:false});
      else res=resolveLabel(r.label||r.find);
      if (res){ r.key=res.key; r.override=res.override||null; r.conf=res.conf; r.how=res.how||''; r.extra=res.extra||''; }
    }
    const cs=state.claudeSugs && state.claudeSugs[r.id];
    if (cs){ r.key=cs.key; r.override=cs.override||null; r.conf=cs.conf; r.how='Claude: '+cs.reason; r.extra=''; r.format='auto'; }
    const ed=state.edits[r.id];
    if (ed){ if ('key' in ed){ r.key=ed.key; r.conf=1; r.how=''; r.extra=''; } if ('format' in ed) r.format=ed.format; if ('override' in ed) r.override=ed.override; if ('enabled' in ed) r.enabled=ed.enabled; }
  }
  state.rows=[...rows.values()].sort((a,b)=>(a.count?0:1)-(b.count?0:1) || a.first-b.first);
  detectTables();
  // drop conditions that no longer exist
  state.logic = state.logic.filter(l=>state.an.byPid.has(l.pid));
  computeSourceMatches();
}
export function firstPos(find, skipTyped){ for (const p of state.an.paras){ if (p.fallback || (skipTyped && state.typed.has(p.pid))) continue; const m=findAll(untagged(p.model.text),find)[0]; if (m) return p.order*1e5+m[0]; } return 9e15; }
export function valueVariants(v){
  const out=[{text:v, fmt:'none'}];
  const clean=v.replace(/[,\s₹]/g,'');
  if (/^-?\d+(\.\d+)?$/.test(clean)){
    const n=Number(clean);
    out.push({text:indianFmt(n), fmt:'indian'},{text:intlFmt(n), fmt:'intl'});
    if (Number.isInteger(n)) out.push({text:intlFmt(n)+'.00', fmt:'dec2'});
  }
  const seen=new Set(); return out.filter(x=>!seen.has(x.text) && seen.add(x.text));
}
