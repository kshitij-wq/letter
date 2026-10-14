// Moved from frontend_src/letter-tagger.html — see tests_ui/legacy for the reference page. No DOM rendering in this module.
import JSZip from 'jszip'
import { build } from './build.js'
import { suggestDataFilter } from './data.js'
import { analyze } from './detect.js'
import { MERGE_MISMATCH, partKind } from './docx.js'
import { emit, notify } from './events.js'
import { computeLogic } from './logic.js'
import { refreshPreview } from './pipeline.js'
import { scheduleRealCheck, server } from './server.js'
import { hashStr, readAutosave, setupHasWork } from './setup.js'
import { state } from './state.js'
import { resetHistory } from './undo.js'

/* ======================= orchestration ======================= */
let buildTimer;
export function scheduleBuild(){ clearTimeout(buildTimer); buildTimer=setTimeout(()=>{ try{ build(); }catch(e){ console.error(e); } }, 120); }


// everything derived from the letter and the choices, then one change notice (was: redraw every panel)
export function fullRefresh(){
  if (!state.an){ notify(); return; }   // no letter: only the empty page
  computeLogic(); build(); notify();
}

export async function loadDocx(buf, name, isSample){
  if (!buf || !buf.byteLength) throw new Error('That file is empty (0 bytes), so there is no letter in it. Choose the .docx again, or save it again from Word.');
  let zip;
  try { zip = await JSZip.loadAsync(buf); } catch(e){ throw new Error('That file is not a .docx. If it is an older .doc, open it in Word and use Save As → Word Document (.docx).'); }
  const ct = zip.file('[Content_Types].xml') ? await zip.file('[Content_Types].xml').async('string') : '';
  let main='word/document.xml';
  const m = ct.match(/PartName="\/([^"]+)"\s+ContentType="application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document\.main\+xml"/) || ct.match(/ContentType="application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document\.main\+xml"\s+PartName="\/([^"]+)"/);
  if (m) main=m[1];
  if (!zip.file(main)) throw new Error('This .docx has no main document part. Try re-saving it from Word.');
  const paths=[main, ...Object.keys(zip.files).filter(p=>/^word\/(header\d*|footer\d*|footnotes|endnotes)\.xml$/.test(p)).sort()];
  const xml={}; for (const p of paths) xml[p]=await zip.file(p).async('string');
  MERGE_MISMATCH.clear(); state.claudeSugs={}; state.ai=null;
  state.srcBuf=buf; state.fileName=name; state.isSample=!!isSample; state.xml=xml; state.mainPath=main; state.origXml={...xml}; state.origHash=hashStr(xml[main]);
  state.parts=paths.map(p=>({path:p, kind: p===main?'body':partKind(p)}));
  state.comments=!!zip.file('word/comments.xml');
  state.edits={}; state.logic=[]; state.closing=null; state.sel={pids:[],anchor:null,text:''}; state.tableEdits={};
  state.tagOps=[]; state.previewOverrides={}; state.unplaced=[]; state.typed=new Set(); state.switchOps=[]; state.tColl=new Set(); state.tOpts=new Set(); state.pv={}; state.built=null; state.pvIdx=0; state.batch=null; state.compiled=null; state.mergeB=null; state.switchUi=null; state.inlineUi=null; state.placing=null; state.lastAutosave=null; state.editedAt=null; state.savedWork=null; state.savedEdit=null; state.autosaveFailed=false; state.pendingRestore=null;
  resetHistory();
  analyze();
  fullRefresh();
  // work saved in this browser for the same letter: offered by the UI (state.pendingRestore), restored with importSetup(state.pendingRestore)
  if (!isSample){ const auto=readAutosave(state.origHash); if (auto && setupHasWork(auto)) state.pendingRestore=auto; }
  if (state.csv && (!state.dataFilter || state.dataFilter.auto)){ const before=JSON.stringify(state.dataFilter); suggestDataFilter(); if (JSON.stringify(state.dataFilter)!==before){ state.batch=null; state.pvIdx=0; analyze(); fullRefresh(); } }
  notify(); if (server.ok){ server.check=null; server.err=null; scheduleRealCheck(); }
  if (state.view==='filled') refreshPreview();
  emit('loaded', {name, isSample:!!isSample});
}
