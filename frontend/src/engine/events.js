// Moved from frontend_src/letter-tagger.html — see tests_ui/legacy for the reference page. No DOM rendering in this module.

/* ======================= change notification + events (new: replaces every render*() call and toast()) =======================
   The engine never draws anything. When something changes it calls notify(); a UI layer subscribes and re-reads `state`.
   One-off messages for the person (toasts, "show this paragraph", file errors) are events: on('toast', fn). */
export const bus = { rev: 0, queued: false, subs: new Set(), handlers: new Map() };
export function notify(){
  bus.rev++;
  if (bus.queued) return;
  bus.queued = true;
  queueMicrotask(()=>{ bus.queued = false; for (const f of [...bus.subs]) { try { f(); } catch(e){ console.error(e); } } });
}
export const getRev = () => bus.rev;
export function subscribe(fn){ bus.subs.add(fn); return ()=>bus.subs.delete(fn); }
export function on(evt, fn){
  if (!bus.handlers.has(evt)) bus.handlers.set(evt, new Set());
  bus.handlers.get(evt).add(fn);
  return ()=>bus.handlers.get(evt).delete(fn);
}
export function emit(evt, payload){
  const hs = bus.handlers.get(evt);
  if (hs) for (const f of [...hs]) { try { f(payload); } catch(e){ console.error(e); } }
  return !!(hs && hs.size);
}
export function toast(msg){ emit('toast', msg); }
