// Moved from frontend_src/letter-tagger.html — see tests_ui/legacy for the reference page. No DOM rendering in this module.
import { build } from './build.js'
import { COND_PRESETS } from './catalog.js'
import { csvKeyUniverse, didYouMean, isCompUpKey, keyStatus, tagSyntaxProblem } from './checks.js'
import { cbEnglish, cbExpr, cbNew } from './conditions.js'
import { csvRows, filterColumns, flags, ingestCsv, ingestWorkbook, setDataFilter, templateValueFor, useSheet, wbCaches } from './data.js'
import { analyze } from './detect.js'
import { buildBlob, mappingCsv, offer, templateCsv } from './downloads.js'
import { addTagOps, existingTagInfo, loadMergeB, recomputeMerge, renameEverywhere } from './edits.js'
import { emit, notify, on, toast } from './events.js'
import { addDefaultTo, fixTags } from './fixes.js'
import { lsSet, norm, straightenTags } from './helpers.js'
import { fullRefresh, loadDocx, scheduleBuild } from './load.js'
import { addLogic, addLogicAt, afterLogicChange, logicTpl, normalizeLogicText, syncLogic } from './logic.js'
import { batchCsv, pvMatches, refreshPreview, schedulePreview } from './pipeline.js'
import { buildTag, edit, rowStatus } from './rows.js'
import { sampleDocx } from './sample.js'
import { exportSetup, findOffset, flushAutosave, importSetup, setupReportText } from './setup.js'
import { state } from './state.js'
import { setTab, setView } from './steps.js'
import { cellMemKey, tEditCell, tEditCol, tEditHide, tEditRowHide, tableAction } from './tables.js'
import { HISTORY, recordUndo } from './undo.js'

/* ======================= actions: what the buttons and fields do =======================
   Each one is the body of an old event handler with the page reading and drawing taken out: values come in as
   arguments, the result is state (then notify()), a returned value, or an event (toast, error, reveal...). */
export const baseName = () => (state.fileName||'').replace(/\.docx$/i,'') || 'letter';

