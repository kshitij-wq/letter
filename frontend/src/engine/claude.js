// Moved from frontend_src/letter-tagger.html — see tests_ui/legacy for the reference page. No DOM rendering in this module.
import { blockCountsNow } from './blocks.js'
import { isMoney } from './catalog.js'
import { squash } from './checks.js'
import { cbExpr, cbNew, cbNum } from './conditions.js'
import { csvRows, fileHeaders } from './data.js'
import { analyze } from './detect.js'
import { MERGE_MISMATCH } from './docx.js'
import { notify, on, toast } from './events.js'
import { W, ancestor, isW, snake, straighten } from './helpers.js'
import { fullRefresh } from './load.js'
import { pageLabel } from './logic.js'
import { csrfToken } from './platform.js'
import { buildTag, finalTag, userSet } from './rows.js'
import { server } from './server.js'
import { state } from './state.js'
import { tagKeyOf } from './tables.js'
import { recordUndo } from './undo.js'

/* ======================= Claude (your API key, on the Letter Studio server) ======================= */
// The key stays on the server; the page sends the letter's text, tag names, column names and the
// values of columns with only a few categories. Employee rows are never sent.
export function aiReady(){ return !!(server.ok && server.info && server.info.assistant && server.info.assistant.ready); }
export async function postAssist(task, payload, opts){
  const r=await fetch('api/assist', {method:'POST', body:JSON.stringify({task, payload}), headers:{'Content-Type':'application/json', 'X-CSRFToken':csrfToken()}, credentials:'same-origin', ...(opts&&opts.signal?{signal:opts.signal}:{})});
  let j={}; try{ j=await r.json(); }catch(e){ j={error:`The server answered ${r.status}.`}; }
  if (!r.ok) throw new Error(j.error||`The server answered ${r.status}.`);
  return j;
}
export const PERSONAL_RX=/name|email|e-mail|mobile|phone|address|pan|aadha|account|ifsc|uan|dob|birth|head/i;
export const DATE_RX=/^(\d{1,2}[-\/ ][A-Za-z]{3,9}[-\/ ]\d{2,4}|\d{4}-\d{2}-\d{2}|\d{1,2}[-\/.]\d{1,2}[-\/.]\d{2,4})$/;
export function columnsForClaude(){
  const place=state.settings.csvPlace||'both';
  const tagFor=h=>String(h).includes('.') ? String(h) : place==='top' ? tagKeyOf(h) : 'custom_schema.'+snake(h);
  const out=[]; const rows=csvRows();
  const add=(f, rowsOf)=>{
    for (const [i,h] of fileHeaders(f).entries()){
      if (!String(h||'').trim()) continue;
      const col={name:String(h), tag:tagFor(h)};
      const vals=rowsOf ? rowsOf.map(r=>String(r[i]??'').trim()).filter(Boolean) : [];
      if (rowsOf){
        const d=new Map(); for (const v of vals) d.set(v,(d.get(v)||0)+1);
        const num=vals.length && vals.filter(v=>cbNum(v)!=null).length>=vals.length*0.9;
        const date=!num && vals.length && vals.filter(v=>DATE_RX.test(v)).length>=vals.length*0.9;
        col.type=num?'number':date?'date':'text'; col.filled=`${vals.length} of ${rowsOf.length}`; col.distinct=d.size;
        if (num && vals.every(v=>cbNum(v)===0)) col.note='always 0';
        if (date) col.examples=[...d.keys()].slice(0,2);
        else if (!num && d.size<=30 && !PERSONAL_RX.test(h)) col.examples=[...d.entries()].sort((a,b)=>b[1]-a[1]).slice(0,15).map(([v,n])=>`${v} (${n})`);
      }
      out.push(col);
    }
  };
  if (state.csv && state.csv.mode==='sample') add(state.csv, state.csv.params ? null : rows);
  else if (state.csv) add(state.csv, null);
  for (const f of state.csvExtra||[]){ if (f.mode==='sample') add(f, f.params||f.rows.length<2 ? null : f.rows); }
  return out.slice(0,400);
}
export function tableSpot(p){
  const tc=ancestor(p.el,['tc']); if (!tc) return null; const tr=tc.parentNode, tbl=tr && tr.parentNode; if (!tbl) return null;
  const txt=el=>[...el.getElementsByTagNameNS(W,'t')].map(t=>t.textContent).join('').replace(/\s+/g,' ').trim();
  const cells=t=>[...t.childNodes].filter(n=>isW(n,'tc'));
  const tcs=cells(tr); const ci=tcs.indexOf(tc);
  const trs=[...tbl.childNodes].filter(n=>isW(n,'tr'));
  let column=''; for (const t of trs){ if (t===tr) break; const c=cells(t)[ci]; const s2=c?txt(c):''; if (s2){ column=s2; break; } }
  return {row: tcs[0] && tcs[0]!==tc ? txt(tcs[0]).slice(0,80) : '', column: column.slice(0,80)};
}
export function placeholdersForClaude(){
  const out=[];
  for (const r of state.rows){
    if (!r.enabled || !r.count || userSet(r)) continue;
    const spots=[];
    for (const p of state.an.paras){
      if (p.fallback) continue; const t=p.model.text||''; const at=t.indexOf(r.find); if (at<0) continue;
      const sp={page:pageLabel(p), text:(t.slice(Math.max(0,at-110), at)+'⟦'+r.find+'⟧'+t.slice(at+r.find.length, at+r.find.length+70)).replace(/\s+/g,' ').trim()};
      const ts=tableSpot(p); if (ts) sp.table=ts;
      spots.push(sp); if (spots.length>=2) break;
    }
    const code=MERGE_MISMATCH.get(r.find);
    out.push({id:r.id, text:r.find, kind:r.kind, occurrences:r.count, places:spots, tool_guess:finalTag(r)||'', ...(code?{merge_field_code:code}:{})});
  }
  return out.slice(0,150);
}
export function letterForClaude(max=80000){
  const an=state.built?state.built.an:state.an; if (!an) return '';
  let s='';
  for (const p of an.paras){ if (p.fallback) continue; const t=(p.model.text||'').replace(/\s+/g,' ').trim(); if (!t) continue; const ts=tableSpot(p); s+=`${pageLabel(p)||''}${p.kind!=='body'?' ('+p.kind+')':''}${ts?' [table'+(ts.row?' row “'+ts.row+'”':'')+(ts.column?' column “'+ts.column+'”':'')+']':''}: ${t}\n`; if (s.length>max) break; }
  return s.slice(0,max);
}
export function findingsForClaude(){ return (state.built?state.built.checks:[]).filter(x=>x.level!=='info').map(x=>`${x.level}: ${x.html.replace(/<[^>]+>/g,'').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').slice(0,300)}`).slice(0,40); }
export function blocksForClaude(){ const b=blockCountsNow(); if (!state.lg) return []; return state.lg.filter(e=>e.kw==='if'||e.kw==='elif').slice(0,60).map(e=>({tag:e.text.slice(0,200), page:pageLabel(e.p), employees: b && b.byKey.has(e.key) ? `${b.byKey.get(e.key)} of ${b.total}` : 'unknown'})); }
export function aiBusy(on, what){ state.aiBusy=on?what:''; notify(); }
export async function aiSuggestTags(){
  const places=placeholdersForClaude();
  if (!places.length){ toast('Every piece of text already has a tag you chose. Nothing to ask.'); return; }
  aiBusy(true,'tags');
  try{
    const j=await postAssist('suggest_tags', {letter_name:state.fileName, tag_style: (state.settings.csvPlace||'both')==='top' ? 'columns are written with their plain name, e.g. {{ basic1 }}' : 'columns from the data file are written as custom_schema.<column>, e.g. {{ custom_schema.basic1 }}', columns:columnsForClaude(), placeholders:places});
    const conf={high:0.92, medium:0.75, low:0.5}; let n=0;
    state.claudeSugs=state.claudeSugs||{};
    for (const sg of j.suggestions||[]){
      const r=state.rows.find(x=>x.id===sg.id); if (!r) continue;
      const field=String(sg.field||'').trim(); const tag=straighten(String(sg.tag||'').trim());
      if (!field && !tag) continue;
      const built=field ? buildTag(field, isMoney(field)?state.settings.money:'none') : '';
      state.claudeSugs[r.id]={key:field, override: tag && squash(tag)!==squash(built) ? tag : null, conf:conf[sg.confidence]??0.5, reason:String(sg.reason||'').slice(0,240)};
      n++;
    }
    state.ai={...(state.ai||{}), tagNotes:j.notes||[], tagUsage:j._usage};
    recordUndo(); analyze(); fullRefresh();
    toast(n ? `Claude suggested ${n} tag${n>1?'s':''}. Check the ones marked “To check”.` : 'Claude had no suggestions.');
  }catch(e){ state.ai={...(state.ai||{}), tagErr:e.message}; toast(e.message); }
  finally{ aiBusy(false); }
}
export async function aiReview(){
  aiBusy(true,'review');
  try{
    const rows=csvRows();
    const j=await postAssist('review', {letter_name:state.fileName, letter:letterForClaude(), findings:findingsForClaude(), blocks:blocksForClaude(), columns:columnsForClaude(), employees: rows.length ? `${rows.length}${state.dataFilter?` (only ${state.dataFilter.col} = ${state.dataFilter.value})`:''}` : 'no data file loaded'});
    state.ai={...(state.ai||{}), review:j, reviewErr:null};
  }catch(e){ state.ai={...(state.ai||{}), reviewErr:e.message}; }
  finally{ aiBusy(false); }
}

