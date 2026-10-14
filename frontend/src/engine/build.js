// Moved from frontend_src/letter-tagger.html — see tests_ui/legacy for the reference page. No DOM rendering in this module.
import { scheduleBlockCounts } from './blocks.js'
import { computeChecks, runChecks } from './checks.js'
import { RX_TAG } from './detect.js'
import { buildModel, insertAt, paraModel, parseAll, replaceRange, spanCount } from './docx.js'
import { notify } from './events.js'
import { W, ancestor, childW, isW, serialize, straighten, straightenTags } from './helpers.js'
import { applyLogic, syncLogic } from './logic.js'
import { escapeLiterals, schedulePreview } from './pipeline.js'
import { computeMatches, finalTag } from './rows.js'
import { realCheckTarget, scheduleRealCheck, server } from './server.js'
import { hashStr } from './setup.js'
import { state } from './state.js'
import { appendTagRun, cellAt, fillCell, lastCellPara, rowCondExpr, tCellTag, tableGrid, topTables } from './tables.js'

/* ======================= build + checks ======================= */
export function build(){
  if (!state.an) return;
  const {docs} = parseAll();
  const an = buildModel(docs);
  const active = state.rows.filter(r=>r.enabled && finalTag(r));
  const matches = computeMatches(an, active);
  const touched=new Set(); let replaced=0;
  const inserts=new Map(); state.logic.forEach((l,i)=>{ if (l.place!=='at') return; if (!inserts.has(l.pid)) inserts.set(l.pid,[]); inserts.get(l.pid).push({s:l.offset||0, text:straightenTags(String(l.text)), i}); });
  for (const pid of new Set([...matches.keys(), ...inserts.keys()])){
    const p=an.byPid.get(pid); if (!p) continue;
    const reps=(matches.get(pid)||[]).map(m=>({s:m.s, e:m.e, row:m.row, t:0}));
    const ins=(inserts.get(pid)||[]).map(x=>{ const r=reps.find(q=>x.s>q.s && x.s<q.e); return {s:r?r.e:x.s, e:r?r.e:x.s, text:x.text, t:1, i:x.i}; });
    for (const op of [...reps, ...ins].sort((a,b)=>b.s-a.s || a.t-b.t || (b.i||0)-(a.i||0))){
      if (op.t===0){ if (replaceRange(p.model, op.s, op.e, finalTag(op.row), touched)) replaced++; }
      else insertAt(p.model, op.s, op.text);
    }
  }
  if (state.settings.removeHl){
    for (const t of touched){ const r=ancestor(t,['r']); const rPr=r&&childW(r,'rPr'); const h=rPr&&childW(rPr,'highlight'); if (h) rPr.removeChild(h); }
  }
  // salary tables
  let filled=0;
  const tbls=topTables(docs[state.mainPath]);
  for (const t of state.tables){
    if (!t.enabled || !tbls[t.ti]) continue;
    const g=tableGrid(tbls[t.ti], an);
    for (const row of t.rows) for (const col of t.cols){
      const tag=tCellTag(t,row,col); if (!tag) continue;
      const c=cellAt(g[row.ri], col.ci); if (!c || c.text) continue;
      fillCell(docs[state.mainPath], c.tc, tag); filled++;
    }
  }
  let hiddenRows=0;
  for (const t of state.tables){
    if (!t.enabled || !t.hide.on || !tbls[t.ti]) continue;
    const trs=[...tbls[t.ti].childNodes].filter(n=>isW(n,'tr'));
    for (const row of t.rows){
      if (!row.hide) continue; const expr=rowCondExpr(t,row); if (!expr) continue;
      const pa=trs[row.ri-1] && lastCellPara(trs[row.ri-1]), pb=trs[row.ri] && lastCellPara(trs[row.ri]);
      if (!pa || !pb) continue;
      appendTagRun(docs[state.mainPath], pa, `{% if ${expr} %}`); appendTagRun(docs[state.mainPath], pb, '{% endif %}'); hiddenRows++;
    }
  }
  // logic tags placed by the user
  const condErr=[]; applyLogic(docs, an);
  // repair pass on every paragraph: merge split tags, straighten quotes
  let merged=0, fixedQ=0, ampFixed=0;
  for (const part of state.parts){
    let inRaw=false;
    for (const p of [...docs[part.path].getElementsByTagNameNS(W,'p')]){
      const model=paraModel(p); const t=model.text; if (!/\{[{%#]/.test(t)) continue;
      const ms=[...t.matchAll(RX_TAG)].map(m=>{ const kw=(m[0].match(/^\{%-?\s*(\w+)/)||[])[1]; const raw=inRaw && kw!=='endraw'; if (kw==='raw') inRaw=true; if (kw==='endraw') inRaw=false; return {m, raw}; });
      for (const {m, raw} of ms.reverse()){
        const s=m.index, e=s+m[0].length; const st=straighten(m[0]); const fixed=raw||m[0].startsWith('{#') ? st : escapeLiterals(st); const sc=spanCount(model,s,e);
        if (sc>1 || fixed!==m[0]){ replaceRange(model,s,e,fixed,null); if (sc>1) merged++; if (st!==m[0]) fixedQ++; if (fixed!==st) ampFixed++; }
      }
    }
  }
  if (state.an.fields) { /* mail merge settings removed on download */ }
  const out = buildModel(docs);
  const checks = runChecks(out, {replaced, merged, fixedQ, ampFixed, joined:state.an.joined, fields:state.an.fields, condErr, filled, hiddenRows});
  const xml={}; for (const part of state.parts) xml[part.path]=serialize(docs[part.path]);
  state.built={an:out, xml, checks, replaced, sig:hashStr(state.parts.map(p=>xml[p.path]).join('\u0001'))};
  scheduleBlockCounts();
  if (server.ok && realCheckTarget()==='built') scheduleRealCheck();
  computeChecks();
  if (state.view==='tagged') syncLogic();
  if (state.batch && !state.batch.running && state.batch.src && !state.batch.stale && state.parts.some(p=>state.batch.src[p.path]!==xml[p.path])){ state.batch.stale=true; if (state.tab==='check') notify(); }
  if (state.view==='filled') schedulePreview();
  notify();
}
