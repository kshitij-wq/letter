// Moved from frontend_src/letter-tagger.html — see tests_ui/legacy for the reference page. No DOM rendering in this module.

/* ======================= helpers ======================= */
export const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
export const XMLNS = 'http://www.w3.org/XML/1998/namespace';
export const hid = s => 'r'+[...String(s)].reduce((h,c)=>(h*31+c.charCodeAt(0))|0,7).toString(36).replace('-','m');
export const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const norm = s => String(s||'').toLowerCase().replace(/[’']/g,'').replace(/[^a-z0-9%]+/g,' ').trim();
export const snake = s => String(s||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+/,'');
export function parseXml(s){ const d = new DOMParser().parseFromString(s,'application/xml'); if (d.getElementsByTagName('parsererror').length) throw new Error('Could not read the document XML.'); return d; }
export function serialize(d){ let s = new XMLSerializer().serializeToString(d); if (!/^<\?xml/.test(s)) s = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n' + s; return s; }
export const isW = (el,name) => el && el.nodeType===1 && el.namespaceURI===W && el.localName===name;
export function childW(el,name){ for (let c=el.firstChild;c;c=c.nextSibling) if (isW(c,name)) return c; return null; }
export function ancestor(el, names, stop){ for (let a=el.parentNode; a && a!==stop && a.nodeType===1; a=a.parentNode){ if (names.includes(a.localName)) return a; } return null; }
export function closestP(el){ for (let a=el.parentNode; a && a.nodeType===1; a=a.parentNode) if (isW(a,'p')) return a; return null; }
export function cleanCondExpr(s){
  s=straighten(String(s||'')).trim();
  s=s.replace(/\{%-?\s*endif\s*-?%\}/gi,'').trim();
  for (let i=0;i<5 && /^\{%-?\s*(if|elif)\s+/i.test(s);i++) s=s.replace(/^\{%-?\s*(if|elif)\s+/i,'').replace(/\s*-?%\}\s*$/,'').trim();
  return s.replace(/^if\s+/i,'').trim();
}
export function straightenTags(s){ return String(s).replace(/\{[{%#][\s\S]*?[}%#]\}/g, m=>straighten(m)).replace(/\{%[–—]|[–—]%\}/g, m=>m.replace(/[–—]/,'-')); }
export function straighten(s){ return s.replace(/[“”„‟″]/g,'"').replace(/[‘’‚‛′]/g,"'").replace(/(\{%|\{\{)[–—]/g,'$1-').replace(/[–—](%\}|\}\})/g,'-$1').replace(/\u00A0/g,' '); }
export function indianFmt(n){ const neg=n<0; let [i,d] = Math.abs(n).toString().split('.'); let last3=i.slice(-3), rest=i.slice(0,-3); if (rest) rest = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ','; return (neg?'-':'')+rest+last3+(d?'.'+d:''); }
export function intlFmt(n){ const [i,d]=Math.abs(n).toString().split('.'); return (n<0?'-':'')+i.replace(/\B(?=(\d{3})+(?!\d))/g,',')+(d?'.'+d:''); }
export function findAll(text, find){
  const out=[]; if (!find) return out; let i=0;
  const wordish = /[A-Za-z0-9]/;
  while ((i = text.indexOf(find, i)) !== -1){
    const before = text[i-1], after = text[i+find.length];
    const okB = !(wordish.test(find[0]) && before && wordish.test(before));
    const okA = !(wordish.test(find[find.length-1]) && after && wordish.test(after));
    if (okB && okA) out.push([i, i+find.length]);
    i += Math.max(1, find.length);
  }
  return out;
}
export function lsGet(k,d){ try{ const v=localStorage.getItem(k); return v?JSON.parse(v):d; }catch(e){ return d; } }
export function lsSet(k,v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} }
/* ---- icons inside HTML strings (the letter's margin lines): the UI layer (main.tsx) supplies the renderer ---- */
let iconFn = () => '';
export function icon(n, cls=''){ return iconFn(n, cls); }
export function setIconRenderer(fn){ iconFn = fn; }
/** "3 letters", "1 letter" */
export const plural = (n, w) => `${n} ${w}${n===1?'':'s'}`;