/* ---- opening files ---- */
// the reason a letter file can't be opened, or ''
export function letterFileProblem(name){
  if (/\.docx$/i.test(name)) return '';
  return /\.doc$/i.test(name) ? 'That is an older .doc file. Open it in Word and use Save As → Word Document (.docx).' : /\.(csv|xlsx|xlsm|xls)$/i.test(name) ? 'That looks like a data file. Add it as employee data, and choose the Word .docx letter here.' : 'Upload a Word .docx file.';
}
// a real letter with changes is open: the UI asks before replacing it. Its work is flushed to the browser's autosave first.
export function replaceWarning(){
  if (state.isSample || !HISTORY.undo.length) return null;
  flushAutosave();
  return {lost:!!state.autosaveFailed, fileName:state.fileName};
}
export function reportError(message, scope){ emit('error', {message, scope}); }
export async function openLetterFile(f){
  const bad=letterFileProblem(f.name); if (bad){ reportError(bad, 'letter'); return false; }
  try { await loadDocx(await f.arrayBuffer(), f.name, false); toast(`Loaded ${f.name}`); return true; } catch(e){ console.warn(e); reportError(e.message, 'letter'); return false; }
}
// a template that is already tagged: load it and go straight to the check
export async function openTaggedTemplate(f){
  if (!/\.docx$/i.test(f.name)){ reportError('Upload the tagged template as a Word .docx file.', 'letter'); return false; }
  try {
    await loadDocx(await f.arrayBuffer(), f.name, false);
    if (state.view!=='source') setView('source');
    setTab('check', {open:true});
    toast(`Loaded ${f.name}. The problems are listed on the left; red tags in the letter have one.`);
    return true;
  } catch(err){ console.warn(err); reportError(err.message, 'letter'); return false; }
}
export async function loadSample(){
  try { await loadDocx(await sampleDocx(), 'sample-appraisal-letter.docx', true); return true; }
  catch(e){ console.warn(e); reportError('Could not load the sample letter: '+e.message, 'letter'); return false; }
}
export async function loadDataFile(f, extra){
  flags.addingExtra=!!extra;
  try {
    if (/\.(xlsx|xlsm|xls)$/i.test(f.name)){ toast('Reading the workbook…'); await ingestWorkbook(await f.arrayBuffer(), f.name); }
    else ingestCsv(await f.text(), f.name);
    toast(extra ? `Added ${f.name}` : `Loaded ${f.name}`);
    return true;
  } catch(e){ console.warn(e); reportError('Could not read that file: '+e.message, 'data'); return false; }
  finally { flags.addingExtra=false; }
}
export function clearData(){ recordUndo(); state.csv=null; state.csvExtra=[]; state.batch=null; state.pvIdx=0; analyze(); fullRefresh(); if (state.view==='filled') schedulePreview(); }
export function removeExtraFile(name){ recordUndo(); state.csvExtra=(state.csvExtra||[]).filter(f=>f.name!==name); state.batch=null; analyze(); fullRefresh(); if (state.view==='filled') schedulePreview(); toast('Removed the file.'); }
// "use the employees where <column> is <value>"; col '' = everyone
export function chooseDataFilter(col){
  if (!col){ setDataFilter(null); return; }
  const fc=filterColumns().find(x=>x.col===col); const guess=fc && (templateValueFor(fc.values, state.fileName) || fc.values[0][0]);
  setDataFilter(col, guess);
}
export function chooseDataFilterValue(v){ setDataFilter(state.dataFilter.col, v); }
export function chooseSheet(fileName, sheetName){
  const f=[state.csv, ...(state.csvExtra||[])].find(x=>x && x.name===fileName); const wb=f && wbCaches.get(f.book); const i=wb ? wb.sheets.findIndex(x=>x.name===sheetName) : -1;
  if (i>=0){ useSheet(f.book, i, false, f.name); toast(`Using the sheet “${sheetName}”.`); }
}
export function chooseSampleRow(i){ recordUndo(); state.csv={...state.csv, sampleIdx:+i}; analyze(); fullRefresh(); }

/* ---- settings ---- */
// patch: any of {money, spaced, guard, removeHl}
export function changeSettings(patch){ recordUndo(); state.settings={...state.settings, ...patch}; lsSet('lt.settings', state.settings); syncLogic(); build(); }
// patch: any of {csvPlace, csvNumbers, previewSamples}
export function changePreviewSettings(patch){ state.settings={...state.settings, ...patch}; lsSet('lt.settings', state.settings); state.batch=null; build(); notify(); if (state.view==='filled') schedulePreview(); }

/* ---- salary tables ---- */
export const tableCol=(t,ci)=>t.cols.find(c=>c.ci===ci);
export function typeTableCellKey(t, row, ci, value){
  recordUndo('tk-'+t.id+'-'+row.ri+'-'+ci);
  const v=String(value).trim(); tEditCell(t,row,ci,{key:v, override:null});
  if (v){ state.learnedCells[cellMemKey(row.label, tableCol(t,ci).header)]=v; lsSet('lt.cells', state.learnedCells); }
  syncLogic(); scheduleBuild();
}
export function typeTableCellTag(t, row, ci, value){ recordUndo('tt-'+t.id+'-'+row.ri+'-'+ci); tEditCell(t,row,ci,{override:value}); syncLogic(); scheduleBuild(); }
export function typeTableHidePattern(t, value){ recordUndo('thp-'+t.id); tEditHide(t,{pattern:value}); syncLogic(); scheduleBuild(); }
export function commitTableHidePattern(t, value){ recordUndo(); tEditHide(t,{pattern:value}); state.settings.hidePattern=value; lsSet('lt.settings', state.settings); syncLogic(); scheduleBuild(); }
export function setTableEnabled(t, on){ recordUndo(); (state.tableEdits[t.id] ||= {}).enabled=on; t.enabled=on; syncLogic(); scheduleBuild(); }
export function setTableColFormat(t, ci, fmt){ recordUndo(); tEditCol(t,ci,{fmt}); syncLogic(); scheduleBuild(); }
export function setTableColDivide12(t, ci, on){ recordUndo(); tEditCol(t,ci,{div12:on}); syncLogic(); scheduleBuild(); }
export function setTableHideOn(t, on){ recordUndo(); tEditHide(t,{on}); syncLogic(); scheduleBuild(); }
export function setTableHideColumn(t, ci){ recordUndo(); tEditHide(t,{ci}); syncLogic(); scheduleBuild(); }
export function setTableRowHide(t, row, hide){ recordUndo(); tEditRowHide(t,row,hide); syncLogic(); scheduleBuild(); }
// act: 'csv' (match CSV columns), 'comp' (suggest CompUp component tags) or 'clear'
export function runTableAction(t, act){
  if (act==='csv' && !state.csvHeaders.length){ toast('Load a CSV first. Its column headers become the tag options.'); return; }
  recordUndo(); const n=tableAction(t, act); syncLogic(); build();
  toast(act==='clear'?'Cleared the table tags.':n?`Filled ${n} cell${n>1?'s':''}.`:'No empty cells matched.');
}