// the builder: describe the condition in words

// the question box and the builder's "describe it" box are UI inputs: their text comes in as an argument
export async function aiAsk(q){
  q=String(q||''); if (!q.trim()){ toast('Type a question first.'); return; }
  state.ai={...(state.ai||{}), q};
  aiBusy(true,'ask');
  try{ const j=await postAssist('ask', {question:q, letter_name:state.fileName, letter:letterForClaude(), columns:columnsForClaude()}); state.ai={...(state.ai||{}), answer:{q, answer:j.answer, tags:j.tags||[]}, askErr:null}; }
  catch(e){ state.ai={...(state.ai||{}), askErr:e.message}; }
  finally{ aiBusy(false); }
}
// the builder: describe the condition in words. Resolves true when the builder was filled in.
export async function aiCondition(ask){
  ask=String(ask||'').trim();
  if (!ask){ toast('Describe who should see this, e.g. “promoted employees whose PLI changed”.'); return false; }
  const ctx=(state.sel.pids||[]).map(pid=>state.an.byPid.get(pid)).filter(Boolean).map(p=>p.model.text).join(' ').slice(0,1200) || (state.sel.text||'') || (state.condEdit?state.condEdit.tag:'');
  state.cbAsk=ask; state.cbBusy=true; notify();
  try{
    const j=await postAssist('condition', {request:ask, context:ctx, current:cbExpr(state.cb), columns:columnsForClaude()});
    state.cb=cbNew(j.condition||''); state.cbNote=`Claude: ${j.explanation||''}${(j.assumptions||[]).length?' Assumed: '+j.assumptions.join('; '):''}`;
    return true;
  }catch(e){ toast(e.message); return false; }
  finally{ state.cbBusy=false; notify(); }
}
