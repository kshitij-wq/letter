// Combine several client versions of one letter into one template. No DOM drawing in this module.
// Written the way people write these templates by hand: text that is the same everywhere stays once; a paragraph, table
// row or a few words that only some versions have get an if / else on a yes / no field (custom_schema.promotion == "yes"),
// one field per difference that versions share, so "promotion" switches every promotion paragraph at once.
import JSZip from 'jszip'
import { CAT } from './catalog.js'
import { condEnglish } from './conditions.js'
import { insertAt, paraModel, setPreserve, unwrapMergeFields } from './docx.js'
import { blockMatcher, caseCond, importBlocks, looseText, sourceEdit, topBlocksOf } from './edits.js'
import { notify, toast } from './events.js'
import { W, isW, parseXml, serialize } from './helpers.js'
import { loadDocx } from './load.js'
import { normAnchor } from './setup.js'
import { setTab, setView } from './steps.js'
import { state } from './state.js'
import { lastCellPara } from './tables.js'

/* ======================= pure logic (works on plain {kind, text, rows?} lists, no DOM) ======================= */

const wordCh=c=>/[\p{L}\p{N}_]/u.test(c||'');
const openIn=s=>s.lastIndexOf('«')>s.lastIndexOf('»') || s.lastIndexOf('{')>s.lastIndexOf('}') || s.lastIndexOf('<<')>s.lastIndexOf('>>');
/** The common start and end of several texts, in characters, never cutting a word, a «field» or a {{ tag }}. */
export function commonEnds(texts){
  const t0=texts[0]; const min=Math.min(...texts.map(t=>t.length)); let pre=0, suf=0;
  while (pre<min && texts.every(t=>t[pre]===t0[pre])) pre++;
  while (suf<min-pre && texts.every(t=>t[t.length-1-suf]===t0[t0.length-1-suf])) suf++;
  const bad=(t,i)=>(wordCh(t[i-1]) && wordCh(t[i])) || openIn(t.slice(0,i));
  while (pre>0 && texts.some(t=>bad(t,pre))) pre--;
  while (suf>0 && texts.some(t=>bad(t,t.length-suf))) suf--;
  return {pre, suf};
}
// two paragraphs are "the same paragraph, a few words changed" when at least half of the longer one is shared at the ends
export function similarText(a, b){
  if (!a || !b) return false;
  const {pre, suf}=commonEnds([a, b]); return pre+suf>=0.5*Math.max(a.length, b.length);
}
const rowKey=(t, loose)=>loose?looseText(t):t;
function lcsLen(a, b){
  const L=Array.from({length:a.length+1},()=>new Int32Array(b.length+1));
  for (let i=a.length-1;i>=0;i--) for (let j=b.length-1;j>=0;j--) L[i][j]=a[i]===b[j]?L[i+1][j+1]+1:Math.max(L[i+1][j],L[i][j+1]);
  return L[0][0];
}
// two tables are "the same table, some rows changed" when the first row is the same and at least half the rows are
export function similarRows(ra, rb, loose){
  if (!ra || !rb || !ra.length || !rb.length) return false;
  const a=ra.map(t=>rowKey(t, loose)), b=rb.map(t=>rowKey(t, loose));
  return a[0]===b[0] && lcsLen(a, b)>=0.5*Math.max(a.length, b.length);
}

/**
 * pairs [i, j, similar] of matching blocks, in order (the most matching text wins). Equal blocks (or, with `loose`, equal apart
 * from numbers and spacing) count most; a paragraph with a few words changed, or a table with some rows changed, counts half
 * and is marked similar; two blank lines count least.
 */
export function matchPairs(A, B, loose){
  const key=x=>({kind:x.kind, text:x.match ?? x.text});
  const eq=blockMatcher(A.map(key), B.map(key), loose, true); const n=A.length, m=B.length;
  const sim=(a, b)=>a.kind===b.kind && (a.kind==='p' ? similarText(a.text, b.text) : a.kind==='tbl' && similarRows(a.rows, b.rows, loose));
  const Wt=Array.from({length:n},()=>new Int8Array(m));
  const L=Array.from({length:n+1},()=>new Int32Array(m+1));
  for (let i=n-1;i>=0;i--) for (let j=m-1;j>=0;j--){
    // blank lines line up with any blank line: they count least, so they never pull real text out of line
    const w=eq(i,j)?(A[i].text?4:1):sim(A[i], B[j])?2:0; Wt[i][j]=w;
    L[i][j]=Math.max(L[i+1][j], L[i][j+1], w?w+L[i+1][j+1]:0);
  }
  const pairs=[]; let i=0, j=0;
  while (i<n && j<m){
    const w=Wt[i][j];
    if (w && L[i][j]===w+L[i+1][j+1]){ pairs.push([i, j, w===2]); i++; j++; }
    else if (L[i][j+1]>=L[i+1][j]) j++; else i++;
  }
  return pairs;
}

const isBlank=b=>b.blank ?? !b.text;
/**
 * Progressive alignment. lists[v] = the top-level blocks ({kind, text, rows?, blank?}) of version v; `base` is the one whose blocks
 * come first. Returns the merged block sequence; each entry says which block of which version it stands for (refs).
 */
export function alignVersions(lists, opts={}){
  const N=lists.length; const base=opts.base||0; const loose=opts.loose!==false;
  const order=[base, ...lists.map((_,i)=>i).filter(i=>i!==base)];
  const entry=(b, v, bi)=>({kind:b.kind, text:b.text, match:b.match, rows:b.rows, blank:isBlank(b), refs:{[v]:bi}});
  let merged=lists[base].map((b,bi)=>entry(b, base, bi));
  for (const v of order.slice(1)){
    const B=lists[v]; const pairs=matchPairs(merged, B, loose); const out=[];
    let ai=0, bj=0;
    for (const [i,j] of [...pairs, [merged.length, B.length]]){
      while (ai<i) out.push(merged[ai++]);
      while (bj<j){ out.push(entry(B[bj], v, bj)); bj++; }
      if (i<merged.length){ merged[i].refs[v]=j; if (!isBlank(B[j])) merged[i].blank=false; out.push(merged[i]); ai=i+1; bj=j+1; }
    }
    merged=out;
  }
  const sameCount=merged.filter(e=>Object.keys(e.refs).length===N && e.text).length;
  return {merged, sameCount, order};
}

