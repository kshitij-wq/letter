// Combine several client versions of one letter into one template. No DOM drawing in this module.
// The text that is the same in every version stays once; the paragraphs that differ sit side by side inside
// {% if %} / {% elif %} / {% else %} / {% endif %} lines, one branch per group of versions that share the same text.
import JSZip from 'jszip'
import { condEnglish } from './conditions.js'
import { unwrapMergeFields } from './docx.js'
import { blockMatcher, caseCond, importBlocks, sourceEdit, topBlocksOf } from './edits.js'
import { notify, toast } from './events.js'
import { W, childW, isW, parseXml } from './helpers.js'
import { loadDocx } from './load.js'
import { setTab, setView } from './steps.js'
import { state } from './state.js'

/* ======================= pure logic (works on plain {kind, text} lists, no DOM) ======================= */

// pairs [i, j] of equal blocks, in order (the same longest-common-subsequence walk as computeHunks)
export function matchPairs(A, B, loose){
  // "ignore small differences" = numbers and spacing only, never a merely similar sentence
  const eq=blockMatcher(A, B, loose, true); const n=A.length, m=B.length;
  const L=Array.from({length:n+1},()=>new Int32Array(m+1));
  for (let i=n-1;i>=0;i--) for (let j=m-1;j>=0;j--) L[i][j]=eq(i,j)?L[i+1][j+1]+1:Math.max(L[i+1][j],L[i][j+1]);
  const pairs=[]; let i=0, j=0;
  while (i<n && j<m){ if (eq(i,j)){ pairs.push([i,j]); i++; j++; } else if (L[i][j+1]>=L[i+1][j]) j++; else i++; }
  return pairs;
}

/**
 * Progressive alignment. lists[v] = the top-level blocks ({kind, text}) of version v; `base` is the one whose blocks come first.
 * Returns the merged block sequence (each entry says which blocks of which versions it stands for) and the regions:
 * maximal runs of entries that are not in every version.
 */
export function alignVersions(lists, opts={}){
  const N=lists.length; const base=opts.base||0; const loose=opts.loose!==false;
  const order=[base, ...lists.map((_,i)=>i).filter(i=>i!==base)];
  let merged=lists[base].map((b,bi)=>({kind:b.kind, text:b.text, refs:{[base]:bi}}));
  for (const v of order.slice(1)){
    const B=lists[v]; const pairs=matchPairs(merged, B, loose); const out=[];
    let ai=0, bj=0;
    for (const [i,j] of [...pairs, [merged.length, B.length]]){
      while (ai<i) out.push(merged[ai++]);
      while (bj<j){ out.push({kind:B[bj].kind, text:B[bj].text, refs:{[v]:bj}}); bj++; }
      if (i<merged.length){ merged[i].refs[v]=j; out.push(merged[i]); ai=i+1; bj=j+1; }
    }
    merged=out;
  }
  const common=e=>Object.keys(e.refs).length===N;
  const regions=[]; let cur=null;
  merged.forEach((e,k)=>{
    if (common(e)){ cur=null; return; }
    if (!cur){ cur={entries:[], start:k, prev:k-1}; regions.push(cur); }
    cur.entries.push(e); cur.end=k;
  });
  for (const r of regions){
    let nx=r.end+1; r.next=nx<merged.length?nx:-1;
    r.content=lists.map((_,v)=>r.entries.filter(e=>v in e.refs).map(e=>({v, bi:e.refs[v], kind:e.kind, text:e.text})));
  }
  const sameCount=merged.filter(e=>common(e) && e.text).length;
  return {merged, regions, sameCount, order};
}

// groups of versions with the same text in one region, in the order of the versions (the base first)
export function groupRegion(region, order){
  const groups=[]; const byKey=new Map();
  for (const v of order){
    const blocks=region.content[v]; const key=JSON.stringify(blocks.map(b=>[b.kind,b.text]));
    let g=byKey.get(key);
    if (!g){ g={versions:[], blocks, key, empty:blocks.every(b=>!b.text)}; byKey.set(key,g); groups.push(g); }
    g.versions.push(v);
  }
  return groups;
}