/* ---- placeholders (rows) ---- */
export function setFilter(f){ state.filter=f; notify(); }
export function setSearch(q){ state.q=q; notify(); }
export function clearFilters(){ state.filter='all'; state.q=''; notify(); }
export function setRowKey(id, value){
  const r=state.rows.find(x=>x.id===id); if (!r) return;
  recordUndo('key-'+id);
  const v=String(value).trim(); const patch={key:v};
  if (r.override!=null && !(state.edits[id]&&'override' in state.edits[id])) patch.override=null; else if (state.edits[id] && 'override' in state.edits[id]) { patch.override=null; }
  edit(id, patch);
  const lbl=norm(r.scope==='all' ? (r.label||r.find) : ''); if (lbl && v && r.kind!=='Sample value'){ state.learned[lbl]=v; lsSet('lt.learned', state.learned); }
  syncLogic(); scheduleBuild();
}
export function setRowTag(id, value){ recordUndo('fin-'+id); edit(id, {override:value}); syncLogic(); scheduleBuild(); }
export function setRowFormat(id, fmt){
  recordUndo(); const patch={format:fmt};
  if (state.edits[id] && 'override' in state.edits[id]) patch.override=null; else { const r=state.rows.find(x=>x.id===id); if (r.override!=null) patch.override=null; }
  edit(id, patch); syncLogic(); scheduleBuild();
}
export function setRowEnabled(id, on){ recordUndo(); edit(id, {enabled:on}); syncLogic(); scheduleBuild(); }
export function confirmRow(id){ recordUndo(); edit(id, {reviewed:true}); syncLogic(); scheduleBuild(); }
export function resetRowTag(id){
  recordUndo(); const ed=state.edits[id]; if (ed) delete ed.override;
  const r=state.rows.find(x=>x.id===id); r.override = r.csv && r.csv.override && !(ed&&'key' in ed) ? r.csv.override : null;
  syncLogic(); scheduleBuild();
}
export function deleteRow(id){ recordUndo(); delete state.edits[id]; analyze(); fullRefresh(); }
export function acceptAllChecks(){
  const todo=state.rows.filter(r=>r.count && rowStatus(r)==='check'); if (!todo.length) return 0;
  recordUndo(); let n=0; for (const r of todo){ edit(r.id,{reviewed:true}); n++; }
  syncLogic(); build(); toast(`Accepted ${n} suggestion${n===1?'':'s'}.`); return n;
}
// the next placeholder that needs a tag or a check (after afterId), or null
export function nextReviewId(afterId){
  const list=state.rows.filter(r=>r.count && (rowStatus(r)==='need' || rowStatus(r)==='check'));
  if (!list.length){ toast('Everything is reviewed. Download the tagged .docx when ready.'); return null; }
  let r=list[0]; if (afterId){ const i=state.rows.findIndex(x=>x.id===afterId); r=list.find(x=>state.rows.indexOf(x)>i) || list[0]; }
  return r.id;
}
// text typed or selected in the letter becomes a placeholder
export function addManual(text){
  const id='g:'+text;
  if (state.rows.some(r=>r.id===id)){ toast('That text is already in the list.'); flashRow(id); return; }
  recordUndo();
  state.edits[id]={manual:true, find:text};
  analyze(); fullRefresh();
  const r=state.rows.find(x=>x.id===id);
  if (r && !r.count) toast('That text does not appear in the letter exactly as typed.');
  flashRow(id);
}
// the UI shows the row (clears the filters if needed, opens it, scrolls to it)
export function flashRow(id){ if (state.rows.some(r=>r.id===id)) emit('flashRow', {id}); }

