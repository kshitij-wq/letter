// Moved from frontend_src/letter-tagger.html — see tests_ui/legacy for the reference page. No DOM rendering in this module.
import { toast } from './events.js'

export function browserDownload(filename, data){
  const blob = data instanceof Blob ? data : new Blob([data], {type: /\.csv$/i.test(filename)?'text/csv;charset=utf-8':/\.json$/i.test(filename)?'application/json':'application/octet-stream'});
  const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url), 4000);
  toast('Saved '+filename);
}
/* ======================= Letter Studio server (real Jinja check) ======================= */
// Only when the page is served by the Letter Studio back end; on claude.ai this stays off.
export function csrfToken(){ const m=document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/); return m?decodeURIComponent(m[1]):''; }
/* ---- the only places the engine touches the browser page: a file save, a cookie read, one script ---- */
let xlsxPromise = null;
export function loadXlsx(){
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (!xlsxPromise){
    xlsxPromise = (async()=>{
      try {
        // SheetJS 0.18.5 (the vendored file) is compiled the first time a workbook is opened
        const src = (await import('../../../renderer/static/renderer/vendor/xlsx.full.min.js?raw')).default;
        const sc = document.createElement('script'); sc.textContent = src; document.head.appendChild(sc); sc.remove();
        if (window.XLSX) return window.XLSX;
      } catch(e){}
      throw new Error("The Excel reader didn't load. Save the sheet as CSV instead.");
    })();
    xlsxPromise.catch(()=>{ xlsxPromise = null; });
  }
  return xlsxPromise;
}
