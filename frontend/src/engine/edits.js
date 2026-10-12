// Moved from frontend_src/letter-tagger.html — see tests_ui/legacy for the reference page. No DOM rendering in this module.
import JSZip from 'jszip'
import { identifiersIn } from './checks.js'
import { RX_TAG, analyze } from './detect.js'
import { cloneParaWithText, paraModel, replaceRange, unwrapMergeFields } from './docx.js'
import { emit, notify, toast } from './events.js'
import { W, childW, cleanCondExpr, closestP, isW, norm, parseXml, serialize, straighten } from './helpers.js'
import { fullRefresh } from './load.js'
import { addLogic, addLogicAt, afterLogicChange } from './logic.js'
import { edit } from './rows.js'
import { anchorOf, atContext, dice, normAnchor, scheduleAutosave, tokSet } from './setup.js'
import { state } from './state.js'
import { tEditCell, topTables } from './tables.js'
import { HISTORY, recordUndo } from './undo.js'

/* ======================= editing the letter itself (merge, text by value) ======================= */
export function sourceEdit(mutate, opts={}){
  if (!opts.noUndo) recordUndo();
  const docs={}; for (const part of state.parts) docs[part.path]=parseXml(state.xml[part.path]);
  const oldPs={}; for (const part of state.parts) oldPs[part.path]=[...docs[part.path].getElementsByTagNameNS(W,'p')];
  const oldT=topTables(docs[state.mainPath]);
  const res=mutate(docs, {pEl:pid=>{ const i=pid.lastIndexOf('#'); return oldPs[pid.slice(0,i)][+pid.slice(i+1)]; }}) || {};
  if (res.cancel) { if (!opts.noUndo){ HISTORY.undo.pop(); notify(); } return res; }
  const pidMap=new Map(), pos={};
  for (const part of state.parts){
    const list=[...docs[part.path].getElementsByTagNameNS(W,'p')]; pos[part.path]=new Map(list.map((el,i)=>[el,i]));
    oldPs[part.path].forEach((el,i)=>{ const j=pos[part.path].get(el); pidMap.set(part.path+'#'+i, j==null?null:part.path+'#'+j); });
  }
  const pidOfEl=el=>{ for (const part of state.parts){ const j=pos[part.path].get(el); if (j!=null) return part.path+'#'+j; } return null; };
  const lost=[];
  state.typed=new Set([...state.typed].map(pid=>pidMap.has(pid)?pidMap.get(pid):pid).filter(Boolean));
  for (const el of res.typedEls||[]){ const np=pidOfEl(el); if (np) state.typed.add(np); }
  state.logic=state.logic.map(l=>{ const np=pidMap.get(l.pid); if (np===undefined) return l; if (np===null){ lost.push(l); return null; } return {...l, pid:np}; }).filter(Boolean);
  if (lost.length) state.unplaced.push(...lost.map(l=>({...l, anchor:null, ...(l.place==='at'?atContext(l):{}), reason:'Its paragraph was replaced.'})));
  const ne={}; for (const [id,ed] of Object.entries(state.edits)){ const m=id.match(/^o:(.+#\d+):(\d+)$/); if (m){ const np=pidMap.get(m[1]); if (np) ne[`o:${np}:${m[2]}`]=ed; } else ne[id]=ed; } state.edits=ne;
  const newT=topTables(docs[state.mainPath]); const te={};
  for (const [id,ed] of Object.entries(state.tableEdits)){ const el=oldT[+id.slice(1)]; const j=el?newT.indexOf(el):-1; if (j>=0) te['t'+j]=ed; }
  state.tableEdits=te;
  for (const part of state.parts) state.xml[part.path]=serialize(docs[part.path]);
  const addLater=(res.newLogic||[]).map(nl=>({pid:pidOfEl(nl.el), place:nl.place||'end', text:nl.text, extra:nl.extra})).filter(x=>x.pid);
  state.sel={pids:[],anchor:null,text:''}; state.closing=null; state.switchUi=null; state.inlineUi=null;
  analyze();
  for (const x of addLater) addLogic(x.pid, x.place, x.text, x.extra);
  fullRefresh();
  return res;
}
/* ---- text by value ---- */
export function quoteJ(s){ return '"'+String(s).replace(/\\/g,'\\\\').replace(/"/g,'\\"').replace(/&/g,'\\u0026').replace(/</g,'\\u003c').replace(/>/g,'\\u003e')+'"'; }
export function caseCond(field, match, value){
  const vals=String(value).split(',').map(v=>v.trim()).filter(Boolean);
  if (!vals.length) return '';
  if (match==='number'){ const ns=vals.map(v=>Number(v.replace(/,/g,''))).filter(Number.isFinite); if (!ns.length) return ''; return ns.length===1 ? `(${field} | float) == ${ns[0]}` : `(${field} | float) in [${ns.join(', ')}]`; }
  const low=vals.map(v=>v.toLowerCase());
  return low.length===1 ? `${field} | string | lower | trim == ${quoteJ(low[0])}` : `${field} | string | lower | trim in [${low.map(quoteJ).join(', ')}]`;
}
export function switchPreview(sw){
  const f=(sw.field||'').trim(); if (!f) return '';
  const cs=sw.cases.filter(c=>c.v.trim());
  if (!cs.length) return '';
  const parts=cs.map((c,k)=>`${k?'{%- elif':'{% if'} ${caseCond(f, sw.match, c.v)} -%}`);
  return parts.join(' … ')+(sw.other.trim()?' … {%- else -%}':'')+' … {%- endif %}';
}
export function applySwitch(){
  const sw=state.switchUi; const f=cleanCondExpr(sw.field||'').replace(/^\{\{\s*|\s*\}\}$/g,'');
  if (!f){ toast('Pick the field the text depends on, e.g. employee_schema.rating.'); return; }
  const cs=sw.cases.filter(c=>c.v.trim());
  if (!cs.length){ toast('Add at least one value and the text for it.'); return; }
  for (const c of cs) if (!caseCond(f, sw.match, c.v)){ toast(`“${c.v}” isn't a number. Switch to “Match text” or fix the value.`); return; }
  if (sw.mode==='inline'){
    const {pid, s, e}=sw.range; recordUndo();
    const first=`{% if ${caseCond(f, sw.match, cs[0].v)} %}`;
    const tail=cs.slice(1).map(c=>`{% elif ${caseCond(f, sw.match, c.v)} %}${c.t}`).join('')+(sw.other.trim()?`{% else %}${sw.other}`:'')+'{% endif %}';
    addLogicAt(pid, s, first); addLogicAt(pid, e, tail);
    state.switchUi=null; state.sel={pids:[],anchor:null,text:''}; emit('clearSelection'); notify(); afterLogicChange('Added text by value.');
    return;
  }
  const pids=sw.pids.slice();
  const cfg={field:f, match:sw.match, cases:cs.map(c=>({v:c.v, t:c.t})), other:sw.other, where:sw.where};
  const op={id:'s'+Math.random().toString(36).slice(2,9), anchors:pids.map(anchorOf), cfg};
  const res=switchParaEdit(pids, cfg, op.id);
  if (!res.cancel){ state.switchOps.push(op); scheduleAutosave(); toast(`Added ${cs.length+(sw.other.trim()?1:0)} versions of the paragraph with if / else if tags.`); }
}
export function switchParaEdit(pids, cfg, opId, noUndo){
  const {field:f, match, other, where}=cfg; const cs=cfg.cases.filter(c=>String(c.v).trim());
  return sourceEdit((docs,H)=>{
    const els=pids.map(pid=>H.pEl(pid)).filter(Boolean); if (!els.length || els.length!==pids.length) return {cancel:true};
    const doc=els[0].ownerDocument; const ref=els[0]; const last=els[els.length-1];
    if (where==='replace' && els.some(el=>{ const pp=childW(el,'pPr'); return pp && childW(pp,'sectPr'); })){ if (!noUndo) toast("One of those paragraphs ends a section of the document, so it can't be replaced. Use “Add after” instead."); return {cancel:true}; }
    const newLogic=[]; let cursor=last; const extra={sw:opId};
    cs.forEach((c,k)=>{ const p=cloneParaWithText(doc, ref, c.t||''); cursor.parentNode.insertBefore(p, cursor.nextSibling); cursor=p; newLogic.push({el:p, place:'before', text:k?`{%- elif ${caseCond(f, match, c.v)} -%}`:`{% if ${caseCond(f, match, c.v)} -%}`, extra}); });
    if (String(other||'').trim()){ const p=cloneParaWithText(doc, ref, other); cursor.parentNode.insertBefore(p, cursor.nextSibling); cursor=p; newLogic.push({el:p, place:'before', text:'{%- else -%}', extra}); }
    const typedEls=newLogic.map(x=>x.el);
    newLogic.push({el:cursor, place:'after', text:'{%- endif %}', extra});
    if (where==='replace') for (const el of els) el.parentNode.removeChild(el);
    return {newLogic, typedEls};
  }, {noUndo});
}
/* ---- combine two versions ---- */
export function topBlocksOf(doc){
  const body=doc.getElementsByTagNameNS(W,'body')[0]; const out=[];
  for (let c=body.firstChild;c;c=c.nextSibling){ if (c.nodeType!==1) continue; if (isW(c,'p')||isW(c,'tbl')||isW(c,'sdt')) out.push({el:c, kind:c.localName, text:blockText(c)}); }
  return out;
}
export function blockText(el){ if (isW(el,'p')) return normAnchor(paraModel(el).text); const ps=[...el.getElementsByTagNameNS(W,'p')].filter(p=>closestP(p)===null || true); return (isW(el,'tbl')?'[table] ':'')+normAnchor(ps.map(p=>paraModel(p).text).join(' | ')); }
export function looseText(t){ return norm(String(t).replace(/\d[\d,.\s]*/g,' # ')); }
// the one rule for "these two blocks are the same block" (kind, exact text, or with `loose` the same apart from numbers / spacing)
export function blockMatcher(A, B, loose, numbersOnly){
  const tA=A.map(x=>({lt:looseText(x.text), ts:tokSet(looseText(x.text))})), tB=B.map(x=>({lt:looseText(x.text), ts:tokSet(looseText(x.text))}));
  return (i,j)=>{ const a=A[i], b=B[j]; if (a.kind!==b.kind) return false; if (a.text===b.text) return true; if (!loose || !a.text || !b.text) return false; if (tA[i].lt===tB[j].lt) return true; if (numbersOnly) return false; return dice(tA[i].ts, tB[j].ts)>=0.85; };
}
export function computeHunks(A, B, loose){
  const eq=blockMatcher(A, B, loose);
  const n=A.length, m=B.length; const L=Array.from({length:n+1},()=>new Int32Array(m+1));
  for (let i=n-1;i>=0;i--) for (let j=m-1;j>=0;j--) L[i][j]=eq(i,j)?L[i+1][j+1]+1:Math.max(L[i+1][j],L[i][j+1]);
  const hunks=[], similar=[]; let i=0, j=0, cur=null;
  const flush=()=>{ if (cur && [...cur.a.map(k=>A[k]), ...cur.b.map(k=>B[k])].some(x=>x.text)) hunks.push(cur); cur=null; };
  while (i<n || j<m){
    if (i<n && j<m && eq(i,j)){ flush(); if (A[i].text!==B[j].text) similar.push({a:i, b:j}); i++; j++; }
    else if (j<m && (i>=n || L[i][j+1]>=L[i+1][j])){ (cur ||= {a:[], b:[], at:i}).b.push(j); j++; }
    else { (cur ||= {a:[], b:[], at:i}).a.push(i); i++; }
  }
  flush();
  return {hunks, similar};
}
export function sanitizeImported(n, st){
  const kill=['drawing','pict','object','footnoteReference','endnoteReference','commentRangeStart','commentRangeEnd','commentReference','bookmarkStart','bookmarkEnd','proofErr','del','moveFrom','altChunk','permStart','permEnd'];
  for (const name of kill) for (const el of [...n.getElementsByTagNameNS(W,name)]){ if (['drawing','pict','object'].includes(name)) st.images++; el.parentNode && el.parentNode.removeChild(el); }
  for (const el of [...n.getElementsByTagName('*')].filter(x=>x.localName==='AlternateContent')){ st.images++; el.parentNode && el.parentNode.removeChild(el); }
  for (const el of [...n.getElementsByTagNameNS(W,'sectPr')]) if (el.parentNode && el.parentNode.localName==='pPr') el.parentNode.removeChild(el);
  for (const name of ['hyperlink','ins','moveTo','smartTag','fldSimple','customXml']) for (const el of [...n.getElementsByTagNameNS(W,name)]){ while (el.firstChild) el.parentNode.insertBefore(el.firstChild, el); el.parentNode.removeChild(el); }
  for (const el of [...n.getElementsByTagNameNS(W,'sdt')]){ const c=childW(el,'sdtContent'); if (c) while (c.firstChild) el.parentNode.insertBefore(c.firstChild, el); el.parentNode.removeChild(el); }
  for (const el of [n, ...n.getElementsByTagName('*')]) for (const a of [...(el.attributes||[])]) if (/officeDocument\/2006\/relationships/.test(a.namespaceURI||'')) el.removeAttributeNode(a);
  if (n.getElementsByTagNameNS && n.getElementsByTagNameNS(W,'numPr').length) st.lists++;
}
export function importBlocks(docA, el, st){
  const n=docA.importNode(el, true);
  if (isW(n,'sdt')){ const c=childW(n,'sdtContent'); const kids=c?[...c.childNodes].filter(x=>x.nodeType===1):[]; kids.forEach(k=>sanitizeImported(k, st)); return kids; }
  sanitizeImported(n, st); return [n];
}
export async function loadMergeB(file){
  let zip; try { zip=await JSZip.loadAsync(await file.arrayBuffer()); } catch(e){ throw new Error('Letter B is not a .docx file.'); }
  const ct=zip.file('[Content_Types].xml')?await zip.file('[Content_Types].xml').async('string'):'';
  const m=ct.match(/PartName="\/([^"]+)"\s+ContentType="application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document\.main\+xml"/) || ct.match(/ContentType="application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document\.main\+xml"\s+PartName="\/([^"]+)"/);
  const main=m?m[1]:'word/document.xml'; if (!zip.file(main)) throw new Error("Letter B has no main document part.");
  const docB=parseXml(await zip.file(main).async('string')); unwrapMergeFields(docB);
  state.mergeB={name:file.name, docB, loose:true, cond:state.mergeB?state.mergeB.cond:'', include:{}, conds:{}};
  recomputeMerge();
}
export function recomputeMerge(){
  const mb=state.mergeB; if (!mb) return;
  const docA=parseXml(state.xml[state.mainPath]); unwrapMergeFields(docA);
  mb.A=topBlocksOf(docA); mb.B=topBlocksOf(mb.docB);
  const r=computeHunks(mb.A, mb.B, mb.loose); mb.hunks=r.hunks; mb.similar=r.similar;
}
export function applyMerge(){
  const mb=state.mergeB; const cond=cleanCondExpr(mb.cond);
  if (!cond){ toast('Write when Letter A applies, e.g. employee_schema.promotion_needed | lower | trim == "yes".'); return; }
  const chosen=mb.hunks.map((h,k)=>({h,k})).filter(x=>mb.include[x.k]!==false);
  if (!chosen.length){ toast('Tick at least one difference to merge.'); return; }
  const st={images:0, lists:0};
  sourceEdit(docs=>{
    const docA=docs[state.mainPath]; const A=topBlocksOf(docA); const B=mb.B;
    const body=docA.getElementsByTagNameNS(W,'body')[0]; const sect=[...body.childNodes].find(x=>isW(x,'sectPr'))||null;
    const mkP=()=>docA.createElementNS(W,'w:p'); const newLogic=[];
    const insertAfter=(node, ref)=>body.insertBefore(node, ref.nextSibling);
    for (const {h,k} of chosen){
      const hc=(mb.conds[k]||'').trim()?cleanCondExpr(mb.conds[k]):cond;
      const aEls=h.a.map(i=>A[i].el); const anchor=aEls[0] || (A[h.at]?A[h.at].el:sect);
      const pOpen=mkP(); body.insertBefore(pOpen, anchor);
      let cursor = aEls.length ? aEls[aEls.length-1] : pOpen;
      const pushB=()=>{ for (const bi of h.b){ for (const node of importBlocks(docA, B[bi].el, st)){ insertAfter(node, cursor); cursor=node; } } };
      if (aEls.length && h.b.length){ const pElse=mkP(); insertAfter(pElse, cursor); cursor=pElse; pushB(); newLogic.push({el:pOpen, text:`{% if ${hc} -%}`}, {el:pElse, text:'{%- else -%}'}); }
      else if (aEls.length) newLogic.push({el:pOpen, text:`{% if ${hc} -%}`});
      else { pushB(); newLogic.push({el:pOpen, text:`{% if not (${hc}) -%}`}); }
      const pEnd=mkP(); insertAfter(pEnd, cursor); newLogic.push({el:pEnd, text:'{%- endif %}'});
    }
    return {newLogic:newLogic.map(x=>({...x, place:'end', extra:{mg:1}}))};
  });
  const n=chosen.length;
  state.mergeB.done={n, images:st.images, lists:st.lists};
  state.mergeB.hunks=[]; state.mergeB.include={}; state.mergeB.conds={}; notify();
  toast(`Merged ${n} difference${n>1?'s':''} as if / else blocks. Check them in the Logic tags list.`);
}
/* ---- tag clean-up (tags already in the letter) ---- */
export const escRe=s=>String(s).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
export function renameIdent(text, from, to){
  if (!from || from===to) return text;
  const rx=new RegExp(`(^|[^\\w.])(${escRe(from)})(?![\\w])`,'g');
  return String(text).replace(RX_TAG, tag=>tag.replace(/('(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*")|([^'"]+)/g,(m,lit,code)=>{
    if (lit) return lit;
    return code.replace(rx,(mm,pre,name,off,whole)=>{ const before=whole.slice(0,off+pre.length).trimEnd(); return before.endsWith('|') ? mm : pre+to; });
  }));
}
export function applyTagOps(t){
  for (const op of state.tagOps){
    if (op.off) continue;
    if (op.type==='rename') t=renameIdent(t, op.from, op.to);
    else if (op.type==='map'){ if (t===op.from) t=op.to; }
    else if (op.type==='replace'){ if (!op.find) continue; if (op.regex){ try{ t=t.replace(new RegExp(op.find,'g'), op.repl); }catch(e){} } else t=t.split(op.find).join(op.repl); }
  }
  return t;
}
export function rewriteDocTags(doc){
  let n=0;
  for (const p of [...doc.getElementsByTagNameNS(W,'p')]){
    const model=paraModel(p); const t=model.text; if (!/\{[{%#]/.test(t)) continue;
    for (const m of [...t.matchAll(RX_TAG)].reverse()){ const t0=straighten(m[0]); const t1=applyTagOps(t0); if (t1!==t0){ replaceRange(model, m.index, m.index+m[0].length, t1, null); n++; } }
  }
  return n;
}
export function existingTagInfo(){
  const names=new Map(), amount=[], locals=new Set(); let total=0;
  if (!state.an) return {names, amount, total};
  for (const p of state.an.paras){
    if (p.fallback) continue;
    for (const m of p.model.text.matchAll(RX_TAG)){
      const tag=straighten(m[0]); if (tag.startsWith('{#')) continue; total++;
      const inner=tag.replace(/^\{[{%]-?|-?[}%]\}$/g,'').trim(); const kw=(inner.match(/^(\w+)/)||[])[1]||'';
      if (tag.startsWith('{%')){ if (kw==='set'){ const v=(inner.match(/^set\s+(\w+)/)||[])[1]; if (v) locals.add(v); } if (kw==='for'){ const v=inner.match(/^for\s+(\w+)(?:\s*,\s*(\w+))?/)||[]; if (v[1]) locals.add(v[1]); if (v[2]) locals.add(v[2]); } }
      const expr=tag.startsWith('{%') ? inner.replace(/^(if|elif|for\s+\w+(?:\s*,\s*\w+)?\s+in|set\s+\w+\s*=)\s*/,'') : inner;
      if (/^(else|endif|endfor|raw|endraw)$/.test(expr)) continue;
      const ids=identifiersIn(expr).filter(x=>x!=='currentDatetime' && !locals.has(x.split('.')[0]));
      for (const id of ids){ const e=names.get(id)||{id, count:0}; e.count++; names.set(id,e); }
      if (tag.startsWith('{{') && [...new Set(ids)].length===1 && /indian_comma|int_comma|\|\s*float|\|\s*int|\.format\(|\|\s*round/.test(tag)) amount.push({tag, id:ids[0], pid:p.pid});
    }
  }
  return {names, amount, total};
}
export function renameEverywhere(from, to){
  recordUndo();
  for (const r of state.rows){
    if (r.key===from){ edit(r.id,{key:to}); }
    else if (r.override!=null && r.override.includes(from)){ const nt=renameIdent(r.override, from, to); if (nt!==r.override) edit(r.id,{override:nt}); }
  }
  for (const t of state.tables) for (const row of t.rows) for (const ci of row.empties){ const c=row.cells[ci]; if (!c) continue; if (c.key===from) tEditCell(t,row,ci,{key:to}); else if (c.override && c.override.includes(from)) tEditCell(t,row,ci,{override:renameIdent(c.override, from, to)}); }
  for (const l of state.logic) if (l.text.includes(from)) l.text=renameIdent(l.text, from, to);
  const info=existingTagInfo(); if (info.names.has(from)) state.tagOps.push({id:'o'+Date.now().toString(36), type:'rename', from, to});
  analyze(); fullRefresh(); notify();
}
export function addTagOps(ops, msg){
  if (!ops.length){ toast('Nothing to change.'); return; }
  recordUndo(); for (const op of ops) state.tagOps.push({id:'o'+Math.random().toString(36).slice(2,9), ...op});
  analyze(); fullRefresh(); notify(); toast(msg);
}
