// Moved from frontend_src/letter-tagger.html — see tests_ui/legacy for the reference page. No DOM rendering in this module.
import { build } from './build.js'
import { KEYWORDS, csvKeyUniverse, identifiersIn, keyStatus, locateTags, placeChips } from './checks.js'
import { buildCtx, csvRows, empLabel, getPath } from './data.js'
import { RX_TAG } from './detect.js'
import { buildModel, paraModel } from './docx.js'
import { buildBlob, csvCell } from './downloads.js'
import { notify, toast } from './events.js'
import { W, childW, closestP, esc, isW, parseXml, serialize, straighten } from './helpers.js'
import { escRe } from './edits.js'
import { syncLogic } from './logic.js'
import { getEnv, loadEngine, rt } from './preview.js'
import { finalTag, tagProblem } from './rows.js'
import { postValidate, server, templateTagsWith } from './server.js'
import { state } from './state.js'

/* ======================= preview pipeline ======================= */
export const SA='\uE000', SB='\uE001', SC='\uE002', SD='\uE003';
export function decodeXmlText(s){ return String(s).replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&#39;/g,"'").replace(/&#x([0-9a-f]+);/gi,(m,h)=>String.fromCharCode(parseInt(h,16))).replace(/&#(\d+);/g,(m,d)=>String.fromCharCode(+d)).replace(/&amp;/g,'&'); }
/* What Python would print: a float result such as 4900.0 keeps its ".0" in CompUp */
export function pyResultType(expr){
  const toks=String(expr).replace(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"/g,' "S" ').match(/"S"|\d+\.\d*|\.\d+|\d+|\*\*|\/\/|==|!=|>=|<=|[A-Za-z_]\w*|\S/g)||[];
  let i=0; const peek=()=>toks[i], next=()=>toks[i++];
  const comb=(a,b,op)=>{ if (a==='str'||b==='str') return (op==='+'||op==='*'||op==='%')?'str':''; if (op==='/') return 'float'; if (a==='float'||b==='float') return 'float'; if (a==='int'&&b==='int') return 'int'; return ''; };
  const FT={float:'float', round:'float', int:'int', length:'int', count:'int', wordcount:'int', abs:null, default:null, d:null, sum:'', first:'', last:'', min:'', max:'', random:''};
  const skip=()=>{ const o=next(); const c=o==='('?')':']'; let d=1; while (i<toks.length && d>0){ const t=next(); if (t==='('||t==='[') d++; else if (t===')'||t===']') d--; } void c; };
  function primary(){
    const t=peek(); if (t==null) return ''; let ty='';
    if (t==='('){ next(); ty=cond(); while (peek()===','){ next(); cond(); ty=''; } if (peek()===')') next(); }
    else if (t==='['){ skip(); }
    else if (t==='"S"'){ next(); ty='str'; }
    else if (/^\.?\d/.test(t)){ next(); ty=/\./.test(t)?'float':'int'; }
    else if (/^[A-Za-z_]/.test(t)){ next(); }
    else { next(); return ''; }
    while (peek()==='.' || peek()==='[' || peek()==='('){
      if (peek()==='.'){ next(); const nm=next(); if (peek()==='('){ skip(); ty=(ty==='str' && ['format','upper','lower','strip','title','replace','capitalize','join','zfill','rjust','ljust'].includes(nm))?'str':''; } else ty=''; }
      else { skip(); ty=''; }
    }
    return ty;
  }
  function filtered(){ let t=primary(); while (peek()==='|'){ next(); const f=next()||''; if (peek()==='(') skip(); t = f in FT ? (FT[f]===null ? t : FT[f]) : 'str'; } return t; }
  function pow(){ let a=filtered(); while (peek()==='**'){ next(); a=comb(a, filtered(), '**'); } return a; }
  function unary(){ if (peek()==='-'||peek()==='+'){ next(); return unary(); } return pow(); }
  function mul(){ let a=unary(); while (['*','/','//','%'].includes(peek())){ const op=next(); a=comb(a, unary(), op); } return a; }
  function add(){ let a=mul(); while (peek()==='+'||peek()==='-'){ const op=next(); a=comb(a, mul(), op); } return a; }
  function cat(){ let a=add(); while (peek()==='~'){ next(); add(); a='str'; } return a; }
  function cmp(){ let a=cat(); while (['==','!=','<','>','<=','>=','in','is'].includes(peek()) || (peek()==='not' && toks[i+1]==='in')){ const op=next(); if (op==='not'||(op==='is'&&peek()==='not')) next(); cat(); a=''; } return a; }
  function not_(){ if (peek()==='not'){ next(); not_(); return ''; } return cmp(); }
  function and_(){ let a=not_(); while (peek()==='and'){ next(); not_(); a=''; } return a; }
  function or_(){ let a=and_(); while (peek()==='or'){ next(); and_(); a=''; } return a; }
  function cond(){ const a=or_(); if (peek()==='if'){ next(); or_(); if (peek()==='else'){ next(); const b=cond(); return a===b?a:''; } return ''; } return a; }
  try { const t=cond(); return i>=toks.length ? t : ''; } catch(e){ return ''; }
}
export function escapeLiterals(tag){
  // & < > inside quotes: Word stores them as &amp; &lt; &gt;, and an engine may compare against that text; \u0026 etc. mean the same to Jinja
  return tag.replace(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"/g, lit=>/[&<>]/.test(lit) ? lit.replace(/&/g,'\\u0026').replace(/</g,'\\u003c').replace(/>/g,'\\u003e') : lit);
}
export function unicodeEscapes(tag){
  // Jinja reads \u0026 inside quotes as "&"; the preview engine doesn't, so convert those first
  return tag.replace(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"/g, lit=>lit.replace(/\\u([0-9a-fA-F]{4})/g,(m,h)=>{ const c=String.fromCharCode(parseInt(h,16)); return (c==='"'||c==="'"||c==='\\')?m:c; }));
}
export function prepareTemplateXml(xml, meta){
  const doc=parseXml(xml);
  for (const p of [...doc.getElementsByTagNameNS(W,'p')]){
    const t=paraModel(p).text; if (!t.trim()) continue;
    if (t.replace(/\{%[\s\S]*?%\}|\{#[\s\S]*?#\}/g,'').trim()!=='') continue;   // not a tag-only line
    if (!/\{%-|-%\}/.test(t)) continue;                                        // no trim markers: the blank line stays, as in CompUp
    // with trim markers CompUp drops the line: mark it and remove it after filling (see parseRendered)
    const ns=paraModel(p).nodes; if (!ns.length) continue;
    ns[0].node.textContent=SD+ns[0].node.textContent; ns[ns.length-1].node.textContent+=SD;
  }
  let s=serialize(doc);
  s=s.replace(/\{[{%#][\s\S]*?[}%#]\}/g, m=>unicodeEscapes(straighten(decodeXmlText(m))));
  s=s.replace(/\{\{[\s\S]*?\}\}/g, m=>{ const i=meta.tags.length; meta.tags.push(m); return SA+i+SB+m+SC; });
  return s;
}
export function friendlyEngineMsg(d){
  d=String(d||'').replace(/^\(unknown path\)\s*/,'').replace(/^Error:\s*/,'').trim();
  let m;
  if (/expected elif, else, or endif, got end of file/.test(d)) return 'An if block is never closed with end if.';
  if (/expected endfor/.test(d)) return 'A for block is never closed with end for.';
  if ((m=d.match(/unknown block tag: (\w+)/))) return `There is a “${m[1]}” without a matching if or for before it.`;
  if ((m=d.match(/filter not found: (\w+)/))) return `The filter “${m[1]}” isn't known to the preview. If CompUp supports it, this preview can't show it; otherwise check the spelling.`;
  if ((m=d.match(/Unable to call `([^`]+)`/))) return `“${m[1]}” is called like a function but isn't one.`;
  if (/unexpected token/.test(d)) return 'A tag has a typing mistake: '+d.replace(/\s+/g,' ');
  return d.replace(/\s+/g,' ');
}
export function describeEngineError(e, src, part){
  const msg=String((e && e.message) || e);
  const m=msg.match(/\[Line (\d+), Column (\d+)\]/);
  const detail=msg.split('\n').slice(1).join(' ').trim() || msg;
  let tag='';
  if (m){
    const lines=src.split('\n'); let off=0; for (let i=0;i<+m[1]-1 && i<lines.length;i++) off+=lines[i].length+1; off+=+m[2]-1;
    const a=Math.max(src.lastIndexOf('{{',off), src.lastIndexOf('{%',off));
    if (a>=0){ const close=src[a+1]==='{'?'}}':'%}'; const b=src.indexOf(close, a); tag=src.slice(a, b>=0 && b-a<300 ? b+2 : a+120); }
  }
  return {msg:friendlyEngineMsg(detail), tag, part};
}
export async function getCompiled(){
  const nj=await loadEngine();
  getEnv(nj);
  if (!state.built) build();
  const bx=state.built.xml;
  const c=state.compiled;
  if (c && state.parts.every(p=>c.src[p.path]===bx[p.path])) return c;
  const meta={tags:[]}, parts={}; let error=null;
  for (const part of state.parts){
    const src=prepareTemplateXml(bx[part.path], meta);
    try { parts[part.path]=new nj.Template(src, rt.ENV, part.path, true); }
    catch(e){ error=describeEngineError(e, src, part.path); break; }
  }
  meta.floaty=meta.tags.map(t=>pyResultType(String(t).replace(/^\{\{-?|-?\}\}$/g,''))==='float');
  state.compiled={src:{...bx}, meta, parts, error};
  return state.compiled;
}
export function renderEmployee(comp, ctx){
  rt.issues=[]; const xml={}; let error=null;
  for (const part of state.parts){
    try { xml[part.path]=comp.parts[part.path].render(ctx).replace(/\uE000(\d+)\uE001(-?\d+)\uE002/g, (m,k,v)=>comp.meta.floaty && comp.meta.floaty[+k] ? SA+k+SB+v+'.0'+SC : m); }
    catch(e){ const msg=String((e&&e.message)||e); error={msg:friendlyEngineMsg(msg.split('\n').slice(1).join(' ')||msg), part:part.path}; break; }
  }
  const issues=rt.issues||[]; rt.issues=null;
  return {xml, error, issues};
}
export function parseRendered(xml){
  const docs={};
  for (const [p,x] of Object.entries(xml)){
    const d=new DOMParser().parseFromString(x,'application/xml');
    const pe=d.getElementsByTagName('parsererror')[0];
    if (pe) return {broken:true, part:p, detail:(pe.textContent||'').slice(0,160)};
    dropTagLines(d); docs[p]=d;
  }
  let emptyCells=0, emptyTables=0;
  for (const d of Object.values(docs)){
    for (const tc of d.getElementsByTagNameNS(W,'tc')) if (![...tc.childNodes].some(n=>isW(n,'p')||isW(n,'tbl'))) emptyCells++;
    for (const t of d.getElementsByTagNameNS(W,'tbl')) if (![...t.childNodes].some(n=>isW(n,'tr'))) emptyTables++;
  }
  return {docs, emptyCells, emptyTables};
}
export function dropTagLines(d){
  // paragraphs that held only trim-marked tags ({%- … -%}) disappear, as CompUp removes those lines
  if (!/\uE003/.test(d.documentElement.textContent)) return;
  for (const p of [...d.getElementsByTagNameNS(W,'p')]){
    const ts=[...p.getElementsByTagNameNS(W,'t')].filter(t=>closestP(t)===p); if (!ts.some(t=>t.textContent.includes(SD))) continue;
    for (const t of ts) if (t.textContent.includes(SD)) t.textContent=t.textContent.split(SD).join('');
    if (ts.some(t=>t.textContent.trim()) || p.getElementsByTagNameNS(W,'drawing').length || p.getElementsByTagNameNS(W,'pict').length) continue;
    const pPr=childW(p,'pPr'); if (pPr && childW(pPr,'sectPr')) continue;
    const parent=p.parentNode;
    if (isW(parent,'tc') && [...parent.childNodes].filter(n=>isW(n,'p')||isW(n,'tbl')).length===1) continue;
    if ((isW(parent,'hdr')||isW(parent,'ftr')) && [...parent.childNodes].filter(n=>isW(n,'p')||isW(n,'tbl')).length===1) continue;
    parent.removeChild(p);
  }
}
export function tagPrimaryIds(tag){ const inner=String(tag).replace(/^\{\{-?|-?\}\}$/g,''); return identifiersIn(inner).filter(x=>x!=='currentDatetime'); }
export function outputValues(xml, comp){
  const out=[]; const re=/\uE000(\d+)\uE001([^\uE002]*)\uE002/g;
  for (const x of Object.values(xml)){ let m; re.lastIndex=0; while ((m=re.exec(x))){ out.push({tag:comp.meta.tags[+m[1]], val:decodeXmlText(m[2])}); } }
  return out;
}
export function employeeIssues(r, comp, info, U, rowIdx){
  const out=[]; const add=(level,key,msg,extra)=>out.push({level,key,msg,...(extra||{})});
  if (r.error){ add('error','err:'+r.error.msg, `The letter can't be generated: ${esc(r.error.msg)}`); return out; }
  const pr=parseRendered(r.xml);
  if (pr.broken) add('error','xml',"The filled letter is damaged and Word won't open it. This usually means an if and its end if sit in different parts of a table or paragraph.");
  else {
    if (pr.emptyCells) add('error','cells','A table cell ends up with nothing in it, which Word treats as damaged. Keep at least one line outside the if in every cell.');
    if (pr.emptyTables) add('error','tables','Every row of a table is hidden, which leaves an empty table that Word treats as damaged.');
  }
  for (const v of outputValues(r.xml, comp)){
    const ids=tagPrimaryIds(v.tag); const id=ids[0]||''; if (info.sampled.has(id)) continue;
    const st=id?keyStatus(id,U):'compup';
    const t=v.val.trim();
    if (!t){ if (st==='compup' && !info.fromCsv.has(id)) continue; add('warn','empty:'+v.tag, `<code>${esc(v.tag)}</code> prints nothing`, {id}); }
    else if (/^(nan|none|undefined|null|infinity)$/i.test(t)) add('warn','bad:'+v.tag, `<code>${esc(v.tag)}</code> prints “${esc(t)}”`, {id});
    else if (/^-?\d+\.0$/.test(t) && comp.meta.floaty && comp.meta.floaty[comp.meta.tags.indexOf(v.tag)]) add('warn','f0:'+v.tag, `<code>${esc(v.tag)}</code> prints “${esc(t)}”. A result of <code>| float</code>, <code>| round</code> or <code>/</code> keeps the .0; end the tag with <code>| int</code> or a comma filter to print a whole number.`, {id});
  }
  // Jinja stops the letter when a field that doesn't exist goes through | float or | int (the preview is lenient here)
  if (!comp.strictUses){ const m=new Map(); for (const p of (state.built?state.built.an.paras:[])) for (const t of p.model.text.matchAll(RX_TAG)){ const e=t[0].replace(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"/g,'""'); for (const x of e.matchAll(/(?<![\w.])([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)?)\s*\|\s*(float|int)\b/g)) if (!KEYWORDS.has(x[1])) m.set(x[1], x[2]); } comp.strictUses=m; }
  const missing=[...comp.strictUses.keys()].filter(id=>getPath(info.ctx, id)===undefined);
  if (missing.length) add('warn','undef:'+missing.length, `${missing.length} field${missing.length>1?'s':''} used with <code>| float</code> or <code>| int</code> ${missing.length>1?'are':'is'}n't in the data for this employee: ${missing.slice(0,8).map(x=>`<code>${esc(x)}</code>`).join(', ')}${missing.length>8?` and ${missing.length-8} more`:''}. In Jinja a missing field there stops the whole letter with an “is undefined” error. Make sure every employee has ${missing.length>1?'these columns':'this column'} (load the other upload to check), or write <code>${esc(missing[0])} | default(0) | float</code>.`);
  const seenF=new Set();
  for (const is of r.issues){ if (seenF.has(is.key)) continue; seenF.add(is.key); add(is.kind==='textnum'?'info':'warn', 'f:'+is.key, esc(is.msg).replace(/^(float|int|round|indian_comma|int_comma|format_date)\b/,'<code>$1</code>')); }
  const text=decodeXmlText(Object.values(r.xml).join(' ').replace(/<[^>]+>/g,' ')).replace(/\uE000\d+\uE001/g,'').replace(/\uE002/g,'');
  const ph=text.match(/\[[^\]\n]{2,40}\]|<<[^>\n]{1,40}>>|«[^»\n]{1,40}»|(?<![A-Za-z])X{4,}(?![A-Za-z])/g);
  if (ph) for (const x of [...new Set(ph)].slice(0,3)) add('warn','ph:'+x, `The letter still shows <code>${esc(x)}</code>. Tag it, or delete it if it isn't needed.`);
  if (/\{\{|\{%/.test(text)) add('error','lit','Some tag text prints as it is. A tag is probably mistyped or has curly quotes.');
  if (rowIdx!=null && csvRows()[rowIdx]){
    const row=csvRows()[rowIdx]; const cols=state.csv.headers.filter((h,k)=>/[&<>]/.test(row[k]||''));
    if (cols.length) add('info','amp:'+cols.join(','), `Values in ${cols.map(x=>'<code>'+esc(x)+'</code>').join(', ')} contain &amp;, &lt; or &gt;. The preview escapes them automatically; confirm CompUp does too (guide 11.3).`);
  }
  return out;
}
export function templateIdentifiers(){
  const set=new Map(); if (!state.built) return set; const locals=new Set();
  for (const p of state.built.an.paras){
    if (p.fallback) continue;
    for (const m of p.model.text.matchAll(RX_TAG)){
      const tag=m[0]; if (tag.startsWith('{#')) continue;
      const inner=tag.replace(/^\{[{%]-?|-?[}%]\}$/g,'').trim(); const kw=(inner.match(/^(\w+)/)||[])[1];
      if (tag.startsWith('{%')){ if (kw==='set'){ const v=(inner.match(/^set\s+(\w+)/)||[])[1]; if (v) locals.add(v); } if (kw==='for'){ const v=inner.match(/^for\s+(\w+)(?:\s*,\s*(\w+))?/)||[]; if (v[1]) locals.add(v[1]); if (v[2]) locals.add(v[2]); } }
      const expr=tag.startsWith('{%') ? inner.replace(/^(if|elif|for\s+\w+(?:\s*,\s*\w+)?\s+in|set\s+\w+\s*=)\s*/,'') : inner;
      if (/^(else|endif|endfor|raw|endraw)$/.test(expr)) continue;
      for (const id of identifiersIn(expr)){ if (id==='currentDatetime' || locals.has(id.split('.')[0]) || ['custom_schema','employee_schema'].includes(id)) continue; set.set(id,(set.get(id)||0)+1); }
    }
  }
  return set;
}
/* ======================= employee preview ======================= */
let pvToken=0, pvTimer=null;
export function schedulePreview(){ clearTimeout(pvTimer); pvTimer=setTimeout(refreshPreview, 200); }
export async function refreshPreview(){
  if (state.view!=='filled' || !state.an) return;
  const token=++pvToken; state.pv={...(state.pv||{}), loading:true}; notify();
  let next;
  try{
    const comp=await getCompiled();
    if (token!==pvToken) return;
    if (comp.error) next={an:null, issues:[], error:comp.error};
    else {
      const rows=csvRows(); const idx=rows.length?Math.min(state.pvIdx||0, rows.length-1):null;
      const info=buildCtx(idx); const r=renderEmployee(comp, info.ctx);
      const issues=employeeIssues(r, comp, info, csvKeyUniverse(), idx);
      let an=null, error=r.error;
      if (!error){ const pr=parseRendered(r.xml); if (pr.broken) error={msg:"The filled letter is damaged, so it can't be shown. This usually means an if and its end if sit in different parts of a table or paragraph."}; else an=buildModel(pr.docs); }
      const rank={error:0,warn:1,info:2};
      next={an, issues:issues.filter(x=>!(error && x.key==='xml')).sort((a,b)=>rank[a.level]-rank[b.level]), error, sampled:info.sampled, tags:comp.meta.tags, idCache:new Map()};
    }
  }catch(e){ next={an:null, issues:[], error:{msg:e.message}}; }
  if (token!==pvToken) return;
  state.pv={...next, loading:false};
  syncLogic(); notify();
}
// the employees whose label or any cell contains the search text (null = no search, everyone)
export const PV_MAX=3000;
export function pvMatches(rows){
  const q=String(state.pvQuery||'').trim().toLowerCase(); if (!q || !rows.length) return null;
  let c=state._pvText; if (!c || c.rows!==rows){ c={rows, text:rows.map((r,i)=>(empLabel(i)+' '+r.join(' ')).toLowerCase())}; state._pvText=c; }
  const out=[]; for (let i=0;i<rows.length;i++) if (c.text[i].includes(q)) out.push(i);
  return out;
}
// previous / next employee, within the search results when there is a search
export function pvStep(dir){
  const rows=csvRows(); if (!rows.length) return;
  const list=pvMatches(rows) || rows.map((_,i)=>i); if (!list.length) return;
  let k=list.indexOf(state.pvIdx); k = k<0 ? (dir>0?0:list.length-1) : (k+dir+list.length)%list.length;
  state.pvIdx=list[k]; refreshPreview(); if (state.tab==='export') notify();
}
export async function runBatch(){
  const rows=csvRows(); if (!rows.length){ toast('Load a CSV with one row per employee first.'); return; }
  let comp; try{ comp=await getCompiled(); }catch(e){ toast(e.message); return; }
  if (comp.error){ state.batch={error:comp.error}; notify(); return; }
  const B=state.batch={running:true, total:rows.length, done:0, groups:new Map(), perEmp:[], started:performance.now(), src:comp.src, cancel:false};
  notify(); const U=csvKeyUniverse();
  for (let i=0;i<rows.length;i++){
    if (B.cancel){ B.cancelled=true; break; }
    const info=buildCtx(i,{noOverrides:true}); const r=renderEmployee(comp, info.ctx);
    const issues=employeeIssues(r, comp, info, U, i);
    const seen=new Set(); let n=0;
    for (const is of issues){ if (seen.has(is.key)) continue; seen.add(is.key); if (is.level!=='info') n++; let g=B.groups.get(is.key); if (!g){ g={level:is.level, msg:is.msg, count:0, emps:[]}; B.groups.set(is.key,g); } g.count++; if (g.emps.length<5000) g.emps.push(i); }
    B.perEmp.push({i,n}); B.done=i+1;
    if (i%10===9){ notify(); await new Promise(res=>setTimeout(res,0)); if (state.batch!==B) return; }
  }
  B.running=false; B.ms=performance.now()-B.started; notify(); if (server.ok && !B.cancelled) await realBatch(B, rows);
}
// the same employees filled with real Jinja on this computer: anyone the letter can't be made for
export async function realBatch(B, rows){
  B.realRunning=true; notify();
  try{
    const emps=rows.slice(0,5000).map((r,i)=>({label:empLabel(i), values:buildCtx(i,{noOverrides:true}).ctx}));
    const j=await postValidate(await buildBlob(), emps);
    if (state.batch!==B) return;
    B.real=j;
    if (j.syntax && j.syntax.length){ B.realErr='the template has a typing mistake (see Template check above), so no employee could be filled.'; }
    for (const f of (j.employees&&j.employees.failed)||[]){
      const key='real:'+f.friendly+'|'+(f.tag||'');
      let g=B.groups.get(key);
      if (!g){ g={level:'error', real:true, msg:`${esc(f.friendly)}${f.tag?` <code>${esc(f.tag)}</code>`:''}`, count:0, emps:[], tag:f.tag, name:f.name}; B.groups.set(key,g); }
      g.count++; if (g.emps.length<5000) g.emps.push(f.index);
      const pe=B.perEmp.find(x=>x.i===f.index); if (pe) pe.n++;
    }
  }catch(e){ if (state.batch===B) B.realErr=e.message||String(e); }
  finally{ if (state.batch===B){ B.realRunning=false; notify(); } }
}
/* ---- what "Test every employee" shows (new: the data half of the old renderBatch / batchTableHtml; no HTML) ----
   status: none (not run) | error (the template can't be filled) | running | done */
export function batchView(){
  const rows=csvRows(); const B=state.batch; const f=state.dataFilter;
  const out={rows:rows.length, src:null, noRowsText: state.csv && !rows.length ? `Your data file (${state.csv.name}) has no employee rows. Load a CSV or Excel file with one row per employee.` : 'Load a CSV or Excel file with one row per employee to run this test.',
    status:'none', running:false, stats:'', error:null, progress:{done:0, total:0, pct:0}, done:null};
  if (rows.length){ const total=state.csv.rows.length; out.src={name:state.csv.name, count:rows.length, of: f&&f.col&&total!==rows.length ? total : 0, filter: f&&f.col&&total!==rows.length ? {col:f.col, value:f.value} : null}; }
  if (!B) return out;
  if (B.error){ out.status='error'; out.error={msg:B.error.msg, tag:B.error.tag||''}; return out; }
  out.progress={done:B.done, total:B.total, pct:B.total?100*B.done/B.total:0};
  if (B.running){ out.status='running'; out.running=true; return out; }
  out.status='done';
  const bad=B.perEmp.filter(x=>x.n>0).length, ok=B.done-bad;
  out.stats=`${ok} fine · ${bad} to look at`;
  const rank={error:0,warn:1,info:2}; const lab={error:'Fix',warn:'Check',info:'Note'};
  const groups=[...B.groups.values()].sort((a,b)=>rank[a.level]-rank[b.level] || (b.real?1:0)-(a.real?1:0) || b.count-a.count).map(g=>({
    level:g.level, label:lab[g.level], real:!!g.real, count:g.count, html:g.msg, text:decodeXmlText(String(g.msg).replace(/<[^>]+>/g,'')),
    fixDefault: g.real && g.name && g.tag && new RegExp(`${escRe(g.name)}\\s*\\|\\s*(float|int)\\b`).test(g.tag) ? g.name : '',
    chips: g.real ? placeChips(locateTags(g.tag?[g.tag]:templateTagsWith(g.name),4)) : [],
  }));
  let real={kind:'none', text:''};
  if (server.ok){
    if (B.realRunning) real={kind:'busy', text:'Now filling the same employees with real Jinja…'};
    else if (B.realErr) real={kind:'error', text:`Real Jinja check didn't finish: ${B.realErr}`};
    else if (B.real && B.real.employees){ const n=new Set(B.real.employees.failed.map(x=>x.index)).size;
      real = n ? {kind:'failed', text:`Real Jinja (the engine CompUp uses) can't make the letter for ${n} employee${n>1?'s':''}; marked "Real Jinja" below.`} : {kind:'passed', text:`Real Jinja (the engine CompUp uses) filled the letter for all ${B.real.employees.tested} employees.`}; }
    else if (B.cancelled) real={kind:'none', text:''};
    else real={kind:'busy', text:'Waiting for the real Jinja check…'};
  }
  const only = bad>0 && (state.batchOnlyBad===undefined ? true : !!state.batchOnlyBad);
  // never "all clear" unless it is true: nobody has a problem, the run finished, the template hasn't changed and real Jinja filled everyone.
  // Without the back end (claude.ai) a clean run is reported as what it is: the page's own engine only (pageOnly).
  const clear = bad===0 && !B.cancelled && !B.stale;
  const confirmed = server.ok ? real.kind==='passed' : false;
  out.done={ok, bad, total:B.done, seconds:(B.ms||0)/1000, cancelled:!!B.cancelled, stale:!!B.stale, groups, real, only, hasProblems:bad>0, canDownload:groups.length>0,
    allClear: clear && server.ok && confirmed, confirmed, pageOnly: clear && !server.ok,
    list:(only ? B.perEmp.filter(x=>x.n>0) : B.perEmp).map(x=>({i:x.i, n:x.n, label:empLabel(x.i)}))};
  return out;
}
export function batchCsv(){ const B=state.batch; const lines=[['Employee','CSV row','Level','Issue']]; for (const g of B.groups.values()) for (const i of g.emps) lines.push([empLabel(i), i+2, g.level, decodeXmlText(g.msg.replace(/<[^>]+>/g,''))]); return '﻿'+lines.map(l=>l.map(csvCell).join(',')).join('\r\n'); }
// the list of values behind the preview (was drawn by renderPvPanel): one line per field the template uses
export function previewValues(){
  const rows=csvRows(); const ids=[...templateIdentifiers().keys()].sort();
  const {ctx, sampled, fromCsv}=buildCtx(rows.length?(state.pvIdx||0):null);
  return {rows:ids.map(id=>{
    const v=getPath(ctx,id); const ov=Object.prototype.hasOwnProperty.call(state.previewOverrides,id);
    const source = ov?'changed':fromCsv.has(id)?'data':sampled.has(id)?'sample':v===undefined?'notset':'set';
    return {id, value: v==null||typeof v==='object'?'':String(v), source};
  })};
}
// what one placeholder's tag gives for one employee (or made-up sample values), from the same preview engine as the letter
// (was updateTagPreview). kind: off | none | value | empty | error
export async function previewTag(r){
  const tag=finalTag(r);
  const rows=csvRows(); const idx=rows.length ? Math.min(state.pvIdx||0, rows.length-1) : null;
  const heading = idx!=null ? `Preview for ${empLabel(idx)}` : 'Preview';
  if (!r.enabled) return {heading, kind:'off', text:r.find, note:'This text is not included, so it stays as typed in the letter.'};
  if (!tag) return {heading, kind:'none', text:'Choose a field to see a value.', note:''};
  if (tagProblem(tag)) return {heading, kind:'none', text:'Fix the tag to see a value.', note:''};
  const {ctx, sampled, fromCsv}=buildCtx(idx);
  const toks=tag.replace(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"/g,' ').match(/[A-Za-z_][\w.]*/g)||[];
  const nSamp=toks.filter(t=>sampled.has(t)).length, nCsv=toks.filter(t=>fromCsv.has(t)).length;
  const hasOver=toks.some(t=>Object.prototype.hasOwnProperty.call(state.previewOverrides||{}, t));
  let note = idx==null ? 'Sample value (made up)' : hasOver ? 'Value you set in the employee preview' : nSamp && nCsv ? 'Includes a sample value (made up)' : nSamp ? 'Sample value (made up)' : nCsv ? `From ${(state.csv&&state.csv.name)||'your data file'}, ${empLabel(idx)}` : '';
  const text=unicodeEscapes(straighten(tag));
  try{
    const nj=await loadEngine(); getEnv(nj);
    const tpl=new nj.Template(text, rt.ENV, 'tag', true);
    rt.issues=[]; let out, issues; try{ out=tpl.render(ctx); } finally { issues=rt.issues||[]; rt.issues=null; }
    out=decodeXmlText(out);
    const m1=tag.match(/^\{\{-?([\s\S]*?)-?\}\}$/); if (m1 && /^-?\d+$/.test(out.trim()) && pyResultType(m1[1])==='float') out=out.trim()+'.0';
    const iss=issues.length ? ` Note: ${issues[0].msg}.` : '';
    return {heading, kind: out.trim()==='' ? 'empty' : 'value', text: out.trim()==='' ? 'Empty for this employee' : out, note:note+iss, warn:!!iss};
  }catch(e){
    const em=String((e&&e.message)||e); const msg=/preview engine/i.test(em) ? em : /\[Line \d+/.test(em) ? describeEngineError(e, text, 'tag').msg : "This tag can't be previewed yet. Check it for typing mistakes.";
    return {heading, kind:'error', text:msg, note};
  }
}
// the employee picker: the label list is long, so the UI shows a window of it (PV_MAX) around the current one
export function previewPicker(){
  const rows=csvRows(); const m=pvMatches(rows); const list=m || rows.map((_,i)=>i);
  const shown=list.slice(0,PV_MAX); if (rows.length && !shown.includes(state.pvIdx) && list.includes(state.pvIdx)) shown.push(state.pvIdx);
  const pos=list.indexOf(state.pvIdx);
  return {rows:rows.length, matches:m?m.length:null, list, shown, pos, canStep: rows.length>1 && list.length>1};
}
