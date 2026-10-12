// Moved from frontend_src/letter-tagger.html — see tests_ui/legacy for the reference page. No DOM rendering in this module.
import JSZip from 'jszip'
import { build } from './build.js'
import { flushEditor } from './editor.js'
import { toast } from './events.js'
import { browserDownload } from './platform.js'
import { finalTag } from './rows.js'
import { state } from './state.js'

/* ======================= downloads ======================= */
let dlApi=null;
try { (window.claude && window.claude.use ? window.claude.use('downloads') : Promise.resolve(null)).then(d=>{ dlApi=d; }).catch(()=>{}); } catch(e){}
export async function buildBlob(){
  await flushEditor();   // changes made in the editor go into the letter first
  build();
  const z = await JSZip.loadAsync(state.srcBuf);
  for (const [p,x] of Object.entries(state.built.xml)) z.file(p, x);
  if (state.an.fields && z.file('word/settings.xml')){
    let s=await z.file('word/settings.xml').async('string');
    s=s.replace(/<w:mailMerge>[\s\S]*?<\/w:mailMerge>/,''); z.file('word/settings.xml', s);
  }
  return z.generateAsync({type:'blob', mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document', compression:'DEFLATE'});
}
export async function offer(filename, data){
  if (!dlApi && !window.claude){ browserDownload(filename, data); return true; }
  if (!dlApi){ toast("Downloads aren't available in this view. Open the page on claude.ai to save files."); return false; }
  try { await dlApi.save({filename, data}); toast('Saved '+filename); return true; }
  catch(e){ const c=e&&e.code; toast(c==='declined'?'Download cancelled.':c==='rate_limited'?'A download prompt is already open. Finish that one first.':['unavailable','not_granted','capability_disabled','capability_removed'].includes(c)?"Downloads aren't available in this view. Open the page on claude.ai to save files.":'Could not save the file'+(e&&e.message?': '+e.message:'.')); return false; }
}
export function csvCell(v){ v=String(v??''); return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v; }
export function mappingCsv(){
  const lines=[['Text in letter','CompUp tag','Occurrences','Source']];
  for (const r of state.rows) if (r.enabled && finalTag(r)) lines.push([r.find, finalTag(r), r.count, r.kind]);
  return '\uFEFF'+lines.map(l=>l.map(csvCell).join(',')).join('\r\n');
}
export function templateCsv(){
  const lines=[['Text in letter','CompUp tag'],
    ['Employee Name','{{ first_name }} {{ last_name }}'],['Employee Code','{{ emp_code }}'],['Designation','{{ employee_schema.designation }}'],
    ['New Designation','{{ employee_schema.updated_designation }}'],['Revised CTC','{{ ctc | indian_comma }}'],['Existing CTC','{{ old_ctc | indian_comma }}'],
    ['Effective Date','{{ effective_date }}'],['Letter Date',"{{ currentDatetime('%B %d, %Y') }}"],['Graduation Certificate','{{ custom_schema.graduation_certificate }}']];
  return '\uFEFF'+lines.map(l=>l.map(csvCell).join(',')).join('\r\n');
}