/* ---- the letter: selecting paragraphs and words ---- */
// a click on a paragraph (shift extends the selection to a range)
export function clickParagraph(pid, shift){
  const s=state.sel; s.text=''; s.range=null; state.switchUi=null; state.inlineUi=null;
  const info=state.an.byPid.get(pid); const a0=s.anchor && state.an.byPid.get(s.anchor);
  if (shift && a0 && a0.path===info.path){
    const lo=Math.min(a0.order, info.order), hi=Math.max(a0.order, info.order);
    s.pids=state.an.paras.filter(x=>x.path===info.path && !x.textbox && !x.fallback && x.order>=lo && x.order<=hi).map(x=>x.pid);
  } else if (s.pids.length===1 && s.pids[0]===pid){ s.pids=[]; s.anchor=null; }
  else { s.pids=[pid]; s.anchor=pid; }
  notify();
}
// words selected inside one paragraph; range = {pid, s, e, text} (offsets into the paragraph text) or null
export function selectWords(text, range){ state.sel={pids:[], anchor:null, text, range}; state.inlineUi=null; state.switchUi=null; notify(); }
export function clearSelection(){ state.sel={pids:[],anchor:null,text:''}; state.cb=null; emit('clearSelection'); notify(); }
// while "pick where it ends" is on: the click on a paragraph closes the open block there
export function closeBlockAt(pid){
  const op=state.lg.find(x=>x.key===state.closing); const tgt=state.an.byPid.get(pid);
  if (op && tgt.path!==op.path){ toast(`That if is in the ${op.p.kind==='body'?'letter body':op.p.kind}, so its end if has to be there too.`); return false; }
  if (op && (tgt.order<op.order || (tgt.order===op.order && op.rank>=3))){ toast('Pick a paragraph after the if. The end has to come after the start.'); return false; }
  recordUndo(); addLogic(tgt.pid,'after', logicTpl(op && op.kw==='for'?'endfor':'endif'));
  state.closing=null; notify(); afterLogicChange('Closed.'); return true;
}
// while "place this tag" is on: the click on a paragraph puts the unplaced tag there
export function placeUnplacedAt(pid){
  const u=state.placing; const info=state.an.byPid.get(pid);
  recordUndo();
  const id='l'+Math.random().toString(36).slice(2,9);
  if (u.place==='at'){ const f=(u.ctxB!=null||u.ctxA!=null) ? findOffset(info.model.text, u.ctxB, u.ctxA) : null; state.logic.push({id, pid:info.pid, place:'at', offset:f==null?info.model.text.length:f, text:u.text}); }
  else state.logic.push({id, pid:info.pid, place:u.place||'before', text:u.text});
  state.unplaced.splice(u.k,1); state.placing=null; notify(); afterLogicChange('Placed.');
}
export function cancelPicking(){ state.closing=null; state.placing=null; notify(); }
export function startPlacing(k){ state.placing={k, ...state.unplaced[k]}; state.sel={pids:[],anchor:null,text:''}; if (state.view!=='source') setView('source'); notify(); }
export function discardUnplaced(k){ recordUndo(); state.unplaced.splice(k,1); syncLogic(); }

