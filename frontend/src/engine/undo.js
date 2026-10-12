// Moved from frontend_src/letter-tagger.html — see tests_ui/legacy for the reference page. No DOM rendering in this module.
import { analyze } from './detect.js'
import { notify, toast } from './events.js'
import { fullRefresh } from './load.js'
import { scheduleAutosave } from './setup.js'
import { state } from './state.js'

/* ======================= undo / redo ======================= */
export const HISTORY={undo:[], redo:[], group:'', t:0};
export function snapState(){ return {xml:{...state.xml}, csv:state.csv, csvExtra:state.csvExtra, rest:JSON.stringify({edits:state.edits, tableEdits:state.tableEdits, logic:state.logic, tagOps:state.tagOps, settings:state.settings, previewOverrides:state.previewOverrides, unplaced:state.unplaced, typed:[...state.typed], switchOps:state.switchOps})}; }
export function recordUndo(group){
  if (!state.an) return;   // nothing to undo before a letter is open
  const now=Date.now();
  if (group && group===HISTORY.group && now-HISTORY.t<1500){ HISTORY.t=now; scheduleAutosave(); return; }
  HISTORY.undo.push(snapState()); if (HISTORY.undo.length>80) HISTORY.undo.shift();
  HISTORY.redo=[]; HISTORY.group=group||''; HISTORY.t=now;
  notify(); scheduleAutosave();
}
export function restoreSnap(s){
  state.xml={...s.xml}; state.csv=s.csv; state.csvExtra=s.csvExtra||[]; const r=JSON.parse(s.rest);
  state.edits=r.edits||{}; state.tableEdits=r.tableEdits||{}; state.logic=r.logic||[]; state.tagOps=r.tagOps||[]; state.previewOverrides=r.previewOverrides||{}; state.unplaced=r.unplaced||[]; state.typed=new Set(r.typed||[]); state.switchOps=r.switchOps||[];
  if (r.settings){ state.settings=r.settings; notify(); }
  state.closing=null; state.sel={pids:[],anchor:null,text:''}; state.switchUi=null; state.inlineUi=null;
  analyze(); notify(); fullRefresh();
}
export function undo(){ if (!HISTORY.undo.length) return; HISTORY.redo.push(snapState()); restoreSnap(HISTORY.undo.pop()); HISTORY.group=''; notify(); scheduleAutosave(); notify(); toast('Undone.'); }
export function redo(){ if (!HISTORY.redo.length) return; HISTORY.undo.push(snapState()); restoreSnap(HISTORY.redo.pop()); HISTORY.group=''; notify(); scheduleAutosave(); notify(); toast('Redone.'); }
export function resetHistory(){ HISTORY.undo=[]; HISTORY.redo=[]; HISTORY.group=''; notify(); }