/* ---- sets of versions: sorted arrays of version indexes ---- */
const keyOf=s=>s.join(',');
const minus=(a, b)=>a.filter(x=>!b.includes(x));
const inter=(a, b)=>a.filter(x=>b.includes(x));
const same=(a, b)=>a.length===b.length && a.every((x,i)=>x===b[i]);
const presence=e=>Object.keys(e.refs).map(Number).sort((a,b)=>a-b);

/** Groups of versions that have the same text in one merged entry, the host version's group first. */
function variantsOf(lists, e, host, order, loose){
  const groups=[]; const by=new Map();
  for (const v of [host, ...order.filter(x=>x!==host)]){
    if (e.refs[v]==null) continue; const b=lists[v][e.refs[v]];
    const k=b.kind==='tbl' ? (b.rows||[b.text]).map(t=>rowKey(t, loose)).join('\n') : rowKey(b.text, loose);
    let g=by.get(k); if (!g){ g={versions:[], v, text:b.text, rows:b.rows}; by.set(k,g); groups.push(g); }
    g.versions.push(v);
  }
  for (const g of groups) g.versions.sort((a,b)=>a-b);
  return groups;
}

/**
 * The whole plan. Every difference is written as a chain of branches; each branch needs a condition that is true for
 * exactly its versions among the versions that reach it (`ctx`). Those needs are then met with as few yes / no fields as can be:
 * one field per set of versions, reused wherever it fits (a paragraph only promotions have, and the promotion words in a table).
 *
 * script: what goes into the letter, in order: {op:'block', k} (merged entry k) or {op:'mark', kind, need} (an if / elif / else / endif line).
 * Entries with words or rows that differ carry .inline / .rowPlan / .alts with their own branches.
 */