/* ---- the selection tools ---- */
export function startInlineIf(){ state.inlineUi={kind:'if', cond:'', other:''}; state.cb=cbNew(''); notify(); }
export function startInlineTag(){ state.inlineUi={kind:'tag', tag:''}; notify(); }
export function backFromInline(){ state.inlineUi=null; state.cb=null; notify(); }
export function startSwitchInline(){ const s=state.sel; if (!s.range) return; state.switchUi={mode:'inline', range:{...s.range}, field:'', match:'text', cases:[{v:'',t:s.range.text},{v:'',t:''}], other:''}; notify(); }
export function startSwitchParagraphs(){
  const ps=state.sel.pids.map(id=>state.an.byPid.get(id)).sort((a,b)=>a.order-b.order);
  state.switchUi={mode:'para', pids:ps.map(p=>p.pid), field:'', match:'text', cases:[{v:'',t:ps.map(p=>p.model.text).join('\n')},{v:'',t:''}], other:'', where:'replace'}; notify();
}
export function cancelSwitch(){ state.switchUi=null; notify(); }
export function cancelCondEdit(){ state.condEdit=null; state.cb=null; notify(); }
// "Show these words only when …" (inside a sentence)
export function applyInlineIf(otherText){
  const s=state.sel; if (!s.range) return false; const {pid, s:a, e:b}=s.range;
  const cond=cbExpr(state.cb); if (!cond){ toast('Pick a field, a test and a value first.'); return false; }
  { const why=tagSyntaxProblem(`{% if ${cond} %}`); if (why){ toast(why); return false; } }
  const other=String(otherText||'');
  recordUndo(); addLogicAt(pid, a, `{% if ${cond} %}`); addLogicAt(pid, b, other.trim()?`{% else %}${other}{% endif %}`:'{% endif %}');
  const en=cbEnglish(state.cb); state.cb=null;
  state.inlineUi=null; state.sel={pids:[],anchor:null,text:''}; emit('clearSelection'); notify(); afterLogicChange(en?`Added: shown only when ${en}.`:'Added a condition inside the sentence.');
  return true;
}
// "Insert a tag here…": where is 'before', 'after' or 'replace'
export function applyInlineTag(tagText, where){
  const s=state.sel; if (!s.range) return false; const {pid, s:a, e:b}=s.range;
  const raw=straightenTags(tagText); if (!raw.trim()){ toast('Type the tag first.'); return false; }
  const tag=raw.replace(/^[\r\n]+|[\r\n]+$/g,'');
  recordUndo();
  if (where==='replace'){ const id=`o:${pid}:${a}`; state.edits[id]={manual:true, occ:{pid, s:a, e:b, find:s.range.text}, override:tag.trim()}; state.inlineUi=null; state.sel={pids:[],anchor:null,text:''}; emit('clearSelection'); analyze(); fullRefresh(); toast('Tagged these words.'); return true; }
  addLogicAt(pid, where==='before'?a:b, tag);
  state.inlineUi=null; state.sel={pids:[],anchor:null,text:''}; emit('clearSelection'); notify(); afterLogicChange('Inserted the tag.');
  return true;
}
// "Tag this text": the selected words become a placeholder
export function tagSelectedWords(){ const t=state.sel.text; state.sel={pids:[],anchor:null,text:''}; emit('clearSelection'); notify(); addManual(t); }
// Advanced: one logic tag typed by hand, before/after the selected paragraphs
export function insertLogicTag(rawText, place){
  const text=normalizeLogicText(rawText);
  if (text && !/CONDITION/.test(text)) recordUndo();
  if (!text){ toast('Write the tag first.'); return false; }
  if (/CONDITION/.test(text)){ toast('Replace CONDITION with your condition, or pick one from “Condition…”.'); return false; }
  const ps=state.sel.pids.map(id=>state.an.byPid.get(id)).sort((a,b)=>a.order-b.order); const first=ps[0], last=ps[ps.length-1];
  const target = (place==='after'||place==='end') ? last : first;
  addLogic(target.pid, place, text);
  state.sel={pids:[],anchor:null,text:''}; notify();
  afterLogicChange(`Added ${text.length>40?text.slice(0,40)+'…':text}.`);
  return true;
}

