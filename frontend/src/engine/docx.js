// Moved from frontend_src/letter-tagger.html — see tests_ui/legacy for the reference page. No DOM rendering in this module.
import { RX_TAG } from './detect.js'
import { rewriteDocTags } from './edits.js'
import { W, XMLNS, ancestor, childW, closestP, isW, parseXml } from './helpers.js'
import { state } from './state.js'

/* ======================= docx model ======================= */
// shown «name» → field code, when they differ (Word's mail merge prints the field code's value)
export const MERGE_MISMATCH=new Map();
export function unwrapMergeFields(doc){
  let n=0;
  for (const f of [...doc.getElementsByTagNameNS(W,'fldSimple')]){
    if (!/MERGEFIELD/i.test(f.getAttributeNS(W,'instr')||f.getAttribute('w:instr')||'')) continue;
    while (f.firstChild) f.parentNode.insertBefore(f.firstChild, f);
    f.parentNode.removeChild(f); n++;
  }
  for (const p of [...doc.getElementsByTagNameNS(W,'p')]){
    const runs=[...p.getElementsByTagNameNS(W,'r')].filter(r=>closestP(r)===p);
    for (let i=0;i<runs.length;i++){
      const fc=childW(runs[i],'fldChar'); if (!fc || fc.getAttributeNS(W,'fldCharType')!=='begin') continue;
      let instr='', sep=-1, end=-1, depth=0;
      for (let j=i;j<runs.length;j++){
        const c=childW(runs[j],'fldChar'); const t=c && c.getAttributeNS(W,'fldCharType');
        if (t==='begin') depth++;
        if (t==='end'){ depth--; if (depth===0){ end=j; break; } }
        if (depth===1){ if (t==='separate' && sep<0) sep=j; if (sep<0) for (const x of runs[j].getElementsByTagNameNS(W,'instrText')) instr+=x.textContent; }
      }
      if (end<0 || !/MERGEFIELD/i.test(instr)) continue;
      if (sep>=0){ const code=(instr.match(/MERGEFIELD\s+"?([^"\s\\]+)/i)||[])[1]||''; let shown=''; for (let k=sep+1;k<end;k++) for (const x of runs[k].getElementsByTagNameNS(W,'t')) shown+=x.textContent; const sn=shown.replace(/[«»]/g,'').trim(); if (code && sn && /«[^»]+»/.test(shown) && sn.toLowerCase()!==code.toLowerCase()) MERGE_MISMATCH.set(shown.trim(), code); }
      if (sep<0){
        const nm=(instr.match(/MERGEFIELD\s+"?([^"\s\\]+)/i)||[])[1]||'Field';
        const r=doc.createElementNS(W,'w:r'); const t=doc.createElementNS(W,'w:t'); t.textContent='«'+nm+'»'; r.appendChild(t);
        runs[i].parentNode.insertBefore(r, runs[i]);
      }
      const cut = sep>=0 ? sep : end-1;
      for (let k=i;k<=cut;k++) runs[k].parentNode && runs[k].parentNode.removeChild(runs[k]);
      runs[end].parentNode && runs[end].parentNode.removeChild(runs[end]);
      n++; i=end;
    }
  }
  return n;
}
export function runFmt(t){
  const r = ancestor(t,['r']); const rPr = r && childW(r,'rPr'); const f={};
  if (!rPr) return f;
  const on = el => el && !/^(0|false|none)$/i.test(el.getAttributeNS(W,'val')||'');
  f.b=on(childW(rPr,'b')); f.i=on(childW(rPr,'i')); f.u=on(childW(rPr,'u'));
  const hl=childW(rPr,'highlight'); f.hl = !!(hl && !/^none$/i.test(hl.getAttributeNS(W,'val')||''));
  return f;
}
export function paraModel(p){
  const items=[]; let pos=0;
  (function walk(node){
    for (let c=node.firstChild;c;c=c.nextSibling){
      if (c.nodeType!==1) continue;
      const ln=c.localName;
      if (c.namespaceURI===W){
        if (['p','pPr','rPr','del','moveFrom','drawing','pict','instrText','delText','object'].includes(ln)) continue;
        if (ln==='t'){ const len=c.textContent.length; items.push({type:'t', node:c, start:pos, len}); pos+=len; continue; }
        if (ln==='tab' || ln==='ptab'){ items.push({type:'tab'}); continue; }
        if (ln==='lastRenderedPageBreak'){ items.push({type:'pb', rendered:true}); continue; }
        if (ln==='br' && c.getAttributeNS(W,'type')==='page'){ items.push({type:'pb', explicit:true}); continue; }
        if (ln==='br' || ln==='cr'){ items.push({type:'br'}); continue; }
      } else if (ln==='AlternateContent') continue;
      walk(c);
    }
  })(p);
  const nodes=items.filter(x=>x.type==='t');
  return {items, nodes, text:nodes.map(x=>x.node.textContent).join('')};
}
export function partKind(path){ return /header/.test(path)?'header':/footer/.test(path)?'footer':/footnotes|endnotes/.test(path)?'notes':'body'; }
export function buildModel(docs){
  const paras=[]; const byPid=new Map(); const byEl=new Map(); let order=0;
  for (const part of state.parts){
    const doc=docs[part.path]; const ps=[...doc.getElementsByTagNameNS(W,'p')];
    ps.forEach((p,i)=>{
      const info={pid:part.path+'#'+i, path:part.path, kind:part.kind, el:p, order:order++,
        fallback:!!ancestor(p,['Fallback']), textbox:!!ancestor(p,['txbxContent']), model:paraModel(p)};
      paras.push(info); byPid.set(info.pid,info); byEl.set(p,info);
    });
  }
  const an={docs, paras, byPid, byEl}; assignPages(an); return an;
}
export function parseAll(){ const docs={}; let fields=0, rewritten=0, joined=0; for (const part of state.parts){ const d=parseXml(state.xml[part.path]); fields+=unwrapMergeFields(d); joined+=joinSplitTags(d); if (state.tagOps && state.tagOps.length) rewritten+=rewriteDocTags(d); docs[part.path]=d; } return {docs, fields, rewritten, joined}; }
/* A tag typed over two lines (Enter or Shift+Enter inside {% … %}) is one tag to Jinja: the engine strips the Word markup between.
   Join those lines into one paragraph with a space, so the tag reads the same in this tool, in the preview and in any engine. */
