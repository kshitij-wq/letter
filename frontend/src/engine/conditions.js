// Moved from frontend_src/letter-tagger.html — see tests_ui/legacy for the reference page. No DOM rendering in this module.
import { CAT } from './catalog.js'
import { squash, tagSyntaxProblem } from './checks.js'
import { buildCtx, csvRows, empLabel, getPath } from './data.js'
import { cloneParaWithText } from './docx.js'
import { quoteJ, sourceEdit } from './edits.js'
import { emit, notify, toast } from './events.js'
import { fixTags } from './fixes.js'
import { cleanCondExpr, esc, straighten } from './helpers.js'
import { addLogic, afterLogicChange, computeLogic, logicTpl, normalizeLogicText, showPid } from './logic.js'
import { decodeXmlText, describeEngineError, unicodeEscapes } from './pipeline.js'
import { getEnv, loadEngine, rt } from './preview.js'
import { state } from './state.js'
import { setView } from './steps.js'
import { recordUndo } from './undo.js'

/* ======================= change an existing condition ======================= */

export const COND_TAG_RX=/^(\{%-?\s*(?:p\s+)?(?:if|elif)\s+)([\s\S]*?)(\s*-?%\})$/;
export function saveCondEdit(){
  const ce=state.condEdit; if (!ce) return;
  const expr=cbExpr(state.cb);
  if (!expr){ toast('Pick a field, a test and a value first.'); return; }
  const why=tagSyntaxProblem(`{% if ${expr} %}`); if (why){ toast(why); return; }
  if (!COND_TAG_RX.test(straighten(ce.tag))){ toast("This tag can't be changed here; edit it in the Conditions step."); return; }
  const en=cbEnglish(state.cb); const said=en?`: now shown when ${en}`:'';
  const swap=t=>t.replace(COND_TAG_RX, (m,a,b,c)=>a+expr+c);
  if (ce.src==='you'){
    const l=state.logic.find(x=>x.id===ce.id); if (!l){ state.condEdit=null; notify(); return; }
    recordUndo();
    if (l.place==='at') l.text=String(l.text).split(ce.tag).join(swap(straighten(ce.tag)));
    else l.text=swap(normalizeLogicText(l.text));
    state.condEdit=null; state.cb=null; notify(); afterLogicChange(); toast(`Changed the condition${said}.`);
    return;
  }
  state.condEdit=null; state.cb=null;
  const target=squash(ce.tag);
  fixTags(t=>squash(t)===target ? swap(t) : t, n=>`Changed the condition${n>1?` in ${n} places (the same tag was used ${n} times)`:''}${said}.`);
  notify();
}
/* ======================= condition builder ======================= */
// Field · test · value rows joined by and / or. Writes the condition the CompUp way
// (text compared lower-case and trimmed, numbers through | float with a default), and reads
// those conditions back so they can be edited and described in plain words.
export const CB_OPS=[
  ['is','is'],['isnot','is not'],['in','is one of'],['notin','is not one of'],['has','contains'],
  ['gt','is more than'],['ge','is at least'],['lt','is less than'],['le','is at most'],['eqn','equals (number)'],['nen','is not (number)'],
  ['empty','is empty'],['filled','has a value'],
];
export const CB_NOVAL=new Set(['empty','filled']);
export const CB_NUM={gt:'>', ge:'>=', lt:'<', le:'<=', eqn:'==', nen:'!='};
export const CB_NUM_REV=Object.fromEntries(Object.entries(CB_NUM).map(([k,v])=>[v,k]));
export function cbList(v){ return String(v??'').split(',').map(x=>x.trim()).filter(Boolean); }
export function cbNum(v){ const t=String(v??'').replace(/[,\s₹]/g,''); if (!t) return null; const n=Number(t); return Number.isFinite(n)?n:null; }
export function cbBlank(field=''){ return {field, op: field && cbIsNumeric(field) ? 'gt' : 'is', value:''}; }
export function cbNew(expr){ state.cbNote=''; if (expr){ const p=cbParse(expr); if (p) return p; return {rules:[cbBlank()], join:'and', raw:cleanCondExpr(expr)}; } return {rules:[cbBlank()], join:'and', raw:null}; }
export function cbRuleExpr(r){
  const f=String(r.field||'').trim(); if (!/^[A-Za-z_][\w.]*$/.test(f)) return '';
  const v=String(r.value??'').trim(); const T=`${f} | string | lower | trim`;
  switch(r.op){
    case 'is': case 'isnot': return v ? `${T} ${r.op==='is'?'==':'!='} ${quoteJ(v.toLowerCase())}` : '';
    case 'in': case 'notin': { const vs=cbList(v).map(x=>x.toLowerCase()); if (!vs.length) return ''; return vs.length===1 ? `${T} ${r.op==='in'?'==':'!='} ${quoteJ(vs[0])}` : `${T} ${r.op==='in'?'in':'not in'} [${vs.map(quoteJ).join(', ')}]`; }
    case 'has': return v ? `${quoteJ(v.toLowerCase())} in (${T})` : '';
    case 'empty': return `(${f} | default('', true) | string | trim) == ""`;
    case 'filled': return `(${f} | default('', true) | string | trim) != ""`;
  }
  // numbers: uploads are text and may have commas (12,00,000), so strip them before | float
  if (CB_NUM[r.op]){ const n=cbNum(v); return n==null ? '' : `(${f} | default(0) | string | replace(",", "") | float) ${CB_NUM[r.op]} ${n}`; }
  return '';
}
export function cbExpr(cb){
  if (!cb) return '';
  if (cb.raw!=null) return cleanCondExpr(cb.raw);
  const parts=cb.rules.map(cbRuleExpr).filter(Boolean);
  return parts.join(` ${cb.join} `);
}
export function cbFieldLabel(f){ const c=CAT[f]; if (c) return c.label; return String(f||'').replace(/^(custom_schema|employee_schema|emp_variable_plan_formula)\./,'').replace(/_/g,' '); }
export function cbRuleEnglish(r){
  const F=cbFieldLabel(r.field); const v=String(r.value??'').trim(); const q=x=>`“${x}”`;
  switch(r.op){
    case 'is': return `${F} is ${q(v)}`; case 'isnot': return `${F} is not ${q(v)}`;
    case 'in': return `${F} is ${cbList(v).map(q).join(' or ')}`; case 'notin': return `${F} is not ${cbList(v).map(q).join(' or ')}`;
    case 'has': return `${F} contains ${q(v)}`; case 'empty': return `${F} is empty`; case 'filled': return `${F} has a value`;
    case 'gt': return `${F} is more than ${v}`; case 'ge': return `${F} is at least ${v}`; case 'lt': return `${F} is less than ${v}`; case 'le': return `${F} is at most ${v}`;
    case 'eqn': return `${F} is ${v}`; case 'nen': return `${F} is not ${v}`;
  }
  return '';
}
export function cbEnglish(cb){ if (!cb) return ''; if (cb.raw!=null){ const p=cbParse(cb.raw); return p?cbEnglish(p):''; } const ok=cb.rules.filter(r=>cbRuleExpr(r)); return ok.map(cbRuleEnglish).join(cb.join==='or'?', or ':', and '); }
export function condEnglish(expr){ const p=cbParse(expr); return p ? cbEnglish(p) : ''; }
// split a condition on a top-level and / or (not inside quotes or brackets)
export function splitTop(e, word){
  const out=[]; let depth=0, q='', cur=''; const w=' '+word+' ';
  for (let i=0;i<e.length;i++){
    const ch=e[i];
    if (q){ cur+=ch; if (ch==='\\'){ cur+=e[++i]||''; continue; } if (ch===q) q=''; continue; }
    if (ch==='"' || ch==="'"){ q=ch; cur+=ch; continue; }
    if ('([{'.includes(ch)) depth++; else if (')]}'.includes(ch)) depth--;
    if (!depth && e.startsWith(w, i)){ out.push(cur); cur=''; i+=w.length-1; continue; }
    cur+=ch;
  }
  out.push(cur); return out.map(x=>x.trim()).filter(Boolean);
}
export function splitCommas(t){ const out=[]; let q='', cur=''; for (let i=0;i<t.length;i++){ const ch=t[i]; if (q){ cur+=ch; if (ch==='\\'){ cur+=t[++i]||''; continue; } if (ch===q) q=''; continue; } if (ch==='"'||ch==="'"){ q=ch; cur+=ch; continue; } if (ch===','){ out.push(cur); cur=''; continue; } cur+=ch; } out.push(cur); return out.map(x=>x.trim()).filter(Boolean); }
export function cbUnquote(lit){ const m=String(lit).trim().match(/^"((?:\\.|[^"\\])*)"$|^'((?:\\.|[^'\\])*)'$/); if (!m) return null; return (m[1]??m[2]).replace(/\\u([0-9a-fA-F]{4})/g,(x,h)=>String.fromCharCode(parseInt(h,16))).replace(/\\(.)/g,'$1'); }
export function cbStrip(e){ e=e.trim(); while (e.startsWith('(') && e.endsWith(')')){ let d=0, ok=true; for (let i=0;i<e.length;i++){ if (e[i]==='(') d++; else if (e[i]===')'){ d--; if (!d && i<e.length-1){ ok=false; break; } } } if (!ok) break; e=e.slice(1,-1).trim(); } return e; }
export const CB_F='([A-Za-z_][\\w.]*)';
export const CB_TXT=`\\(?\\s*${CB_F}((?:\\s*\\|\\s*(?:string|lower|trim|upper))*)\\s*\\)?`;
export const CB_LIT=`("(?:\\\\.|[^"\\\\])*"|'(?:\\\\.|[^'\\\\])*')`;
export function cbParseRule(p){
  const e=cbStrip(p); let m;
  if ((m=e.match(new RegExp(`^${CB_TXT}\\s*(==|!=)\\s*${CB_LIT}$`)))) return {field:m[1], op:m[3]==='=='?'is':'isnot', value:cbUnquote(m[4])};
  if ((m=e.match(new RegExp(`^${CB_TXT}\\s+(not in|in)\\s*\\[([^\\]]*)\\]$`)))){ const items=splitCommas(m[4]).map(x=>cbUnquote(x)??x); if (!items.length) return null; return {field:m[1], op:m[3]==='in'?'in':'notin', value:items.join(', ')}; }
  if ((m=e.match(new RegExp(`^${CB_LIT}\\s+in\\s+${CB_TXT}$`)))) return {field:m[2], op:'has', value:cbUnquote(m[1])};
  if ((m=e.match(new RegExp(`^\\(?\\s*${CB_F}\\s*\\|\\s*default\\([^)]*\\)(?:\\s*\\|\\s*string)?\\s*\\|\\s*trim\\s*\\)?\\s*(==|!=)\\s*(""|'')$`)))) return {field:m[1], op:m[2]==='=='?'empty':'filled', value:''};
  if ((m=e.match(new RegExp(`^\\(?\\s*${CB_F}(?:\\s*\\|\\s*default\\([^)]*\\))?(?:\\s*\\|\\s*string)?(?:\\s*\\|\\s*replace\\(\\s*(?:","|',')\\s*,\\s*(?:""|'')\\s*\\))?\\s*\\|\\s*(?:float|int)(?:\\(\\s*0?\\s*\\))?\\s*\\)?\\s*(>=|<=|==|!=|>|<)\\s*(-?\\d+(?:\\.\\d+)?)$`)))) return {field:m[1], op:CB_NUM_REV[m[2]], value:m[3]};
  if ((m=e.match(new RegExp(`^${CB_F}$`))) && !/^(true|false|none|not)$/i.test(m[1])) return {field:m[1], op:'filled', value:''};
  if ((m=e.match(new RegExp(`^not\\s+${CB_F}$`)))) return {field:m[1], op:'empty', value:''};
  return null;
}
export function cbParse(expr){
  const e=cbStrip(cleanCondExpr(expr||'')); if (!e) return null;
  const ors=splitTop(e,'or'), ands=splitTop(e,'and');
  if (ors.length>1 && ands.length>1) return null;
  const join=ors.length>1?'or':'and'; const parts=ors.length>1?ors:ands;
  const rules=parts.map(cbParseRule); if (rules.some(r=>!r)) return null;
  return {rules, join, raw:null};
}
// every employee's values, made once per data file
export function allCtx(){
  const key=[state.csv, (state.csvExtra||[]).length, JSON.stringify(state.settings), state.dataFilter?state.dataFilter.col+'='+state.dataFilter.value:''];
  const c=state._ctxCache; if (c && c.key.every((x,i)=>x===key[i])) return c.list;
  const rows=csvRows(); const list=rows.slice(0,3000).map((r,i)=>buildCtx(i,{noOverrides:true}).ctx);
  state._ctxCache={key, list}; return list;
}
export function cbValues(field){
  const f=String(field||'').trim(); if (!f || !csvRows().length) return [];
  // conditions ignore case, so "Yes" and "yes" are one value
  const cnt=new Map(); for (const c of allCtx()){ const v=getPath(c,f); if (v===undefined || (v!==null && typeof v==='object')) continue; const t=String(v??'').trim(); const k=t.toLowerCase(); const e=cnt.get(k)||{n:0, forms:new Map()}; e.n++; e.forms.set(t,(e.forms.get(t)||0)+1); cnt.set(k,e); }
  const list=[...cnt.values()].map(e=>({v:[...e.forms.entries()].sort((a,b)=>b[1]-a[1])[0][0], n:e.n})).sort((a,b)=>(a.v==='')-(b.v==='') || b.n-a.n || a.v.localeCompare(b.v));
  if (list.length>25 && list.filter(x=>cbNum(x.v)!=null).length>list.length*0.8) return [];
  return list.slice(0,12);
}
export function cbIsNumeric(field){ const vals=cbValues(field).filter(x=>x.v!==''); if (vals.length<2) return false; return vals.every(x=>cbNum(x.v)!=null) && !vals.every(x=>/^[01]$/.test(x.v)); }
// the condition as a tiny template that prints 1 when the letter would show and 0 when not
export function condTemplate(expr){ return unicodeEscapes(straighten(`{% if ${decodeXmlText(expr)} %}`))+'1{% else %}0{% endif %}'; }
export async function cbCount(expr){
  const rows=csvRows(); if (!rows.length || !expr) return null;
  const nj=await loadEngine(); getEnv(nj);
  let t; try{ t=new nj.Template(condTemplate(expr), rt.ENV, 'condition', true); }catch(e){ return {error:true}; }
  let n=0, m=0; for (const c of allCtx()){ try{ if (t.render(c).trim()==='1') n++; m++; }catch(e){ return {error:true}; } }
  return {n, total:m, more:rows.length>m};
}
export const CB_KW=new Set(['and','or','not','in','is','if','else','true','false','none','True','False','None']);
// colours for the Jinja editor: strings, numbers, filters after |, keywords, field names
export function cbHl(src){
  let out='', last=0; const rx=/("(?:\\.|[^"\\])*"?|'(?:\\.|[^'\\])*'?)|(\|\s*)([A-Za-z_]\w*)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_][\w.]*)/g; let m;
  while ((m=rx.exec(src))){
    out+=esc(src.slice(last, m.index)); last=rx.lastIndex;
    if (m[1]) out+=`<span class="tk-str">${esc(m[1])}</span>`;
    else if (m[3]) out+=`${esc(m[2])}<span class="tk-fn">${esc(m[3])}</span>`;
    else if (m[4]) out+=`<span class="tk-num">${esc(m[4])}</span>`;
    else out+=`<span class="${CB_KW.has(m[5])?'tk-kw':/^\s*\(/.test(src.slice(last,last+3))?'tk-fn':'tk-field'}">${esc(m[5])}</span>`;
  }
  out+=esc(src.slice(last));
  return out + (src.endsWith('\n')?' ':'');
}
export function cbHandOk(raw){ return !String(raw||'').trim() || !!cbParse(raw); }
// Does the condition show the letter to this employee? Same engine and same test as the count.
export async function cbEmployee(expr){
  const rows=csvRows(); const idx=rows.length ? Math.min(state.pvIdx||0, rows.length-1) : null;
  const who = rows.length ? empLabel(idx) : 'sample employee (made-up values)';
  const src=condTemplate(expr);
  try{
    const nj=await loadEngine(); getEnv(nj);
    const t=new nj.Template(src, rt.ENV, 'condition', true);
    return {who, shown:t.render(buildCtx(idx).ctx).trim()==='1'};
  }catch(e){ return {who, error:describeEngineError(e, src, 'condition').msg}; }
}
// "Show these paragraphs only when …": if before the first, end if after the last, optional else text