// regions where at least one version has some text; each with its groups
export function planVersions(lists, opts={}){
  const al=alignVersions(lists, opts);
  const regions=[];
  for (const r of al.regions){
    if (r.content.every(c=>c.every(b=>!b.text))) continue;   // only blank lines differ
    regions.push({...r, groups:groupRegion(r, al.order)});
  }
  return {regions, sameCount:al.sameCount, merged:al.merged, order:al.order};
}

/* ---- conditions ---- */
// Every version gets a condition of its own on this placeholder field, so the combined template is valid straight away.
// The person changes the field, or the conditions, later in Conditions (or adds this column to the data).
export const AUTO_FIELD='custom_schema.letter_version';
export function slugOf(label){ return String(label||'').toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'')||'version'; }
// the automatic value of every version, from its name, made unique: {versionId: 'promotion', ...}
export function autoValues(cfg){
  const out={}; const used=new Set();
  for (const v of cfg.versions){
    const base=slugOf(v.label); let s=base, k=2; while (used.has(s)) s=`${base}_${k++}`;
    used.add(s); out[v.id]=s;
  }
  return out;
}
// the condition of a group of versions: each version's automatic condition, joined with "or" when there are several
export function groupCondition(cfg, versions){
  const vals=autoValues(cfg);
  const parts=versions.map(i=>caseCond(AUTO_FIELD, 'text', vals[cfg.versions[i].id])).filter(Boolean);
  if (parts.length<=1) return parts[0]||'';
  return parts.map(p=>`(${p})`).join(' or ');
}

/**
 * The branches of one region, in the order they are written. {kind:'if'|'elif', cond, group}.
 * Groups with no text need no branch: those versions simply get nothing there.
 */
export function regionBranches(region, cfg){
  const out=[];
  for (const g of region.groups) if (!g.empty) out.push({group:g, cond:groupCondition(cfg, g.versions)});
  out.forEach((b,k)=>{ b.kind=k?'elif':'if'; });
  return out;
}
// The line for a branch. docxtpl joins a {%- … -%} line with the paragraph before / after it (so no empty paragraph is left),
// but it breaks the file when that neighbour is a table: dashes are used only next to paragraphs.
export function markerText(kind, cond, before=true, after=true){
  const l=before?'{%-':'{%', r=after?'-%}':'%}';
  if (kind==='endif') return `${l} endif %}`;
  if (kind==='else') return `${l} else ${r}`;
  if (kind==='elif') return `${l} elif ${cond} ${r}`;
  return `{% if ${cond} ${r}`;
}

/* ======================= reading the files ======================= */
const stripExt=n=>String(n).replace(/\.docx$/i,'');
let seq=0;
export async function readVersion(file){
  const name=file.name;
  if (!/\.docx$/i.test(name)) throw new Error(`${name} is not a .docx file.`);
  let buf; try { buf=await file.arrayBuffer(); } catch(e){ throw new Error(`${name} could not be read.`); }
  if (!buf || !buf.byteLength) throw new Error(`${name} is empty (0 bytes).`);
  let zip; try { zip=await JSZip.loadAsync(buf); } catch(e){ throw new Error(`${name} is not a .docx file.`); }
  const ct=zip.file('[Content_Types].xml')?await zip.file('[Content_Types].xml').async('string'):'';
  const m=ct.match(/PartName="\/([^"]+)"\s+ContentType="application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document\.main\+xml"/) || ct.match(/ContentType="application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document\.main\+xml"\s+PartName="\/([^"]+)"/);
  const main=m?m[1]:'word/document.xml'; if (!zip.file(main)) throw new Error(`${name} has no letter text in it. Try saving it again from Word.`);
  let doc; try { doc=parseXml(await zip.file(main).async('string')); } catch(e){ throw new Error(`${name} could not be read. Try saving it again from Word.`); }
  unwrapMergeFields(doc);
  const blocks=topBlocksOf(doc);
  return {id:'v'+(++seq), name, label:stripExt(name), buf, doc, blocks};
}

