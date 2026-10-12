// Moved from frontend_src/letter-tagger.html — see tests_ui/legacy for the reference page. No DOM rendering in this module.
import { JINJA_FILTERS, KEYWORDS, lev, squash, tagSyntaxProblem } from './checks.js'
import { RX_TAG, analyze } from './detect.js'
import { escRe } from './edits.js'
import { emit, notify, toast } from './events.js'
import { straighten } from './helpers.js'
import { fullRefresh } from './load.js'
import { computeLogic, showPid } from './logic.js'
import { edit } from './rows.js'
import { state } from './state.js'
import { setView } from './steps.js'
import { tEditCell } from './tables.js'
import { HISTORY, recordUndo } from './undo.js'

/* ======================= one-click fixes for tags ======================= */
// Rewrite tags everywhere they live: tags already in the letter (through tag ops), tags the
// tool added (logic tags, typed overrides in rows and table cells). fn gets one straightened tag
// and returns it changed, or unchanged.
export function fixTags(fn, msg){
  recordUndo(); let n=0;
  const each=text=>String(text).replace(RX_TAG, t=>{ const t0=straighten(t); const t1=fn(t0); if (t1 && t1!==t0){ n++; return t1; } return t; });
  for (const l of state.logic){ const nt=each(l.text); if (nt!==l.text) l.text=nt; }
  for (const r of state.rows) if (r.override!=null){ const nt=each(r.override); if (nt!==r.override) edit(r.id,{override:nt}); }
  for (const t of state.tables) for (const row of t.rows) for (const ci of row.empties){ const c=row.cells[ci]; if (c && c.override){ const nt=each(c.override); if (nt!==c.override) tEditCell(t,row,ci,{override:nt}); } }
  const seen=new Set();
  for (const p of state.an.paras) for (const m of (p.model.text||'').matchAll(RX_TAG)){
    const t0=straighten(m[0]); if (seen.has(t0)) continue; seen.add(t0);
    const t1=fn(t0); if (t1 && t1!==t0){ state.tagOps.push({id:'o'+Math.random().toString(36).slice(2,9), type:'map', from:t0, to:t1}); n++; }
  }
  if (!n){ HISTORY.undo.pop(); notify(); toast('Nothing to change.'); return 0; }
  analyze(); fullRefresh(); notify(); toast(typeof msg==='function'?msg(n):msg);
  return n;
}
// apply fn to the code parts of a tag, leaving quoted text alone
export function onCode(tag, fn){ return tag.replace(/('(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*")|([^'"]+)/g, (m,lit,code)=>lit?lit:fn(code)); }
export function fixSingleEq(tag){
  if (!/^\{%-?\s*(?:p\s+|tr\s+|tc\s+|r\s+)?(if|elif)\b/.test(tag)) return tag;
  return onCode(tag, c=>c.replace(/(^|[^=!<>%{])=(?!=)/g, '$1=='));
}
export function closestFilter(name){
  let best='', d=9; for (const f of JINJA_FILTERS){ if (f.length<3) continue; const k=lev(name.toLowerCase(), f); if (k<d){ d=k; best=f; } }
  return d<=2 ? best : '';
}
export function replaceFilter(tag, bad, good){ return onCode(tag, c=>c.replace(new RegExp(`(\\|\\s*)${escRe(bad)}(?![\\w])`,'g'), `$1${good}`)); }
// "field | float" → "field | default(0) | float": a missing value then counts as 0 instead of stopping the letter
export function addDefaultTo(tag, id){ return onCode(tag, c=>c.replace(new RegExp(`(^|[^\\w.])(${escRe(id)})(\\s*\\|\\s*)(float|int)\\b`,'g'), (m,pre,name,bar,f)=>`${pre}${name} | default(0)${bar}${f}`)); }
export function floatUsesWithoutDefault(expr){ const out=new Set(); onCode(expr, c=>{ for (const m of c.matchAll(/(?<![\w.|]\s*)([A-Za-z_][\w.]*)\s*\|\s*(float|int)\b/g)) out.add(m[1]); return c; }); return [...out].filter(id=>!KEYWORDS.has(id)); }
// the fix button for a typing mistake, if there is a safe one
export function tagSyntaxFix(tag){
  if (!tag) return null;
  const why=tagSyntaxProblem(tag);
  if (/Use == to compare/.test(why)){ const nt=fixSingleEq(tag); if (nt!==tag) return {label:'Change = to ==', fn:()=>fixTags(t=>squash(t)===squash(tag)?fixSingleEq(t):t, 'Changed = to ==.')}; }
  const m=why.match(/^“\| (\w+)” isn't a filter/);
  if (m){ const good=closestFilter(m[1]); if (good) return {label:`Use | ${good}`, fn:()=>fixTags(t=>replaceFilter(t, m[1], good), n=>`Changed | ${m[1]} to | ${good} in ${n} tag${n>1?'s':''}.`)}; }
  return null;
}

export function closingFixFor(tag){
  computeLogic(); const open=(state.lg||[]).filter(e=>e.status==='open');
  const e = tag ? open.find(x=>squash(x.text)===squash(tag)) : open[0];
  return e ? {label:'Choose where it ends', fn:()=>startClosing(e.key)} : null;
}
export function startClosing(key){
  const e=state.lg && state.lg.find(x=>x.key===key); if (!e){ toast('Open the Conditions step to see the open block.'); return; }
  state.closing=key; state.sel={pids:[],anchor:null,text:''}; state.condEdit=null;
  if (state.view!=='source') setView('source');
  notify(); showPid(e.pid); emit('reveal', {panel:'selTools'});
}
