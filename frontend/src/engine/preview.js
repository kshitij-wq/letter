// Moved from frontend_src/letter-tagger.html — see tests_ui/legacy for the reference page. No DOM rendering in this module.
import nunjucks from 'nunjucks/browser/nunjucks.min.js'
import { indianFmt, intlFmt } from './helpers.js'

export const MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
export const WEEKDAYS=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
export function strftime(d, fmt){
  const p2=(n,np)=>np?String(n):String(n).padStart(2,'0');
  return String(fmt).replace(/%(-?)([a-zA-Z%])/g,(m,np,c)=>{
    switch(c){
      case 'd': return p2(d.getDate(),np); case 'm': return p2(d.getMonth()+1,np);
      case 'Y': return String(d.getFullYear()); case 'y': return String(d.getFullYear()%100).padStart(2,'0');
      case 'B': return MONTHS[d.getMonth()]; case 'b': case 'h': return MONTHS[d.getMonth()].slice(0,3);
      case 'A': return WEEKDAYS[d.getDay()]; case 'a': return WEEKDAYS[d.getDay()].slice(0,3);
      case 'H': return p2(d.getHours(),np); case 'I': return p2(((d.getHours()+11)%12)+1,np);
      case 'M': return p2(d.getMinutes(),np); case 'S': return p2(d.getSeconds(),np);
      case 'p': return d.getHours()<12?'AM':'PM';
      case 'j': { const s=new Date(d.getFullYear(),0,1); return String(Math.floor((d-s)/864e5)+1).padStart(np?0:3,'0'); }
      case '%': return '%';
      default: return m;
    }
  });
}
export function strptime(str, fmt){
  let rx='^'; const order=[]; const f=String(fmt);
  const map={d:'(\\d{1,2})',m:'(\\d{1,2})',Y:'(\\d{4})',y:'(\\d{2})',H:'(\\d{1,2})',I:'(\\d{1,2})',M:'(\\d{1,2})',S:'(\\d{1,2})',B:'([A-Za-z]+)',b:'([A-Za-z]{3})',h:'([A-Za-z]{3})',A:'([A-Za-z]+)',a:'([A-Za-z]{3})',p:'([AaPp][Mm])',j:'(\\d{1,3})'};
  for (let i=0;i<f.length;i++){
    if (f[i]==='%' && i+1<f.length){
      let c=f[++i]; if (c==='-' && i+1<f.length) c=f[++i];
      if (c==='%'){ rx+='%'; continue; }
      if (!map[c]) return null; rx+=map[c]; order.push(c);
    } else if (/\s/.test(f[i])) rx+='\\s*';
    else rx+=f[i].replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  }
  const m=String(str).trim().match(new RegExp(rx+'$')); if (!m) return null;
  let Y=1900, M=1, D=1, H=0, Mi=0, S=0, pm=null;
  order.forEach((c,k)=>{ const v=m[k+1];
    if (c==='d') D=+v; else if (c==='m') M=+v; else if (c==='Y') Y=+v; else if (c==='y') Y=(+v<69?2000:1900)+(+v);
    else if (c==='H'||c==='I') H=+v; else if (c==='M') Mi=+v; else if (c==='S') S=+v; else if (c==='p') pm=/p/i.test(v);
    else if (c==='B'||c==='b'||c==='h'){ const lv=v.toLowerCase(); const i=MONTHS.findIndex(x=>c==='B'?x.toLowerCase()===lv:x.toLowerCase().slice(0,3)===lv); M=i<0?NaN:i+1; }
  });
  if (pm!=null){ if (pm && H<12) H+=12; if (!pm && H===12) H=0; }
  const d=new Date(Y, M-1, D, H, Mi, S);
  if (isNaN(d) || d.getMonth()!==M-1 || d.getDate()!==D) return null;
  return d;
}
export function issuePush(kind, key, msg){ if (rt.issues && rt.issues.length<300) rt.issues.push({kind, key, msg}); }
export function pyRound(n, p=0){ const f=10**p; const x=n*f; const t=Math.trunc(x); if (Math.abs(x-t)===0.5){ const fl=Math.floor(x); return (fl%2===0?fl:fl+1)/f; } return Math.round(x)/f; }
export function fixedPy(x, p){ if (p===0){ const t=Math.trunc(x); if (Math.abs(x-t)===0.5){ const fl=Math.floor(x); return String(fl%2===0?fl:fl+1); } return String(Math.round(x)); } return x.toFixed(p); }
export function formatSpec(v, spec){
  const m=String(spec).match(/^(?:(.)?([<>=^]))?([+\- ])?(#)?(0)?(\d+)?([,_])?(?:\.(\d+))?([bcdeEfFgGnosxX%])?$/);
  if (!m) return v==null?'None':String(v);
  const fill=m[1], align=m[2], sign=m[3], zero=m[5], width=m[6], group=m[7], prec=m[8], type=m[9];
  const numeric = type ? 'dfFeEgGn%'.includes(type) : (typeof v==='number' || !!group);
  let s;
  if (numeric){
    let n = typeof v==='number' ? v : typeof v==='boolean' ? +v : NaN;
    if (typeof v!=='number' && typeof v!=='boolean'){
      issuePush('type','format-text',`'{:${spec}}'.format() got text (“${String(v??'').slice(0,24)}”). CompUp stops with an error here; convert with | float first.`);
      n=Number(String(v??'').replace(/,/g,'')); if (!Number.isFinite(n)) return String(v??'');
    }
    const P = prec!=null ? +prec : null; const a=Math.abs(n); let digits, suffix='';
    switch(type){
      case 'd': case 'n': digits=Number.isInteger(n)?String(a):String(Math.trunc(a)); break;
      case '%': digits=fixedPy(a*100, P??6); suffix='%'; break;
      case 'e': case 'E': digits=a.toExponential(P??6).replace(/e([+-])(\d)$/,'e$10$2'); if (type==='E') digits=digits.toUpperCase(); break;
      case 'g': case 'G': digits=String(Number(a.toPrecision(P||6))); break;
      case 'f': case 'F': digits=fixedPy(a, P??6); break;
      default: digits = P!=null ? String(Number(a.toPrecision(Math.max(1,P)))) : String(a);
    }
    if (group && !/e/i.test(digits)){ const [i,d]=digits.split('.'); digits=i.replace(/\B(?=(\d{3})+(?!\d))/g, group)+(d!==undefined?'.'+d:''); }
    const neg = n<0 || Object.is(n,-0);
    s=(neg?'-':(sign==='+'?'+':sign===' '?' ':''))+digits+suffix;
  } else s = v==null ? 'None' : typeof v==='boolean' ? (v?'True':'False') : String(v);
  if (width && s.length<+width){
    const w=+width, padN=w-s.length; const a = align || (zero ? '=' : (numeric ? '>' : '<')); const f = fill || (zero && !align ? '0' : ' ');
    if (a==='<') s=s+f.repeat(padN); else if (a==='>') s=f.repeat(padN)+s;
    else if (a==='^'){ const l=Math.floor(padN/2); s=f.repeat(l)+s+f.repeat(padN-l); }
    else { const sg=/^[+\- ]/.test(s)?s[0]:''; s=sg+f.repeat(padN)+s.slice(sg.length); }
  }
  return s;
}
export function pyFormat(fmt, args){
  let auto=0; const kw = args.length && args[args.length-1] && typeof args[args.length-1]==='object' && args[args.length-1].__keywords ? args.pop() : {};
  return String(fmt).replace(/\{\{|\}\}|\{([^{}]*)\}/g,(m,inner)=>{
    if (m==='{{') return '{'; if (m==='}}') return '}';
    const ci=inner.indexOf(':'); let field=ci>=0?inner.slice(0,ci):inner; const spec=ci>=0?inner.slice(ci+1):'';
    field=field.replace(/![rsa]$/,'');
    const v = field==='' ? args[auto++] : /^\d+$/.test(field) ? args[+field] : kw[field];
    return formatSpec(v, spec);
  });
}
export function titleCase(s){ return String(s).toLowerCase().replace(/(^|[\s\-\(\{\[<])([a-z])/g,(m,a,b)=>a+b.toUpperCase()); }
export function trimSet(s, chars, left, right){ const set=new Set(String(chars)); let a=0, b=s.length; if (left) while (a<b && set.has(s[a])) a++; if (right) while (b>a && set.has(s[b-1])) b--; return s.slice(a,b); }
export function installPyString(){
  const def=(n,f)=>{ if (!Object.prototype.hasOwnProperty.call(String.prototype,n)) Object.defineProperty(String.prototype,n,{value:f,writable:true,configurable:true,enumerable:false}); };
  def('format', function(...a){ return pyFormat(String(this), a); });
  def('upper', function(){ return String(this).toUpperCase(); });
  def('lower', function(){ return String(this).toLowerCase(); });
  def('strip', function(c){ return c==null ? String(this).trim() : trimSet(String(this), c, true, true); });
  def('lstrip', function(c){ return c==null ? String(this).replace(/^\s+/,'') : trimSet(String(this), c, true, false); });
  def('rstrip', function(c){ return c==null ? String(this).replace(/\s+$/,'') : trimSet(String(this), c, false, true); });
  def('startswith', function(x){ return String(this).startsWith(x); });
  def('endswith', function(x){ return String(this).endsWith(x); });
  def('title', function(){ return titleCase(String(this)); });
  def('capitalize', function(){ const s=String(this); return s.charAt(0).toUpperCase()+s.slice(1).toLowerCase(); });
  def('isdigit', function(){ return /^\d+$/.test(String(this)); });
  def('zfill', function(w){ return String(this).padStart(+w||0,'0'); });
}
export const isKw=a=>!!(a && typeof a==='object' && a.__keywords);
export const toNum=v=>{ if (typeof v==='number') return v; if (typeof v==='boolean') return v?1:0; if (v==null) return NaN; const s=String(v).trim(); if (!s || !/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s)) return NaN; return Number(s); };
export const pyStr=v=>v==null?'':typeof v==='boolean'?(v?'True':'False'):String(v);
export function makeEnv(nj){
  const env=new nj.Environment(null,{autoescape:true});
  env.addFilter('float',(v,d)=>{ if (isKw(d)) d=d.default; if (d===undefined) d=0; const n=toNum(v); if (Number.isFinite(n)) return n; if (v!=null && String(v).trim()!=='') issuePush('number','float',`float turned “${String(v).slice(0,30)}” into ${d}, because it isn't a plain number (commas and words stop the conversion)`); return d; });
  env.addFilter('int',(v,d)=>{ if (isKw(d)) d=d.default; if (d===undefined) d=0; const n=toNum(v); if (Number.isFinite(n)) return Math.trunc(n); if (v!=null && String(v).trim()!=='') issuePush('number','int',`int turned “${String(v).slice(0,30)}” into ${d}, because it isn't a plain number`); return d; });
  env.addFilter('round',(v,p,method)=>{
    if (isKw(p)){ method=p.method; p=p.precision; } else if (isKw(method)) method=method.method;
    p=p==null?0:+p; method=method||'common';
    if (typeof v==='string') issuePush('type','round-text',`round got the text “${v.slice(0,24)}”. CompUp needs a number here; put | float before | round.`);
    const n=toNum(v); if (!Number.isFinite(n)) return v; const f=10**p;
    if (method==='ceil') return Math.ceil(n*f)/f; if (method==='floor') return Math.floor(n*f)/f; return pyRound(n,p);
  });
  const comma=(indian,name)=>v=>{
    if (v===undefined || v===null || v==='') return '';
    let n; if (typeof v==='number') n=v;
    else { const s=String(v).trim(); const c=s.replace(/,/g,''); if (!/^[-+]?\d+(\.\d+)?$/.test(c)){ issuePush('number',name+'-nan',`${name} got “${s.slice(0,30)}”, which isn't a number, so it printed as it is`); return s; }  n=Number(c); }
    return indian ? indianFmt(n) : intlFmt(n);
  };
  env.addFilter('indian_comma', comma(true,'indian_comma'));
  env.addFilter('int_comma', comma(false,'int_comma'));
  env.addFilter('format_date',(v,inF,outF)=>{ if (isKw(inF)) inF=undefined; if (isKw(outF)) outF=undefined; inF=inF||'%d-%m-%Y'; outF=outF||'%B %d, %Y'; if (v==null || v==='') return ''; const d=v instanceof Date?v:strptime(String(v).trim(), inF); if (!d){ issuePush('date','date:'+inF,`format_date couldn't read “${String(v).slice(0,24)}” with the input format ${inF}`); return String(v); } return strftime(d, outF); });
  env.addFilter('lower',v=>pyStr(v).toLowerCase()); env.addFilter('upper',v=>pyStr(v).toUpperCase()); env.addFilter('trim',v=>pyStr(v).trim());
  env.addFilter('title',v=>titleCase(pyStr(v))); env.addFilter('capitalize',v=>{ const s=pyStr(v); return s.charAt(0).toUpperCase()+s.slice(1).toLowerCase(); });
  env.addFilter('string',v=>v==null?(v===null?'None':''):pyStr(v));
  env.addFilter('replace',(v,a,b,count)=>{ const s=pyStr(v); a=pyStr(a); b=pyStr(b); if (!a) return s; if (count==null || isKw(count)) return s.split(a).join(b); let out='', rest=s, k=+count; while (k-- > 0){ const i=rest.indexOf(a); if (i<0) break; out+=rest.slice(0,i)+b; rest=rest.slice(i+a.length); } return out+rest; });
  env.addFilter('abs',v=>{ const n=toNum(v); return Number.isFinite(n)?Math.abs(n):v; });
  env.addFilter('min',a=>Array.isArray(a)&&a.length?a.reduce((x,y)=>y<x?y:x):'');
  env.addFilter('max',a=>Array.isArray(a)&&a.length?a.reduce((x,y)=>y>x?y:x):'');
  env.addFilter('unique',a=>Array.isArray(a)?[...new Set(a)]:a);
  env.addFilter('map',(arr,...args)=>{ if (!Array.isArray(arr)) arr=arr==null?[]:[...arr]; const kw=args.length&&isKw(args[args.length-1])?args.pop():{}; if (kw.attribute) return arr.map(x=>String(kw.attribute).split('.').reduce((o,k)=>o==null?undefined:o[k],x)); if (args.length){ const f=env.getFilter(args[0]); return arr.map(x=>f(x,...args.slice(1))); } return arr; });
  env.addFilter('tojson',v=>JSON.stringify(v));
  env.addFilter('format',(f,...args)=>{ let i=0; return pyStr(f).replace(/%(\.\d+)?([sdf%])/g,(m,p,c)=>{ if (c==='%') return '%'; const v=args[i++]; if (c==='s') return pyStr(v); const n=toNum(v); if (c==='d') return String(Math.trunc(n)); return p?n.toFixed(+p.slice(1)):String(n); }); });
  env.addGlobal('currentDatetime',(f)=>strftime(new Date(), f||'%B %d, %Y'));
  env.addGlobal('True',true); env.addGlobal('False',false); env.addGlobal('None',null);
  env.addTest('none',v=>v===null);
  env.addTest('number',v=>typeof v==='number');
  env.addTest('string',v=>typeof v==='string');
  return env;
}
/* ---- the preview engine: nunjucks 3.2.4 is bundled (the same file the old page loaded), so there is nothing to fetch ---- */
export const rt = { ENV: null, issues: null };
export function loadEngine(){ return Promise.resolve(nunjucks); }
export function getEnv(nj){ if (!rt.ENV){ installPyString(); rt.ENV = makeEnv(nj); } return rt.ENV; }
