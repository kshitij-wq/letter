// Combine several client versions of one letter into one template. No DOM drawing in this module.
// The text that is the same in every version stays once; the paragraphs that differ sit side by side inside
// {% if %} / {% elif %} / {% else %} / {% endif %} lines, one branch per group of versions that share the same text.
import JSZip from 'jszip'
import { tagSyntaxProblem } from './checks.js'
import { condEnglish } from './conditions.js'
import { unwrapMergeFields } from './docx.js'
import { blockMatcher, caseCond, importBlocks, sourceEdit, topBlocksOf } from './edits.js'
import { notify, toast } from './events.js'
import { W, cleanCondExpr, isW, parseXml } from './helpers.js'
import { loadDocx } from './load.js'
import { setTab, setView } from './steps.js'
import { state } from './state.js'

/* ======================= pure logic (works on plain {kind, text} lists, no DOM) ======================= */

// pairs [i, j] of equal blocks, in order (the same longest-common-subsequence walk as computeHunks)
export function matchPairs(A, B, loose){
  const eq=blockMatcher(A, B, loose); const n=A.length, m=B.length;
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
  return {regions, sameCount:al.sameCount, merged:al.merged, order:al.order, base:opts.base||0};
}

/* ---- conditions ---- */
export function cleanField(f){ return cleanCondExpr(f||'').replace(/^\{\{\s*|\s*\}\}$/g,'').trim(); }
export function versionCondition(cfg, v){
  const c=v.cond||{}; if (c.mode==='else') return '';
  if (c.mode==='raw') return cleanCondExpr(c.raw||'');
  const f=cleanField(cfg.field); if (!f) return '';
  return caseCond(f, cfg.match||'text', c.value||'');
}
// the condition of a group of versions: all "one field decides" values in one list, typed conditions joined with "or"
export function groupCondition(cfg, versions){
  const vs=versions.map(i=>cfg.versions[i]).filter(v=>v.cond.mode!=='else');
  const f=cleanField(cfg.field);
  const vals=vs.filter(v=>v.cond.mode!=='raw').map(v=>String(v.cond.value||'').trim()).filter(Boolean);
  const raws=vs.filter(v=>v.cond.mode==='raw').map(v=>cleanCondExpr(v.cond.raw||'')).filter(Boolean);
  const parts=[]; if (vals.length && f){ const c=caseCond(f, cfg.match||'text', vals.join(',')); if (c) parts.push(c); }
  for (const r of raws) parts.push(r);
  if (parts.length<=1) return parts[0]||'';
  const lead=vals.length&&f?1:0;   // the value list is safe next to "or" as it is; typed conditions get brackets
  return parts.map((p,k)=>k<lead?p:`(${p})`).join(' or ');
}
const valuesOf=v=>String((v.cond||{}).value||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);

/** What stops "Combine into one template": plain sentences, each with the version it is about (when there is one). */
export function validateCombine(cfg){
  const out=[]; const vs=cfg.versions;
  if (vs.length<2){ out.push({text:'Add at least two versions to combine.'}); return out; }
  const elses=vs.filter(v=>v.cond.mode==='else');
  if (elses.length>1) out.push({text:'Only one version can be “Everything else”.', id:elses[1].id});
  const needField=vs.some(v=>v.cond.mode==='value');
  if (needField && !cleanField(cfg.field)) out.push({text:'Pick the field that decides which version a letter gets.'});
  const seen=new Map();
  for (const v of vs){
    const c=v.cond;
    if (c.mode==='else') continue;
    if (c.mode==='raw'){
      const expr=cleanCondExpr(c.raw||'');
      if (!expr){ out.push({text:`Write the condition for ${v.label}.`, id:v.id}); continue; }
      const bad=tagSyntaxProblem(`{% if ${expr} %}`);
      if (bad) out.push({text:`${v.label}: ${bad}`, id:v.id});
      continue;
    }
    const vals=valuesOf(v);
    if (!vals.length){ out.push({text:`Choose the value for ${v.label}, or mark one version “Everything else”.`, id:v.id}); continue; }
    if ((cfg.match||'text')==='number' && !caseCond(cleanField(cfg.field)||'x', 'number', c.value)){ out.push({text:`${v.label}: “${c.value}” isn't a number. Switch to “Match text” or fix the value.`, id:v.id}); continue; }
    for (const x of vals){
      if (seen.has(x) && seen.get(x)!==v.id){ const other=vs.find(o=>o.id===seen.get(x)); out.push({text:`${v.label} and ${other?other.label:'another version'} use the same value “${x}”.`, id:v.id}); }
      else seen.set(x, v.id);
    }
  }
  return out;
}

/**
 * The branches of one region, in the order they are written. {kind:'if'|'elif'|'else', cond, group|null}.
 * Groups with no text need no branch, unless the "everything else" version has text there: then they get an empty branch of
 * their own, so they do not fall into the else.
 */