export function startCondEdit(key){
  computeLogic(); const e=state.lg.find(x=>x.key===key);
  if (!e || !(e.kw==='if' || e.kw==='elif')){ toast('Only if and else if tags have a condition to change.'); return; }
  state.condEdit={key, kw:e.kw, tag:e.text, src:e.src, id:e.id, pid:e.pid};
  state.cb=cbNew(e.expr); state.sel={pids:[],anchor:null,text:''}; state.closing=null; state.inlineUi=null; state.switchUi=null; state.placing=null;
  if (state.view!=='source') setView('source');
  notify(); showPid(e.pid); emit('reveal', {panel:'selTools'});
}
// "Show these paragraphs only when …": if before the first, end if after the last, optional else text.
// Reads the selection and the builder from state (state.sel, state.cb); otherText is the "Otherwise" box, one paragraph per line.
export function applyParaCondition(otherText){
  const expr=cbExpr(state.cb);
  if (!expr){ toast('Pick a field, a test and a value first.'); return; }
  const why=tagSyntaxProblem(`{% if ${expr} %}`); if (why){ toast(why); return; }
  const ps=state.sel.pids.map(id=>state.an.byPid.get(id)).filter(Boolean).sort((a,b)=>a.order-b.order); if (!ps.length) return;
  const first=ps[0], last=ps[ps.length-1];
  if (first.el.parentNode!==last.el.parentNode){ toast('The first and last paragraphs are in different places (e.g. different table cells). Select paragraphs that sit together.'); return; }
  const other=String(otherText||'').split(/\n+/).map(x=>x.trim()).filter(Boolean);
  const en=cbEnglish(state.cb);
  const done=()=>{ state.cb=null; toast(en?`Added: shown only when ${en}${other.length?', otherwise the other text':''}.`:'Added the condition.'); };
  if (!other.length){
    recordUndo(); addLogic(first.pid,'before',logicTpl('if',expr)); addLogic(last.pid,'after',logicTpl('endif'));
    state.sel={pids:[],anchor:null,text:''}; notify(); afterLogicChange(); done(); return;
  }
  const res=sourceEdit((docs,H)=>{
    const fe=H.pEl(first.pid), le=H.pEl(last.pid); if (!fe || !le) return {cancel:true};
    const doc=le.ownerDocument; let cursor=le; const made=[];
    for (const line of other){ const p=cloneParaWithText(doc, le, line); cursor.parentNode.insertBefore(p, cursor.nextSibling); cursor=p; made.push(p); }
    return {newLogic:[{el:fe, place:'before', text:logicTpl('if',expr)}, {el:made[0], place:'before', text:logicTpl('else')}, {el:cursor, place:'after', text:logicTpl('endif')}], typedEls:made};
  });
  if (!res.cancel) done();
}
