// Moved from frontend_src/letter-tagger.html — see tests_ui/legacy for the reference page. No DOM rendering in this module.
import { analyze } from './detect.js'
import { notify, toast } from './events.js'
import { lsGet, lsSet, norm } from './helpers.js'
import { fullRefresh } from './load.js'
import { finalTag } from './rows.js'
import { exportSetup, hashStr } from './setup.js'
import { state } from './state.js'
import { cellMemKey } from './tables.js'

/* ======================= team library (shared through the artifact's database) ======================= */
let dbApi=null, teamUnsub=null, setupsUnsub=null;
export const slugify=s=>String(s||'').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,60)||'client';
export function initTeam(){
  try{
    const p = window.claude && window.claude.use ? window.claude.use('db') : Promise.resolve(null);
    p.then(db=>{ dbApi=db; state.teamStatus=db?'ready':'none'; if (db){ subscribeClients(); checkTeamWrite(); } notify(); }).catch(()=>{ state.teamStatus='none'; notify(); });
  }catch(e){ state.teamStatus='none'; }
}
export async function checkTeamWrite(){
  // ask up front whether this viewer may save to the shared library; null means "not told", so let a refused write decide
  try{ const u=await window.claude.use('user'); const w=u && u.can ? await u.can('data.write') : null; if (w===false){ state.teamReadOnly=true; notify(); } }catch(e){}
}
export const jsonBytes=o=>new TextEncoder().encode(JSON.stringify(o)).length;
export const TEAM_MAX=250000;
export function subscribeClients(){
  if (teamUnsub) teamUnsub();
  teamUnsub=dbApi.collection('clients').onSnapshot(snap=>{
    state.teamClients=snap.docs.filter(d=>d.exists).map(d=>({id:d.id, ...d.data()}));
    const sel=lsGet('lt.team.client','');
    if (sel && state.teamClients.some(c=>c.id===sel)) setTeamClient(sel, true); else if (state.team && !state.teamClients.some(c=>c.id===state.team.id)) setTeamClient('', true);
    else if (state.team){ const c=state.teamClients.find(x=>x.id===state.team.id); state.team={...c, use:state.team.use}; }
    notify();
  }, err=>{ state.teamStatus=err && err.code==='revoked' ? 'none' : 'error'; notify(); });
}
export function setTeamClient(id, fromSnap){
  const c=state.teamClients.find(x=>x.id===id);
  const prev=state.team && state.team.id; const use=state.team ? state.team.use : lsGet('lt.team.use', true);
  state.team = c ? {...c, use} : null; lsSet('lt.team.client', c?c.id:'');
  if (setupsUnsub && (!c || c.id!==prev)){ setupsUnsub(); setupsUnsub=null; state.teamSetups=[]; }
  if (c && !setupsUnsub && dbApi){
    setupsUnsub=dbApi.collection('setups').where('client','==',c.id).onSnapshot(snap=>{ state.teamSetups=snap.docs.filter(d=>d.exists).map(d=>({id:d.id, ...d.data()})).sort((a,b)=>String(b.savedAt).localeCompare(String(a.savedAt))); notify(); }, ()=>{});
  }
  if (!fromSnap || id!==prev){ if (state.an){ analyze(); fullRefresh(); } }
}
export function teamWriteError(e){
  const code=e && e.code;
  if (code==='invalid_argument'){ state.teamReadOnly=true; notify(); toast("You can use the team library but not save to it. Ask the owner of this tool for Contributor access."); }
  else if (code==='quota_exceeded') toast('The team library is full. Delete old saved setups to make room.');
  else if (code==='resource_exhausted') toast('Too many saves in a short time. Wait a few seconds and try again.');
  else if (code==='revoked'){ state.teamStatus='none'; notify(); }
  else toast("Couldn't save to the team library right now. Try again in a moment.");
}
export async function teamCreateClient(name){
  name=String(name||'').trim(); if (!name){ toast('Type the client name first.'); return; }
  let id=slugify(name); if (id==='client' && !/client/i.test(name)) id='client-'+hashStr(name).slice(0,6);
  if (state.teamClients.some(c=>c.id===id)){ setTeamClient(id); state.teamNew=false; notify(); toast(`${name} is already in the library.`); return; }
  const prevSel=lsGet('lt.team.client',''); lsSet('lt.team.client', id);   // the snapshot for this write can arrive before set() resolves
  try{ await dbApi.doc('clients/'+id).set({name, columns:[], labels:{}, cells:{}, settings:{}, updatedAt:new Date().toISOString()}); state.teamNew=false; if (state.teamClients.some(c=>c.id===id) && (!state.team || state.team.id!==id)) setTeamClient(id); notify(); toast(`Added ${name} to the team library.`); }
  catch(e){ lsSet('lt.team.client', prevSel); teamWriteError(e); }
}
export function collectTeamChoices(){
  const labels={}, cells={};
  for (const r of state.rows){ if (!r.enabled || !r.count || r.scope!=='all') continue; const tag=finalTag(r); const lbl=norm(r.label||r.find); if (tag && lbl && ['Brackets','Merge field','CSV','Added'].includes(r.kind)) labels[lbl]=tag; }
  for (const t of state.tables) for (const row of t.rows) for (const ci of row.empties){ const c=row.cells[ci]; const col=t.cols.find(x=>x.ci===ci); if (c && c.key) cells[cellMemKey(row.label, col.header)]=c.key; }
  return {labels, cells};
}
export async function teamSaveChoices(){
  const t=state.team; if (!t) return;
  const {labels, cells}=collectTeamChoices();
  const body={name:t.name, columns:[...new Set([...(t.columns||[]), ...state.csvHeaders])].slice(0,2000), labels:{...(t.labels||{}), ...labels}, cells:{...(t.cells||{}), ...cells}, settings:{money:state.settings.money, spaced:state.settings.spaced, guard:state.settings.guard, hidePattern:state.settings.hidePattern||''}, updatedAt:new Date().toISOString()};
  if (jsonBytes(body)>TEAM_MAX){ toast("That's more than the library can hold for one client. Remove unused columns from the CSV and try again."); return; }
  try{ await dbApi.doc('clients/'+t.id).set(body); toast(`Saved ${Object.keys(labels).length} text tags and ${Object.keys(cells).length} table cells to ${t.name}.`); }
  catch(e){ teamWriteError(e); }
}
export async function teamSaveSetup(name){
  const t=state.team; if (!t) return; if (!state.an){ toast('Open a letter first.'); return; } name=String(name||'').trim()||state.fileName.replace(/\.docx$/i,'');
  const setup=exportSetup({includeSource:true}); let body={client:t.id, name, fileName:state.fileName, savedAt:new Date().toISOString(), setup};
  if (jsonBytes(body)>TEAM_MAX){ body.setup=exportSetup({includeSource:false}); body.noSource=true; }
  if (jsonBytes(body)>TEAM_MAX){ toast('This setup is too large for the team library. Download the setup file instead.'); return; }
  try{ await dbApi.doc('setups/'+t.id+'~'+slugify(name)).set(body); toast(`Saved the setup “${name}” for ${t.name}.`); }
  catch(e){ teamWriteError(e); }
}
export async function teamDeleteSetup(id){ try{ await dbApi.doc('setups/'+id).delete(); toast('Deleted the saved setup.'); }catch(e){ teamWriteError(e); } }