export function openTagAtEnd(t){
  let i=0, open=null;
  while (i<t.length){
    if (!open){ const m=t.slice(i).match(/\{[{%#]/); if (!m) return false; i+=m.index; open={'{{':'}}','{%':'%}','{#':'#}'}[t.substr(i,2)]; i+=2; continue; }
    const j=t.indexOf(open, i); if (j<0) return true; i=j+2; open=null;
  }
  return !!open;
}
export function breaksInTags(doc, p){
  // a line break or tab inside a tag becomes a space
  const seq=[]; let pos=0;
  (function walk(n){ for (let c=n.firstChild;c;c=c.nextSibling){ if (c.nodeType!==1) continue; if (c.namespaceURI===W){ if (['pPr','rPr','del','moveFrom','drawing','pict','instrText','delText','object'].includes(c.localName)) continue; if (c.localName==='p') continue;
    if (c.localName==='t'){ pos+=c.textContent.length; continue; } if (['br','cr','tab'].includes(c.localName) && !(c.localName==='br' && c.getAttributeNS(W,'type')==='page')){ seq.push({el:c, pos}); continue; } } else if (c.localName==='AlternateContent') continue; walk(c); } })(p);
  if (!seq.length) return 0;
  const text=paraModel(p).text; const spans=[...text.matchAll(RX_TAG)].map(m=>[m.index, m.index+m[0].length]);
  let n=0;
  for (const b of seq){ if (!spans.some(([a,e])=>b.pos>a && b.pos<e)) continue; const t=doc.createElementNS(W,'w:t'); setPreserve(t); t.textContent=' '; b.el.parentNode.replaceChild(t, b.el); n++; }
  return n;
}
export function joinSplitTags(doc){
  let n=0;
  for (const p of [...doc.getElementsByTagNameNS(W,'p')]){
    if (!p.parentNode) continue;
    n+=breaksInTags(doc, p);
    if (!openTagAtEnd(paraModel(p).text)) continue;
    // only join when the tag really closes within the next few lines; a stray "{{" is left for the checks to report
    let txt=paraModel(p).text, k=0, sib=p, closes=false;
    while (k++<6){ sib=sib.nextSibling; while (sib && sib.nodeType!==1) sib=sib.nextSibling; if (!sib || !isW(sib,'p')) break; txt+=' '+paraModel(sib).text; if (!openTagAtEnd(txt)){ closes=true; break; } }
    if (!closes) continue;
    let guard=0;
    while (guard++<7 && openTagAtEnd(paraModel(p).text)){
      let nx=p.nextSibling; while (nx && nx.nodeType!==1) nx=nx.nextSibling;
      if (!nx || !isW(nx,'p')) break;
      const r=doc.createElementNS(W,'w:r'); const t=doc.createElementNS(W,'w:t'); setPreserve(t); t.textContent=' '; r.appendChild(t); p.appendChild(r);
      for (const c of [...nx.childNodes]) if (!isW(c,'pPr')) p.appendChild(c);
      nx.parentNode.removeChild(nx); n++;
      n+=breaksInTags(doc, p);
    }
  }
  return n;
}
export function makeRunLike(doc, ref, text){
  const r=doc.createElementNS(W,'w:r');
  const fr=[...ref.getElementsByTagNameNS(W,'r')].find(x=>closestP(x)===ref); const rPr=fr && childW(fr,'rPr');
  if (rPr){ const c=rPr.cloneNode(true); const h=childW(c,'highlight'); if (h) c.removeChild(h); r.appendChild(c); }
  const t=doc.createElementNS(W,'w:t'); setPreserve(t); t.textContent=text; r.appendChild(t); return r;
}
export function assignPages(an){
  const doc=an.docs[state.mainPath]; if (!doc) return;
  const rendered=doc.getElementsByTagNameNS(W,'lastRenderedPageBreak').length>0;
  let page=1, pending=false;
  for (const p of an.paras){
    if (p.path!==state.mainPath || p.fallback || p.textbox) continue;
    const pPr=childW(p.el,'pPr');
    if (!rendered){ if (pending) page++; const pb=pPr&&childW(pPr,'pageBreakBefore'); if (pb && !/^(0|false)$/i.test(pb.getAttributeNS(W,'val')||'')) page++; }
    pending=false; let start=null;
    for (const it of p.model.items){
      if (it.type==='pb' && (rendered ? it.rendered : it.explicit)) page++;
      if (it.type==='t' && it.len && start==null) start=page;
    }
    p.page = start ?? page;
    if (!rendered && pPr){ const sp=childW(pPr,'sectPr'); if (sp){ const ty=childW(sp,'type'); if (!ty || ty.getAttributeNS(W,'val')!=='continuous') pending=true; } }
  }
  an.pages=page; an.pageSource=rendered?'rendered':'explicit';
}
export function cloneParaWithText(doc, ref, text){
  const p=doc.createElementNS(W,'w:p');
  const pPr=childW(ref,'pPr'); if (pPr){ const c=pPr.cloneNode(true); for (const n of [...c.childNodes]) if (n.nodeType===1 && ['sectPr','pageBreakBefore'].includes(n.localName)) c.removeChild(n); p.appendChild(c); }
  const fr=[...ref.getElementsByTagNameNS(W,'r')].find(x=>closestP(x)===ref && x.getElementsByTagNameNS(W,'t').length); const rPr=fr && childW(fr,'rPr');
  const lines=String(text).split(/\r?\n/);
  const r=doc.createElementNS(W,'w:r'); if (rPr){ const c=rPr.cloneNode(true); const h=childW(c,'highlight'); if (h) c.removeChild(h); r.appendChild(c); }
  lines.forEach((ln,i)=>{ if (i) r.appendChild(doc.createElementNS(W,'w:br')); const t=doc.createElementNS(W,'w:t'); setPreserve(t); t.textContent=ln; r.appendChild(t); });
  p.appendChild(r); return p;
}
/* ======================= small helpers used by the new panels ======================= */
export function insertAt(model, o, str){
  const nodes=model.nodes.filter(n=>n.len>0);
  if (!nodes.length) return false;
  let n=nodes.find(x=>o>=x.start && o<x.start+x.len);
  if (!n) n=nodes.filter(x=>x.start+x.len<=o).pop() || nodes[0];
  const off=Math.max(0, Math.min(o-n.start, n.node.textContent.length));
  const t0=n.node.textContent; n.node.textContent=t0.slice(0,off)+str+t0.slice(off); setPreserve(n.node);
  return true;
}
export function setPreserve(t){ t.setAttributeNS(XMLNS,'xml:space','preserve'); }
export function replaceRange(model, start, end, str, touched){
  const nodes=model.nodes;
  let si=-1, ei=-1;
  for (let i=0;i<nodes.length;i++){ const n=nodes[i]; if (si<0 && start>=n.start && start<n.start+n.len) si=i; if (end>n.start && end<=n.start+n.len){ ei=i; break; } }
  if (si<0 || ei<0) return false;
  const a=nodes[si].node, offS=start-nodes[si].start, offE=end-nodes[ei].start;
  if (si===ei){ const t0=a.textContent; a.textContent=t0.slice(0,offS)+str+t0.slice(offE); setPreserve(a); touched && touched.add(a); }
  else {
    const t0=a.textContent; a.textContent=t0.slice(0,offS)+str; setPreserve(a); touched && touched.add(a);
    for (let k=si+1;k<ei;k++){ nodes[k].node.textContent=''; touched && touched.add(nodes[k].node); }
    const b=nodes[ei].node; b.textContent=b.textContent.slice(offE); setPreserve(b); touched && touched.add(b);
  }
  return true;
}
export function spanCount(model,s,e){ return model.nodes.filter(n=>n.len>0 && s<n.start+n.len && e>n.start).length; }
export function makeTagPara(doc, ref, text){
  const p=doc.createElementNS(W,'w:p');
  const pPr=childW(ref,'pPr');
  if (pPr){ const c=pPr.cloneNode(true); for (const n of [...c.childNodes]) if (n.nodeType===1 && ['numPr','sectPr','pageBreakBefore'].includes(n.localName)) c.removeChild(n); p.appendChild(c); }
  const r=doc.createElementNS(W,'w:r');
  const fr=[...ref.getElementsByTagNameNS(W,'r')].find(x=>closestP(x)===ref); const rPr=fr && childW(fr,'rPr');
  if (rPr){ const c=rPr.cloneNode(true); const h=childW(c,'highlight'); if (h) c.removeChild(h); r.appendChild(c); }
  const t=doc.createElementNS(W,'w:t'); setPreserve(t); t.textContent=text; r.appendChild(t); p.appendChild(r);
  return p;
}