export function planVersions(lists, opts={}){
  const N=lists.length; const base=opts.base||0; const loose=opts.loose!==false;
  const {merged, sameCount, order}=alignVersions(lists, {base, loose});
  const ALL=order.slice().sort((a,b)=>a-b);
  const needs=[]; const script=[]; const items=[];
  const need=(G, ctx, text)=>{ needs.push({G, ctx, text}); return needs.length-1; };
  // branches of one chain of disjoint groups: if / elif …, the last one an else when it is all that is left
  const chain=(groups, ctx, textOf)=>{
    let rest=ctx; const out=[];
    groups.forEach((g,i)=>{
      if (i && i===groups.length-1 && same(rest, g.versions)) out.push({kind:'else', g});
      else out.push({kind:i?'elif':'if', g, need:need(g.versions, rest, textOf(g))});
      rest=minus(rest, g.versions);
    });
    return out;
  };
  const hostOf=e=>e.refs[base]!=null?base:order.find(v=>e.refs[v]!=null);

  // words or rows that differ inside one entry
  merged.forEach((e,k)=>{
    if (e.blank) return;
    const P=presence(e); const host=hostOf(e); const groups=variantsOf(lists, e, host, order, loose);
    if (groups.length<2) return;
    if (e.kind==='p'){
      const {pre, suf}=commonEnds(groups.map(g=>g.text));
      for (const g of groups) g.mid=g.text.slice(pre, g.text.length-suf);
      const branches=chain(groups.filter(g=>g.mid), P, g=>g.mid);
      e.inline={groups, branches};
      items.push({kind:'inline', k, ctx:P, branches, empty:minus(P, branches.flatMap(b=>b.g.versions))});
    } else if (e.kind==='tbl' && groups.every(g=>g.rows)){
      // rows of every variant aligned like the blocks, one variant per group
      let rows=groups[0].rows.map((t,ri)=>({text:t, refs:{[groups[0].v]:ri}, gs:[0]}));
      groups.slice(1).forEach((g,gi)=>{
        const pairs=matchPairs(rows.map(r=>({kind:'r', text:r.text})), g.rows.map(t=>({kind:'r', text:t})), loose);
        const out=[]; let ai=0, bj=0;
        for (const [i,j] of [...pairs, [rows.length, g.rows.length]]){
          while (ai<i) out.push(rows[ai++]);
          while (bj<j){ out.push({text:g.rows[bj], refs:{[g.v]:bj}, gs:[gi+1]}); bj++; }
          if (i<rows.length){ rows[i].refs[g.v]=j; rows[i].gs.push(gi+1); out.push(rows[i]); ai=i+1; bj=j+1; }
        }
        rows=out;
      });
      for (const r of rows) r.versions=r.gs.flatMap(gi=>groups[gi].versions).sort((a,b)=>a-b);
      if (same(rows[0].versions, P)){
        const conds=[]; rows.forEach((r,ri)=>{ if (!same(r.versions, P)) conds.push({ri, need:need(r.versions, P, r.text)}); });
        e.rowPlan={groups, rows, conds};
        items.push({kind:'rows', k, ctx:P, rows:conds.map(c=>({versions:rows[c.ri].versions, text:rows[c.ri].text, need:c.need}))});
        return;
      }
    }
    if (e.kind!=='p'){   // a table (or content control) that differs too much: each variant whole, side by side
      const branches=chain(groups, P, g=>g.text);
      e.alts={groups, branches};
      items.push({kind:'tables', k, ctx:P, branches, empty:[]});
    }
  });

  // paragraphs and tables only some versions have: runs of entries with the same versions; disjoint runs side by side form one chain
  const textOfRuns=runs=>runs.flatMap(r=>r.ks).map(k=>merged[k].text).filter(Boolean).slice(0,6).join('\n');
  const firstK=ks=>ks.find(k=>!merged[k].blank) ?? ks[0];
  // runs side by side for different versions are one if / elif / else only when together they cover every version (alternatives);
  // otherwise each gets an if of its own
  const chainsOf=(runs, ctx)=>{
    let cur=null; const out=[]; for (const r of runs){ if (!cur || cur.some(x=>inter(x.set, r.set).length)){ cur=[]; out.push(cur); } cur.push(r); }
    return out.flatMap(ch=>same([...new Set(ch.flatMap(r=>r.set))].sort((a,b)=>a-b), ctx) ? [ch] : ch.map(r=>[r]));
  };
  // runs of one region, among the versions `ctx`. When they are all parts of one bigger difference (every run is in no
  // consultant letter, say), and some text is in all of those, they go inside one if for that, as people write it, and the
  // smaller differences nest inside.
  const emitRuns=(runs, ctx)=>{
    const U=[...new Set(runs.flatMap(r=>r.set))].sort((a,b)=>a-b);
    if (runs.length>1 && !same(U, ctx) && runs.some(r=>same(r.set, U)) && chainsOf(runs, ctx).length>1){
      const n=need(U, ctx, textOfRuns(runs)); const ks=runs.flatMap(r=>r.ks);
      script.push({op:'mark', kind:'if', need:n});
      items.push({kind:'blocks', k:firstK(ks), ctx, branches:[{kind:'if', need:n, g:{versions:U, run:{ks}}}], empty:minus(ctx, U)});
      let sub=[]; const flushSub=()=>{ if (sub.length) emitRuns(sub, U); sub=[]; };
      for (const r of runs){ if (same(r.set, U)){ flushSub(); for (const k of r.ks) script.push({op:'block', k}); } else sub.push(r); }
      flushSub();
      script.push({op:'mark', kind:'endif'});
      return;
    }
    for (const ch of chainsOf(runs, ctx)){
      const branches=chain(ch.map(r=>({versions:r.set, run:r})), ctx, g=>textOfRuns([g.run]));
      for (const b of branches){ script.push({op:'mark', kind:b.kind, need:b.need}); for (const k of b.g.run.ks) script.push({op:'block', k}); }
      script.push({op:'mark', kind:'endif'});
      items.push({kind:'blocks', k:firstK(ch[0].ks), ctx, branches, empty:minus(ctx, branches.flatMap(b=>b.g.versions))});
    }
  };
  // a region: runs and the blank lines between them, up to the next text every version has
  let seq=[];
  const fit=(B, S)=>N-minus(B, S).length-minus(S, B).length;   // versions that get this blank line right
  const flush=()=>{
    const before=[], after=[];
    // each blank line goes with the run before or after it, or outside the if (everyone), or nowhere: whatever is right for most versions
    seq.forEach((x,i)=>{
      if (x.run) return;
      const prev=seq.slice(0,i).reverse().find(y=>y.run), next=seq.slice(i+1).find(y=>y.run); const B=presence(merged[x.k]);
      const opts=[]; if (prev) opts.push([fit(B, prev.set), 'prev']); if (next) opts.push([fit(B, next.set), 'next']);
      if (!prev || !next) opts.push([fit(B, ALL), 'out']);
      opts.push([fit(B, []), 'drop']);
      const best=opts.reduce((m,o)=>o[0]>m[0]?o:m)[1];
      if (best==='prev') prev.ks.push(x.k); else if (best==='next') (next.pre ||= []).push(x.k); else if (best==='out') (prev?after:before).push(x.k);
    });
    const region=seq.filter(x=>x.run); for (const r of region) if (r.pre) r.ks.unshift(...r.pre);
    for (const k of before) script.push({op:'block', k});
    emitRuns(region, ALL);
    for (const k of after) script.push({op:'block', k});
    seq=[];
  };
  merged.forEach((e,k)=>{
    const P=presence(e);
    if (P.length===N){ flush(); script.push({op:'block', k}); return; }
    if (e.blank){ seq.push({k}); return; }
    const key=keyOf(P); let li=seq.length-1; while (li>=0 && !seq[li].run) li--;
    // the same versions again after only blank lines: one run, blank lines included
    if (li>=0 && seq[li].key===key){ seq[li].ks.push(...seq.splice(li+1).map(x=>x.k), k); return; }
    seq.push({run:true, key, set:P, ks:[k]});
  });
  flush();
  items.sort((a,b)=>a.k-b.k);

  // the yes / no fields: first for differences between all versions (the smaller side says yes), then the rest
  const flags=[];
  const add=(set, text)=>{ const f={set, key:keyOf(set), text}; flags.push(f); return f; };
  // between all versions the smaller side says yes (consultant: yes for 1 of 10); inside a difference, the versions that have the text
  const smaller=(G, ctx)=>{ const o=minus(ctx, G); return ctx.length<N || G.length<=o.length?G:o; };
  const find=(G, ctx)=>{
    // "no" only between all versions (consultant == "no"): inside a difference it would read as an unrelated reason
    for (const f of flags){ if (same(inter(f.set, ctx), G)) return [{f, yes:true}]; if (ctx.length===N && same(minus(ctx, f.set), G)) return [{f, yes:false}]; }
    const parts=flags.map(f=>({f, s:inter(f.set, ctx)})).filter(x=>x.s.length && !minus(x.s, G).length).sort((a,b)=>b.s.length-a.s.length);
    const pick=[]; let cov=[];
    for (const x of parts){ if (minus(x.s, cov).length){ pick.push(x); cov=[...new Set([...cov, ...x.s])].sort((a,b)=>a-b); } if (same(cov, G)) break; }
    return same(cov, G) && pick.length<=3 ? pick.map(x=>({f:x.f, yes:true})) : null;
  };
  for (const n of needs) if (n.ctx.length===N && !find(n.G, n.ctx)) add(smaller(n.G, n.ctx), n.text);
  for (const n of needs){ n.terms=find(n.G, n.ctx); if (!n.terms){ add(smaller(n.G, n.ctx), n.text); n.terms=find(n.G, n.ctx); } }
  return {merged, order, sameCount, script, needs, flags, items};
}

