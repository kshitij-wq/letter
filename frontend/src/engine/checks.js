// Moved from frontend_src/letter-tagger.html — see tests_ui/legacy for the reference page. No DOM rendering in this module.
import { blockCountsNow } from './blocks.js'
import { KNOWN, isMoney } from './catalog.js'
import { AUTO_FIELD } from './combine.js'
import { condEnglish, startCondEdit } from './conditions.js'
import { dataFiles, fileHeaders } from './data.js'
import { RX_TAG, analyze } from './detect.js'
import { MERGE_MISMATCH } from './docx.js'
import { renameEverywhere } from './edits.js'
import { notify, toast } from './events.js'
import { addDefaultTo, closingFixFor, fixTags, floatUsesWithoutDefault, tagSyntaxFix } from './fixes.js'
import { W, ancestor, esc, isW, snake, straighten } from './helpers.js'
import { fullRefresh } from './load.js'
import { normalizeLogicText, pageLabel, parseLogic, snippet } from './logic.js'
import { decodeXmlText, pyResultType } from './pipeline.js'
import { effFormat, finalTag, rowStatus } from './rows.js'
import { realLocs, server } from './server.js'
import { state } from './state.js'
import { tableCounts, tagKeyOf, topTables } from './tables.js'
import { recordUndo } from './undo.js'