/* ---- the Conditions list ---- */
export function deleteLogic(id){ recordUndo(); state.logic=state.logic.filter(l=>l.id!==id); afterLogicChange('Tag deleted.'); }
// typing in a tag's text box: live, the tag is normalised when the box is left (commitLogicText)
export function typeLogicText(id, text){ const l=state.logic.find(x=>x.id===id); if (!l) return; recordUndo('lgt-'+l.id); l.text=text; syncLogic(); scheduleBuild(); }
export function commitLogicText(id, text){ const l=state.logic.find(x=>x.id===id); if (!l) return; l.text = l.place==='at' ? straightenTags(text) : normalizeLogicText(text); afterLogicChange(''); }
export function setLogicPlace(id, place){ const l=state.logic.find(x=>x.id===id); if (!l) return; recordUndo(); l.place=place; afterLogicChange(''); }

/* ---- employee preview and the employee test ---- */
export function setPvIdx(i){ state.pvIdx=+i; refreshPreview(); }
export function setPvQuery(q){
  state.pvQuery=q; const m=pvMatches(csvRows());
  if (m && m.length && !m.includes(state.pvIdx)){ state.pvIdx=m[0]; refreshPreview(); } else notify();
}
export function setPreviewOverride(id, value){
  recordUndo(); state.previewOverrides={...state.previewOverrides, [id]:value};
  if (state.view==='filled') schedulePreview(); else setView('filled');
  notify();
}
export function resetPreviewOverrides(){ recordUndo(); state.previewOverrides={}; notify(); if (state.view==='filled') schedulePreview(); }
export function previewEmployee(i){ state.pvIdx=+i; setView('filled'); }
export function stopBatch(){ if (state.batch) state.batch.cancel=true; }
export function batchFixDefault(id){
  if (fixTags(t=>addDefaultTo(t,id), n=>`Added | default(0) to ${id} in ${n} tag${n>1?'s':''}. Run the test again to check.`)){ if (state.batch) state.batch.stale=true; notify(); return true; }
  return false;
}

/* ---- tags already in the letter (clean-up) ---- */
// the tag names found in the letter, most used first, each with where it stands against the data file
export function oldTagNames(){
  const info=existingTagInfo(); const U=csvKeyUniverse();
  const names=[...info.names.values()].sort((a,b)=>b.count-a.count || a.id.localeCompare(b.id)).map(n=>{ const status=keyStatus(n.id,U); return {id:n.id, count:n.count, status, suggestion: status==='unknown' ? didYouMean(n.id,U) : null}; });
  return {total:info.total, amountTags:new Set(info.amount.map(a=>a.tag)).size, names, ops:state.tagOps};
}
export function renameTag(from, to){ renameEverywhere(from, to); toast(`Changed ${from} to ${to}.`); }
export function renameTagTyped(from, to){
  to=String(to).trim(); if (!/^[A-Za-z_][\w.]*$/.test(to)){ toast('Use letters, digits, underscores and dots, e.g. custom_schema.basic.'); return false; }
  addTagOps([{type:'rename', from, to}], `Renamed ${from} to ${to}.`); return true;
}
export function undoTagOp(id){ recordUndo(); state.tagOps=state.tagOps.filter(x=>x.id!==id); analyze(); fullRefresh(); toast('Change undone.'); }
export function addPrefixToTags(prefix, picked){
  const pre=String(prefix).trim(); if (!/^[A-Za-z_][\w.]*$/.test(pre)){ toast('Type a prefix such as custom_schema.'); return false; }
  const names=((picked&&picked.length)?picked:[...existingTagInfo().names.keys()].filter(id=>!isCompUpKey(id))).filter(id=>!id.startsWith(pre));
  addTagOps(names.map(id=>({type:'rename', from:id, to:pre+id})), `Added ${pre} to ${names.length} name${names.length===1?'':'s'}.`); return true;
}
export function rewriteAmountTags(fmt){
  const seen=new Set(); const ops=[];
  for (const a of existingTagInfo().amount){ if (seen.has(a.tag)) continue; seen.add(a.tag); const nt=buildTag(a.id, fmt); if (nt && nt!==a.tag) ops.push({type:'map', from:a.tag, to:nt}); }
  addTagOps(ops, `Rewrote ${ops.length} amount tag${ops.length===1?'':'s'}.`);
}
export function replaceInTags(find, repl, regex){
  if (!find){ toast('Type what to find.'); return false; }
  if (regex){ try{ new RegExp(find); }catch(err){ toast("That pattern isn't valid."); return false; } }
  addTagOps([{type:'replace', find, repl, regex}], 'Replaced inside the tags.'); return true;
}

