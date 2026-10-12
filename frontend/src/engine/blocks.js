// Moved from frontend_src/letter-tagger.html — see tests_ui/legacy for the reference page. No DOM rendering in this module.
import { computeChecks, squash } from './checks.js'
import { allCtx } from './conditions.js'
import { csvRows } from './data.js'
import { computeLogic, syncLogic } from './logic.js'
import { prepareTemplateXml } from './pipeline.js'
import { getEnv, loadEngine, rt } from './preview.js'
import { state } from './state.js'

/* ======================= employees per condition block ======================= */
// Fill the letter for every employee with a marker after each if / else if / else, and count
// who gets each marker: that is who sees the block, nesting and else-if chains included.
let blockTimer=null, blockSeq=0;
export function dataKey(){ return [state.csv&&state.csv.name, csvRows().length, state.dataFilter?state.dataFilter.col+'='+state.dataFilter.value:'', (state.csvExtra||[]).map(f=>f.name).join(','), JSON.stringify(state.settings)].join('|'); }
export function blockKeyNow(){ return state.built ? state.built.sig+'|'+dataKey() : ''; }
export function blockCountsNow(){ const b=state.blockCounts; return b && b.key===blockKeyNow() ? b : null; }
export function scheduleBlockCounts(){ clearTimeout(blockTimer); if (!csvRows().length || !state.built){ return; } if (blockCountsNow()) return; blockTimer=setTimeout(computeBlockCounts, 500); }
export async function computeBlockCounts(){
  if (!csvRows().length || !state.built) return;
  const key=blockKeyNow(); if (state.blockCounts && state.blockCounts.key===key) return;
  const seq=++blockSeq;
  let nj; try{ nj=await loadEngine(); }catch(e){ return; }
  getEnv(nj);
  const marks=[], parts=[];
  for (const part of state.parts){
    let src=prepareTemplateXml(state.built.xml[part.path], {tags:[]});
    src=src.replace(/\{%-?\s*(if|elif|else)\b[\s\S]*?%\}/g, m=>{ const k=marks.length; marks.push({tag:m, path:part.path}); return m+''+k+''; });
    try{ parts.push(new nj.Template(src, rt.ENV, part.path, true)); }catch(e){ return; }
  }
  const ctxs=allCtx(); const seen=marks.map(()=>0); const prev=rt.issues; rt.issues=null; let failed=0;  // employees the letter can't be filled for are left out of the counts
  try{
    for (let i=0;i<ctxs.length;i++){
      const hit=new Set(); let bad=false;
      for (const t of parts){ let out; try{ out=t.render(ctxs[i]); }catch(e){ bad=true; break; } for (const m of out.matchAll(/(\d+)/g)) hit.add(+m[1]); }
      if (bad){ failed++; continue; }
      for (const k of hit) seen[k]++;
      if (i%25===24){ await new Promise(r=>setTimeout(r,0)); if (seq!==blockSeq) return; }
    }
  } finally { rt.issues=prev; }
  if (seq!==blockSeq || key!==blockKeyNow()) return;
  // marks → Logic list entries, matched by tag text and order
  computeLogic(); const byKey=new Map(); const idx=new Map(), used=new Map();
  marks.forEach((m,k)=>{ const q=squash(m.tag)+'|'+m.path; if (!idx.has(q)) idx.set(q,[]); idx.get(q).push(k); });
  for (const e of state.lg){ if (!['if','elif','else'].includes(e.kw)) continue; const q=squash(e.text)+'|'+e.path; const n=used.get(q)||0; used.set(q,n+1); const k=(idx.get(q)||[])[n]; if (k!=null) byKey.set(e.key, seen[k]); }
  state.blockCounts={key, total:ctxs.length-failed, failed, byKey: ctxs.length-failed>0 ? byKey : new Map()};
  syncLogic(); computeChecks();
}