/* ---- names and conditions ---- */
export function slugOf(label){ return String(label||'').toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'')||'version'; }
const STOP=new Set(['the','and','for','your','you','our','with','from','this','that','are','dear','subject','has','have','been','will','letter','template','version','final','copy','docx']);
// words of a file name: split at punctuation and at capitals (XYPromotionBonus = xy promotion bonus); codes with digits are left out
const tokens=label=>String(label).split(/[^A-Za-z0-9]+/).filter(w=>w && !/\d/.test(w)).flatMap(w=>w.match(/[A-Z]+(?=[A-Z][a-z])|[A-Z]?[a-z]+|[A-Z]+/g)||[]).map(t=>t.toLowerCase()).filter(t=>t.length>1);
/** A field name for a set of versions: the words in the names of exactly those versions (e.g. "promotion"), else words from the text. */
export function suggestName(set, labels, text){
  const tok=labels.map(l=>new Set(tokens(l)));
  const out=set.length ? tokens(labels[set[0]]).filter((t,i,a)=>a.indexOf(t)===i && !STOP.has(t) && set.every(v=>tok[v].has(t)) && tok.every((s,v)=>set.includes(v) || !s.has(t))) : [];
  if (out.length) return out.slice(0,3).join('_');
  // else the first line of the text with a few real words in it (not a date or a name field)
  const lines=String(text||'').split('\n').map(l=>(l.toLowerCase().replace(/«[^»]*»|\{\{[^}]*\}\}|^\[[^\]]*\]$/g,' ').match(/[a-z]{3,}/g)||[]).filter(w=>!STOP.has(w)));
  return (lines.find(w=>w.length>=2)||lines.find(w=>w.length)||['switch']).slice(0,3).join('_');
}
/** The field of every yes / no switch, {key: 'custom_schema.promotion'}: the person's name for it, or the suggested one, unique. */
// `taken`: names the letters already use for their own values (merge fields, known fields), which a suggested name must not reuse
export function flagFields(plan, labels, names={}, taken=new Set()){
  const out={}; const used=new Set();
  for (const f of plan.flags){
    const raw=String(names[f.key]??'').trim();
    let short=slugOf(raw || suggestName(f.set, labels, f.text));
    if (!raw && taken.has(short)) short='has_'+short;
    let field=raw.includes('.') ? raw.replace(/\s+/g,'') : `custom_schema.${short}`;
    const b=field; let n=2; while (used.has(field)) field=`${b}_${n++}`;
    used.add(field); out[f.key]=field;
  }
  return out;
}
export function needCondition(n, fields){
  const parts=n.terms.map(t=>caseCond(fields[t.f.key], 'text', t.yes?'yes':'no'));
  return parts.length>1 ? parts.map(p=>`(${p})`).join(' or ') : parts[0];
}
// The line for a branch: the tag joins the end of the paragraph before it ({%- …), the way people write them by hand
// ("…Human Resources{% if … %}"), so no empty paragraph is left and every paragraph keeps its own formatting.
export function markerText(kind, cond, join=true, joinNext=false){
  const l=join?'{%-':'{%', r=joinNext?'-%}':'%}';
  if (kind==='endif') return `${l} endif ${r}`;
  if (kind==='else') return `${l} else ${r}`;
  return `${l} ${kind} ${cond} ${r}`;
}
// …and with -%} everything up to the first text of the paragraph after: only join one with nothing before its text
export function startJoinable(p){
  if (!isW(p,'p')) return false;
  const pPr=[...p.childNodes].find(x=>isW(x,'pPr')); if (pPr && pPr.getElementsByTagNameNS(W,'sectPr').length) return false;
  const t=p.getElementsByTagNameNS(W,'t')[0]; if (!t) return false;
  for (const name of KEEP) for (const el of p.getElementsByTagNameNS(W,name)) if (el.compareDocumentPosition(t) & 4) return false;
  return true;
}
const firstRPr=p=>{ const t=p.getElementsByTagNameNS(W,'t')[0]; const r=t && t.parentNode; return r && [...r.childNodes].find(x=>isW(x,'rPr')); };
const headOf=p=>{ const pPr=[...p.childNodes].find(x=>isW(x,'pPr')); const c=pPr?pPr.cloneNode(true):null; if (c) for (const x of [...c.childNodes]) if (isW(x,'rPr')) c.removeChild(x); const rp=firstRPr(p); return (c?serialize(c):'')+'|'+(rp?serialize(rp):''); };
// the paragraph settings of p, with its first run's formatting as the paragraph mark's (the tag run is made from that)
function headPPr(p){
  const d=p.ownerDocument; const pPr=[...p.childNodes].find(x=>isW(x,'pPr')); const c=pPr?pPr.cloneNode(true):d.createElementNS(W,'w:pPr');
  for (const x of [...c.childNodes]) if (isW(x,'rPr')) c.removeChild(x);
  const rp=firstRPr(p); if (rp) c.appendChild(rp.cloneNode(true));
  return c;
}
// docxtpl drops everything between the last text of the paragraph before and a {%- tag: only join a paragraph with nothing after its text
const KEEP=['drawing','pict','object','fldChar','fldSimple','instrText','br','tab','footnoteReference','endnoteReference','commentReference','sym'];
export function joinable(p){
  if (!isW(p,'p')) return false;
  const ts=p.getElementsByTagNameNS(W,'t'); if (!ts.length) return false;
  const lastT=ts[ts.length-1];
  for (const name of KEEP) for (const el of p.getElementsByTagNameNS(W,name)) if (lastT.compareDocumentPosition(el) & 4) return false;
  return true;
}

