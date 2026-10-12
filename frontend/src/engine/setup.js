// Moved from frontend_src/letter-tagger.html — see tests_ui/legacy for the reference page. No DOM rendering in this module.
import { analyze } from './detect.js'
import { switchParaEdit } from './edits.js'
import { notify } from './events.js'
import { lsGet, lsSet, norm } from './helpers.js'
import { fullRefresh } from './load.js'
import { MONTHS, strftime } from './preview.js'
import { state } from './state.js'
import { HISTORY, recordUndo } from './undo.js'

/* ======================= setup files + autosave ======================= */
export function hashStr(s){ let h=0x811c9dc5; for (let i=0;i<s.length;i++){ h^=s.charCodeAt(i); h=Math.imul(h,0x01000193); } return (h>>>0).toString(16).padStart(8,'0'); }
export const normAnchor=s=>String(s||'').replace(/\s+/g,' ').trim();
export const tokSet=s=>new Set(norm(s).split(' ').filter(Boolean));
export function dice(a,b){ if (!a.size || !b.size) return 0; let n=0; for (const x of a) if (b.has(x)) n++; return 2*n/(a.size+b.size); }
export function nonEmptyNeighbour(p, dir){ const list=state.an.paras.filter(x=>x.path===p.path && !x.fallback && !x.textbox); let i=list.indexOf(p)+dir; while (i>=0 && i<list.length){ const t=normAnchor(list[i].model.text); if (t) return t.slice(0,160); i+=dir; } return ''; }
export function anchorOf(pid){
  const p=state.an.byPid.get(pid); if (!p) return null; const t=normAnchor(p.model.text);
  const same=state.an.paras.filter(x=>x.path===p.path && !x.fallback && normAnchor(x.model.text)===t);
  return {kind:p.kind, text:t.slice(0,300), nth:same.indexOf(p), prev:nonEmptyNeighbour(p,-1), next:nonEmptyNeighbour(p,1)};
}
export function findAnchor(a){
  if (!a) return null;
  const cands=state.an.paras.filter(x=>x.kind===a.kind && !x.fallback && !x.textbox);
  if (a.text){
    const exact=cands.filter(x=>normAnchor(x.model.text).slice(0,300)===a.text);
    if (exact.length===1) return exact[0].pid;
    if (exact.length>1){ const byCtx=exact.find(x=>nonEmptyNeighbour(x,-1)===a.prev); return (byCtx || exact[a.nth] || exact[0]).pid; }
    let best=null, bs=0; const ta=tokSet(a.text);
    for (const x of cands){ const s=dice(ta, tokSet(x.model.text)); if (s>bs){ bs=s; best=x; } }
    return bs>=0.6 ? best.pid : null;
  }
  const prevP=a.prev ? cands.find(x=>normAnchor(x.model.text).slice(0,160)===a.prev) : null;
  if (prevP){ const i=cands.indexOf(prevP); for (let k=i+1;k<Math.min(cands.length,i+5);k++) if (!normAnchor(cands[k].model.text)) return cands[k].pid; }
  return null;
}
export function tableSig(t){ return {headers:t.cols.map(c=>norm(c.header)), labels:t.rows.map(r=>norm(r.label))}; }
export function sigMatch(a,b){ if (!a||!b || a.headers.join('|')!==b.headers.join('|')) return false; const B=new Set(b.labels); const n=a.labels.filter(x=>B.has(x)).length; return n >= Math.ceil(Math.max(a.labels.length,1)*0.5); }
export function exportTable(t){
  const ed=state.tableEdits[t.id]; if (!ed) return null;
  const colBy=Object.fromEntries(t.cols.map(c=>[c.ci,c.header])); const rowBy=Object.fromEntries(t.rows.map(r=>[r.ri,r.label]));
  return {sig:tableSig(t), enabled:ed.enabled, hide:ed.hide||null,
    cols:Object.entries(ed.cols||{}).map(([ci,v])=>({header:colBy[ci], ...v})),
    cells:Object.entries(ed.cells||{}).map(([k,v])=>{ const [ri,ci]=k.split(':'); return {row:rowBy[ri], col:colBy[ci], key:v.key||'', override:v.override??null}; }),
    rowHide:Object.entries(ed.rowHide||{}).map(([ri,v])=>({row:rowBy[ri], hide:v}))};
}
export function importTable(t, st){
  const ed={}; if (st.enabled===false) ed.enabled=false; if (st.hide) ed.hide=st.hide;
  const ciBy=h=>t.cols.find(c=>norm(c.header)===norm(h))?.ci; const riBy=l=>t.rows.find(r=>norm(r.label)===norm(l))?.ri;
  for (const c of st.cols||[]){ const ci=ciBy(c.header); if (ci==null) continue; const v={}; if (c.fmt!=null) v.fmt=c.fmt; if (c.div12!=null) v.div12=c.div12; (ed.cols ||= {})[ci]=v; }
  for (const c of st.cells||[]){ const ri=riBy(c.row), ci=ciBy(c.col); if (ri==null || ci==null) continue; (ed.cells ||= {})[ri+':'+ci]={key:c.key||'', override:c.override??null, src:'you'}; }
  for (const h of st.rowHide||[]){ const ri=riBy(h.row); if (ri!=null) (ed.rowHide ||= {})[ri]=h.hide; }
  state.tableEdits[t.id]=ed;
}
export function exportSetup(opts={}){
  const modified=state.parts.some(p=>state.xml[p.path]!==state.origXml[p.path]);
  return {
    format:'compup-letter-tagger-setup', version:1, savedAt:new Date().toISOString(),
    letter:{fileName:state.fileName, hash:state.origHash, modified},
    source: opts.includeSource!==false && modified ? {...state.xml} : null,
    csv: state.csvHeaders.length ? {name:(state.csv&&state.csv.name)||'', headers:state.csvHeaders} : null,
    settings:state.settings, edits:state.edits,
    rowsInfo:Object.keys(state.edits).filter(id=>id.startsWith('o:')).map(id=>{ const r=state.rows.find(x=>x.id===id); return r?{id, find:r.find, ctx:(r.ctx||'').slice(-40)}:null; }).filter(Boolean),
    tables:state.tables.map(exportTable).filter(Boolean), tableEditsRaw:state.tableEdits,
    logic:state.logic.map(l=>({...l, anchor:anchorOf(l.pid), ...(l.place==='at'?atContext(l):{})})),
    unplaced:state.unplaced, tagOps:state.tagOps, previewOverrides: opts.local ? state.previewOverrides : {},
    typed: opts.includeSource!==false && modified ? [...state.typed] : [], switchOps:state.switchOps,
  };
}
export const setupHasWork=s=>!!(s && (Object.keys(s.edits||{}).length || (s.logic||[]).length || (s.tables||[]).length || (s.tagOps||[]).length || s.source));
export function atContext(l){ const p=state.an && state.an.byPid.get(l.pid); if (!p) return {}; const t=p.model.text, o=Math.min(l.offset||0, t.length); return {ctxB:t.slice(Math.max(0,o-40),o), ctxA:t.slice(o,o+40)}; }
export function findOffset(text, ctxB, ctxA){
  // where an inline tag belongs in a paragraph whose wording changed: after the words that came before it, or before the words that came after it
  const once=(k)=>{ const i=text.indexOf(k); return i>=0 && text.indexOf(k,i+1)<0 ? i : -1; };
  ctxB=ctxB||''; ctxA=ctxA||'';
  if (!ctxB.trim() && !ctxA.trim()) return null;
  for (let n=ctxB.length;n>=6;n--){ const k=ctxB.slice(-n); if (!k.trim()) continue; const i=once(k); if (i>=0) return i+n; }
  for (let n=ctxA.length;n>=6;n--){ const k=ctxA.slice(0,n); if (!k.trim()) continue; const i=once(k); if (i>=0) return i; }
  if (!ctxA) return text.length;
  if (!ctxB) return 0;
  return null;
}
export function commonSuffix(a,b){ let n=0; while (n<a.length && n<b.length && a[a.length-1-n]===b[b.length-1-n]) n++; return n; }
export function importSetup(obj, opts={}){
  if (!obj || obj.format!=='compup-letter-tagger-setup') throw new Error("That file isn't a Letter Tagger setup file.");
  if (!opts.noUndo) recordUndo();
  const same = !!(obj.letter && obj.letter.hash===state.origHash && (!obj.letter.modified || obj.source));
  if (obj.settings){ state.settings={...state.settings, ...obj.settings}; notify(); lsSet('lt.settings', state.settings); }
  state.tagOps=obj.tagOps||[]; if (obj.previewOverrides && Object.keys(obj.previewOverrides).length) state.previewOverrides=obj.previewOverrides;
  if (!state.csv && obj.csv && obj.csv.headers && obj.csv.headers.length) state.csv={mode:'keys', name:(obj.csv.name||'columns')+' (from setup)', keys:obj.csv.headers.slice()};
  const report={same, rows:0, tables:0, logic:0, unplaced:0, switches:0, switchLost:0};
  if (same){
    state.xml={...state.origXml}; state.typed=new Set(); if (obj.source){ for (const [p,x] of Object.entries(obj.source)) if (p in state.xml) state.xml[p]=x; state.typed=new Set(obj.typed||[]); }
    state.edits=obj.edits||{}; state.tableEdits=obj.tableEditsRaw||{};
    state.logic=(obj.logic||[]).map(({anchor, ...l})=>l); state.unplaced=obj.unplaced||[]; state.switchOps=obj.switchOps||[];
    analyze(); notify(); fullRefresh();
    report.rows=Object.keys(state.edits).length; report.tables=Object.keys(state.tableEdits).length; report.logic=state.logic.length; report.unplaced=state.unplaced.length;
    return report;
  }
  state.edits={}; state.tableEdits={}; state.logic=[]; state.unplaced=[]; state.typed=new Set(); state.switchOps=[];
  state.xml={...state.origXml};
  for (const [id,ed] of Object.entries(obj.edits||{})) if (id.startsWith('g:')){ state.edits[id]=ed; report.rows++; }
  analyze();
  // redo "text by value" paragraphs first: they add paragraphs the other choices may sit on
  const replayed=new Set();
  for (const op of obj.switchOps||[]){
    const pids=(op.anchors||[]).map(findAnchor);
    if (!pids.length || pids.some(x=>!x) || new Set(pids).size!==pids.length){ report.switchLost++; continue; }
    const res=switchParaEdit(pids, op.cfg, op.id, true);
    if (res.cancel){ report.switchLost++; continue; }
    state.switchOps.push(op); replayed.add(op.id); report.switches++;
  }
  for (const info of obj.rowsInfo||[]){
    const ed=(obj.edits||{})[info.id]; if (!ed) continue;
    let best=null, bs=-1; for (const r of state.rows){ if (r.scope!=='one' || r.find!==info.find) continue; const sc=commonSuffix(r.ctx||'', info.ctx||''); if (sc>bs){ bs=sc; best=r; } }
    if (best){ state.edits[best.id]=ed; report.rows++; }
  }
  for (const st of obj.tables||[]){ const t=state.tables.find(x=>sigMatch(tableSig(x), st.sig)); if (t){ importTable(t, st); report.tables++; } }
  for (const l of obj.logic||[]){
    if (l.sw){ if (replayed.has(l.sw)) report.logic++; continue; }
    if (l.mg){ report.merged=true; continue; }
    const pid=findAnchor(l.anchor);
    const {anchor, ctxB, ctxA, ...rest}=l;
    let ok=!!pid;
    if (ok && rest.place==='at'){
      const t=state.an.byPid.get(pid).model.text; const o=rest.offset||0;
      const exact=ctxB!=null && t.slice(Math.max(0,o-ctxB.length), o)===ctxB && t.slice(o, o+(ctxA||'').length)===(ctxA||'');
      const off=exact ? o : (ctxB==null && ctxA==null) ? (normAnchor(t).slice(0,300)===(anchor&&anchor.text) ? o : null) : findOffset(t, ctxB, ctxA);
      if (off==null) ok=false; else rest.offset=off;
    }
    if (ok){ state.logic.push({...rest, pid, id:'l'+Math.random().toString(36).slice(2,9)}); report.logic++; }
    else { state.unplaced.push({...rest, anchor, ctxB, ctxA, reason:"Couldn't find its place in this letter."}); report.unplaced++; }
  }
  analyze(); notify(); fullRefresh();
  return report;
}
let autosaveTimer=null;
export function scheduleAutosave(){ notify(); if (state.isSample || !state.origHash) return; clearTimeout(autosaveTimer); autosaveTimer=setTimeout(doAutosave, 1500); }
export function doAutosave(){
  try{
    let setup=exportSetup({includeSource:true, local:true}); let s=JSON.stringify(setup);
    if (s.length>2500000){ setup=exportSetup({includeSource:false, local:true}); s=JSON.stringify(setup); }
    if (!setupHasWork(setup)) return;
    localStorage.setItem('lt.auto.'+state.origHash, s);
    const idx=lsGet('lt.auto.index',[]).filter(x=>x.h!==state.origHash); idx.unshift({h:state.origHash, f:state.fileName, t:Date.now()});
    for (const old of idx.slice(10)){ try{ localStorage.removeItem('lt.auto.'+old.h); }catch(e){} }
    lsSet('lt.auto.index', idx.slice(0,10)); state.lastAutosave=Date.now(); notify(); }catch(e){ state.autosaveFailed=true; notify(); }
}
// the status line in the header: only ever says what this browser did
export function saveStatusText(){
  return state.isSample ? "Sample letter isn't saved"
    : state.autosaveFailed ? 'Not saved: browser storage is full or blocked'
    : state.lastAutosave ? 'Saved in this browser · '+fmtWhen(state.lastAutosave)
    : HISTORY.undo.length ? 'Saves in this browser as you work' : 'Not changed yet';
}
export function readAutosave(hash){ try{ const s=localStorage.getItem('lt.auto.'+hash); return s?JSON.parse(s):null; }catch(e){ return null; } }
export function fmtWhen(t){ const d=new Date(t); const now=Date.now(); const m=Math.round((now-t)/60000); if (m<1) return 'just now'; if (m<60) return `${m} min ago`; const h=Math.round(m/60); if (h<24) return `${h} h ago`; return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0,3)}, ${strftime(d,'%I:%M %p').replace(/^0/,'')}`; }
export function setupReportText(r){
  if (r.same) return `Restored your work on this letter: ${r.rows} text choice${r.rows===1?'':'s'}, ${r.tables} table${r.tables===1?'':'s'}, ${r.logic} logic tag${r.logic===1?'':'s'}.`;
  return `Applied to this version of the letter: ${r.rows} text choice${r.rows===1?'':'s'}, ${r.tables} table${r.tables===1?'':'s'}, ${r.logic} logic tag${r.logic===1?'':'s'} placed.${r.switches?` Recreated ${r.switches} text-by-value block${r.switches>1?'s':''}.`:''}${r.unplaced?` ${r.unplaced} logic tag${r.unplaced>1?'s':''} couldn't be matched; place ${r.unplaced>1?'them':'it'} from the Conditions step.`:''}${r.switchLost?` ${r.switchLost} text-by-value block${r.switchLost>1?'s':''} couldn't be recreated because ${r.switchLost>1?'their paragraphs have':'its paragraph has'} changed; add ${r.switchLost>1?'them':'it'} again.`:''}${r.merged?" Paragraphs added by combining two letters aren't carried over; combine them again if you need them.":''}`;
}
// write the browser autosave now (before the letter is replaced)
export function flushAutosave(){ clearTimeout(autosaveTimer); doAutosave(); }
