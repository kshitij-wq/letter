// Moved from frontend_src/letter-tagger.html — see tests_ui/legacy for the reference page. No DOM rendering in this module.
import { build } from './build.js'
import { csvRows } from './data.js'
import { saveEditor } from './editor.js'
import { plural } from './helpers.js'
import { emit, notify, on, toast } from './events.js'
import { PV_MAX, previewPicker, refreshPreview, templateIdentifiers } from './pipeline.js'
import { rowStatus } from './rows.js'
import { server } from './server.js'
import { state } from './state.js'
import { tableCellsTodo, tableCounts } from './tables.js'

/* ======================= steps ======================= */
export const STEPS=['doc','tags','logic','check','export'];
// A step is only marked done from what the page can see, never from clicks or navigation.
// what the step badges and the export checklist both read: Validate's counts and the condition problems
export function readiness(){
  const lg=state.lg||[];
  const bad=lg.filter(e=>e.status==='open'||e.status==='stray'||(e.status==='cells'&&(e.kw||'').startsWith('end'))).length+(state.unplaced||[]).length;
  let errs, warns;
  if (state.checkCounts){ errs=state.checkCounts.e; warns=state.checkCounts.w; }
  else { const ch=state.built?state.built.checks:[]; errs=ch.filter(x=>x.level==='error').length; warns=ch.filter(x=>x.level==='warn').length; }
  return {lg, bad, errs, warns};
}
// the readiness checklist in Preview & export: every line comes from the page's current state
export function exportFacts(){
  const live=state.rows.filter(r=>r.count && rowStatus(r)!=='off');
  let cellsAll=0, cellsDone=0; for (const t of state.tables){ if (!t.enabled) continue; const c=tableCounts(t); cellsAll+=c.all; cellsDone+=c.done; }
  const needTag=live.filter(r=>rowStatus(r)==='need').length + (cellsAll-cellsDone);
  const toCheck=live.filter(r=>rowStatus(r)==='check').length;
  const total=live.length+cellsAll;
  const lg=state.lg||[];
  const ifs=lg.filter(e=>e.kw==='if').length;
  const openN=lg.filter(e=>e.status==='open').length;
  const {bad, errs, warns}=readiness();
  return {total, needTag, toCheck, ifs, openN, bad, errs, warns};
}
// Steps: Document → Tags & fields → Conditions → Validate → Preview & export.
// The current step is kept in engine state because the preview and the checks look at it; the UI layer can mirror it.
export function setTab(t, opts){
  if (!STEPS.includes(t)) t='doc';
  const changed=state.tab!==t;
  state.tab=t;
  if (t!=='doc' && state.view==='edit') setView('source');   // the other steps work on the letter itself, not the editor
  notify();
  emit('tab', {tab:t, changed, open:!!(opts && opts.open)});
}