/* ======================= reading the files ======================= */
const stripExt=n=>String(n).replace(/\.docx$/i,'');
const mainOf=ct=>{ const m=ct.match(/PartName="\/([^"]+)"\s+ContentType="application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document\.main\+xml"/) || ct.match(/ContentType="application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document\.main\+xml"\s+PartName="\/([^"]+)"/); return m?m[1]:'word/document.xml'; };
const CONTENT=['drawing','pict','object','br','sectPr'];
let seq=0;
export async function readVersion(file){
  const name=file.name;
  if (!/\.docx$/i.test(name)) throw new Error(`${name} is not a .docx file.`);
  let buf; try { buf=await file.arrayBuffer(); } catch(e){ throw new Error(`${name} could not be read.`); }
  if (!buf || !buf.byteLength) throw new Error(`${name} is empty (0 bytes).`);
  let zip; try { zip=await JSZip.loadAsync(buf); } catch(e){ throw new Error(`${name} is not a .docx file.`); }
  const ct=zip.file('[Content_Types].xml')?await zip.file('[Content_Types].xml').async('string'):'';
  const main=mainOf(ct); if (!zip.file(main)) throw new Error(`${name} has no letter text in it. Try saving it again from Word.`);
  let doc; try { doc=parseXml(await zip.file(main).async('string')); } catch(e){ throw new Error(`${name} could not be read. Try saving it again from Word.`); }
  unwrapMergeFields(doc);
  const blocks=topBlocksOf(doc);
  for (const b of blocks){
    // a page break, an image or a section break is not a blank line: it gets a text of its own, so it only lines up with its like
    const what=!b.text && CONTENT.find(n=>b.el.getElementsByTagNameNS(W,n).length);
    b.blank=!b.text && !what;
    if (what) b.text={drawing:'[picture]', pict:'[picture]', object:'[object]', br:'[page break]', sectPr:'[section break]'}[what];
    if (b.kind==='tbl') b.rows=[...b.el.childNodes].filter(n=>isW(n,'tr')).map(tr=>normAnchor([...tr.getElementsByTagNameNS(W,'p')].map(p=>paraModel(p).text).join(' | ')));
  }
  // …and it lines up by the text that follows it (the page break before the same section, the signature above the same name)
  blocks.forEach((b,i)=>{ if (b.kind==='p' && !b.blank && !paraModel(b.el).text.trim()){ const nx=blocks.slice(i+1).find(x=>x.text && !x.text.startsWith('[')); b.match=b.text+' '+(nx?nx.text.slice(0,80):''); } });
  return {id:'v'+(++seq), name, label:stripExt(name), buf, doc, blocks, main};
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
    const cur=state.combine||{versions:[], base:0, loose:true, names:{}};
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
// the person's name for one yes / no field, by the versions it is "yes" for (stays when versions move)
export function combineSetName(flagKey, name){
  const c=state.combine; if (!c) return; const plan=planOf(c); const f=plan.flags.find(x=>x.key===flagKey); if (!f) return;
  (c.names ||= {})[f.set.map(i=>c.versions[i].id).join(',')]=name; notify();
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
function fieldsOf(c, plan){
  const names={}; for (const f of plan.flags){ const n=(c.names||{})[f.set.map(i=>c.versions[i].id).join(',')]; if (n!=null) names[f.key]=n; }
  return flagFields(plan, c.versions.map(v=>v.label), names, takenNames(c));
}
function takenNames(c){
  const out=new Set(Object.keys(CAT).map(k=>k.split('.').pop()));
  for (const v of c.versions) for (const b of v.blocks) for (const m of String(b.text).matchAll(/«([^»]+)»|<<([^>]+)>>/g)) out.add(slugOf(m[1]||m[2]));
  return out;
}
export function combineView(){
  const c=state.combine; if (!c) return null;
  const n=c.versions.length;
  const plan=n>=2?planOf(c):{items:[], flags:[], sameCount:0, merged:[], needs:[]};
  const fields=n>=2?fieldsOf(c, plan):{};
  const label=i=>c.versions[i].label;
  const cond=need=>need==null?'':needCondition(plan.needs[need], fields);
  const group=(versions, need, texts, empty)=>{ const cd=cond(need); return {versions:versions.map(label), cond:cd, english:cd?(condEnglish(cd)||cd):'', empty, texts, preview:texts.map(t=>short(t)).join(' ')}; };
  const textsOf=(it, b)=>it.kind==='inline' ? [b.g.mid] : it.kind==='tables' ? [b.g.text] : b.g.run.ks.map(k=>plan.merged[k].text).filter(Boolean);
  const prevText=k=>{ for (let i=k-1;i>=0;i--){ const e=plan.merged[i]; if (e.text && Object.keys(e.refs).length===n) return short(e.text, 60); } return ''; };
  const regions=plan.items.map((it,k)=>{
    const groups=it.kind==='rows'
      ? it.rows.map(r=>group(r.versions, r.need, [r.text], false))
      : it.branches.map(b=>({...group(b.g.versions, b.need, textsOf(it, b), false), ...(b.kind==='else'?{english:'none of the above'}:{})}));
    if (it.empty && it.empty.length) groups.push(group(it.empty, null, [], true));
    const anchor=it.kind==='blocks' ? prevText(it.k) : short(String(plan.merged[it.k].text||'').replace(/^\[table\] /,''), 60);
    return {index:k, kind:it.kind, after:anchor, groups};
  });
  const flags=plan.flags.map((f,k)=>({key:f.key, index:k, field:fields[f.key], name:fields[f.key].replace(/^custom_schema\./,''), versions:f.set.map(label)}));
  return {regions, flags, sameCount:plan.sameCount, differ:regions.length, ready:n>=2};
}

/* ======================= build the combined template ======================= */
const RELS='http://schemas.openxmlformats.org/package/2006/relationships';
const RNS=/officeDocument\/2006\/relationships$/;
const relsPathOf=main=>main.replace(/([^/]+)$/, '_rels/$1.rels');
const dirOf=p=>p.replace(/[^/]*$/, '');
const resolvePath=(dir, t)=>{ const parts=(t.startsWith('/')?t.slice(1):dir+t).split('/'); const out=[]; for (const x of parts){ if (x==='..') out.pop(); else if (x && x!=='.') out.push(x); } return out.join('/'); };
async function partDoc(zip, path){ const f=path && zip.file(path); return f ? parseXml(await f.async('string')) : null; }
function relTarget(rels, type){ for (const r of rels?[...rels.getElementsByTagNameNS(RELS,'Relationship')]:[]) if ((r.getAttribute('Type')||'').endsWith('/'+type)) return r.getAttribute('Target'); return null; }

/**
 * The base file, with what the other versions' copied paragraphs need from their own files: their images, list numbering
 * and styles the base lacks. Returns {buf, maps: {versionIndex: {rel: {oldId: newId}, num: {oldNumId: newNumId}}}}.
 */
async function mergePackage(c, imports){
  const base=c.versions[c.base]; const zip=await JSZip.loadAsync(base.buf); const dir=dirOf(base.main);
  const relsPath=relsPathOf(base.main); const rels=await partDoc(zip, relsPath); const ct=await partDoc(zip, '[Content_Types].xml');
  const numPath=rels && relTarget(rels,'numbering') && resolvePath(dir, relTarget(rels,'numbering'));
  const stylePath=rels && relTarget(rels,'styles') && resolvePath(dir, relTarget(rels,'styles'));
  const num=await partDoc(zip, numPath), sty=await partDoc(zip, stylePath);
  const maps={}; let touched=false;
  const wv=(el,name)=>el.getAttributeNS(W,name);
  for (const [vi, els] of imports){
    const v=c.versions[vi]; const vz=await JSZip.loadAsync(v.buf); const vdir=dirOf(v.main);
    const vrels=await partDoc(vz, relsPathOf(v.main)); const m={rel:{}, num:{}}; maps[vi]=m;
    const all=els.flatMap(el=>[el, ...el.getElementsByTagName('*')]);
    // images
    const ids=new Set(all.flatMap(x=>[...(x.attributes||[])].filter(a=>RNS.test(a.namespaceURI||'')).map(a=>a.value)));
    if (rels && vrels) for (const r of [...vrels.getElementsByTagNameNS(RELS,'Relationship')]){
      const id=r.getAttribute('Id'); if (!ids.has(id) || !/\/image$/.test(r.getAttribute('Type')||'') || r.getAttribute('TargetMode')==='External') continue;
      const src=resolvePath(vdir, r.getAttribute('Target')); const f=vz.file(src); if (!f) continue;
      const fileName=`combine${vi+1}_${src.split('/').pop()}`; zip.file(dir+'media/'+fileName, await f.async('uint8array'));
      const nr=rels.createElementNS(RELS,'Relationship'); const nid=`rIdCombine${vi+1}x${id.replace(/\W/g,'')}`;
      nr.setAttribute('Id', nid); nr.setAttribute('Type', r.getAttribute('Type')); nr.setAttribute('Target', 'media/'+fileName);
      rels.documentElement.appendChild(nr); m.rel[id]=nid; touched=true;
      const ext=fileName.split('.').pop().toLowerCase();
      if (ct && ![...ct.documentElement.childNodes].some(x=>x.nodeType===1 && x.localName==='Default' && (x.getAttribute('Extension')||'').toLowerCase()===ext)){
        const vct=await partDoc(vz,'[Content_Types].xml'); const d=vct && [...vct.documentElement.childNodes].find(x=>x.nodeType===1 && x.localName==='Default' && (x.getAttribute('Extension')||'').toLowerCase()===ext);
        if (d){ const nd=ct.importNode(d, true); ct.documentElement.insertBefore(nd, ct.documentElement.firstChild); }
      }
    }
    const vrelT=t=>vrels && relTarget(vrels, t) && resolvePath(vdir, relTarget(vrels, t));
    // list numbering: each list the copied paragraphs use, copied with new ids (the base may use the same ids for other lists)
    const numIds=new Set(all.filter(x=>x.localName==='numId' && x.namespaceURI===W).map(x=>wv(x,'val')).filter(x=>x && x!=='0'));
    const vnum=numIds.size && num ? await partDoc(vz, vrelT('numbering')) : null;
    if (vnum){
      const root=num.documentElement; const nums=[...root.getElementsByTagNameNS(W,'num')], abs=[...root.getElementsByTagNameNS(W,'abstractNum')];
      let nextNum=Math.max(0, ...nums.map(x=>+wv(x,'numId')||0))+1, nextAbs=Math.max(0, ...abs.map(x=>+wv(x,'abstractNumId')||0))+1;
      for (const id of numIds){
        const n=[...vnum.getElementsByTagNameNS(W,'num')].find(x=>wv(x,'numId')===id); if (!n) continue;
        const ref=[...n.childNodes].find(x=>x.nodeType===1 && x.localName==='abstractNumId'); const a=ref && [...vnum.getElementsByTagNameNS(W,'abstractNum')].find(x=>wv(x,'abstractNumId')===wv(ref,'val')); if (!a) continue;
        const na=num.importNode(a, true); na.setAttributeNS(W,'w:abstractNumId', String(nextAbs));
        for (const x of [...na.childNodes]) if (x.nodeType===1 && ['nsid','numStyleLink','styleLink'].includes(x.localName)) na.removeChild(x);
        const lastAbs=[...root.getElementsByTagNameNS(W,'abstractNum')].pop(); const firstNum=root.getElementsByTagNameNS(W,'num')[0];
        root.insertBefore(na, lastAbs ? lastAbs.nextSibling : firstNum||null);
        const nn=num.importNode(n, true); nn.setAttributeNS(W,'w:numId', String(nextNum));
        for (const x of nn.childNodes) if (x.nodeType===1 && x.localName==='abstractNumId') x.setAttributeNS(W,'w:val', String(nextAbs));
        const cleanup=[...root.childNodes].find(x=>x.nodeType===1 && x.localName==='numIdMacAtCleanup'); root.insertBefore(nn, cleanup||null);
        m.num[id]=String(nextNum); nextNum++; nextAbs++; touched=true;
      }
    }
    // styles the base does not have (with the styles they are based on)
    const vsty=sty ? await partDoc(vz, vrelT('styles')) : null;
    if (vsty){
      const have=new Set([...sty.getElementsByTagNameNS(W,'style')].map(x=>wv(x,'styleId')));
      const vs=new Map([...vsty.getElementsByTagNameNS(W,'style')].map(x=>[wv(x,'styleId'), x]));
      const want=[...new Set(all.filter(x=>x.namespaceURI===W && ['pStyle','rStyle','tblStyle'].includes(x.localName)).map(x=>wv(x,'val')))];
      while (want.length){
        const id=want.pop(); if (!id || have.has(id) || !vs.has(id)) continue; have.add(id);
        const s=vs.get(id); sty.documentElement.appendChild(sty.importNode(s, true)); touched=true;
        for (const x of s.childNodes) if (x.nodeType===1 && ['basedOn','link','next'].includes(x.localName)) want.push(wv(x,'val'));
      }
    }
  }
  if (!touched) return {buf:base.buf, maps};
  if (rels) zip.file(relsPath, serialize(rels));
  if (ct) zip.file('[Content_Types].xml', serialize(ct));
  if (num) zip.file(numPath, serialize(num));
  if (sty) zip.file(stylePath, serialize(sty));
  return {buf:await zip.generateAsync({type:'arraybuffer'}), maps};
}

// everything the plan copies from the other versions: {versionIndex: [elements]}
function importsOf(c, plan){
  const out=new Map(); const add=(v, el)=>{ if (v===c.base) return; if (!out.has(v)) out.set(v, []); out.get(v).push(el); };
  const blk=(v, e)=>c.versions[v].blocks[e.refs[v]].el;
  const hostOf=e=>e.refs[c.base]!=null?c.base:plan.order.find(v=>e.refs[v]!=null);
  for (const s of plan.script) if (s.op==='block'){ const e=plan.merged[s.k]; const h=hostOf(e); if (!e.alts) add(h, blk(h, e)); }
  for (const e of plan.merged){
    if (e.alts) for (const g of e.alts.groups) add(g.v, blk(g.v, e));
    if (e.rowPlan) for (const r of e.rowPlan.rows){ const v=+Object.keys(r.refs)[0]; add(v, blk(v, e)); }
  }
  return out;
}

/**
 * Opens the base version as the letter, then writes in every other version's differences in ONE edit (one undo step).
 * Resolves to {regions, added, images, lists, fields} or false (with a toast saying why).
 */
export async function applyCombine(){
  const c=state.combine; if (!c) return false;
  if (c.versions.length<2){ toast('Add at least two versions to combine.'); return false; }
  const plan=planOf(c); const base=c.versions[c.base];
  if (!plan.items.length){ toast('These versions have the same text, so there is nothing to combine.'); return false; }
  const fields=fieldsOf(c, plan); const cond=need=>needCondition(plan.needs[need], fields);
  let pkg;
  try { pkg=await mergePackage(c, importsOf(c, plan)); await loadDocx(pkg.buf, base.name, false); } catch(e){ console.warn(e); toast(e.message); return false; }
  const st={images:0, lists:0}; let added=0;
  state.combineFlags=[...new Set(Object.values(fields))];   // before the edit: its checks warn about them
  const res=sourceEdit(docs=>{
    const docA=docs[state.mainPath]; const A=topBlocksOf(docA);
    if (A.length!==base.blocks.length) return {cancel:true};
    const body=docA.getElementsByTagNameNS(W,'body')[0]; const sect=[...body.childNodes].find(x=>isW(x,'sectPr'))||null;
    const copy=(v, el)=>{ st.relMap=pkg.maps[v]?.rel; st.numMap=pkg.maps[v]?.num; const ns=importBlocks(docA, el, st); added+=ns.length; return ns; };
    const blockEls=(v, e)=>v===c.base ? [A[e.refs[v]].el] : copy(v, c.versions[v].blocks[e.refs[v]].el);
    const hostOf=e=>e.refs[c.base]!=null?c.base:plan.order.find(v=>e.refs[v]!=null);
    for (const b of A) b.el.parentNode.removeChild(b.el);
    const put=n=>body.insertBefore(n, sect);
    const marks=[]; const newLogic=[];
    const mark=(kind, need)=>{ const p=docA.createElementNS(W,'w:p'); marks.push({el:p, kind, cond:need==null?'':cond(need)}); put(p); };
    for (const s of plan.script){
      if (s.op==='mark'){ mark(s.kind, s.need); continue; }
      const e=plan.merged[s.k]; const h=hostOf(e);
      if (e.alts){
        for (const b of e.alts.branches){ mark(b.kind, b.need); for (const n of blockEls(b.g.v, e)) put(n); }
        mark('endif'); continue;
      }
      const els=blockEls(h, e); for (const n of els) put(n);
      if (e.inline && els.length===1) inlineEdit(els[0], e, h, newLogic, cond);
      if (e.rowPlan && els.length===1) rowEdit(els[0], e, h, newLogic, cond, copy);
    }
    // tags join the end of the paragraph before them when that is safe, else they stay on a line of their own
    const sib=el=>{ for (let n=el.previousSibling; n; n=n.previousSibling) if (n.nodeType===1) return n; return null; };
    const next=el=>{ for (let n=el.nextSibling; n; n=n.nextSibling) if (n.nodeType===1) return n; return null; };
    const markEls=new Set(marks.map(m=>m.el));
    for (const m of marks){
      const prev=sib(m.el);
      // a blank line, a picture or a page break before the tag: a space after it gives the tag text to join (nothing to see)
      if (isW(prev,'p') && !markEls.has(prev) && !joinable(prev)){ const r=docA.createElementNS(W,'w:r'), t=docA.createElementNS(W,'w:t'); setPreserve(t); t.textContent=' '; r.appendChild(t); prev.appendChild(r); }
      m.left=isW(prev,'p');
    }
    // an if right after a table has no paragraph to join: it joins the paragraph after it instead ({% if … -%}), and so does its
    // endif ({% endif -%}), when both paragraphs look the same (same paragraph and first-run formatting), which they then keep
    const stack=[];
    for (const m of marks){
      if (m.kind==='if'){ stack.push({m, inner:[]}); continue; }
      if (m.kind!=='endif'){ stack.length && stack[stack.length-1].inner.push(m); continue; }
      const ch=stack.pop(); if (!ch || ch.m.left || ch.inner.some(x=>!x.left) || !m.left) continue;
      const x1=next(ch.m.el), y=next(m.el);
      if (markEls.has(x1) || markEls.has(y) || !startJoinable(x1) || !startJoinable(y) || headOf(x1)!==headOf(y)) continue;
      for (const k of [ch.m, m]){ k.right=true; k.left=false; k.el.appendChild(headPPr(y)); }
    }
    for (const m of marks) newLogic.push({el:m.el, text:markerText(m.kind, m.cond, m.left, m.right), place:'end', extra:{mg:1}});
    return {newLogic};
  });
  if (res.cancel){ state.combineFlags=[]; toast('Could not combine these versions.'); return false; }
  const report={regions:plan.items.length, added, images:st.images, lists:st.lists, versions:c.versions.length, base:base.label, fields:state.combineFlags};
  state.combine=null; setView('source'); setTab('logic', {open:true}); notify();
  toast(combineToast(report));
  return report;
}

// a few words that differ inside one paragraph: every version's words side by side, each in its own if / elif
function inlineEdit(p, e, host, newLogic, cond){
  unwrapMergeFields(p);
  const model=paraModel(p); const T=model.text;
  const c=state.combine; const raw=g=>g.v===host ? T : paraModel(c.versions[g.v].blocks[e.refs[g.v]].el).text;
  const {groups, branches}=e.inline; const texts=groups.map(raw);
  const {pre, suf}=commonEnds(texts);
  const mids=texts.map(t=>t.slice(pre, t.length-suf));
  const emitted=branches.map(b=>groups.indexOf(b.g));
  // the host's own words stay where they are (with their formatting); the others go right after them
  const at=T.length-suf; const others=emitted.filter(i=>i!==0);
  const ins=others.map(i=>mids[i]).join('');
  if (ins){ const n=model.nodes.find(x=>x.len>0 && at>x.start && at<=x.start+x.len); if (n){ const t=n.node.textContent, o=at-n.start; n.node.textContent=t.slice(0,o)+ins+t.slice(o); setPreserve(n.node); } else insertAt(model, at, ins); }
  const start={}; let o=at; for (const i of others){ start[i]=o; o+=mids[i].length; } start[0]=pre;
  const endAt=others.length ? o : pre+mids[0].length;
  branches.forEach((b,k)=>{ const i=emitted[k]; newLogic.push({el:p, place:'at', text:b.kind==='else'?'{% else %}':`{% ${b.kind} ${cond(b.need)} %}`, extra:{offset:start[i], mg:1}}); });
  newLogic.push({el:p, place:'at', text:'{% endif %}', extra:{offset:endAt, mg:1}});
}

// rows that only some versions have: the condition opens at the end of the row before and closes at the end of the row
function rowEdit(tbl, e, host, newLogic, cond, copy){
  const c=state.combine; const {rows, conds}=e.rowPlan;
  const trsOf=el=>[...el.childNodes].filter(n=>isW(n,'tr'));
  const own=trsOf(tbl);
  const trs=rows.map(r=>{
    if (r.refs[host]!=null) return own[r.refs[host]];
    const v=+Object.keys(r.refs)[0]; const src=trsOf(c.versions[v].blocks[e.refs[v]].el)[r.refs[v]];
    return copy(v, src)[0];
  });
  for (const tr of own) tbl.removeChild(tr);
  for (const tr of trs) tbl.appendChild(tr);
  for (const cd of conds){
    const a=lastCellPara(trs[cd.ri-1]), b=lastCellPara(trs[cd.ri]); if (!a || !b) continue;
    newLogic.push({el:a, place:'end', text:`{% if ${cond(cd.need)} %}`, extra:{mg:1}}, {el:b, place:'end', text:'{% endif %}', extra:{mg:1}});
  }
}

export function combineToast(r){
  let s=`Combined ${r.versions} versions. Each difference is an if / else on a yes / no field — set who sees which in Conditions.`;
  if (r.images) s+=` ${r.images} image${r.images>1?'s':''} in the other versions couldn’t be copied.`;
  if (r.lists) s+=` Numbered or bulleted paragraphs from the other versions use ${r.base}’s list styles, so check the numbering.`;
  return s;
}