/** Reads the dropped files (kept in memory only). Starts or extends state.combine; returns {added, errors}. */
export async function loadVersions(files){
  const errors=[]; const added=[]; const c=state.combine;
  const have=new Set((c?c.versions:[]).map(v=>v.name+':'+v.buf.byteLength));
  for (const f of files){
    try {
      const v=await readVersion(f);
      if (have.has(v.name+':'+v.buf.byteLength)){ errors.push(`${v.name} is already in the list.`); continue; }
      have.add(v.name+':'+v.buf.byteLength); added.push(v);
    } catch(e){ errors.push(e.message); }
  }
  if (added.length || c){
    const cur=state.combine||{versions:[], base:0, loose:true};
    cur.versions.push(...added); cur.errors=errors; state.combine=cur;
  }
  notify();
  return {added:added.length, errors};
}
export function combineCancel(){ state.combine=null; notify(); }
export function combineRemove(id){
  const c=state.combine; if (!c) return; const i=c.versions.findIndex(v=>v.id===id); if (i<0) return;
  const baseId=c.versions[c.base]&&c.versions[c.base].id; c.versions.splice(i,1);
  c.base=Math.max(0, c.versions.findIndex(v=>v.id===baseId)); notify();
}
export function combineMove(id, delta){
  const c=state.combine; if (!c) return; const i=c.versions.findIndex(v=>v.id===id); const j=i+delta;
  if (i<0 || j<0 || j>=c.versions.length) return;
  const baseId=c.versions[c.base].id; const [v]=c.versions.splice(i,1); c.versions.splice(j,0,v);
  c.base=c.versions.findIndex(x=>x.id===baseId); notify();
}
export function combineMoveTo(id, toIndex){
  const c=state.combine; if (!c) return; const i=c.versions.findIndex(v=>v.id===id); if (i<0) return;
  combineMove(id, Math.max(0, Math.min(c.versions.length-1, toIndex))-i);
}
export function combineSetBase(id){ const c=state.combine; if (!c) return; const i=c.versions.findIndex(v=>v.id===id); if (i>=0){ c.base=i; notify(); } }
export function combineSetLoose(on){ const c=state.combine; if (!c) return; c.loose=!!on; notify(); }
export function combineSetLabel(id, label){ const v=combineVersion(id); if (v){ v.label=label; notify(); } }
const combineVersion=id=>state.combine && state.combine.versions.find(v=>v.id===id);

/* ======================= what the screen shows ======================= */
const short=(t,n=140)=>t.length>n?t.slice(0,n)+'…':t;
let cache=null;
function planOf(c){
  const key=JSON.stringify([c.versions.map(v=>v.id), c.base, c.loose]);
  if (cache && cache.key===key && cache.vs.every((v,i)=>v===c.versions[i])) return cache.plan;
  const plan=planVersions(c.versions.map(v=>v.blocks), {base:c.base, loose:c.loose});
  cache={key, vs:[...c.versions], plan}; return plan;
}
export function combineView(){
  const c=state.combine; if (!c) return null;
  const n=c.versions.length;
  const plan=n>=2?planOf(c):{regions:[], sameCount:0, order:[], merged:[]};
  const label=i=>c.versions[i].label;
  const regions=plan.regions.map((r,k)=>{
    const prev=r.prev>=0?plan.merged[r.prev]:null;
    return {
      index:k, after:prev&&prev.text?short(prev.text,60):'',
      groups:r.groups.map(g=>{
        const cond=groupCondition(c, g.versions);
        return {versions:g.versions.map(label), english:cond?(condEnglish(cond)||cond):'', cond, empty:g.empty,
          texts:g.blocks.filter(b=>b.text).map(b=>b.text), preview:g.blocks.filter(b=>b.text).map(b=>short(b.text)).join(' ')};
      }),
    };
  });
  return {regions, sameCount:plan.sameCount, differ:regions.length, ready:n>=2, autoField:AUTO_FIELD};
}

/* ======================= build the combined template ======================= */
/**
 * Opens the base version as the letter, then adds every other version's differing paragraphs in ONE edit (one undo step).
 * Resolves to {regions, added, images, lists} or false (with a toast saying why).
 */