/* ======================= CSV-aware tag checks ======================= */
export function csvKeyUniverse(){
  const u=new Set(); const place=state.settings.csvPlace||'both';
  const add=(h,params)=>{ const hk=String(h||'').trim(); if (!hk) return; if (hk.includes('.')){ u.add(hk); return; } if (place!=='custom') u.add(tagKeyOf(hk)); if (place!=='top' && !params) u.add('custom_schema.'+snake(hk)); };
  for (const f of dataFiles()) fileHeaders(f).forEach(h=>add(h, !!f.params)); ((state.team&&state.team.use!==false&&state.team.columns)||[]).forEach(h=>add(h,false));
  return u;
}
export function isCompUpKey(id){
  if (KNOWN.has(id)) return true;
  if (/^(employee_schema|emp_variable_plan_formula)\.\w+$/.test(id)) return true;
  if (/^\w+_(current|old|new)_amount$/.test(id) || /^factor_\w+$/.test(id)) return true;
  return ['employee_schema','custom_schema','emp_variable_plan_formula'].includes(id);
}
export function keyStatus(id, U){
  U=U||csvKeyUniverse();
  if (U.has(id)) return 'csv';
  if (/^custom_schema\./.test(id)) return U.size ? 'unknown' : 'compup';
  if (isCompUpKey(id)) return 'compup';
  if (state.extraKeys.has(id)) return 'csv';
  return U.size ? 'unknown' : 'nocsv';
}
export function lev(a,b){ if (a===b) return 0; const m=a.length, n=b.length; if (!m) return n; if (!n) return m; let prev=Array.from({length:n+1},(_,j)=>j); for (let i=1;i<=m;i++){ const cur=[i]; for (let j=1;j<=n;j++) cur[j]=Math.min(prev[j]+1, cur[j-1]+1, prev[j-1]+(a[i-1]===b[j-1]?0:1)); prev=cur; } return prev[n]; }
export function didYouMean(id, U){
  U=U||csvKeyUniverse();
  const strip=x=>String(x).replace(/^custom_schema\./,'').replace(/^custom_/,'');
  const core=strip(id);
  for (const c of [core, 'custom_schema.'+core, 'custom_'+core]) if (c!==id && U.has(c)) return c;   // same field, other prefix
  const toks=x=>strip(x).toLowerCase().split(/[._]+/).filter(Boolean);
  const a=toks(id); let best=null, bd=1e9;
  for (const c of new Set([...U, ...KNOWN])){
    if (c===id) continue; const b=toks(c); if (b.length!==a.length) continue;   // a different set of words is a different field (e.g. old vs revised)
    let tot=0, ok=true;
    for (let k=0;k<a.length;k++){ const d=lev(a[k],b[k]); const mn=Math.min(a[k].length,b[k].length), mx=Math.max(a[k].length,b[k].length); if (d===0) continue; if ((d===1 && mx>=2) || (d===2 && mn>=6)) tot+=d; else { ok=false; break; } }
    if (ok && tot<=2 && tot<bd){ bd=tot; best=c; }
  }
  return best;
}
export function exprTokens(expr){ const e=String(expr).replace(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"/g,'"S"'); return e.match(/"S"|\*\*|\/\/|>=|<=|==|!=|\|\s*[A-Za-z_]\w*|\.[A-Za-z_]\w*|[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*|\d+(?:\.\d+)?|\S/g)||[]; }
export function rawNumericUses(expr){
  const t=exprTokens(expr); const out=[]; const OPS=new Set(['+','-','*','/','//','%','**','>','<','>=','<=']);
  for (let i=0;i<t.length;i++){
    const tok=t[i]; if (!/^[A-Za-z_]/.test(tok) || KEYWORDS.has(tok)) continue;
    const prev=t[i-1]||'', next=t[i+1]||'';
    if (prev.startsWith('|') || prev.startsWith('.') || next==='(' || next.startsWith('|') || next.startsWith('.')) continue;
    const nOp=OPS.has(next), pOp=OPS.has(prev); if (!nOp && !pOp) continue;
    if ((next==='+' && t[i+2]==='"S"') || (prev==='+' && t[i-2]==='"S"')) continue;
    out.push({id:tok, op:nOp?next:prev});
  }
  return out;
}
export function lastFilterName(expr){ const m=String(expr).replace(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"/g,'""').match(/\|\s*(\w+)\s*(\([^()]*\))?\s*$/); return m?m[1]:''; }
export function addTrimMarkers(tag){
  const p=parseLogic(tag); if (!p.kw) return tag;
  const open=t=>t.replace(/\s*-?%\}$/,' -%}'), close=t=>t.replace(/^\{%-?\s*/,'{%- ');
  if (['if','for'].includes(p.kw)) return open(tag);
  if (['endif','endfor'].includes(p.kw)) return close(tag);
  if (['elif','else'].includes(p.kw)) return open(close(tag));
  return tag;
}
export const KEYWORDS = new Set(['if','elif','else','endif','for','endfor','in','set','and','or','not','is','defined','none','None','true','false','True','False','raw','endraw','loop','range','with','endwith','number','string','even','odd','sameas','divisibleby','mapping','iterable']);
export function identifiersIn(expr){
  const e = expr.replace(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"/g,'""');
  const out=[]; const rx=/\|\s*[A-Za-z_]\w*|\.[A-Za-z_]\w*|[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*|[^\s]/g; let m, prev=[];
  while ((m=rx.exec(e))){
    const tok=m[0];
    if (/^[A-Za-z_]/.test(tok)){
      const next=e.slice(rx.lastIndex).trimStart();
      const isKw = KEYWORDS.has(tok);
      const afterIs = prev[prev.length-1]==='is' || (prev[prev.length-1]==='not' && prev[prev.length-2]==='is');
      const kwarg = next[0]==='=' && next[1]!=='=';
      if (!isKw && !afterIs && !kwarg) out.push(tok);
    }
    prev.push(tok);
  }
  return out;
}
export function isKnownKey(id, localVars){
  const root=id.split('.')[0];
  if (KNOWN.has(id) || localVars.has(root) || state.extraKeys.has(id)) return true;
  if (/^(employee_schema|custom_schema|emp_variable_plan_formula)(\.\w+)?$/.test(id)) return true;
  if (/^\w+_(current|old|new)_amount$/.test(id) || /^factor_\w+$/.test(id)) return true;
  return false;
}
export function typedKey(id){ return dataFiles().some(f=>f.typed && fileHeaders(f).some(h=>tagKeyOf(h)===id)); }
export function rowCondMismatches(an){
  const out=[]; const doc=an.docs[state.mainPath]; if (!doc) return out;
  const tagsOf=el=>[...el.getElementsByTagNameNS(W,'p')].map(p=>an.byEl.get(p)).filter(Boolean).flatMap(i=>[...i.model.text.matchAll(RX_TAG)].map(m=>m[0]));
  const idsOf=tags=>new Set(tags.flatMap(t=>identifiersIn(t.replace(/^\{[{%]-?|-?[}%]\}$/g,'').replace(/^\s*(if|elif)\s+/,''))).filter(x=>x!=='currentDatetime'));
  for (const tbl of topTables(doc)){
    const trs=[...tbl.childNodes].filter(n=>isW(n,'tr'));
    for (let i=1;i<trs.length;i++){
      const prevCells=[...trs[i-1].childNodes].filter(n=>isW(n,'tc')); const lastPrev=prevCells[prevCells.length-1]; if (!lastPrev) continue;
      const pt=tagsOf(lastPrev); const opener=pt[pt.length-1]; if (!opener || !/^\{%-?\s*if\b/.test(opener)) continue;
      const cells=[...trs[i].childNodes].filter(n=>isW(n,'tc')); if (cells.length<2) continue;
      let rowTags=cells.slice(1).flatMap(tagsOf);
      if (rowTags.length && /^\{%-?\s*if\b/.test(rowTags[rowTags.length-1]) && rowTags.some(t=>/^\{%-?\s*endif/.test(t))) rowTags=rowTags.slice(0,-1);
      if (!rowTags.some(t=>t.startsWith('{{'))) continue;
      const cond=[...idsOf([opener])], used=idsOf(rowTags.filter(t=>t.startsWith('{{')||/^\{%-?\s*if\b/.test(t)));
      const label=(an.byEl.get([...cells[0].getElementsByTagNameNS(W,'p')][0])||{model:{text:''}}).model.text.replace(/\s+/g,' ').trim().slice(0,50)||`Row ${i+1}`;
      const pre=x=>x.replace(/^custom_schema\./,'').replace(/^custom_/,'');
      const base=x=>{ let b=pre(x); for (let k=0;k<3;k++) b=b.replace(/_(mo|monthly|month|an|ann|annual|annum|pa|pm|old|new|revised|current|final|letter)$/,''); return b; };
      // the same field written with two prefixes in one row (custom_x and custom_schema.x)
      const groups=new Map(); for (const x of [...cond, ...used]){ const k=pre(x); if (!groups.has(k)) groups.set(k,new Set()); groups.get(k).add(x); }
      for (const g of groups.values()) if (g.size>1) out.push({label, dup:[...g]});
      if (!cond.length || cond.some(c=>used.has(c)) || cond.some(c=>[...used].some(u=>base(u)===base(c)))) continue;
      out.push({label, cond, cells:[...used]});
    }
  }
  return out;
}
export function isLastTc(tc){ let n=tc.nextSibling; while (n){ if (isW(n,'tc')) return false; n=n.nextSibling; } return true; }
export function nextTr(tr){ let n=tr.nextSibling; while (n && !isW(n,'tr')) n=n.nextSibling; return n; }
export function rowPair(a,b){ return !!(a && b && isW(a.parentNode,'tr') && isW(b.parentNode,'tr') && nextTr(a.parentNode)===b.parentNode && isLastTc(a) && isLastTc(b)); }
export function fixTrimless(tags){
  recordUndo();
  for (const t of tags){
    const nt=addTrimMarkers(t); if (nt===t) continue;
    for (const l of state.logic) if (l.place!=='at' && normalizeLogicText(l.text)===t) l.text=nt;
    state.tagOps.push({id:'o'+Math.random().toString(36).slice(2,9), type:'map', from:t, to:nt});
  }
  analyze(); fullRefresh(); toast('Added trim marks to the tag lines.');
}
export const JINJA_FILTERS=new Set('abs attr batch capitalize center count d default dictsort e escape filesizeformat first float forceescape format groupby indent int items join last length list lower map max min pprint random reject rejectattr replace reverse round safe select selectattr slice sort string striptags sum title tojson trim truncate unique upper urlencode urlize wordcount wordwrap xmlattr indian_comma int_comma format_date'.split(' '));
export const JINJA_TAGS=new Set('if elif else endif for endfor set endset raw endraw macro endmacro call endcall filter endfilter with endwith block endblock include import from extends break continue do autoescape endautoescape trans endtrans pluralize'.split(' '));
export function tagSyntaxProblem(tag){
  if (tag.startsWith('{#')) return '';
  const inner=tag.replace(/^\{[{%]-?|-?[}%]\}$/g,'').trim();
  const noEsc=inner.replace(/\\./g,'');
  // quotes: walk the tag, so an apostrophe inside "…" is fine
  let q=''; for (const ch of noEsc){ if (q){ if (ch===q) q=''; } else if (ch==='"' || ch==="'") q=ch; }
  if (q) return `A quote isn't closed in this tag. Every " or ' needs its pair.`;
  const bare=noEsc.replace(/'[^']*'|"[^"]*"/g,'""');
  let depth=0; for (const ch of bare){ if ('([{'.includes(ch)) depth++; else if (')]}'.includes(ch)) depth--; if (depth<0) break; }
  if (depth>0) return 'A bracket ( or [ is opened but not closed in this tag.';
  if (depth<0) return 'There is a ) or ] without its opening bracket in this tag.';
  if (tag.startsWith('{%')){
    const body=bare.replace(/^(p|tr|tc|r)\s+/,'');
    const kw=(body.match(/^([A-Za-z_]\w*)/)||[])[1]||'';
    if (!kw) return 'This {% %} tag is empty or starts with something that isn\'t a keyword (if, else, endif, for, set…).';
    if (!JINJA_TAGS.has(kw)) return `“{% ${kw} %}” isn't a Jinja tag. Check the spelling (if, elif, else, endif, for, endfor, set).`;
    if ((kw==='if' || kw==='elif') && /(^|[^=!<>])=(?!=)/.test(body)) return 'Use == to compare inside a condition, e.g. {% if band == "A" %}. A single = only works in {% set %}.';
    if ((kw==='if' || kw==='elif') && !body.slice(kw.length).trim()) return `{% ${kw} %} needs a condition after it, e.g. {% ${kw} band == "A" %}.`;
  }
  for (const m of bare.matchAll(/\|\s*([A-Za-z_]\w*)/g)) if (!JINJA_FILTERS.has(m[1])) return `“| ${m[1]}” isn't a filter Jinja knows. Check the spelling (for example | float, | int, | indian_comma, | lower).`;
  return '';
}
export function runChecks(an, st){
  const out=[]; state.fixes=[];
  const add=(level, html, fix, tags)=>{ const old=out.find(x=>x.html===html); if (old){ if (tags) old.tags.push(...tags); return; } const item={level, html, tags:tags?[...tags]:[]}; if (fix) item.fix={label:fix.label, idx:state.fixes.push(fix.fn)-1}; out.push(item); };
  const idTags=new Map(); const floatIds=new Map(); const tagsOf=ids=>[...ids].flatMap(id=>[...(idTags.get(id)||[])]);
  const U=csvKeyUniverse(); const usedIds=new Set(); const numericUse=new Map(); const floatPrint=new Set(); const trimless=new Set(); const ampLit=new Set(); const fixedAmt=new Set(); const bareIf=new Set();
  const mergedRuns=Math.max(0,(st.merged||0)-(st.joined||0)); if (mergedRuns) add('fixed', `Joined ${mergedRuns} tag${mergedRuns>1?'s':''} that Word had split across runs.`);
  if (st.joined) add('fixed', `Joined ${st.joined} tag${st.joined>1?'s':''} typed over two or more lines (Enter or Shift+Enter inside the braces) into one line. The engine reads them the same way; this only makes them safe to check and preview.`);
  if (st.ampFixed) add('fixed', `Wrote &amp;, &lt; and &gt; inside quotes as <code>\\u0026</code>, <code>\\u003c</code> and <code>\\u003e</code> in ${st.ampFixed} tag${st.ampFixed>1?'s':''}, so a value like “R&amp;D” matches whichever way the engine reads the .docx. Jinja turns them back into the same characters.`);
  if (st.fixedQ) add('fixed', `Straightened curly quotes or dashes inside ${st.fixedQ} tag${st.fixedQ>1?'s':''}.`);
  if (st.hiddenRows) add('info', `${st.hiddenRows} table row${st.hiddenRows>1?'s':''} will be left out when the value is empty or 0. The <code>{% if %}</code> sits at the end of the row above and <code>{% endif %}</code> at the end of the row. Check an employee with a missing component in Employee preview, then preview their PDF in CompUp.`);
  if (st.filled) add('fixed', `Filled ${st.filled} empty table cell${st.filled>1?'s':''} with tags.`);
  for (const t of state.tables){ if (!t.enabled) continue; const c=tableCounts(t); if (c.all>c.done) add('warn', `Table ${t.n}: ${c.all-c.done} empty cell${c.all-c.done>1?'s have':' has'} no tag and will stay blank.`); }
  if (st.fields) add('fixed', `Converted ${st.fields} Word merge field${st.fields>1?'s':''} to plain text so they can be tagged.`);
  for (const [shown, code] of MERGE_MISMATCH) add('warn', `The letter shows <code>${esc(shown)}</code>, but that merge field is really <code>${esc(code)}</code>. Word's mail merge prints ${esc(code)} there, so the old letters may have had the wrong value in this place. The tag is suggested from the name shown (${esc(shown.replace(/[«»]/g,''))}); check that is the value you want.`, null, [shown]);
  const need=state.rows.filter(r=>r.enabled && r.count && !finalTag(r)).length;
  if (need) add('warn', `${need} piece${need>1?'s':''} of dynamic text still need a tag and will stay as typed.`);
  const chk=state.rows.filter(r=>rowStatus(r)==='check' && r.count).length;
  if (chk) add('warn', `${chk} suggested tag${chk>1?'s are':' is'} a low-confidence guess. Review the rows marked "To check".`);
  let ins=0, del=0;
  for (const part of state.parts){ const d=an.docs[part.path]; ins+=d.getElementsByTagNameNS(W,'ins').length; del+=d.getElementsByTagNameNS(W,'del').length; }
  if (ins+del) add('warn', 'The letter has tracked changes. Accept or reject them all and turn Track Changes off before uploading to CompUp.');
  if (state.comments) add('info', 'The letter has Word comments. CompUp ignores them and they may be dropped from the PDF it makes.');

  const localVars=new Set();
  const stacks={}; const unknown=new Set(); const upper=new Set();
  let total=0;
  for (const p of an.paras){
    if (p.fallback) continue;
    const t=p.model.text; if (!t) continue;
    if (!p.textbox && /\{%/.test(t) && t.replace(/\{%[\s\S]*?%\}|\{#[\s\S]*?#\}/g,'').trim()==='' && !/\{%-|-%\}/.test(t)){ for (const m of t.matchAll(/\{%[\s\S]*?%\}/g)) trimless.add(m[0]); }
    const rest=t.replace(RX_TAG,'');
    if (/\{\{|\{%|\}\}|%\}/.test(rest)) add('error', `Unclosed or stray tag braces in: <code>${esc(t.slice(0,90))}</code>`, null, [{para:t}]);
    for (const m of t.matchAll(RX_TAG)){
      total++;
      const tag=m[0];
      const node=p.model.nodes.find(n=>m.index>=n.start && m.index<n.start+n.len);
      if (p.textbox) add('error', `<code>${esc(tag.slice(0,60))}</code> is inside a text box. CompUp can't fill tags there; move it to a normal paragraph or table.`, null, [tag]);
      else if (node && ancestor(node.node,['sdtContent'])) add('warn', `<code>${esc(tag.slice(0,60))}</code> is inside a content control. Remove the control and keep plain text.`, null, [tag]);
      if (p.kind==='header' || p.kind==='footer') add('info', `There are tags in the ${p.kind}. They are filled like the rest of the letter; check the ${p.kind} once in Employee preview, then in a PDF previewed in CompUp.`, null, [tag]);
      if (p.kind==='notes') add('warn', 'Tags in footnotes or endnotes depend on the renderer. Test before going live.', null, [tag]);
      if (tag.startsWith('{#')) continue;
      { const why=tagSyntaxProblem(tag); if (why) add('error', `${esc(why)} <code>${esc(tag.slice(0,90))}</code>`, tagSyntaxFix(tag), [tag]); }
      if (!tag.startsWith('{#')){ const body=tag.replace(/^\{[{%]-?|-?[}%]\}$/g,''); for (const id of floatUsesWithoutDefault(body)){ if (!floatIds.has(id)) floatIds.set(id, new Set()); floatIds.get(id).add(tag); } }
      const inner=tag.replace(/^\{[{%]-?|-?[}%]\}$/g,'').trim();
      if ((inner.match(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"/g)||[]).some(l=>/[&<>]/.test(l))) ampLit.add(tag);
      { const mm=inner.match(/^(?:if|elif)\s+([A-Za-z_][\w.]*)$/); if (mm){ const id=mm[1]; const isTyped=typedKey(id); if (!isTyped && (/^custom_/.test(id) || keyStatus(id,U)==='csv')) bareIf.add(id); } }
      if (tag.startsWith('{{') && (inner.match(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"/g)||[]).some(l=>/^['"]\s*(₹|rs\.?|inr)?\s*\d{1,3}(,\d{2,3})+(\.\d+)?\s*(\/-)?['"]$|^['"]\d{4,}['"]$/i.test(l))) fixedAmt.add(tag);
      if (tag.startsWith('{%')){
        const kw=(inner.match(/^(\w+)/)||[])[1]||'';
        const cell=ancestor(p.el,['tc']);
        const sk=(stacks[p.path] ||= []);
        if (kw==='set'){ const v=(inner.match(/^set\s+(\w+)/)||[])[1]; if (v) localVars.add(v); }
        if (kw==='for'){ const v=(inner.match(/^for\s+(\w+)(?:\s*,\s*(\w+))?/)||[]); if (v[1]) localVars.add(v[1]); if (v[2]) localVars.add(v[2]); }
        if (kw==='if' || kw==='for') sk.push({kw, cell, tag});
        else if (kw==='elif' || kw==='else'){ const top=sk[sk.length-1]; if (!top || top.kw!=='if') add('error', `<code>${esc(tag)}</code> has no matching <code>{% if %}</code> above it.`, null, [tag]); }
        else if (kw==='endif' || kw==='endfor'){
          const want=kw==='endif'?'if':'for'; const top=sk.pop();
          if (!top || top.kw!==want) add('error', `<code>${esc(tag)}</code> has no matching <code>{% ${want} %}</code> above it.`, null, [tag]);
          else if ((top.cell||cell) && top.cell!==cell && !rowPair(top.cell, cell)) add('error', `A condition opens and closes in different table cells: <code>${esc(top.tag.slice(0,60))}</code>. Keep both in the same cell.`, null, [top.tag, tag]);
        }
      }
      const expr = tag.startsWith('{%') ? inner.replace(/^(if|elif|for\s+\w+(?:\s*,\s*\w+)?\s+in|set\s+\w+\s*=)\s*/,'') : inner;
      if (/^(else|endif|endfor|raw|endraw)$/.test(expr)) continue;
      for (const id of identifiersIn(expr)){
        if (id==='currentDatetime') continue;
        if (!idTags.has(id)) idTags.set(id, new Set()); if (idTags.get(id).size<20) idTags.get(id).add(tag);
        if (!localVars.has(id.split('.')[0])) usedIds.add(id);
        if (!KNOWN.has(id) && id!==id.toLowerCase()) upper.add(id);
        else if (!isKnownKey(id, localVars)) unknown.add(id);
      }
      for (const u of rawNumericUses(expr)) if (!localVars.has(u.id.split('.')[0])) numericUse.set(u.id, u.op);
      if (tag.startsWith('{{') && pyResultType(inner)==='float') floatPrint.add(tag);
    }
  }
  for (const [path, sk] of Object.entries(stacks)) for (const x of sk) add('error', `<code>${esc(x.tag.slice(0,70))}</code> is never closed. Add <code>{% end${x.kw} %}</code> where it should stop.`, closingFixFor(x.tag), [x.tag]);
  // a combined template still switched on the made-up field: no letter will ever match until a real field is chosen
  if (usedIds.has(AUTO_FIELD) && keyStatus(AUTO_FIELD,U)!=='csv') add('warn', `Choose which employee field decides the version. The combined letter still switches on <code>${AUTO_FIELD}</code>, which is not in your data, so no employee gets the right version.`, null, tagsOf([AUTO_FIELD]));
  if (U.size){
    let n=0; const noSug=[];
    for (const id of usedIds){
      if (keyStatus(id,U)!=='unknown') continue; unknown.delete(id);
      if (id===AUTO_FIELD) continue;   // has its own warning above
      const sug=didYouMean(id,U); if (!sug){ noSug.push(id); continue; } if (n++>=20) continue;
      const pref=sug.replace(/^custom_schema\.|^custom_/,'')===id.replace(/^custom_schema\.|^custom_/,'');
      add('warn', `<code>${esc(id)}</code> isn't in your data file. Did you mean <code>${esc(sug)}</code>?${pref?' (If it comes from another upload, ignore this.)':''}`, {label:`Use ${sug}`, fn:()=>{ renameEverywhere(id, sug); toast(`Changed ${id} to ${sug}.`); }}, tagsOf([id]));
    }
    { const noSugF=noSug.filter(id=>!floatIds.has(id));
    if (noSugF.length) add('warn', `${noSugF.length} tag name${noSugF.length>1?'s are':' is'} not in your data file or the CompUp tag list: ${noSugF.slice(0,25).map(x=>`<code>${esc(x)}</code>`).join(', ')}${noSugF.length>25?` and ${noSugF.length-25} more`:''}. If they come from another upload or formula sheet, load that file to check them too; otherwise check the spelling.`, null, tagsOf(noSugF)); }
  }
  if (U.size){
    const miss=[...floatIds.keys()].filter(id=>!localVars.has(id.split('.')[0]) && keyStatus(id,U)==='unknown' && !didYouMean(id,U));
    for (const id of miss.slice(0,15)) add('warn', `<code>${esc(id)}</code> is used with <code>| ${[...floatIds.get(id)].some(t=>/\|\s*int\b/.test(t))?'int':'float'}</code> but isn't in your data file. For any employee without it, Jinja stops the whole letter with “${esc(id.split('.').pop())} is undefined”. Adding <code>| default(0)</code> makes a missing value count as 0.`, {label:'Add | default(0)', fn:()=>fixTags(t=>addDefaultTo(t,id), n=>`Added | default(0) to ${id} in ${n} tag${n>1?'s':''}.`)}, [...floatIds.get(id)]);
  }
  for (const [id,op] of numericUse){ const st=keyStatus(id,U); if (typedKey(id)) continue; if (st==='csv' || /^custom_schema\./.test(id)) add('warn', `<code>${esc(id)}</code> is used with <code>${esc(op)}</code> but without <code>| float</code>. Uploaded values are text, so CompUp can stop with an error or compare them as words. Write <code>(${esc(id)} | float)</code> instead.`, null, tagsOf([id])); }
  for (const x of rowCondMismatches(an)) if (x.dup) add('warn', `Row “${esc(x.label)}” uses ${x.dup.map(d=>`<code>${esc(d)}</code>`).join(' and ')}. They look like the same field with different prefixes, so one of them is probably wrong (only one will have a value).`); else add('warn', `Row “${esc(x.label)}” is shown or hidden by <code>${esc(x.cond.join(', '))}</code>, but its cells use ${x.cells.slice(0,4).map(c=>`<code>${esc(c)}</code>`).join(', ')}. Check that the row's condition uses the same field, or the row can disappear while it has values (or show while empty).`);
  if (bareIf.size) add('info', `${bareIf.size} condition${bareIf.size>1?'s test a value':' tests a value'} directly, e.g. <code>{% if ${esc([...bareIf][0])} %}</code>. Uploaded values are text, and the text “0” counts as true, so the line or cell still shows (printing 0) when the upload has 0. If 0 should hide it, write <code>(${esc([...bareIf][0])} | float) &gt; 0</code>. ${bareIf.size>1?`All: ${[...bareIf].slice(0,12).map(x=>`<code>${esc(x)}</code>`).join(', ')}${bareIf.size>12?'…':''}`:''}`, null, tagsOf(bareIf));
  if (fixedAmt.size) add('info', `${fixedAmt.size} tag${fixedAmt.size>1?'s print':' prints'} a fixed amount typed into the tag rather than a field: ${[...fixedAmt].slice(0,3).map(x=>`<code>${esc(x.slice(0,90))}</code>`).join(', ')}. Fine if it's the same for everyone; otherwise use the field.`, null, [...fixedAmt]);
  if (ampLit.size) add('warn', `${ampLit.size} tag${ampLit.size>1?'s have':' has'} &amp;, &lt; or &gt; inside quotes: ${[...ampLit].slice(0,3).map(x=>`<code>${esc(x.slice(0,80))}</code>`).join(', ')}. The .docx stores them as &amp;amp;, &amp;lt; or &amp;gt;, and some engines compare against that text, so a value like “R&amp;D” may never match. Inside the quotes, write <code>\\u0026</code> for &amp;, <code>\\u003c</code> for &lt; and <code>\\u003e</code> for &gt;.`, null, [...ampLit]);
  if (floatPrint.size) add('info', `${floatPrint.size} tag${floatPrint.size>1?'s print':' prints'} a decimal number such as 1234567.0 in CompUp, because the result comes from <code>| float</code>, <code>| round</code> or <code>/</code>. End ${floatPrint.size>1?'them':'it'} with <code>| int</code> or a comma filter: ${[...floatPrint].slice(0,3).map(x=>`<code>${esc(x)}</code>`).join(', ')}`, null, [...floatPrint]);
  if (trimless.size) add('info', `${trimless.size} logic tag${trimless.size>1?'s sit':' sits'} on a line of its own without the <code>-</code> trim marks, so that line stays blank in the letter CompUp turns into a PDF: ${[...trimless].slice(0,3).map(x=>`<code>${esc(x)}</code>`).join(', ')}`, {label:'Add trim marks', fn:()=>fixTrimless([...trimless])}, [...trimless]);
  for (const id of upper) add('error', `<code>${esc(id)}</code> has capital letters. Tags are case sensitive; CompUp tags are lower case.`, null, tagsOf([id]));
  if (unknown.size) add('info', `Not in the standard tag list: ${[...unknown].slice(0,12).map(x=>`<code>${esc(x)}</code>`).join(', ')}${unknown.size>12?'…':''}. Fine for plan parameters or custom columns; otherwise check the spelling.`, null, tagsOf(unknown));
  const moneyPlain = state.rows.filter(r=>r.enabled && r.count && isMoney(r.key) && effFormat(r)==='none' && r.override==null).length;
  if (moneyPlain) add('info', `${moneyPlain} money value${moneyPlain>1?'s print':' prints'} without commas (e.g. 1200000). Choose a comma format if the letter should show 12,00,000.`);
  if (!out.some(x=>x.level==='error')) add('info', `${total} tag${total===1?'':'s'} in the template. Check one edge-case employee in Employee preview, then preview their PDF in CompUp before generating the cycle.`);
  const rank={error:0,warn:1,fixed:2,info:3}; out.sort((a,b)=>rank[a.level]-rank[b.level]);
  for (const x of out) x.locs=locateTags(x.tags);
  return out;
}
// where a tag sits in the letter as loaded (the paragraphs shown in "Client letter")
export function squash(t){ return straighten(String(t||'')).replace(/\\u0026/gi,'&').replace(/\\u003c/gi,'<').replace(/\\u003e/gi,'>').replace(/\s+/g,'').replace(/\{([{%])-/g,'{$1').replace(/-([}%])\}/g,'$1}'); }
export function locateTags(tags, max=8){
  const out=[]; const seen=new Set(); if (!tags || !tags.length || !state.an) return out;
  const paras=state.an.paras.filter(p=>!p.fallback && p.model.text);
  const sq=new Map(); const sqOf=p=>{ let v=sq.get(p); if (v===undefined){ v=squash(p.model.text); sq.set(p,v); } return v; };
  for (const t of tags){
    const needle = typeof t==='string' ? squash(t) : squash(t.para);
    if (!needle) continue;
    for (const p of paras){
      if (seen.has(p.pid)) continue;
      const hay=sqOf(p);
      if (typeof t==='string' ? hay.includes(needle) : hay===needle){ seen.add(p.pid); out.push(p.pid); if (out.length>=max) return out; }
    }
  }
  return out;
}
/* §check-js */
// Validate step: every finding gets a category and (when it points at the letter) a flag letter.
// The checks themselves live in runChecks / realCheck; this is presentation and navigation only.
export const CK_CATS={
  syntax:{name:'Jinja syntax', why:"CompUp can't fill the letter at all while this is wrong.", fix:"Correct the tag; the one-click fix is offered when it's safe."},
  fields:{name:'Unknown or undefined fields', why:'The value prints empty for every employee.', fix:"Pick the field from the list, or confirm it's a custom column.", act:'Open tags'},
  mapping:{name:'Missing mappings', why:'The text stays as typed in every letter.', fix:'Map each placeholder to a field.', act:'Map field'},
  review:{name:'Low-confidence suggestions', why:'A wrong guess puts the wrong value in every letter.', fix:'Check each suggested tag and confirm it, or pick another field.', act:'Review'},
  cells:{name:'Empty table cells', why:'Empty cells stay blank in every letter.', fix:'Pick a tag for each empty cell in the table.', act:'Show table'},
  conditions:{name:'Conditions', why:'A condition that never applies, or always applies, shows the wrong text.', fix:'Check the field and the value in the condition.', act:'Open conditions'},
  format:{name:'Number and text format', why:'Numbers or text may print differently from what you expect.', fix:'Follow the note in the message, for example pick a comma format.'},
  render:{name:'Rendering', why:'The letter fails or prints wrong for some employees.', fix:'Fix the tag named in the message, then test every employee again.'},
  other:{name:'Other', why:"Worth knowing before the letters go out.", fix:'Read the message and decide whether it needs action.'},
};
export const CK_ORDER=['syntax','fields','mapping','review','cells','conditions','format','render','other'];
export const CK_LAB={error:'Fix', warn:'Check', info:'Note', fixed:'Fixed'};
export function ckPlain(html){ return decodeXmlText(String(html||'').replace(/<[^>]+>/g,'')).replace(/\s+/g,' ').trim(); }
// which group a finding belongs to, from where it came from and what it says
export function checkCategory(x){
  if (x.level==='fixed') return 'fixed';
  if (x.real) return 'syntax';
  const t=ckPlain(x.html);
  if (/still need a tag/.test(t)) return 'mapping';
  if (/low-confidence guess/.test(t)) return 'review';
  if (/empty cells? (has|have) no tag/.test(t)) return 'cells';
  if (/inside a text box|inside a content control|Tags in footnotes|tracked changes|Word comments|^There are tags in the (header|footer)|tags? in the template\. Preview/.test(t)) return 'other';
  if (/different table cells/.test(t)) return 'conditions';
  if (x.level==='error') return 'syntax';
  if (/isn't in your data file|not in your data file or the CompUp tag list|Not in the standard tag list/.test(t)) return 'fields';
  if (/Choose which employee field decides the version|Nobody in your data file|Every employee in your data file|test a value directly|tests a value directly|on a line of its own|trim marks|is shown or hidden by|same field with different prefixes|will be left out when the value is empty/.test(t)) return 'conditions';
  if (/without commas|decimal number|fixed amount|inside quotes|without <code>|but without|merge field is really|\| float/.test(t)) return 'format';
  if (/shown or hidden|the letter shows/.test(t)) return 'format';
  return 'other';
}
export function ckLetterName(i){ let n=i+1, s=''; while (n>0){ const r=(n-1)%26; s=String.fromCharCode(65+r)+s; n=Math.floor((n-1)/26); } return s; }
export function ckKey(x, seen){
  // one tag → the key follows the tag, so the same mistake keeps its letter whether the page or real Jinja found it
  const tg=(x.tags||[]).filter(t=>typeof t==='string');
  let k=x.cat+'|'+(tg.length===1 ? 'tag:'+squash(tg[0]) : ckPlain(x.html).replace(/\d+/g,'#').slice(0,200)); const n=(seen.get(k)||0)+1; seen.set(k,n); return n>1 ? k+'~'+n : k;
}
// categories, display order and stable flag letters
export function ckPrepare(list){
  if (state.ckDoc!==state.srcBuf){
    state.ckDoc=state.srcBuf; state.ckLetters=new Map();
    if (state.insp) state.insp=null;
  }
  const dup=new Map();
  for (const x of list){ x.cat=checkCategory(x); x.key=ckKey(x, dup); }
  const active=list.filter(x=>x.level!=='fixed');
  const rank={error:0, warn:1, info:2};
  const by=new Map(); for (const x of active){ if (!by.has(x.cat)) by.set(x.cat, []); by.get(x.cat).push(x); }
  const groups=[...by.entries()].map(([cat, items])=>({cat, items, worst:Math.min(...items.map(x=>rank[x.level]))}))
    .sort((a,b)=>a.worst-b.worst || CK_ORDER.indexOf(a.cat)-CK_ORDER.indexOf(b.cat));
  const flat=groups.flatMap(g=>g.items);
  flat.forEach((x,i)=>{
    x.idx=i; x.letter='';
    if ((x.level==='error' || x.level==='warn') && x.locs && x.locs.length){
      let n=state.ckLetters.get(x.key); if (n==null){ n=state.ckLetters.size; state.ckLetters.set(x.key, n); }
      x.letter=ckLetterName(n);
    }
  });
  state.issues=flat; state.issueGroups=groups; state.ckFixed=list.filter(x=>x.level==='fixed');
}
export function ckEngineConfirmed(){ return server.ok ? !!(server.check && !server.check.syntax.length && !server.err && !server.checking) : !!(window.claude || server.probed); }
export function ckCatAction(cat){ const c=CK_CATS[cat]; return c && c.act ? c.act : ''; }
// ----- margin flags on the paper -----
export function ckFlagSpecs(){
  const out=[]; for (const x of (state.issues||[])){ if (!x.letter) continue; for (const pid of x.locs) out.push({fk:x.idx+'@'+pid, pid, x}); } return out;
}
/* ---- the Validate list: this page's own findings + real Jinja's, grouped, with stable flag letters ----
   (was renderChecks(): everything it computed, none of the drawing. Read state.issues / state.issueGroups / state.checkCounts.) */
export function computeChecks(){
  const own=state.built?state.built.checks:[];
  const real=[]; const c=server.ok && server.check;
  if (c){
    for (const x of c.syntax){
      const fx = /never closed/.test(x.friendly) ? closingFixFor('') : tagSyntaxFix(x.tag);
      const item={level:'error', real:true, html:`${esc(x.friendly)}${x.tag?` <code>${esc(x.tag)}</code>`:''}${x.part_label && x.part_label!=='Body'?` (in the ${esc(x.part_label.toLowerCase())})`:''}`, tags:x.tag?[x.tag]:[], locs:realLocs(x, c.target)};
      if (fx) item.fix={label:fx.label, idx:state.fixes.push(fx.fn)-1};
      real.push(item);
    }
  }
  // the same mistake found by both: keep the real-Jinja wording
  const realTags=new Set(real.flatMap(x=>x.tags.map(squash)));
  const bc=blockCountsNow(); const blockItems=[];
  if (bc && state.lg) for (const e of state.lg){
    if (!(e.kw==='if'||e.kw==='elif') || !bc.byKey.has(e.key)) continue;
    const n=bc.byKey.get(e.key), en=condEnglish(e.expr);
    if (n===0){ const it={level:'warn', html:`Nobody in your data file gets this part of the letter: <code>${esc(e.text.slice(0,90))}</code>${en?` (shown when ${esc(en)})`:''}, 0 of ${bc.total} employees. Check the value and the field name, or ignore this if your data has no such employee yet.`, tags:[e.text], locs:[e.pid]}; it.fix={label:'Change condition', idx:state.fixes.push(()=>startCondEdit(e.key))-1}; blockItems.push(it); }
    else if (n===bc.total && e.kw==='if' && !(e.closer && state.lg.some(x=>x.opener===e && (x.kw==='else'||x.kw==='elif')))) blockItems.push({level:'info', html:`Every employee in your data file gets this part of the letter: <code>${esc(e.text.slice(0,90))}</code>, all ${bc.total}. Fine if that's expected; otherwise the condition isn't doing anything.`, tags:[e.text], locs:[e.pid]});
  }
  const list=[...real, ...blockItems, ...own.filter(x=>!(x.level==='error' && x.tags.length && x.tags.every(t=>typeof t==='string' && realTags.has(squash(t)))))];
  { const rank={error:0,warn:1,fixed:2,info:3}; list.sort((a,b)=>rank[a.level]-rank[b.level]); }
  // mark the tags with a problem in the letter
  const marks=new Map(); for (const x of list){ if (x.level!=='error' && x.level!=='warn') continue; for (const t of (x.tags||[])){ if (typeof t!=='string') continue; const k=squash(t); const was=marks.get(k); if (!was || (was.level==='warn' && x.level==='error')) marks.set(k, {level:x.level, msg:x.html.replace(/<[^>]+>/g,'').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').slice(0,220)}); } }
  const sig=[...marks.entries()].map(([k,v])=>k+v.level).join('|');
  state.tagMarks=marks; state.tagMarksSig=sig;
  const e=list.filter(x=>x.level==='error').length, w=list.filter(x=>x.level==='warn').length;
  ckPrepare(list);
  state.checkCounts={e, w};
  if (state.insp && !(state.issues||[]).some(x=>x.key===state.insp.key)) state.insp=null;   // the finding is gone: its panel closes
  notify();
}
// "name.docx: 12 tags in the letter as loaded, 3 of them conditions, body and 2 header/footer parts."
export function checkSummaryText(){
  if (!state.fileName) return '';
  const an=state.an; let tags=0, logic=0;
  if (an) for (const p of an.paras){ if (p.fallback) continue; for (const m of (p.model.text||'').matchAll(RX_TAG)){ tags++; if (/^\{%-?\s*(if|elif|for)\b/.test(m[0])) logic++; } }
  const hf=state.parts.filter(x=>x.kind==='header'||x.kind==='footer').length;
  return `${state.fileName}: ${tags} tag${tags===1?'':'s'} in the letter as loaded, ${logic} of them condition${logic===1?'':'s'}${hf?`, body and ${hf} header/footer part${hf>1?'s':''}`:''}.`;
}

/* ---- what the Validate step shows (new: the data half of the old renderChecks / realCheckHtml / ckRender / ckRowHtml) ----
   Plain data, no HTML, so a screen can lay it out any way it likes. Everything comes from state.issues and the server probe. */
// where a finding is in the letter: one chip per paragraph (page label + the start of its text)
export function placeChips(pids, n=38){
  const out=[]; for (const pid of (pids||[])){ const p=state.an && state.an.byPid.get(pid); if (!p) continue; out.push({pid, page:pageLabel(p), text:snippet(p,n)}); } return out;
}
// one line about the real Jinja check: what it did, in words (was realCheckHtml). kind: none | unavailable | error | checking | notrun | failed | passed
export function engineStatus(){
  if (!server.ok){
    if (!window.claude && !server.probed) return {kind:'none', title:'', detail:''};
    return {kind:'unavailable', title:"Real Jinja check isn't available here; these are the page's own checks.", detail:''};
  }
  const what = server.check && server.check.target==='built' ? 'the template with your changes' : 'your file as uploaded';
  if (server.err) return {kind:'error', title:`Real Jinja check didn't run: ${server.err}`, detail:''};
  if (server.checking) return {kind:'checking', title:`${server.check?'Checking again':'Checking'} with real Jinja…`, detail:''};
  const c=server.check; if (!c) return {kind:'notrun', title:"Real Jinja check hasn't run yet.", detail:''};
  const v=(server.info&&server.info.versions)||{};
  const eng = v.docxtpl ? `docxtpl ${v.docxtpl}, the engine CompUp uses` : 'the engine CompUp uses';
  const n=c.syntax.length;
  return n ? {kind:'failed', title:`Real Jinja check failed: ${n} typing mistake${n>1?'s':''}, listed first below.`, detail:`Checked ${what} with ${eng}. Jinja stops at the first mistake in each part (body, header, footer), so check again after fixing.`}
    : {kind:'passed', title:`Real Jinja check passed: ${eng}. ${c.variables.length} field${c.variables.length===1?'':'s'} used.`, detail:`Checked ${what}.`};
}
// one finding as plain data (the Validate list and the issue panel both draw this)
export function issueItem(x){
  const cat=CK_CATS[x.cat]||CK_CATS.other;
  return {key:x.key, idx:x.idx, level:x.level, label:CK_LAB[x.level], cat:x.cat, catName:cat.name, real:!!x.real, html:x.html, text:ckPlain(x.html),
    letter:x.letter||'', chips:placeChips(x.locs), moreTags:!!(x.tags && x.tags.length>8), hasLocs:!!(x.locs && x.locs.length), locs:x.locs||[],
    fix:x.fix?{idx:x.fix.idx, label:x.fix.label}:null, act:ckCatAction(x.cat), why:cat.why, how:cat.fix};
}
// the whole step: counts, engine line, whether it is truly clean, the findings grouped by category, the resolved ones
export function checkView(){
  const iss=state.issues||[]; const e=iss.filter(x=>x.level==='error').length, w=iss.filter(x=>x.level==='warn').length;
  const notes=iss.filter(x=>x.level==='info').length; const fixed=state.ckFixed||[];
  const confirmed=ckEngineConfirmed();
  const clean=!e && !w && !!state.an && confirmed;
  const v=(server.info&&server.info.versions)||{};
  const groups=(state.issueGroups||[]).filter(g=>g.items.length).map(g=>({cat:g.cat, name:CK_CATS[g.cat].name,
    errors:g.items.filter(x=>x.level==='error').length, warnings:g.items.filter(x=>x.level==='warn').length, items:g.items.map(issueItem)}));
  const stats = e ? `${e} to fix${w?` · ${w} to check`:''}` : w ? `${w} to check` : clean ? 'No problems found' : server.ok && server.checking ? 'Checking…' : '';
  return {
    hasLetter:!!state.an, counts:{errors:e, warnings:w, resolved:fixed.length, notes}, stats, clean, confirmed, engine:engineStatus(), realAvailable:!!server.ok,
    cleanText: server.ok ? `Real Jinja${v.docxtpl?` (docxtpl ${v.docxtpl})`:''} and the page's own checks found nothing wrong with the tags, fields, conditions and table cells.`
      : "The page's own checks found nothing wrong with the tags, fields, conditions and table cells. The real Jinja check isn't available here, so this is the page checks only.",
    groups, resolved:fixed.map(x=>({key:x.key, text:ckPlain(x.html), letter:x.letter||''})), summary:checkSummaryText(),
  };
}
// one finding by its stable key (the issue panel keeps the key, not the index: indexes move when findings come and go)
export function issueByKey(key){ const x=(state.issues||[]).find(i=>i.key===key); return x ? issueItem(x) : null; }
// the flags for the margin: one per place a finding points at (level error / warn only; notes have no flag)
export function flagList(){
  const out=[]; for (const s of ckFlagSpecs()){ const x=s.x; const plain=ckPlain(x.html);
    out.push({key:s.fk, pid:s.pid, letter:x.letter, level:x.level==='error'?'error':'warn', label:`${(CK_CATS[x.cat]||CK_CATS.other).name}. ${plain.slice(0,90)}${plain.length>90?'…':''}`, index:x.idx, issueKey:x.key}); }
  return out;
}
// the one-click fix of a finding
export function runIssueFix(idx){ const fn=state.fixes[idx]; if (typeof fn!=='function') return false; fn(); return true; }
