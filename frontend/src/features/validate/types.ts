import { batchView as rawBatchView, checkView as rawCheckView, flagList as rawFlagList, issueByKey as rawIssueByKey } from '../../engine'
import type { Level } from './parts'

/** Shapes of the plain data the engine hands the Validate screen (checks.js checkView / pipeline.js batchView). The engine is untyped JS, so they are written here once. */
export type Chip = { pid: string; page: string; text: string }
export type IssueItem = {
  key: string; idx: number; level: Level; label: string; cat: string; catName: string; real: boolean; html: string; text: string; letter: string
  chips: Chip[]; moreTags: boolean; hasLocs: boolean; locs: string[]; fix: { idx: number; label: string } | null; act: string; why: string; how: string
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
export type BatchGroup = { level: Level; label: string; real: boolean; count: number; html: string; text: string; fixDefault: string; chips: Chip[] }
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

export const checkView = () => rawCheckView() as unknown as CheckViewData
export const batchView = () => rawBatchView() as unknown as BatchViewData
export const flagList = () => rawFlagList() as unknown as FlagData[]
export const issueByKey = (key: string) => rawIssueByKey(key) as unknown as IssueItem | null
