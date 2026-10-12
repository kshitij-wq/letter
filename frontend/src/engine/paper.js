// Moved from frontend_src/letter-tagger.html — see tests_ui/legacy for the reference page. No DOM rendering in this module.
import { squash } from './checks.js'
import { RX_TAG } from './detect.js'
import { runFmt } from './docx.js'
import { W, ancestor, childW, closestP, esc, icon, isW } from './helpers.js'
import { computeLogic, lgInfo, lgWord } from './logic.js'
import { tagPrimaryIds } from './pipeline.js'
import { finalTag, rowStatus } from './rows.js'
import { state } from './state.js'
import { tCellTag } from './tables.js'

export function filledHtml(text, fc){
  const wrap=s=>fc?`<span class="${fc}">${s}</span>`:s;
  const pv=state.pv||{}; const tags=pv.tags||[]; const smp=pv.sampled||new Set(); const cache=pv.idCache||new Map();
  let out='', last=0; const re=/(\d+)([^]*)/g; let m;
  while ((m=re.exec(text))){
    out+=wrap(esc(text.slice(last,m.index)));
    const k=+m[1]; const tag=tags[k]||''; let id=cache.get(k); if (id===undefined){ id=tagPrimaryIds(tag)[0]||''; cache.set(k,id); }
    const v=m[2];
    if (!v.trim()) out+=`<span class="fv empty" title="${esc(tag)}">Empty: ${esc(id||'value')}</span>`;
    else out+=`<span class="fv${smp.has(id)?' smp':''}" title="${smp.has(id)?'Made-up sample value · ':''}${esc(tag)}">${wrap(esc(v))}</span>`;
    last=re.lastIndex;
  }
  out+=wrap(esc(text.slice(last).replace(/[-]/g,'')));
  return out;
}
/* ======================= rendering: paper ======================= */
export function paraClass(p){
  const pPr=childW(p,'pPr'); const cls=['lp']; if (!pPr) return cls;
  const jc=childW(pPr,'jc'); if (jc){ const v=jc.getAttributeNS(W,'val'); if (v==='center') cls.push('jc-center'); else if (v==='right'||v==='end') cls.push('jc-right'); else if (v==='both'||v==='distribute') cls.push('jc-both'); }
  const ps=childW(pPr,'pStyle'); if (ps && /heading|title/i.test(ps.getAttributeNS(W,'val'))) cls.push('hd');
  if (childW(pPr,'numPr')) cls.push('li');
  return cls;
}
export function renderParaInner(info, spans, view, inserts){
  const model=info.model; let h='';
  const sp=spans||[]; const ins=(inserts||[]).slice().sort((a,b)=>a.o-b.o || a.k-b.k); let ii=0;
  const emitIns=upto=>{ while (ii<ins.length && ins[ii].o<=upto) h+=ins[ii++].html; };
  for (const it of model.items){
    if (it.type==='tab'){ h+='<span style="display:inline-block;width:2em"></span>'; continue; }
    if (it.type==='br'){ h+='<br>'; continue; }
    if (it.type==='pb') continue;
    const text=it.node.textContent; if (!text) continue;
    const f=runFmt(it.node); const fc=[f.b&&'b', f.i&&'i', f.u&&'u', f.hl&&view==='source'&&'hlr'].filter(Boolean).join(' ');
    if (view==='filled'){ h+=filledHtml(text, fc); continue; }
    const s0=it.start, e0=it.start+text.length;
    const pts=new Set([s0,e0]);
    for (const m of sp){ if (m.e<=s0 || m.s>=e0) continue; if (m.s>s0) pts.add(m.s); if (m.e<e0) pts.add(m.e); }
    for (const x of ins){ if (x.o>s0 && x.o<e0) pts.add(x.o); }
    const cuts=[...pts].sort((a,b)=>a-b);
    for (let k=0;k<cuts.length-1;k++){
      const x=cuts[k], y=cuts[k+1];
      emitIns(x);
      const tx=esc(text.slice(x-s0, y-s0)); if (!tx) continue;
      let inner = view==='source' ? `<span class="tx${fc?' '+fc:''}" data-o="${x}">${tx}</span>` : (fc?`<span class="${fc}">${tx}</span>`:tx);
      const m=sp.find(q=>q.s<=x && q.e>=y);
      if (m){ if (view==='source' && m.row) inner=`<span class="ph s-${rowStatus(m.row)}" data-row="${esc(m.row.id)}" title="${esc(finalTag(m.row)||'Needs a tag')}">${inner}</span>`; else { const mk=view==='source' && state.tagMarks && state.tagMarks.get(squash(model.text.slice(m.s, m.e))); inner=`<span class="tg${m.blk?' blk':''}${mk?' tg-'+mk.level:''}"${mk?` title="${esc(mk.msg)}"`:''}>${inner}</span>`; } }
      h+=inner;
    }
  }
  while (ii<ins.length) h+=ins[ii++].html;
  return h;
}
export function renderBlocks(el, ctx){
  let h='';
  for (let c=el.firstChild;c;c=c.nextSibling){
    if (c.nodeType!==1) continue;
    if (isW(c,'p')) h+=renderPara(c, ctx);
    else if (isW(c,'tbl')){
      h+='<div style="overflow-x:auto"><table class="lt"><tbody>';
      for (const tr of c.childNodes){ if (!isW(tr,'tr')) continue; h+='<tr>';
        for (const tc of tr.childNodes){ if (!isW(tc,'tc')) continue; const tcPr=childW(tc,'tcPr'); const gs=tcPr&&childW(tcPr,'gridSpan'); h+=`<td${gs?` colspan="${gs.getAttributeNS(W,'val')}"`:''}>${renderBlocks(tc, ctx)}</td>`; }
        h+='</tr>'; }
      h+='</tbody></table></div>';
    }
    else if (isW(c,'sdt')){ const sc=childW(c,'sdtContent'); if (sc) h+=renderBlocks(sc, ctx); }
    else if (isW(c,'customXml') || isW(c,'ins')) h+=renderBlocks(c, ctx);
  }
  return h;
}
export function renderPara(p, ctx){
  const info=ctx.an.byEl.get(p); if (!info) return '';
  const view=ctx.view;
  let spans=null;
  if (view==='source'){ spans=[...(state.srcMatches.get(info.pid)||[]), ...[...info.model.text.matchAll(RX_TAG)].map(m=>({s:m.index, e:m.index+m[0].length, blk:m[0].startsWith('{%')}))].sort((a,b)=>a.s-b.s); }
  else if (view==='tagged') spans=[...info.model.text.matchAll(RX_TAG)].map(m=>({s:m.index, e:m.index+m[0].length, blk:m[0].startsWith('{%')}));
  const cls=paraClass(p);
  const selectable=view==='source' && ['body','header','footer'].includes(info.kind) && !info.textbox;
  if (selectable) cls.push('body'); if (selectable && state.sel.pids.includes(info.pid)) cls.push('sel');
  let pre='', post='', startChips='', endChips=''; const inserts=[];
  if (info.kind==='body' && info.page && ctx.lastPage!=null && info.page>ctx.lastPage && !ancestor(p,['tc'])){ pre+=`<div class="page-div" title="${ctx.an.pageSource==='rendered'?'Page breaks as Word last laid out the letter':'From page breaks in the letter'}"><span>Page ${info.page}</span></div>`; ctx.lastPage=info.page; }
  const rail=view==='source' && state.lgRails.get(info.pid);
  if (view==='source'){
    if (rail){ cls.push('in-block'); if (rail.open) cls.push('open-block'); if (rail.branch) cls.push('in-else'); }
    state.lg.forEach((e,i)=>{
      if (e.src!=='you' || e.pid!==info.pid || e.sub>0) return;
      const {st, label, en, lead}=lgInfo(e);
      const say=en ? lead+' '+en : '';
      if (e.place==='at'){ inserts.push({o:e.offset||0, k:i, html:`<span class="tg blk lg-chip${st}" data-key="${esc(e.key)}" title="${esc(label||say||'Tag inside the sentence')}">${esc(e.full)}</span>`}); return; }
      const bare=e.kw==='else'||e.kw==='endif'||e.kw==='endfor';
      const line=`<div class="lg-line${st}" data-key="${esc(e.key)}" style="--d:${e.depth}" role="button" tabindex="0" title="${esc(say||e.text)}"><span class="badge cond">${esc(lgWord(e.kw))}</span>${en?`<span class="lg-en-t">${esc(en)}</span>`:bare?'':`<code>${esc(e.text)}</code>`}<span class="lg-meta">${label?icon('alert-circle')+label:''}</span></div>`;
      const chip=`<span class="tg blk lg-chip${st}" data-key="${esc(e.key)}" title="${esc(label||say||'Logic tag')}">${esc(e.text)}</span>`;
      if (e.place==='before') pre+=line; else if (e.place==='after') post+=line; else if (e.place==='start') startChips+=chip; else endChips+=chip;
    });
  }
  let inner=renderParaInner(info, spans, view, inserts);
  if (view==='source' && state.ghostMap.has(p)){ const gm=state.ghostMap.get(p); const tag=tCellTag(gm.t,gm.row,gm.col); const k=(gm.row.cells[gm.col.ci]||{}).key||''; inner+=`<span class="cell-ghost${tag?'':' blank'}" data-t="${gm.t.id}" data-ri="${gm.row.ri}" data-ci="${gm.col.ci}" title="${esc(tag||'Click to pick a tag')}">${esc(tag ? (k||tag.replace(/^\{\{\s*|\s*\}\}$/g,''))+(gm.col.div12?' ÷ 12':'') : 'Pick a tag')}</span>`; }
  inner=(startChips+inner+endChips) || '&nbsp;';
  let tbx='';
  for (const d of [...p.getElementsByTagNameNS(W,'txbxContent')]){
    if (ancestor(d,['Fallback'])) continue; if (closestP(d)!==p) continue;
    tbx+=`<div class="tbx"><span class="tbx-label">Text box</span>${renderBlocks(d, ctx)}</div>`;
  }
  return `${pre}<p class="${cls.join(' ')}" data-pid="${esc(info.pid)}"${rail?` style="--d:${rail.depth}" title="Inside: ${esc(rail.top.text)}"`:''}>${inner}</p>${tbx}${post}`;
}
/* ---- the letter as HTML (was renderPaper(): same markup, returned instead of written into #paper) ----
   view: 'source' (placeholders, margin lines), 'tagged' (the template as downloaded) or 'filled' (one employee's letter). */