// what the step badges and the export checklist read: counts and "done" per step, from what the page can see
// (never from clicks or navigation). Same rules as the old updateTabBadges().
// what the Tags & fields badge counts, in two parts the panel shows as well: placeholders that need a tag or a check, and empty table cells
export function tagsTodo(){
  const rows=state.rows.filter(r=>r.count && ['need','check'].includes(rowStatus(r))).length;
  const t=tableCellsTodo();
  return {rows, cells:t.todo, tables:t.tables, total:rows+t.todo};
}
export function stepInfo(){
  const inDoc=state.rows.filter(r=>r.count);
  const need=tagsTodo().total;
  const taggedAny=inDoc.some(r=>rowStatus(r)==='tagged') || state.tables.some(t=>t.enabled && tableCounts(t).done>0);
  const {lg, bad, errs, warns}=readiness();
  const hasCond=lg.some(e=>e.kw==='if');
  // an error from Validate that points at a condition (an if / elif / for tag) keeps Conditions from showing done
  const logicErr=(state.issues||[]).some(x=>x.level==='error' && (x.cat==='conditions' || (x.cat==='syntax' && (x.tags||[]).some(t=>typeof t==='string' && /^\s*\{%/.test(t)))));
  const realOk = !server.ok || !!(server.check && !server.check.syntax.length);
  const done={
    doc: !!(state.an && !state.isSample),
    tags: !need && taggedAny,
    logic: hasCond && !bad && !logicErr,
    check: !!state.an && !errs && !warns && realOk && !server.checking,
    export: false,
  };
  const info={
    doc:{n:'', label:'Document'+(done.doc?', done':''), title: state.isSample ? 'Sample letter loaded' : done.doc ? 'Your letter is loaded' : 'No letter loaded'},
    tags:{n:need||'', label:'Tags & fields'+(need?`, ${need} to do`:done.tags?', done':''), title: need ? `${plural(need,'tag')} still to do` : done.tags ? 'Every placeholder has a tag' : 'Nothing tagged yet'},
    logic:{n:bad||'', err:!!bad, label:'Conditions'+(bad?`, ${plural(bad,'problem')}`:logicErr?', Validate found a problem':done.logic?', done':hasCond?'':', optional'), title: bad ? `${plural(bad,'condition problem')}` : logicErr ? 'Validate found a problem in a condition' : done.logic ? 'Conditions are closed' : 'Optional'},
    check:{n:errs||warns||'', err:!!errs, label:'Validate'+(errs?`, ${plural(errs,'error')}`:warns?`, ${plural(warns,'warning')}`:server.checking?', checking':done.check?', done':''), title: errs ? `${plural(errs,'error')} to fix` : warns ? `${plural(warns,'warning')} to check` : done.check ? 'No problems found' : server.checking ? 'Checking with real Jinja…' : server.ok && !(server.check) ? 'Real Jinja check has not finished' : 'Not checked yet'},
    export:{n:'', label:'Preview & export', title:''},
  };
  return {done, info};
}

// the readiness checklist in Preview & export: every line comes from the page's current state.
// Returns {items:[{kind:'ok'|'warn'|'err'|'idle', label, text, sub, step, stepLabel}], warn:'' }
export function exportChecklist(){
  if (!state.an) return {items:[], warn:''};
  const F=exportFacts(); const pl=(n,w)=>`${n} ${w}${n===1?'':'s'}`;
  const items=[];
  // each line starts with a short label so it reads on its own: "Validate — no errors · 1 warning"
  const add=(kind, label, text, sub, step, stepLabel)=>items.push({kind, label, text, sub:sub||'', step:step||'', stepLabel:stepLabel||''});
  // placeholders
  if (!F.total) add('idle', 'Placeholders', 'none found in this letter', '', 'tags', 'Tags & fields');
  else if (!F.needTag && !F.toCheck) add('ok', 'Placeholders', `all ${F.total} mapped`, '', 'tags', 'Tags & fields');
  else add('warn', 'Placeholders', [F.needTag?`${F.needTag} still need${F.needTag===1?'s':''} a tag`:'', F.toCheck?`${F.toCheck} to check`:''].filter(Boolean).join(' · '), `${F.total-F.needTag-F.toCheck} of ${F.total} mapped`, 'tags', 'Tags & fields');
  // conditions
  if (F.bad) add('err', 'Conditions', [F.openN?`${F.openN} not closed`:'', F.bad-F.openN?`${F.bad-F.openN} to fix`:''].filter(Boolean).join(' · '), '', 'logic', 'Conditions');
  else if (F.ifs) add('ok', 'Conditions', `${pl(F.ifs,'condition')}, all closed`, '', 'logic', 'Conditions');
  else add('idle', 'Conditions', 'none (optional)', '', 'logic', 'Conditions');
  // validate: this page's own checks, then the real Jinja check
  if (!state.built) add('idle', 'Validate', 'not checked yet', '', 'check', 'Validate');
  else if (F.errs) add('err', 'Validate', pl(F.errs,'error')+(F.warns?' · '+pl(F.warns,'warning'):''), '', 'check', 'Validate');
  else if (F.warns) add('warn', 'Validate', 'no errors · '+pl(F.warns,'warning'), '', 'check', 'Validate');
  else add('ok', 'Validate', 'no errors', '', 'check', 'Validate');
  const sc=server.check;
  if (!server.ok) add('idle', 'Real Jinja check', 'not available here', 'It runs when this page is opened from Letter Studio.');
  else if (server.err) add('warn', 'Real Jinja check', "didn't run", server.err, 'check', 'Validate');
  else if (!sc || server.checking) add('idle', 'Real Jinja check', 'running…');
  else if (sc.syntax.length) add('err', 'Real Jinja check', `found ${pl(sc.syntax.length,'typing mistake')}`, '', 'check', 'Validate');
  else add('ok', 'Real Jinja check', 'passed', sc.target==='built' ? 'No typing mistakes in the template with your changes.' : 'No typing mistakes in the file as uploaded.');
  // employee test
  const B=state.batch, nRows=csvRows().length;
  if (!B) add('idle', 'Employee test', 'not run yet', nRows ? 'Run Test every employee in Validate.' : 'Needs employee data.', 'check', 'Validate');
  else if (B.running) add('idle', 'Employee test', `testing… ${B.done} of ${B.total}`, '', 'check', 'Validate');
  else if (B.error) add('err', 'Employee test', "the template can't be filled", B.error.msg||'', 'check', 'Validate');
  else { const bad=B.perEmp.filter(x=>x.n>0).length, ok=B.done-bad; add(bad||B.stale?'warn':'ok', 'Employee test', `${ok} of ${B.done} fine`, [bad?`${bad} to look at`:'', B.stale?'The template changed since this test. Run it again.':'', B.cancelled?'Stopped early.':''].filter(Boolean).join(' · '), 'check', 'Validate'); }
  // the download stays available with errors; say what will be in the file
  const realN = server.ok && sc && !server.checking ? sc.syntax.length : 0;
  const n=F.errs||realN;
  return {items, warn: n ? `${F.errs?pl(F.errs,'error'):pl(realN,'typing mistake')} will stay in the file.` : ''};
}
// what the Download button asks before it saves, from the same checklist: errors block it, warnings ask "Download anyway?"
export function exportGate(){
  const from=kind=>exportChecklist().items.filter(i=>i.kind===kind).map(i=>({label:i.label, text:i.text, step:i.step}));
  return {errors:from('err'), warnings:from('warn')};
}

// the three views of the letter: source (what you tag), tagged (the template that gets downloaded), filled (one employee's letter)
export function setView(v){
  if (state.view==='edit' && v!=='edit') saveEditor().catch(()=>{});   // leaving the editor saves what was typed
  state.view=v;
  if (v==='tagged') build();
  if (v==='filled'){ state.pv=state.pv||{}; refreshPreview(); }
  notify();
}

/* ---- the Document step's letter row and the employee preview bar, as plain data ---- */
// what the Client letter row says about the open letter (was renderDocRow)
export function letterSummary(){
  if (!state.an) return null;
  const paras=state.an.paras.filter(p=>!p.fallback && p.model.text.trim()).length;
  const hf=state.parts.filter(x=>x.kind==='header'||x.kind==='footer').length;
  const tags=state.an.existingTags||0;
  return {name:state.fileName, isSample:!!state.isSample, paras, headerFooter:hf, tags, empty:!paras,
    text: !paras ? 'No text found in this letter' : [`${paras} paragraph${paras===1?'':'s'}`, hf?`${hf} header/footer part${hf>1?'s':''}`:'', tags?`${tags} tag${tags>1?'s':''} already in it`:'no tags yet'].filter(Boolean).join(' · ')};
}
// a letter with no text in it says so once, when it is opened
on('loaded', ()=>{ const s=letterSummary(); if (s && s.empty) toast("There is no text in that letter. Check it's the right file."); });

// the bar above the Employee preview: where the values come from, who is shown, how the filled letter looks (was renderPvBar)
export function previewBarInfo(){
  const rows=csvRows(); const pv=state.pv||{}; const iss=pv.issues||[];
  const errs=iss.filter(x=>x.level==='error').length, warns=iss.filter(x=>x.level==='warn').length;
  const pk=previewPicker();
  const hasIssues=!!(iss.length || pv.error);
  const used = rows.length ? [...templateIdentifiers().keys()].filter(id=>(pv.sampled||new Set()).has(id)).length : 0;
  const status = pv.loading ? 'loading' : pv.error ? 'error' : errs ? 'bad' : warns ? 'meh' : 'good';
  const count = !rows.length ? '' : pk.matches!=null ? `${pk.matches} of ${rows.length} match${pk.matches&&pk.pos>=0?` · Employee ${pk.pos+1} of ${pk.matches}`:''}` : `Employee ${state.pvIdx+1} of ${rows.length}${pk.list.length>PV_MAX?` · listing the first ${PV_MAX.toLocaleString('en-US')}, search to find the rest`:''}`;
  return {real:rows.length>0, csvName:state.csv?state.csv.name:'', csvNoRows:!!state.csv && !rows.length, rows:rows.length, query:rows.length?(state.pvQuery||''):'',
    index:state.pvIdx||0, picker:pk, count, canStep:pk.canStep, status, errs, warns, hasIssues, open: hasIssues && (!!state.pvIssuesOpen || !!pv.error),
    error: pv.error||null, issues: iss.slice(0,6), moreIssues: Math.max(0, iss.length-6), usedSample:used};
}
export function togglePvIssues(){ state.pvIssuesOpen=!state.pvIssuesOpen; notify(); }
