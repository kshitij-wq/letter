// Moved from frontend_src/letter-tagger.html — see tests_ui/legacy for the reference page. No DOM rendering in this module.
import { computeChecks, identifiersIn, locateTags } from './checks.js'
import { RX_TAG } from './detect.js'
import { buildBlob } from './downloads.js'
import { notify } from './events.js'
import { csrfToken } from './platform.js'
import { state } from './state.js'
import { HISTORY } from './undo.js'

// Letter Studio back end (real Jinja check); stays off on claude.ai
export const server={ok:false, probed:false, info:null, check:null, checking:false, err:null, seq:0};
export async function probeServer(){
  if (window.claude){ server.probed=true; return; }
  try{ const r=await fetch('api/health', {headers:{'Accept':'application/json'}}); if (!r.ok) throw 0; const j=await r.json(); if (j.app!=='Letter Studio' || !j.validate) throw 0; server.info=j; server.ok=true; }catch(e){ server.probed=true; computeChecks(); return; }
  server.probed=true;
  scheduleRealCheck(); notify(); }
// What to check: the file as uploaded, or (once you've changed something) the template you'd download.
export function realCheckTarget(){ return HISTORY.undo.length ? 'built' : 'file'; }
export async function postValidate(blob, employees){
  const fd=new FormData(); fd.append('template', blob, state.fileName||'letter.docx');
  if (employees) fd.append('employees', JSON.stringify(employees));
  const r=await fetch('api/validate', {method:'POST', body:fd, headers:{'X-CSRFToken':csrfToken()}, credentials:'same-origin'});
  let j={}; try{ j=await r.json(); }catch(e){ j={error:`The server answered ${r.status}.`}; }
  if (!r.ok) throw Object.assign(new Error(j.error||`The server answered ${r.status}.`), {detail:j});
  return j;
}
let realTimer;
export function scheduleRealCheck(){ if (!server.ok) return; clearTimeout(realTimer); realTimer=setTimeout(realCheck, 700); }
export async function realCheck(){
  if (!server.ok || !state.srcBuf) return;
  const seq=++server.seq; server.checking=true; computeChecks();
  try{
    const target=realCheckTarget();
    const blob = target==='built' ? await buildBlob() : new Blob([state.srcBuf]);
    const j=await postValidate(blob);
    if (seq!==server.seq) return;
    server.check={...j, target}; server.err=null;
  }catch(e){ if (seq!==server.seq) return; server.check=null; server.err=e.message||String(e); }
  finally{ if (seq===server.seq){ server.checking=false; computeChecks(); } }
}
// a real-Jinja problem → paragraphs in the letter (by its tag or text; by position when it's the file as uploaded)
export function realLocs(x, target){
  let pids=locateTags(x.tag?[x.tag]:x.line_text?[{para:x.line_text}]:[]);
  if (!pids.length && x.line_text) pids=locateTags([x.line_text.slice(0,60)]);
  if (!pids.length && x.name) pids=locateTags(templateTagsWith(x.name));
  if (!pids.length && target==='file' && x.para_index!=null){ const pid=x.part+'#'+x.para_index; if (state.an.byPid.has(pid)) pids=[pid]; }
  return pids;
}
export function templateTagsWith(name){ const out=[]; if (!state.an) return out; for (const p of state.an.paras) for (const m of (p.model.text||'').matchAll(RX_TAG)) if (identifiersIn(m[0].replace(/^\{[{%]-?|-?[}%]\}$/g,'')).includes(name)) out.push(m[0]); return out.slice(0,20); }
