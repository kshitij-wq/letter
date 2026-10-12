// Moved from frontend_src/letter-tagger.html — see tests_ui/legacy for the reference page. No DOM rendering in this module.
import Papa from 'papaparse'
import { analyze } from './detect.js'
import { notify, toast } from './events.js'
import { snake } from './helpers.js'
import { fullRefresh } from './load.js'
import { schedulePreview } from './pipeline.js'
import { loadXlsx } from './platform.js'
import { strftime } from './preview.js'
import { state } from './state.js'
import { tagKeyOf } from './tables.js'
import { recordUndo } from './undo.js'

/* ======================= employee data (CSV row → template context) ======================= */
export const SAMPLE_VALUES={
  first_name:'Asha', last_name:'Menon', email:'asha.menon@example.com', mobile:'98765 43210', joined_on:'12-06-2019', emp_code:'E1042', gender:'Female',
  organization:'Northwind Appliances Pvt. Ltd.', organization_address:'Plot 14, MIDC Industrial Area, Pune 411019',
  'employee_schema.function':'Engineering', 'employee_schema.family':'Product', 'employee_schema.subfamily':'Firmware', 'employee_schema.level':'L4', 'employee_schema.designation':'Senior Engineer',
  'employee_schema.promotion_needed':'No', 'employee_schema.updated_level':'L5', 'employee_schema.updated_designation':'Lead Engineer', 'employee_schema.promoted_function':'Engineering', 'employee_schema.promoted_family':'Product', 'employee_schema.promoted_subfamily':'Firmware',
  'employee_schema.rating':'A', 'employee_schema.band':'B2', 'employee_schema.location':'Pune', 'employee_schema.department':'Engineering',
  currency_code:'INR', effective_date:'01-04-2026', ctc:1380000, old_ctc:1200000, increment_amount:180000, new_base:552000, eligible_pay:150000, variable_payout:120000,
  variable_pay:150000, variable_payout_percentage:80, variable_schema:'Standard', emp_variable_plan_name:'Annual Performance Plan',
};
export function mkObj(){
  const o={};
  const hidden=(n,f)=>Object.defineProperty(o,n,{value:f,writable:true,configurable:true,enumerable:false});
  hidden('get', function(k,d){ return (k in this && this[k]!==undefined) ? this[k] : (d===undefined?null:d); });
  hidden('items', function(){ return Object.entries(this); }); hidden('keys', function(){ return Object.keys(this); }); hidden('values', function(){ return Object.values(this); });
  return o;
}
export function getPath(obj, path){ return String(path).split('.').reduce((o,k)=>o==null?undefined:o[k], obj); }
export function setPath(obj, path, val){ const ks=String(path).split('.'); let o=obj; for (let i=0;i<ks.length-1;i++){ if (o[ks[i]]==null || typeof o[ks[i]]!=='object') o[ks[i]]=mkObj(); o=o[ks[i]]; } o[ks[ks.length-1]]=val; }
export function fileHeaders(f){ return !f ? [] : f.mode==='sample' ? f.headers.filter(Boolean) : f.mode==='keys' ? f.keys.filter(Boolean) : []; }
export function dataFiles(){ return [state.csv, ...(state.csvExtra||[])].filter(f=>f && f.mode!=='mapping'); }
export const EMP_ID_RX=/^(emp(loyee)?[\s_.-]*(code|id|no|number)|e[\s_-]?code|staff[\s_]*id|associate[\s_]*(code|id)|emp[\s_]*no)$/i;
export const normId=v=>String(v??'').trim().replace(/\.0+$/,'').replace(/^0+(?=\d)/,'').toLowerCase();
export function idCol(f){ return f && f.headers ? f.headers.findIndex(h=>EMP_ID_RX.test(String(h).trim())) : -1; }
export function extraRowFor(f, mainRow){
  // the extra file's row for this employee: matched on employee code; a one-row file (a params sheet) is used for everyone
  if (!f || f.mode!=='sample' || !f.rows.length) return null;
  const mc=idCol(state.csv), ec=idCol(f);
  if (mainRow && mc>=0 && ec>=0){ const want=normId(mainRow[mc]); if (want){ if (!f._idx){ f._idx=new Map(); f.rows.forEach((r,i)=>{ const k=normId(r[ec]); if (k && !f._idx.has(k)) f._idx.set(k,i); }); } const i=f._idx.get(want); if (i!=null) return {row:f.rows[i], matched:true}; } }
  return f.rows.length===1 ? {row:f.rows[0], matched:false} : null;
}
export function extraMatchCount(f){ const rows=csvRows(); if (!rows.length) return 0; let n=0; for (const r of rows){ const x=extraRowFor(f, r); if (x && x.matched) n++; } return n; }
export function csvRows(){
  if (!(state.csv && state.csv.mode==='sample')) return [];
  const f=state.dataFilter; if (!f || !f.col) return state.csv.rows;
  const c=state._fRows; if (c && c.csv===state.csv && c.col===f.col && c.value===f.value) return c.rows;
  const i=state.csv.headers.indexOf(f.col); if (i<0) return state.csv.rows;
  const want=String(f.value).trim().toLowerCase();
  const rows=state.csv.rows.filter(r=>String(r[i]??'').trim().toLowerCase()===want);
  state._fRows={csv:state.csv, col:f.col, value:f.value, rows}; return rows;
}
// columns that can pick a group of employees: few distinct values (a template name, a level, yes/no)
export function filterColumns(){
  const c=state.csv; if (!c || c.mode!=='sample' || c.params || c.rows.length<2) return [];
  const out=[];
  c.headers.forEach((h,i)=>{ const cnt=new Map(); for (const r of c.rows){ const v=String(r[i]??'').trim(); if (v) cnt.set(v,(cnt.get(v)||0)+1); } if (cnt.size>=2 && cnt.size<=60) out.push({col:h, values:[...cnt.entries()].sort((a,b)=>b[1]-a[1]), template:/letter|template/i.test(h)}); });
  return out.sort((a,b)=>(b.template-a.template));
}
export function nameTokens(s){ return String(s||'').replace(/\.docx$/i,'').replace(/([a-z])([A-Z])/g,'$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g,'$1 $2').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean); }
// the template value that best matches the letter's file name: every word of the value in the name, the most words wins
export function templateValueFor(values, fileName){
  const ft=nameTokens(fileName); if (!ft.length) return null; let best=null;
  for (const [v] of values){ const vt=nameTokens(v); if (vt.length<2) continue; const hit=vt.every(t=>ft.includes(t) || (t.length>=3 && ft.some(f=>f.includes(t)))); if (hit && (!best || vt.length>best.n)) best={v, n:vt.length}; }
  return best ? best.v : null;
}
export function suggestDataFilter(){
  if (state.dataFilter && !state.dataFilter.auto) return;
  const tc=filterColumns().find(x=>x.template); if (!tc){ if (state.dataFilter && state.dataFilter.auto) state.dataFilter=null; return; }
  const v=templateValueFor(tc.values, state.fileName);
  if (v){ const n=tc.values.find(x=>x[0]===v)[1]; const changed=!state.dataFilter || state.dataFilter.value!==v; state.dataFilter={col:tc.col, value:v, auto:true}; if (changed) toast(`Using the ${n} employees whose ${tc.col} is ${v}: it matches the letter's file name. Change it under Data file.`); }
  else if (state.dataFilter && state.dataFilter.auto) state.dataFilter=null;
}
export function setDataFilter(col, value){
  state.dataFilter = col ? {col, value, auto:false} : null;
  state.batch=null; state.pvIdx=0; state.blockCounts=null;
  analyze(); notify(); fullRefresh(); if (state.view==='filled') schedulePreview();
}
export function pickCol(re){ const h=(state.csv&&state.csv.headers)||[]; return h.findIndex(x=>re.test(String(x).trim())); }
export function empLabel(i){
  const row=csvRows()[i]; if (!row) return 'Sample employee';
  const idc=pickCol(/^(emp(loyee)?[\s_.-]*(code|id|no|number)|e[\s_-]?code|staff[\s_]*id|id)$/i);
  const fn=pickCol(/^(first[\s_]*name|name|emp(loyee)?[\s_]*name|full[\s_]*name)$/i), ln=pickCol(/^last[\s_]*name$/i);
  const name=[fn>=0?row[fn]:'', ln>=0?row[ln]:''].filter(Boolean).join(' ');
  const id=idc>=0?row[idc]:'';
  return [id, name].filter(Boolean).join(' · ') || `Row ${i+2}`;
}
export function buildCtx(rowIdx, opts={}){
  const ctx=mkObj(); ctx.custom_schema=mkObj(); ctx.employee_schema=mkObj(); ctx.emp_variable_plan_formula=mkObj();
  const sampled=new Set(), fromCsv=new Set();
  const place=state.settings.csvPlace||'both'; const asNum=state.settings.csvNumbers==='number' || !!(state.csv && state.csv.typed);
  const rows=csvRows();
  const put=(hdr, row, num, mark, onlyNew)=>hdr.forEach((h,i)=>{
    const hk=String(h||'').trim(); if (!hk) return;
    let v=row[i]; v=v==null?'':String(v);
    if (num){ const c=v.replace(/,/g,'').trim(); if (/^-?\d+(\.\d+)?$/.test(c) && !/^0\d/.test(c)) v=Number(c); }
    const set=(k,val)=>{ if (onlyNew && getPath(ctx,k)!==undefined) return; setPath(ctx,k,val); if (mark) sampled.add(k); else fromCsv.add(k); };
    if (hk.includes('.')){ set(hk, v); return; }
    if (place!=='custom') set(tagKeyOf(hk), v);
    if (place!=='top') set('custom_schema.'+snake(hk), v);
  });
  const mainRow = rowIdx!=null ? rows[rowIdx] : null;
  if (mainRow) put(state.csv.headers, mainRow, asNum, false, false);
  for (const f of state.csvExtra||[]){
    if (f.mode!=='sample') continue;
    const x=extraRowFor(f, mainRow); if (!x) continue;
    put(f.headers, x.row, state.settings.csvNumbers==='number' || !!f.typed, !x.matched && !!mainRow, true);
  }
  if (state.settings.previewSamples!==false){ for (const [k,v] of Object.entries(SAMPLE_VALUES)) if (getPath(ctx,k)===undefined){ setPath(ctx,k,v); sampled.add(k); } }
  if (!opts.noOverrides) for (const [k,v] of Object.entries(state.previewOverrides||{})){ setPath(ctx,k,v); sampled.delete(k); }
  if (getPath(ctx,'current_date')===undefined){ setPath(ctx,'current_date', strftime(new Date(),'%B %d, %Y')); sampled.add('current_date'); }
  return {ctx, sampled, fromCsv};
}
export function ingestCsv(text, name){
  const res=Papa.parse(text.replace(/^\uFEFF/,''), {skipEmptyLines:'greedy'});
  const rows=res.data.map(r=>r.map(c=>String(c??'').trim())).filter(r=>r.some(Boolean));
  if (!rows.length) throw new Error('That CSV is empty.');
  applyCsv(csvFromRows(rows, name), flags.addingExtra);
}
export function csvFromRows(rows, name){
  const width=Math.max(...rows.map(r=>r.length));
  const hdr=rows[0].map(h=>h.toLowerCase());
  const tagCells=c=>rows.filter(r=>/\{\{|\{%/.test(r[c]||'')).length;
  let tagCol=-1, bestN=0; for (let c=0;c<width;c++){ const n=tagCells(c); if (n>bestN){ bestN=n; tagCol=c; } }
  const headerIsData = tagCol>=0 && /\{\{|\{%/.test(rows[0][tagCol]||'');
  // a "text → tag" list has its tags in the cells, or is a narrow sheet with a Tag column;
  // a wide sheet (an employee export with a "Letter Template" column, say) is employee rows
  if (tagCol<0 && width<=4) tagCol = hdr.findIndex(h=>/(^|\s)(tag|tags|key|keys|jinja|compup|replace with|template)(\s|$)/.test(h));
  let csv;
  if (tagCol>=0 && width>=2){
    let findCol = hdr.findIndex((h,i)=>i!==tagCol && /(find|text|placeholder|label|field|attribute|client|search|letter|original|variable|name|description)/.test(h));
    if (findCol<0) findCol = tagCol===0 ? 1 : 0;
    const data = headerIsData ? rows : rows.slice(1);
    csv={mode:'mapping', name, entries:data.map(r=>({find:r[findCol]||'', tag:r[tagCol]||''})).filter(e=>e.find && e.tag)};
  } else if (width===1){
    csv={mode:'keys', name, keys:rows.flat().map(k=>k.replace(/^\{\{\s*|\s*\}\}$/g,'')).filter(Boolean)};
  } else if (rows.length>=2){
    csv={mode:'sample', name, headers:rows[0], rows:rows.slice(1), sampleIdx:0};
  } else {
    csv={mode:'keys', name, keys:rows[0].filter(Boolean)};
  }
  return csv;
}
export function applyCsv(csv, asExtra){
  recordUndo();
  if (asExtra && state.csv && state.csv.mode!=='mapping' && csv.mode!=='mapping'){
    const extra=(state.csvExtra||[]).filter(f=>f.name!==csv.name);
    const big=f=>f.mode==='sample' ? f.rows.length : 0;
    if (big(csv)>1 && big(state.csv)<=1){ state.csvExtra=[state.csv, ...extra]; state.csv=csv; }   // the employee list leads
    else state.csvExtra=[...extra, csv];
  } else { state.csv=csv; if (!asExtra){ state.csvExtra=[]; state.dataFilter=null; } }
  if (!asExtra) suggestDataFilter();
  state.batch=null; state.pvIdx=0;
  analyze(); notify(); fullRefresh();
  if (state.view==='filled') schedulePreview();
}
export function csvMetaText(c){
  if (!c) return '';
  if (c.mode==='mapping') return `${c.entries.length} text-to-tag row${c.entries.length===1?'':'s'}`;
  if (c.mode==='keys') return `${c.keys.length} tag${c.keys.length===1?'':'s'}`;
  if (c.params) return `${c.headers.length} parameters, one employee's values`;
  const n=csvRows().length, all=c.rows.length;
  return `${n===all?all:`${n} of ${all}`} employee${all===1?'':'s'} · ${c.headers.length} columns`;
}
// The Document step's employee-data card as plain data (was drawn by renderCsvInfo): what the file is, how the letter uses it,
// and the choices under it (which employees, which row, which sheet, the extra files). null when no data is loaded.
export function dataSummary(){
  const c=state.csv; if (!c) return null;
  const u=state.csvUse||{used:0,alias:0,missing:[]};
  const sheetsOf=f=>f.sheets && f.sheets.length>1 ? {names:f.sheets.slice(), current:f.sheet, book:f.book, canSwitch:wbCaches.has(f.book)} : null;
  const kind = c.mode==='mapping' ? 'mapping' : c.mode==='keys' ? 'keys' : c.params ? 'params' : 'sample';
  const rows=csvRows();
  const out={name:c.name, meta:csvMetaText(c), kind, used:u.used, alias:u.alias, employees:rows.length, total:c.mode==='sample'?c.rows.length:0, sheets:sheetsOf(c), filter:null, sampleRows:null, extras:[], canAddExtra:c.mode!=='mapping', keys:c.mode==='keys'?c.keys.length:0};
  if (kind==='sample'){
    const fc=filterColumns(); const df=state.dataFilter;
    if (fc.length){
      const cur=df && fc.find(x=>x.col===df.col);
      out.filter={columns:fc.map(x=>({col:x.col, values:x.values.map(([v,n])=>({value:v, count:n}))})), col:cur?df.col:'', value:cur?String(df.value):'', auto:!!(cur && df.auto), shown:rows.length, total:c.rows.length};
    }
    if (u.used) out.sampleRows={used:u.used, current:c.sampleIdx||0, options:c.rows.slice(0,200).map((r,i)=>({index:i, label:`Row ${i+2}${r[0]?' · '+String(r[0]).slice(0,24):''}`}))};
  }
  const mc=idCol(c);
  for (const f of state.csvExtra||[]){
    const isRows=f.mode==='sample'; const nRows=isRows?f.rows.length:0; const matched=isRows?extraMatchCount(f):0;
    const ec=isRows?idCol(f):-1;
    out.extras.push({name:f.name, kind:!isRows?'names':(nRows===1 && !matched)?'one-row':'rows', names:fileHeaders(f).length, columns:isRows?f.headers.length:0, rows:nRows, params:!!f.params, matched, employees:rows.length, matchBy: mc>=0 && ec>=0 ? String(f.headers[ec]) : '', sheets:sheetsOf(f)});
  }
  return out;
}
export const wbCaches=new Map();
export function xlCell(v){
  if (v==null) return '';
  if (v instanceof Date){ if (isNaN(v)) return ''; return String(v.getDate()).padStart(2,'0')+'-'+String(v.getMonth()+1).padStart(2,'0')+'-'+v.getFullYear(); }
  if (typeof v==='number') return Number.isInteger(v) ? String(v) : String(Math.round(v*1e8)/1e8);
  if (typeof v==='boolean') return v?'TRUE':'FALSE';
  return String(v).replace(/ /g,' ').trim();
}
export function paramsCols(rows){
  for (let r=0;r<Math.min(10,rows.length);r++){ const h=rows[r].map(x=>String(x).toLowerCase().trim()); const k=h.indexOf('params'), v=h.indexOf('values'); if (k>=0 && v>=0) return {r,k,v,def:h.indexOf('default')}; }
  return null;
}
export function sheetToCsv(rows, label){
  const pc=paramsCols(rows);
  if (pc){
    const keys=[], vals=[];
    for (const row of rows.slice(pc.r+1)){ const k=String(row[pc.k]||'').trim(); if (!k) continue; let v=row[pc.v]??''; if (v==='' && pc.def>=0) v=row[pc.def]||''; keys.push(k); vals.push(v); }
    if (!keys.length) throw new Error('That params sheet has no parameter names.');
    return {mode:'sample', name:label, headers:keys, rows:[vals], sampleIdx:0, typed:true, params:true};
  }
  // header row: the row (of the first 10) with the most text cells, e.g. row 2 when row 1 only groups columns
  let best=-1, bi=0;
  for (let r=0;r<Math.min(10,rows.length);r++){ const n=rows[r].filter(x=>x && !/^[-+]?[\d.,]+$/.test(x)).length; if (n>best){ best=n; bi=r; } }
  const body=rows.slice(bi);
  if (body.length<2) return {mode:'keys', name:label, keys:body[0].filter(Boolean)};
  const csv=csvFromRows(body, label); return csv;
}
export async function ingestWorkbook(buf, name){
  const X=await loadXlsx();
  let wb; try { wb=X.read(buf, {type:'array', cellDates:true}); } catch(e){ throw new Error('That Excel file is damaged or password-protected. Open it in Excel, remove any password, and save it again as .xlsx.'); }
  const sheets=wb.SheetNames.map(n=>({name:n, rows:X.utils.sheet_to_json(wb.Sheets[n], {header:1, raw:true, defval:'', blankrows:false}).map(r=>r.map(xlCell)).filter(r=>r.some(Boolean))})).filter(sh=>sh.rows.length);
  if (!sheets.length) throw new Error('That workbook is empty.');
  wbCaches.set(name, {name, sheets});
  let pick=sheets.findIndex(sh=>paramsCols(sh.rows));
  if (pick<0){ let best=-1; sheets.forEach((sh,i)=>{ const sc=sh.rows.length*Math.max(...sh.rows.slice(0,5).map(r=>r.filter(Boolean).length)); if (sc>best){ best=sc; pick=i; } }); }
  useSheet(name, pick, flags.addingExtra);
}
export function useSheet(book, i, asExtra, replaceName){
  const wb=wbCaches.get(book); const sh=wb.sheets[i]; const csv=sheetToCsv(sh.rows, `${wb.name} · ${sh.name}`);
  csv.book=wb.name; csv.sheets=wb.sheets.map(x=>x.name); csv.sheet=sh.name;
  if (replaceName!=null){ recordUndo(); if (state.csv && state.csv.name===replaceName) state.csv=csv; else state.csvExtra=(state.csvExtra||[]).map(f=>f.name===replaceName?csv:f); state.batch=null; state.pvIdx=0; analyze(); notify(); fullRefresh(); if (state.view==='filled') schedulePreview(); return; }
  applyCsv(csv, asExtra);
}
/* ---- flag set while a second data file is being added (read by ingestCsv / ingestWorkbook) ---- */
export const flags = { addingExtra: false };