export function paperHtml(view=state.view){
  let an;
  if (view==='filled'){
    an=state.pv && state.pv.an;
    if (!an){ const pv=state.pv||{}; return pv.error ? `<div class="pv-empty"><b>The letter can't be filled for this employee.</b><span>${esc(pv.error.msg)}</span>${pv.error.tag?`<span>Near <code class="mono">${esc(pv.error.tag)}</code></span>`:''}</div>` : '<div class="pv-empty">Filling the letter…</div>'; }
  } else an = view==='source' ? state.an : state.built && state.built.an;
  if (!an) return '';
  if (view==='source') computeLogic();
  const ctx={an, view, lastPage:1}; let h='';
  for (const part of state.parts.filter(x=>x.kind==='header')){ const root=an.docs[part.path]&&an.docs[part.path].documentElement; if (!root) continue; const b=renderBlocks(root, ctx); if (b.replace(/<[^>]+>|&nbsp;/g,'').trim()) h+=`<div class="part"><span class="part-label">Header</span>${b}</div>`; }
  const mainDoc=an.docs[state.mainPath]; if (!mainDoc) return '';
  const body=mainDoc.getElementsByTagNameNS(W,'body')[0];
  h+=renderBlocks(body, ctx);
  for (const part of state.parts.filter(x=>x.kind==='footer')){ const root=an.docs[part.path]&&an.docs[part.path].documentElement; if (!root) continue; const b=renderBlocks(root, ctx); if (b.replace(/<[^>]+>|&nbsp;/g,'').trim()) h+=`<div class="part" style="margin-top:18px"><span class="part-label">Footer</span>${b}</div>`; }
  return h;
}
