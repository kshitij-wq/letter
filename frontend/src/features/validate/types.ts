import { batchView as rawBatchView, checkView as rawCheckView, flagList as rawFlagList, issueByKey as rawIssueByKey } from '../../engine'
import type { Level } from './parts'
import { PLAIN_CATS, plainEngine, plainMessage } from './plain'

/** Shapes of the plain data the engine hands the Validate screen (checks.js checkView / pipeline.js batchView). The engine is untyped JS, so they are written here once. */
export type Chip = { pid: string; page: string; text: string }
export type IssueItem = {
  key: string; idx: number; level: Level; label: string; cat: string; catName: string; real: boolean; html: string; text: string; letter: string
  chips: Chip[]; moreTags: boolean; hasLocs: boolean; locs: string[]; fix: { idx: number; label: string } | null; act: string; why: string; how: string
  /** the engine's own sentence, kept as technical details when the shown one was reworded */
  original?: string
}
export type EngineLineData = { kind: 'none' | 'unavailable' | 'error' | 'checking' | 'notrun' | 'failed' | 'passed'; title: string; detail: string }
export type CheckViewData = {
  hasLetter: boolean
  counts: { errors: number; warnings: number; resolved: number; notes: number }
  stats: string; clean: boolean; confirmed: boolean; realAvailable: boolean; cleanText: string; summary: string
  engine: EngineLineData
  groups: { cat: string; name: string; errors: number; warnings: number; items: IssueItem[] }[]
  resolved: { key: string; text: string; letter: string }[]
}
export type BatchGroup = { level: Level; label: string; real: boolean; count: number; html: string; text: string; fixDefault: string; chips: Chip[]; original?: string }
export type BatchDone = {
  ok: number; bad: number; total: number; seconds: number; cancelled: boolean; stale: boolean; groups: BatchGroup[]
  real: { kind: 'none' | 'busy' | 'error' | 'failed' | 'passed'; text: string }
  only: boolean; hasProblems: boolean; canDownload: boolean; allClear: boolean; confirmed: boolean; pageOnly: boolean
  list: { i: number; n: number; label: string }[]
}
export type BatchViewData = {
  rows: number; noRowsText: string; status: 'none' | 'error' | 'running' | 'done'; running: boolean; stats: string
  src: { name: string; count: number; of: number; filter: { col: string; value: string } | null } | null
  error: { msg: string; tag: string } | null
  progress: { done: number; total: number; pct: number }
  done: BatchDone | null
}
export type FlagData = { key: string; pid: string; letter: string; level: 'error' | 'warn'; label: string; index: number; issueKey: string }

const plainItem = (x: IssueItem): IssueItem => {
  const m = plainMessage(x.html); const c = PLAIN_CATS[x.cat]
  return { ...x, html: m.html, original: m.original, ...(c ? { catName: c.name, why: c.why, how: c.fix } : {}) }
}
export const checkView = (): CheckViewData => {
  const v = rawCheckView() as unknown as CheckViewData
  return {
    ...v,
    cleanText: v.cleanText.replace(/Real Jinja( \(docxtpl [^)]*\))? and the page's own checks/, "The full check (the engine CompUp uses) and the page's own checks").replace(/The real Jinja check isn't available here, so this is the page checks only\./, "The full check isn't available here, so this is the page's own checks only."),
    engine: plainEngine(v.engine),
    groups: v.groups.map((g) => ({ ...g, name: PLAIN_CATS[g.cat]?.name ?? g.name, items: g.items.map(plainItem) })),
  }
}
export const batchView = (): BatchViewData => {
  const v = rawBatchView() as unknown as BatchViewData
  if (!v.done) return v
  const real = { ...v.done.real, text: plainMessage(v.done.real.text).html }
  return { ...v, done: { ...v.done, real, groups: v.done.groups.map((g) => { const m = plainMessage(g.html); return { ...g, html: m.html, original: m.original } }) } }
}
export const flagList = () => rawFlagList() as unknown as FlagData[]
export const issueByKey = (key: string) => { const x = rawIssueByKey(key) as unknown as IssueItem | null; return x ? plainItem(x) : null }