/* ---- combine two versions ---- */
export async function chooseLetterB(f){
  if (!/\.docx$/i.test(f.name)){ toast('Letter B has to be a .docx file.'); return false; }
  try{ await loadMergeB(f); notify(); return true; }catch(err){ console.warn(err); toast(err.message); return false; }
}
export function setMergeLoose(on){ const mb=state.mergeB; if (!mb) return; mb.loose=on; recomputeMerge(); mb.include={}; mb.conds={}; notify(); }
export function setMergeInclude(k, on){ const mb=state.mergeB; if (!mb) return; mb.include[k]=on; notify(); }
export function setMergePreset(id){ const mb=state.mergeB; const pr=COND_PRESETS.find(x=>x.id===id); if (!mb || !pr) return; mb.cond=pr.expr; notify(); }
export function setMergeCond(v){ if (state.mergeB) state.mergeB.cond=v; }
export function setMergeHunkCond(k, v){ if (state.mergeB) state.mergeB.conds[k]=v; }
export function clearMerge(){ state.mergeB=null; notify(); }

/* ---- saving and sharing ---- */
export async function downloadTemplate(){
  let saved=false;
  try { const blob=await buildBlob(); const errs=state.built.checks.filter(c=>c.level==='error').length; saved=await offer(baseName()+'-compup-template.docx', blob); if (errs) toast(`Saved, but ${errs} template check${errs>1?'s need':' needs'} fixing first.`); }
  catch(e){ console.warn(e); toast('Could not build the file: '+e.message); }
  return saved;
}
export function downloadMapping(){ return offer(baseName()+'-tag-mapping.csv', mappingCsv()); }
export function downloadTagListTemplate(){ return offer('compup-letter-tags-template.csv', templateCsv()); }
export function downloadSetup(){ return offer(baseName()+'-tagger-setup.json', JSON.stringify(exportSetup())); }
export function downloadBatchResults(){ return offer(baseName()+'-employee-test.csv', batchCsv()); }
// a setup file chosen by the person: {report} on success, {error} otherwise
export async function loadSetupFile(f){
  if (!state.an){ toast('Choose the client letter first, then load its setup file.'); return {error:'Open the client letter first, then load its setup file.'}; }
  try{ const r=importSetup(JSON.parse(await f.text())); toast('Setup loaded.'); return {report:setupReportText(r)}; }
  catch(err){ return {error: /JSON/.test(err.message) ? "That file isn't a setup file." : err.message}; }
}
export function restoreAutosave(){ try{ const r=importSetup(state.pendingRestore); toast(setupReportText(r)); }catch(err){ toast(err.message); } state.pendingRestore=null; notify(); }
export function dismissRestore(){ state.pendingRestore=null; notify(); }
export function loadTeamSetup(id){
  const st=state.teamSetups.find(x=>x.id===id); if (!st) return '';
  try{ const r=importSetup(st.setup); const t=setupReportText(r); toast(t); return t; }catch(err){ toast(err.message); return ''; }
}
export function setTeamUse(on){ if (!state.team) return; state.team.use=on; lsSet('lt.team.use', on); analyze(); fullRefresh(); }
