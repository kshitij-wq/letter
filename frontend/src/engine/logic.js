// Moved from frontend_src/letter-tagger.html — see tests_ui/legacy for the reference page. No DOM rendering in this module.
import { blockCountsNow } from './blocks.js'
import { build } from './build.js'
import { rowPair } from './checks.js'
import { condEnglish } from './conditions.js'
import { RX_TAG } from './detect.js'
import { makeRunLike, makeTagPara } from './docx.js'
import { emit, notify, toast } from './events.js'
import { ancestor, isW, straighten, straightenTags } from './helpers.js'
import { state } from './state.js'
import { appendTagRun } from './tables.js'

/* ======================= logic tags (if / elif / else / endif placed anywhere) ======================= */
export const LOGIC_QUICK = [
  {k:'if', label:'if'}, {k:'elif', label:'else if'}, {k:'else', label:'else'}, {k:'endif', label:'end if'},
  {k:'set', label:'set'}, {k:'for', label:'for'}, {k:'endfor', label:'end for'},
];
export const PLACES=[['before','New line before'],['after','New line after'],['start','Start of paragraph'],['end','End of paragraph']];
export const PLACE_RANK={before:0, start:0.5, end:2.5, after:3};
export const PLACE_SHORT={before:'line before', after:'line after', start:'start of paragraph', end:'end of paragraph'};
export function logicTpl(kw, expr){
  const e=(expr||'').trim()||'CONDITION';
  switch(kw){
    case 'if': return `{% if ${e} -%}`;
    case 'elif': return `{%- elif ${e} -%}`;
    case 'else': return '{%- else -%}';
    case 'endif': return '{%- endif %}';
    case 'for': return `{% for ${expr&&expr.trim()?expr.trim():'item in items'} -%}`;
    case 'endfor': return '{%- endfor %}';
    case 'set': return `{% set ${expr&&expr.trim()?expr.trim():'name = value'} %}`;
  }
  return `{% ${e} %}`;
}
export function parseLogic(text){ const m=String(text||'').trim().match(/^\{%-?\s*(\w+)\b([\s\S]*?)-?%\}$/); return m?{kw:m[1].toLowerCase(), expr:m[2].trim()}:{kw:'', expr:''}; }
export function normalizeLogicText(t){
  t=straighten(String(t||'')).trim(); if (!t) return '';
  if (/^\{%/.test(t)) return /%\}$/.test(t) ? t : t+' %}';
  const m=t.match(/^(else\s*if|elif|if|else|end\s*if|endif|end\s*for|endfor|for|set)\b\s*([\s\S]*)$/i);
  if (m){ let kw=m[1].toLowerCase().replace(/\s+/g,''); if (kw==='elseif') kw='elif'; return logicTpl(kw, m[2]); }
  return `{% ${t} %}`;
}
export function logicEntries(an){
  an=an||state.an; const out=[]; const kinds=new Set(['body','header','footer']);
  for (const p of an.paras){
    if (p.fallback || !kinds.has(p.kind)) continue;
    for (const m of p.model.text.matchAll(RX_TAG)){ if (!m[0].startsWith('{%')) continue; out.push({src:'doc', key:'d:'+p.pid+':'+m.index, pid:p.pid, path:p.path, order:p.order, rank:1+m.index/1e6, text:m[0], full:m[0], p}); }
  }
  state.logic.forEach((l,i)=>{
    const p=an.byPid.get(l.pid); if (!p) return;
    if (l.place==='at'){
      const base=1+(l.offset||0)/1e6-1e-8;
      const tags=[...String(l.text).matchAll(RX_TAG)].filter(m=>m[0].startsWith('{%'));
      if (!tags.length){ out.push({src:'you', key:l.id, id:l.id, sub:0, pid:l.pid, path:p.path, order:p.order, rank:base+i*1e-13, text:l.text, full:l.text, place:'at', offset:l.offset, p}); return; }
      tags.forEach((m,k)=>out.push({src:'you', key:l.id+(k?'#'+k:''), id:l.id, sub:k, pid:l.pid, path:p.path, order:p.order, rank:base+(k+1)*1e-10+i*1e-13, text:m[0], full:l.text, place:'at', offset:l.offset, p}));
      return;
    }
    const t=normalizeLogicText(l.text);
    out.push({src:'you', key:l.id, id:l.id, sub:0, pid:l.pid, path:p.path, order:p.order, rank:PLACE_RANK[l.place]+i/1e6, text:t, full:t, place:l.place, p});
  });
  out.sort((a,b)=>a.order-b.order || a.rank-b.rank);
  let stack=[], path=null;
  const closeOut=()=>{ for (const e of stack) e.status='open'; stack=[]; };
  for (const e of out){
    if (e.path!==path){ closeOut(); path=e.path; }
    const {kw,expr}=parseLogic(e.text); e.kw=kw; e.expr=expr; e.cell=ancestor(e.p.el,['tc']); e.status='ok';
    if (kw==='raw' || kw==='endraw' || kw==='set' || !kw){ e.depth=stack.length; continue; }
    if (kw==='if' || kw==='for'){ e.depth=stack.length; stack.push(e); }
    else if (kw==='elif' || kw==='else'){ const top=stack[stack.length-1]; if (!top || top.kw!=='if'){ e.status='stray'; e.depth=stack.length; } else { e.depth=stack.length-1; e.opener=top; } }
    else if (kw==='endif' || kw==='endfor'){
      const want=kw==='endif'?'if':'for'; const top=stack[stack.length-1];
      if (!top || top.kw!==want){ e.status='stray'; e.depth=stack.length; }
      else { stack.pop(); e.depth=stack.length; e.opener=top; top.closer=e;
        if ((top.cell||e.cell) && top.cell!==e.cell && !rowPair(top.cell,e.cell)){ e.status='cells'; top.status='cells'; } }
    } else e.depth=stack.length;
  }
  closeOut();
  return out;
}
export function logicRails(entries, an){
  an=an||state.an; const map=new Map(); let stack=[], i=0, path=null; const kinds=new Set(['body','header','footer']);
  const branch=new Map();   // the branch each open if is in now: '' (the if itself), 'elif' or 'else'
  const apply=e=>{ if (e.kw==='if'||e.kw==='for'){ stack.push(e); branch.set(e,''); } else if ((e.kw==='elif'||e.kw==='else') && stack.length && stack[stack.length-1].kw==='if') branch.set(stack[stack.length-1], e.kw); else if ((e.kw==='endif'&&stack.length&&stack[stack.length-1].kw==='if') || (e.kw==='endfor'&&stack.length&&stack[stack.length-1].kw==='for')) stack.pop(); };
  for (const p of an.paras){
    if (p.fallback || !kinds.has(p.kind)) continue;
    if (p.path!==path){ stack=[]; path=p.path; }
    while (i<entries.length && (entries[i].order<p.order || (entries[i].order===p.order && entries[i].rank<1))){ if (entries[i].path===p.path) apply(entries[i]); i++; }
    if (stack.length) map.set(p.pid, {depth:stack.length, open:stack.some(e=>e.status==='open'), top:stack[stack.length-1], branch:branch.get(stack[stack.length-1])||''});
    while (i<entries.length && entries[i].order===p.order){ apply(entries[i]); i++; }
  }
  return map;
}
export function openStackAt(pid, entries){
  const p=state.an.byPid.get(pid); const stack=[];
  for (const e of entries){
    if (e.order>p.order) break;
    if (e.path!==p.path) continue;
    if (e.kw==='if'||e.kw==='for') stack.push(e);
    else if ((e.kw==='endif'||e.kw==='endfor') && stack.length) stack.pop();
  }
  return stack;
}
export function snippet(p, n=60){ const t=(p && p.model.text || '').replace(/\s+/g,' ').trim(); return t.length>n ? t.slice(0,n)+'…' : (t || 'empty line'); }
export function pageLabel(p){ if (!p) return ''; if (p.kind==='header') return 'Header'; if (p.kind==='footer') return 'Footer'; return p.page ? `p.${p.page}` : ''; }
export function computeLogic(){ state.lg = logicEntries(); state.lgRails = logicRails(state.lg); }
// status, problem label and plain-English reading of one logic tag: the margin lines and the Conditions list say the same
export function lgInfo(e){
  const subs=e.src==='you' ? state.lg.filter(x=>x.id===e.id) : [e];
  const stt=(subs.find(x=>x.status!=='ok')||{}).status||'ok';
  const isCond=e.kw==='if' || e.kw==='elif';
  return {st: stt==='ok'?'':' st-'+stt, isCond, en: isCond ? condEnglish(e.expr) : '', lead: e.kw==='elif' ? 'Else, shown when' : 'Shown when',
    label: stt==='open' ? 'Not closed' : stt==='stray' ? `No matching ${e.kw==='endfor'||e.kw==='for'?'for':'if'}` : stt==='cells' ? 'Different cells' : ''};
}
export function addLogic(pid, place, text, extra){
  const t=normalizeLogicText(text); if (!t) return null;
  const id='l'+Date.now().toString(36)+Math.random().toString(36).slice(2,5);
  state.logic.push({id, pid, place, text:t, ...(extra||{})});
  return id;
}
export function afterLogicChange(msg){
  syncLogic(); build();
  const open=state.lg.filter(e=>e.status==='open');
  if (msg) toast(open.length ? `${msg} ${open.length} block${open.length>1?'s are':' is'} still open; add ${open.length>1?'their':'its'} end if where it should stop.` : msg);
}
export function applyLogic(docs, an){
  const groups=new Map(); for (const l of state.logic){ if (!groups.has(l.pid)) groups.set(l.pid, []); groups.get(l.pid).push(l); }
  let n=0;
  for (const [pid, list] of groups){
    const a=an.byPid.get(pid); if (!a) continue; const doc=docs[a.path]; const p=a.el;
    for (const l of list.filter(x=>x.place==='before')){ p.parentNode.insertBefore(makeTagPara(doc,p,normalizeLogicText(l.text)), p); n++; }
    let ref=p; for (const l of list.filter(x=>x.place==='after')){ const np=makeTagPara(doc,p,normalizeLogicText(l.text)); ref.parentNode.insertBefore(np, ref.nextSibling); ref=np; n++; }
    const firstContent=[...p.childNodes].find(c=>c.nodeType===1 && !isW(c,'pPr')) || null;
    for (const l of list.filter(x=>x.place==='start')){ p.insertBefore(makeRunLike(doc,p,normalizeLogicText(l.text)), firstContent); n++; }
    for (const l of list.filter(x=>x.place==='end')){ appendTagRun(doc, p, normalizeLogicText(l.text)); n++; }
  }
  return n;
}
export function addLogicAt(pid, offset, text){ const id='l'+Date.now().toString(36)+Math.random().toString(36).slice(2,5); state.logic.push({id, pid, place:'at', offset, text:straightenTags(String(text))}); return id; }
/* §logic-js */
// words for the kinds of logic tag, shown on the paper and in the Conditions step
export function lgWord(kw){ return ({if:'Only when', elif:'Else when', else:'Otherwise', endif:'End', for:'Repeat for', endfor:'End repeat', set:'Set value'})[kw] || (kw || 'Tag'); }
/* ---- new: what render*() used to do for the logic list, now data + a change notice ---- */
export function syncLogic(){ if (state.an) computeLogic(); notify(); }
// "show this paragraph in the letter": the page scrolls to it and flashes it (the UI listens)
export function showPid(pid){ emit('show', {pid}); }