export function regionBranches(region, cfg){
  const elseV=cfg.versions.findIndex(v=>v.cond.mode==='else');
  const hasElse=g=>elseV>=0 && g.versions.includes(elseV);
  const elseG=region.groups.find(hasElse)||null;
  const out=[];
  for (const g of region.groups) if (!g.empty && !hasElse(g)) out.push({group:g, cond:groupCondition(cfg, g.versions)});
  if (elseG && !elseG.empty){
    const emptyVs=region.groups.filter(g=>g.empty && !hasElse(g)).flatMap(g=>g.versions);
    if (emptyVs.length) out.push({group:null, cond:groupCondition(cfg, emptyVs), emptyVersions:emptyVs});
    out.push({group:elseG, cond:'', isElse:true});
  }
  out.forEach((b,k)=>{ b.kind=b.isElse?(k?'else':'if'):(k?'elif':'if'); if (b.kind==='if' && b.isElse) b.cond='true'; });
  return out;
}
export const branchLine=b=>b.kind==='else'?'{%- else -%}':b.kind==='elif'?`{%- elif ${b.cond} -%}`:`{% if ${b.cond} -%}`;
export const ENDIF_LINE='{%- endif %}';

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
  return {id:'v'+(++seq), name, label:stripExt(name), buf, doc, blocks, cond:{mode:'value', value:'', raw:''}};
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
    const cur=state.combine||{versions:[], base:0, field:'', match:'text', loose:true};
    cur.versions.push(...added); state.combine=cur;
  }
  notify();
  return {added:added.length, errors};
}
export function combineOpen(){ if (!state.combine) state.combine={versions:[], base:0, field:'', match:'text', loose:true}; notify(); }
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
export function combineSet(key, value){ const c=state.combine; if (!c) return; c[key]=value; notify(); }
export function combineSetLabel(id, label){ const v=combineVersion(id); if (v){ v.label=label; notify(); } }
export function combineSetCond(id, patch){
  const v=combineVersion(id); if (!v) return;
  const c=state.combine;
  if (patch.mode==='else') for (const o of c.versions) if (o!==v && o.cond.mode==='else') o.cond.mode='value';
  Object.assign(v.cond, patch); notify();
}
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
  const problems=validateCombine(c);
  const label=i=>c.versions[i].label;
  const regions=plan.regions.map((r,k)=>{
    const prev=r.prev>=0?plan.merged[r.prev]:null;
    const branches=problems.length?null:regionBranches(r, c);
    return {
      index:k, after:prev&&prev.text?short(prev.text,60):'',
      groups:r.groups.map(g=>{
        const cond=groupCondition(c, g.versions); const isElse=g.versions.some(i=>c.versions[i].cond.mode==='else');
        const english=isElse?'Everything else':(cond?(condEnglish(cond)||cond):'');
        return {versions:g.versions.map(label), english, cond, isElse, empty:g.empty, kind:g.blocks[0]?g.blocks[0].kind:'p',
          texts:g.blocks.filter(b=>b.text).map(b=>b.text), preview:g.blocks.filter(b=>b.text).map(b=>short(b.text)).join(' ')};
      }),
      branches:branches&&branches.map(b=>branchLine(b)),
    };
  });
  return {plan, problems, regions, sameCount:plan.sameCount, differ:regions.length, ready:n>=2 && !problems.length};
}

/* ======================= build the combined template ======================= */
/**
 * Opens the base version as the letter, then adds every other version's differing paragraphs in ONE edit (one undo step).
 * Resolves to {regions, added, images, lists} or false (with a toast saying why).
 */
export async function applyCombine(){
  const c=state.combine; if (!c) return false;
  const problems=validateCombine(c); if (problems.length){ toast(problems[0].text); return false; }
  const plan=planOf(c); const base=c.versions[c.base]; const others=c.versions;
  if (!plan.regions.length){ toast('These versions have the same text, so there is nothing to combine.'); return false; }
  try { await loadDocx(base.buf, base.name, false); } catch(e){ console.warn(e); toast(e.message); return false; }
  const st={images:0, lists:0}; let added=0, done=0;
  const res=sourceEdit(docs=>{
    const docA=docs[state.mainPath]; const A=topBlocksOf(docA);
    if (A.length!==base.blocks.length) return {cancel:true};
    const body=docA.getElementsByTagNameNS(W,'body')[0]; const sect=[...body.childNodes].find(x=>isW(x,'sectPr'))||null;
    const mkP=()=>docA.createElementNS(W,'w:p'); const newLogic=[];
    const marker=text=>{ const p=mkP(); newLogic.push({el:p, text, place:'end', extra:{mg:1}}); return p; };
    for (const r of plan.regions){
      const branches=regionBranches(r, c); if (!branches.length) continue;
      const baseIdx=r.content[c.base].map(b=>b.bi);
      const baseEls=baseIdx.map(i=>A[i].el);
      const baseBranch=baseEls.length?branches.findIndex(b=>b.group && b.group.versions.includes(c.base)):-1;
      const nextRef=r.next>=0 && plan.merged[r.next].refs[c.base]!=null ? A[plan.merged[r.next].refs[c.base]].el : sect;
      const parts=branches.map(b=>{
        const nodes=[marker(branchLine(b))];
        if (b.group && !b.group.versions.includes(c.base)){
          const src=b.group.versions[0];
          for (const blk of b.group.blocks){ for (const n of importBlocks(docA, others[src].blocks[blk.bi].el, st)){ nodes.push(n); added++; } }
        }
        return nodes;
      });
      const end=marker(ENDIF_LINE);
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
    return {newLogic};
  });
  if (res.cancel){ toast('Could not combine these versions.'); return false; }
  const report={regions:done, added, images:st.images, lists:st.lists, versions:c.versions.length, base:base.label};
  state.combine=null; state.combineDone=report; setView('source'); setTab('logic', {open:true}); notify();
  toast(combineToast(report));
  return report;
}
export function combineToast(r){
  let s=`Combined ${r.versions} versions: ${r.regions} place${r.regions===1?'':'s'} differ. Added ${r.added} paragraph${r.added===1?'':'s'} as if / else blocks; they are listed here.`;
  if (r.images) s+=` ${r.images} image${r.images>1?'s':''} in the other versions couldn’t be copied.`;
  if (r.lists) s+=` Numbered or bulleted paragraphs from the other versions use ${r.base}’s list styles, so check the numbering.`;
  return s;
}
