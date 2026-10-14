// Moved from frontend_src/letter-tagger.html — see tests_ui/legacy for the reference page. No DOM rendering in this module.
import { CAT, CATALOG, FORMULAS, KNOWN } from './catalog.js'
import { norm, snake, straighten } from './helpers.js'
import { tagKeyOf } from './tables.js'
import { state } from './state.js'

/* ======================= alias resolution ======================= */
export const ALIASES = [];
for (const c of [...CATALOG, ...FORMULAS]) { ALIASES.push({a:norm(c.label), key:c.key}); for (const a of c.al) ALIASES.push({a:norm(a), key:c.key}); }
export const ALIAS_EXACT = new Map();
for (const x of ALIASES) if (x.a && !ALIAS_EXACT.has(x.a)) ALIAS_EXACT.set(x.a, x.key);
// aliases that are too generic to be used when scanning surrounding words
export const CONTEXT_SKIP = new Set(['id','code','date','name','title','role','position','level','base','hike','increase','revised','effective','variable','family','function','payout','address','plan','monthly','entity']);
export const ROLE_OLD = new Set(['old','existing','previous','current','present','prior','earlier']);
export const ROLE_NEW = new Set(['new','revised','proposed','updated','promoted','increased','post']);
export const SWAP_OLD = {'ctc':'old_ctc','fx:monthly_ctc':'fx:old_monthly_ctc'};
export const SWAP_NEW = {'old_ctc':'ctc','employee_schema.designation':'employee_schema.updated_designation','employee_schema.level':'employee_schema.updated_level','employee_schema.function':'employee_schema.promoted_function','employee_schema.family':'employee_schema.promoted_family','employee_schema.subfamily':'employee_schema.promoted_subfamily','fx:old_monthly_ctc':'fx:monthly_ctc'};
export const STRIP = new Set(['amount','salary','rs','inr','pa','p','a','annual','annually','per','annum','value','component','in','the','of','fixed']);
export const TRAIL_STOP = new Set(['rs','inr','rupees','usd','eur','gbp','of','is','be','the','a','an','at','as','on','by','are','was','will','amounting','shall','your','sum','amount','total']);
export function noteFor(key, extra){
  const notes=[]; if (CAT[key]?.note) notes.push(CAT[key].note);
  if (extra) notes.push(extra);
  if (key==='old_ctc') notes.push('old_ctc is the CTC before this revision.');
  if (key==='ctc') notes.push("In CompUp, ctc is the revised figure.");
  if (/_(current|old)_amount$/.test(key)) notes.push('Salary component. Match the component name used in CompUp.');
  if (key.startsWith('custom_schema.')) notes.push('Uses a column uploaded in the cycle. Check the heading.');
  return notes.join(' ');
}
export function parseTagCell(v){
  v = straighten(String(v||'').trim());
  if (!v) return null;
  if (/\{\{|\{%/.test(v)) return {override:v, key:(v.match(/\{\{-?\s*([A-Za-z_][\w.]*)/)||[])[1]||''};
  return {key:v};
}
export function resolveLabel(label, opts={}){
  const n = norm(label); if (!n) return null;
  if (state.csvAlias.has(n)) return {...state.csvAlias.get(n), conf:1, how:'From your CSV.'};
  if (state.team && state.team.use!==false && state.team.labels && state.team.labels[n]){ const v=parseTagCell(state.team.labels[n]); if (v) return {...v, conf:0.97, how:`From the team library (${state.team.name}).`}; }
  if (state.learned[n]) return {key:state.learned[n], conf:0.95, how:'Matched how you tagged this before.'};
  // label typed as a tag key already
  const raw = String(label).trim().replace(/^\{\{\s*|\s*\}\}$/g,'');
  if (KNOWN.has(raw) || /^(employee_schema|custom_schema|emp_variable_plan_formula)\.\w+$/.test(raw)) return {key:raw, conf:1, how:'Already a CompUp tag name.'};
  if (ALIAS_EXACT.has(n)) return {key:ALIAS_EXACT.get(n), conf:0.95, how:''};
  const words = n.split(' ');
  const hasOld = words.some(w=>ROLE_OLD.has(w)), hasNew = words.some(w=>ROLE_NEW.has(w));
  const role = hasNew ? 'new' : hasOld ? 'old' : null;
  if (role){
    const rest = words.filter(w=>!ROLE_OLD.has(w) && !ROLE_NEW.has(w) && !STRIP.has(w));
    const restN = rest.join(' ');
    if (restN){
      let k = ALIAS_EXACT.get(restN) || ALIAS_EXACT.get(words.filter(w=>!ROLE_OLD.has(w)&&!ROLE_NEW.has(w)).join(' '));
      if (k){ if (role==='old' && SWAP_OLD[k]) k=SWAP_OLD[k]; if (role==='new' && SWAP_NEW[k]) k=SWAP_NEW[k];
        const extra = (k==='new_base' && role==='old') ? 'Old base salary has no confirmed tag yet (guide section 14).' : (k==='old_ctc' && words.includes('current') ? 'The letter says "current"; CompUp\'s ctc is the revised figure, so this maps to old_ctc.' : '');
        return {key:k, conf:0.8, how:'', extra}; }
      if (rest.length<=3 && !rest.some(w=>/^\d+$/.test(w))) return {key:`${snake(restN)}_${role==='old'?'old':'current'}_amount`, conf:0.6, how:'Read as a salary component.'};
    }
  }
  // phrase containment
  let best=null;
  for (const x of ALIASES){
    if (!x.a || x.a.length<3) continue;
    if ((' '+n+' ').includes(' '+x.a+' ')){
      const sc = 0.55 + 0.35*(x.a.length/n.length);
      if (!best || sc>best.sc) best={sc, key:x.key};
    }
  }
  if (best){ let k=best.key; if (role==='old' && SWAP_OLD[k]) k=SWAP_OLD[k]; if (role==='new' && SWAP_NEW[k]) k=SWAP_NEW[k]; return {key:k, conf:Math.min(0.85,best.sc), how:''}; }
  if (opts.fallback===false) return null;
  return {key:'custom_schema.'+snake(label), conf:0.25, how:'No CompUp tag matched.'};
}
// a column in the loaded data that means this field under another name ("dept" for Department), or ''. Only offered, never applied.
export function dataColumnFor(key){
  if (!key || !state.csvHeaders.length) return '';
  return state.csvHeaders.find(h=>ALIAS_EXACT.get(norm(h))===key && tagKeyOf(h)!==key) || '';
}
export function resolveContext(ctx){
  let words = norm(ctx).split(' ').filter(Boolean).slice(-8);
  while (words.length && TRAIL_STOP.has(words[words.length-1])) words.pop();
  if (!words.length) return null;
  const n = words.join(' ');
  if (state.csvAlias.size){ for (const [a,v] of state.csvAlias){ if (a && (' '+n+' ').endsWith(' '+a+' ')) return {...v, conf:0.8, how:'From your CSV, using the words before it.'}; } }
  let best=null;
  for (const x of ALIASES){
    if (!x.a || x.a.length<2 || CONTEXT_SKIP.has(x.a)) continue;
    const hay=' '+n+' ', needle=' '+x.a+' ';
    const idx = hay.lastIndexOf(needle); if (idx<0) continue;
    const end = idx+needle.length;
    if (!best || end>best.end || (end===best.end && x.a.length>best.len)) best={end, len:x.a.length, key:x.key, start:idx};
  }
  if (!best) return null;
  const before = (' '+n+' ').slice(0,best.start).trim().split(' ').slice(-3).concat((' '+n+' ').slice(best.start,best.end).trim().split(' '));
  let k=best.key;
  if (before.some(w=>ROLE_NEW.has(w)) && SWAP_NEW[k]) k=SWAP_NEW[k];
  else if (before.some(w=>ROLE_OLD.has(w)) && SWAP_OLD[k]) k=SWAP_OLD[k];
  return {key:k, conf:0.65, how:'Guessed from the words before it.'};
}