export async function applyCombine(){
  const c=state.combine; if (!c) return false;
  if (c.versions.length<2){ toast('Add at least two versions to combine.'); return false; }
  const plan=planOf(c); const base=c.versions[c.base];
  if (!plan.regions.length){ toast('These versions have the same text, so there is nothing to combine.'); return false; }
  try { await loadDocx(base.buf, base.name, false); } catch(e){ console.warn(e); toast(e.message); return false; }
  const st={images:0, lists:0}; let added=0, done=0;
  const res=sourceEdit(docs=>{
    const docA=docs[state.mainPath]; const A=topBlocksOf(docA);
    if (A.length!==base.blocks.length) return {cancel:true};
    const body=docA.getElementsByTagNameNS(W,'body')[0]; const sect=[...body.childNodes].find(x=>isW(x,'sectPr'))||null;
    const mkP=()=>docA.createElementNS(W,'w:p'); const marks=[];
    const marker=(kind, cond)=>{ const p=mkP(); marks.push({el:p, kind, cond}); return p; };
    for (const r of plan.regions){
      const branches=regionBranches(r, c); if (!branches.length) continue;
      const baseIdx=r.content[c.base].map(b=>b.bi);
      const baseEls=baseIdx.map(i=>A[i].el);
      const baseBranch=baseEls.length?branches.findIndex(b=>b.group && b.group.versions.includes(c.base)):-1;
      const nextRef=r.next>=0 && plan.merged[r.next].refs[c.base]!=null ? A[plan.merged[r.next].refs[c.base]].el : sect;
      const parts=branches.map(b=>{
        const nodes=[marker(b.kind, b.cond)];
        if (b.group && !b.group.versions.includes(c.base)){
          const src=b.group.versions[0];
          for (const blk of b.group.blocks){ for (const n of importBlocks(docA, c.versions[src].blocks[blk.bi].el, st)){ nodes.push(n); added++; } }
        }
        return nodes;
      });
      const end=marker('endif');
      if (baseBranch<0){ for (const nodes of parts) for (const n of nodes) body.insertBefore(n, nextRef); body.insertBefore(end, nextRef); }
      else {
        const first=baseEls[0], last=baseEls[baseEls.length-1];
        parts.forEach((nodes,k)=>{ if (k<=baseBranch) for (const n of nodes.slice(0,k===baseBranch?1:nodes.length)) body.insertBefore(n, first); });
        let cursor=last;
        parts.forEach((nodes,k)=>{ if (k>baseBranch) for (const n of nodes){ body.insertBefore(n, cursor.nextSibling); cursor=n; } });
        body.insertBefore(end, cursor.nextSibling);
      }
      done++;
    }
    // now that everything is in place: which neighbours are paragraphs decides where the dashes go
    const sib=(el,dir)=>{ for (let n=dir<0?el.previousSibling:el.nextSibling; n; n=dir<0?n.previousSibling:n.nextSibling) if (n.nodeType===1) return n; return null; };
    const newLogic=marks.map(m=>{
      const prev=sib(m.el,-1), next=sib(m.el,1);
      const before=isW(prev,'p'), after=isW(next,'p');
      // a line that joins the next paragraph keeps that paragraph's formatting
      if (m.kind==='if' && after){ const pp=childW(next,'pPr'); if (pp){ const cp=pp.cloneNode(true); for (const x of [...cp.getElementsByTagNameNS(W,'sectPr')]) x.parentNode.removeChild(x); m.el.appendChild(cp); } }
      return {el:m.el, text:markerText(m.kind, m.cond, before, after), place:'end', extra:{mg:1}};
    });
    return {newLogic};
  });
  if (res.cancel){ toast('Could not combine these versions.'); return false; }
  const report={regions:done, added, images:st.images, lists:st.lists, versions:c.versions.length, base:base.label};
  state.combine=null; setView('source'); setTab('logic', {open:true}); notify();
  toast(combineToast(report));
  return report;
}
export function combineToast(r){
  let s=`Combined ${r.versions} versions. Each difference is an if / else block — set who sees which in Conditions.`;
  if (r.images) s+=` ${r.images} image${r.images>1?'s':''} in the other versions couldn’t be copied.`;
  if (r.lists) s+=` Numbered or bulleted paragraphs from the other versions use ${r.base}’s list styles, so check the numbering.`;
  return s;
}