/* ---- new: the data the Conditions step and the selection panel draw (what renderLogic / renderSelToolsInner computed inline) ---- */
// problems to fix: blocks that are not closed, stray end/else tags, an if and its end in different table cells, tags that lost their place
export function logicProblems(){
  const L=state.lg||[];
  const open=L.filter(e=>e.status==='open'), stray=L.filter(e=>e.status==='stray'), cells=L.filter(e=>e.status==='cells' && e.kw.startsWith('end'));
  const unplaced=state.unplaced||[];
  const probs=open.length+stray.length+cells.length;
  const nCond=L.filter(e=>e.kw==='if').length;
  const label=!L.length ? '' : probs ? `${probs} to fix` : `${nCond ? `${nCond} condition${nCond>1?'s':''}` : `${L.length} tag${L.length>1?'s':''}`} · all closed`;
  return {open, stray, cells, unplaced, probs, nCond, total:L.length, label};
}
// one row per tag (a tag typed by you can hold several: only its first shows)
export function logicRows(){ return (state.lg||[]).filter(e=>!(e.src==='you' && e.sub>0)); }
// "on p.2 " / "in the header " (empty when there is no page to name)
export function logicWhere(e){ return pageLabel(e.p) ? (e.p.kind==='body' ? 'on '+pageLabel(e.p)+' ' : 'in the '+e.p.kind+' ') : ''; }
// the plain-words line under a tag: what it does, and (when the data file is loaded) how many employees get it
export function logicSay(e){
  const {isCond, en, lead}=lgInfo(e);
  const opEn=(e.kw==='endif' && e.opener && e.opener.kw==='if') ? condEnglish(e.opener.expr) : '';
  if (isCond) return {lead, en, expr:e.expr.slice(0,70)};
  if (e.kw==='else') return {text:'Shown when none of the above match'};
  if (opEn) return {text:`Ends the part shown when ${opEn}`};
  return null;
}
export function blockCountInfo(e){
  const b=blockCountsNow(); if (!b || !b.byKey.has(e.key)) return null;
  const n=b.byKey.get(e.key), T=b.total;
  return {n, total:T, kind: n===0?'none':n===T?'all':'some', text: n===0 ? 'nobody in your data' : n===T ? `all ${T} employees` : `${n} of ${T} employees`};
}
// the paragraphs selected in the letter, where they sit and which block they are inside (null when none)
export function paraSelection(){
  const ps=(state.sel.pids||[]).map(id=>state.an.byPid.get(id)).filter(Boolean).sort((a,b)=>a.order-b.order); if (!ps.length) return null;
  const first=ps[0], last=ps[ps.length-1];
  const stack=openStackAt(last.pid, state.lg); const top=stack[stack.length-1];
  const openTop = top && top.status==='open' ? top : null;
  const onPage = first.kind==='body' ? (first.page ? `on page ${first.page}` : 'in the letter') : `in the ${first.kind}`;
  return {ps, first, last, stack, top, openTop, kw0: openTop ? (openTop.kw==='for'?'endfor':'endif') : 'if', place0: openTop ? 'after' : 'before', onPage};
}
// "Click the paragraph where … should go / end": null when no picking is on
export function pickingInfo(){
  if (state.view!=='source') return null;
  if (state.placing){
    const u=state.placing;
    const note = u.place&&u.place!=='at' ? ' ('+PLACE_SHORT[u.place]+')' : u.ctxB ? ' (it goes after “'+u.ctxB.slice(-24).trim()+'” if those words are there, otherwise at the end)' : ' (it goes at the end of the paragraph)';
    return {kind:'place', code:String(u.text).slice(0,60), note};
  }
  if (state.closing){ const e=state.lg.find(x=>x.key===state.closing); return {kind:'close', code:e?e.text.slice(0,60):'this block', word:e&&e.kw==='for'?'for':'if'}; }
  return null;
}
// the "Advanced: insert a single logic tag" box: choosing a kind keeps a condition already typed (if <-> else if)
export function lgTextForKw(current, kw){
  const cur=parseLogic(normalizeLogicText(current));
  const keepExpr = (cur.kw==='if'||cur.kw==='elif') && (kw==='if'||kw==='elif') && cur.expr && cur.expr!=='CONDITION' ? cur.expr : '';
  return logicTpl(kw, keepExpr);
}
export function lgTextWithExpr(current, expr){ const cur=parseLogic(normalizeLogicText(current)); return {kw: cur.kw==='elif'?'elif':'if', text: logicTpl(cur.kw==='elif'?'elif':'if', expr)}; }
// a field name goes where CONDITION is, else at the cursor (before the closing %} when the cursor is at the end)
export function lgInsertAtCursor(v, txt, a, b){
  const i=v.indexOf('CONDITION');
  if (i>=0) return v.slice(0,i)+txt+v.slice(i+9);
  a=a??v.length; b=b??v.length;
  const at = (a===v.length) ? Math.max(0, v.search(/\s*-?%\}\s*$/)) : a;
  return v.slice(0,at)+(at && !/\s$/.test(v.slice(0,at))?' ':'')+txt+v.slice(at===a?b:at);
}
// a field name into the "Insert a tag here" box: inside empty {{ }}, or at the cursor; an empty box gets {{ field }}
export function insertIntoText(v, txt, a, b){
  a=a??v.length; b=b??v.length;
  if (!v.trim()) return `{{ ${txt} }}`;
  if (/\{\{\s*\}\}$/.test(v.trim()) && a===v.length) return `{{ ${txt} }}`;
  const pad=a && !/\s$/.test(v.slice(0,a)) ? ' ' : '';
  return v.slice(0,a)+pad+txt+v.slice(b);
}
