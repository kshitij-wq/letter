// Moved from frontend_src/letter-tagger.html — see tests_ui/legacy for the reference page. No DOM rendering in this module.
import { noteFor } from './alias.js'
import { CAT, CATALOG, FORMULAS, FX, isMoney } from './catalog.js'
import { tagSyntaxProblem } from './checks.js'
import { cbFieldLabel } from './conditions.js'
import { RX_TAG, overlaps } from './detect.js'
import { esc, findAll, straighten } from './helpers.js'
import { state } from './state.js'
import { tagKeyOf } from './tables.js'

/* ======================= tags ======================= */
export function keyParts(key){ return String(key||'').split('+').map(x=>x.trim()).filter(Boolean); }
export function isMultiKey(key){ return !!key && !/\{\{|\{%/.test(key) && /\+/.test(key) && !/[()'"|]/.test(key) && keyParts(key).every(x=>/^[A-Za-z_][\w.:]*$/.test(x)); }
export function effFormat(r){ if (r.format!=='auto') return r.format; if (isMultiKey(r.key)) return keyParts(r.key).every(isMoney) ? state.settings.money : 'none'; if (isMoney(r.key)) return state.settings.money; return 'none'; }
export function wrapper(){ return state.settings.spaced ? e=>`{{ ${e} }}` : e=>`{{${e}}}`; }
export function buildTag(key, fmt){
  const w=wrapper();
  if (!key) return '';
  if (isMultiKey(key)){ const parts=keyParts(key); return parts.length===1 ? buildTag(parts[0], fmt) : parts.map(k=>buildTag(k, fmt)).join(' '); }
  if (FX[key]) return FX[key].build(w);
  if (/\{\{|\{%/.test(key)) return straighten(key);
  const g=state.settings.guard, n0=g?' | default(0, true)':'', s0=g?" | default('—', true)":'';
  switch(fmt){
    case 'indian': return w(`${key}${n0} | indian_comma`);
    case 'indian_round': return w(`(${key}${n0} | float) | round(0) | int | indian_comma`);
    case 'intl': return w(`${key}${n0} | int_comma`);
    case 'dec2': return w(`'{:,.2f}'.format(${key}${n0} | float)`);
    case 'dec0': return w(`'{:.0f}'.format(${key} | default(0) | float) | indian_comma`);
    case 'house': return houseTag(key, `${key} | float`);
    case 'dash': return dashTag(key, `${key} | float`);
    case 'upper': return w(`${key}${s0} | upper`);
    case 'title': return w(`${key}${s0} | title`);
    case 'date': return w(`${key} | format_date('%d-%m-%Y', '%d %B %Y')`);
    default: return w(`${key}${s0}`);
  }
}
// the team's table-cell style: nothing (or "-") when the value is empty or 0, otherwise '{:.0f}' with Indian commas
export function houseTag(key, num){ const w=wrapper(); return `{% if (${key} | default(0) | float) != 0 %}${w(`'{:.0f}'.format(${num}) | indian_comma`)}{% endif %}`; }
export function dashTag(key, num){ const w=wrapper(); return w(`'-' if (${key} | default(0) | float) == 0 else ('{:.0f}'.format(${num}) | indian_comma)`); }
export function finalTag(r){ return r.override!=null ? straighten(r.override) : buildTag(r.key, effFormat(r)); }
export function userSet(r){ const ed=state.edits[r.id]; return !!(ed && ('key' in ed || 'override' in ed || ed.reviewed)); }
export function rowStatus(r){
  if (!r.enabled) return 'off';
  if (!finalTag(r)) return 'need';
  if (r.conf<0.7 && !userSet(r)) return 'check';
  return 'tagged';
}
/* ======================= matching ======================= */
export function computeMatches(an, rows){
  const map=new Map();
  const globals=rows.filter(r=>r.scope==='all').sort((a,b)=>b.find.length-a.find.length);
  for (const p of an.paras){
    const t=p.model.text; if (!t) continue;
    const cands=[];
    for (const r of rows) if (r.scope==='one' && r.loc.pid===p.pid) cands.push({s:r.loc.s, e:r.loc.e, row:r, pr:0});
    const tagSpans=[...t.matchAll(RX_TAG)].map(m=>[m.index,m.index+m[0].length]);
    const typed=state.typed.has(p.pid);
    for (const r of globals){ if (typed && r.kind==='Sample value') continue; for (const [s,e] of findAll(t, r.find)) if (!overlaps(tagSpans,s,e)) cands.push({s,e,row:r,pr:1}); }
    cands.sort((a,b)=>a.pr-b.pr || (b.e-b.s)-(a.e-a.s) || a.s-b.s);
    const picked=[];
    for (const c of cands) if (!picked.some(x=>c.s<x.e && c.e>x.s)) picked.push(c);
    if (picked.length) map.set(p.pid, picked.sort((a,b)=>a.s-b.s));
  }
  return map;
}
export function computeSourceMatches(){ state.srcMatches = computeMatches(state.an, state.rows); }
/* ======================= rendering: rows ======================= */
export const KIND_TITLE={'Brackets':'Bracket placeholder','Merge field':'Word merge field','Blank':'Blank to fill','Highlight':'Highlighted text','CSV':'Found from your CSV','Sample value':'Text that matches a value in your data file','Added':'Added by you'};
export const KIND_SHOW={"Sample value":"Matches your data"};
// shown text only; r.kind keeps its internal value
export function confText(r, noHow){
  const st=rowStatus(r);
  if (st==='off') return '<span class="lvl">Skipped</span> · left as typed';
  if (!finalTag(r)) return '<span class="lvl lo">Needs a tag</span> · pick one from the list or type a tag';
  const ed=state.edits[r.id]; const us=userSet(r);
  const lvl = us ? (ed && ed.reviewed && !('key' in ed) && !('override' in ed) ? '<span class="lvl hi">Reviewed</span>' : '<span class="lvl hi">Set by you</span>') : r.conf>=0.9 ? '<span class="lvl hi">Matched</span>' : r.conf>=0.7 ? '<span class="lvl hi">Suggested</span>' : '<span class="lvl mid">To check</span>';
  const bits=[lvl]; if (!us && r.how && !noHow) bits.push(esc(r.how));
  const n = noteFor(r.key, us?'':r.extra); if (n) bits.push(esc(n));
  return bits.join(' · ');
}
/* the list of placeholders: one compact line per item; the editor is in the inspector (see §tags-js) */
export const ST_INFO={ tagged:{label:'Tagged', icon:'check-circle'}, check:{label:'To check', icon:'alert-triangle'}, need:{label:'Needs a tag', icon:'flag'}, off:{label:'Skipped', icon:'minus'} };
// a field's name for people: the CSV heading, or the CompUp label, or the key made readable
export function fieldLabel(key){
  const h=state.csvHeaders.find(x=>tagKeyOf(x)===key); if (h && h!==key) return h;
  if (FX[key]) return FX[key].label; if (CAT[key]) return CAT[key].label;
  const t=cbFieldLabel(key); return t ? t.charAt(0).toUpperCase()+t.slice(1) : key;
}
export function rowField(r){
  const key=String(r.key||'').trim(); if (!key) return null;
  const parts = isMultiKey(key) ? keyParts(key) : [key];
  const label=parts.map(fieldLabel).join(' + ');
  return {label, key, same: parts.length===1 && label.replace(/\s+/g,'_').toLowerCase()===key.toLowerCase()};
}
// placeholders that sit in a paragraph inside an if / for block
export function condRowIds(){
  const out=new Set(); const m=state.srcMatches; if (!m || !state.lgRails) return out;
  for (const [pid,spans] of m){ if (!state.lgRails.get(pid)) continue; for (const x of spans) out.add(x.row.id); }
  return out;
}
export function rowSearchText(r){ const f=rowField(r); return [r.find, r.label, r.key, f&&f.label, finalTag(r)].filter(Boolean).join('\n').toLowerCase(); }
export function listRows(){
  const f=state.filter, q=(state.q||'').trim().toLowerCase(); const cond=f==='cond' ? condRowIds() : null;
  return state.rows.filter(r=>{
    if (f==='unused'){ if (r.count) return false; }
    else if (f!=='all'){ if (!r.count) return false; if (f==='cond' ? !cond.has(r.id) : rowStatus(r)!==f) return false; }
    return !q || rowSearchText(r).includes(q);
  });
}
export function edit(id, patch){ state.edits[id]={...(state.edits[id]||{}), ...patch}; const r=state.rows.find(x=>x.id===id); Object.assign(r, patch); if ('key' in patch){ r.conf=1; } }
// searchable tag dropdown (CSV columns first, then CompUp tags)
export function comboOptions(){
  const out=[]; const seen=new Set(); const add=o=>{ if (o.v && !seen.has(o.g+'|'+o.v)){ seen.add(o.g+'|'+o.v); out.push(o); } };
  for (const h of state.csvHeaders) add({v:tagKeyOf(h), l:h===tagKeyOf(h)?'':h, g:'Your CSV columns'});
  if (state.team && state.team.use!==false) for (const h of state.team.columns||[]) if (!state.csvHeaders.includes(h)) add({v:tagKeyOf(h), l:h===tagKeyOf(h)?'':h, g:'Team library · '+state.team.name});
  for (const k of state.extraKeys) if (k && !state.csvHeaders.some(h=>tagKeyOf(h)===k) && !CAT[k] && !FX[k]) add({v:k, l:'', g:'From your CSV'});
  for (const c of [...CATALOG, ...FORMULAS]){
    if (c.key==='fx:full_name') continue;
    add({v:c.key, l:c.label, g:'CompUp · '+c.g});
    if (c.key==='last_name') add({v:'fx:full_name', l:'Full name (first + last)', g:'CompUp · '+c.g});
  }
  [['custom_schema.column_heading','Custom cycle column'],['employee_schema.column_heading','Performance sheet column'],['component_current_amount','Salary component, revised'],['component_old_amount','Salary component, old'],['factor_name_new_amount','Factor'],['emp_variable_plan_formula.parameter_name','Plan parameter weightage']]
    .forEach(([v,l])=>add({v, l, g:'Patterns · edit the name'}));
  return out;
}
// the words around a placeholder, from its own spot or from its first place in the letter
export function rowContext(r){
  if (r.scope==='one') return {before:r.ctx||'', find:r.find, after:r.after||''};
  for (const p of state.an.paras){
    const sp=state.srcMatches.get(p.pid); const m=sp && sp.find(x=>x.row.id===r.id);
    if (m){ const t=p.model.text; return {before:t.slice(Math.max(0,m.s-70), m.s), find:t.slice(m.s,m.e), after:t.slice(m.e, m.e+30)}; }
  }
  return null;
}
// "Inferred from …": what the suggestion was based on, until the user confirms or changes it
// The inspector already shows the status as a badge: the note line keeps what follows the repeated word
export function inspNote(r){
  const lab=ST_INFO[rowStatus(r)].label;
  let h=confText(r, true).replace(new RegExp('^<span class="lvl[^"]*">'+lab+'</span>(?: · )?'), '');
  return h.charAt(0)==='<' ? h : h.charAt(0).toUpperCase()+h.slice(1);
}
export function inferNote(r){
  if (userSet(r) || !r.key || !r.how || rowStatus(r)==='off') return '';
  const h=String(r.how).trim().replace(/\.$/,''); let m;
  if ((m=h.match(/^Claude: ([\s\S]+)$/))) return `Suggested by Claude: ${m[1]} — confirm.`;
  if ((m=h.match(/^Guessed from ([\s\S]+)$/i)) || (m=h.match(/^Matched (how you tagged this before)$/i)) || (m=h.match(/^From ([\s\S]+)$/))) return `Inferred from ${m[1]} — confirm.`;
  return `Inferred: ${h.charAt(0).toLowerCase()+h.slice(1)} — confirm.`;
}
// a tag's own typing mistakes, in the same plain words as the Check step; every {{ }} / {% %} in the text is looked at
export function tagProblem(tag){
  const t=String(tag||''); if (!t.trim()) return '';
  const open=(t.match(/\{\{|\{%/g)||[]).length, close=(t.match(/\}\}|%\}/g)||[]).length;
  if (open!==close) return "A tag has a typing mistake: it isn't closed. Every {{ needs a }} and every {% needs a %}.";
  for (const m of t.matchAll(RX_TAG)){ const why=tagSyntaxProblem(m[0]); if (why) return why; }
  return '';
}
