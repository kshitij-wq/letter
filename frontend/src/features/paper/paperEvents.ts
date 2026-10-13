/*
 * What a click on the letter means. The Paper canvas finds what was clicked and calls the handler for it; the feature that
 * owns that thing registers the handler (features/<feature>/register.ts). Selecting paragraphs or words is handled by the
 * Paper itself (engine clickParagraph / selectWords / closeBlockAt / placeUnplacedAt) and opens the 'selection' inspector.
 */
export type PaperEvents = {
  /** A placeholder in the letter (a `.ph` span). */
  placeholder: { id: string; el: HTMLElement }
  /** The ghost chip in an empty salary-table cell. */
  cell: { t: string; ri: string; ci: string; el: HTMLElement }
  /** A yellow tag that was already in the letter (a `.tg` chip). `pid` is its paragraph, `offset` where the clicked text starts in the paragraph. */
  tag: { pid: string; offset: number; el: HTMLElement }
  /** A condition line or chip in the letter. `key` is the engine's logic key (state.lg[].key). */
  logic: { key: string; el: HTMLElement }
  /** A lettered margin flag. `index` is the issue index (state.issues[index]). */
  flag: { index: number; el: HTMLElement }
}
export type PaperHandler<K extends keyof PaperEvents> = (e: PaperEvents[K]) => void

/** One lettered pennant in the letter's margin, level with its paragraph. */
export type MarginFlag = {
  /** Unique per flag (an issue can point at several paragraphs: use `${issue}@${pid}`). */
  key: string
  pid: string
  letter: string
  /** error = red, warn = amber, quiet = grey (resolved) */
  level: 'error' | 'warn' | 'quiet'
  /** Read by screen readers and shown as the tooltip. */
  label: string
  /** The issue index, passed back to the 'flag' handler. */
  index: number
  /** The open flag gets a 2px ink ring. */
  selected?: boolean
}
let flagProvider: () => MarginFlag[] = () => []
/** The Validate feature sets this: the flags to draw for the Client letter view. */
export function setFlagProvider(fn: () => MarginFlag[]) { flagProvider = fn }
export const getFlags = () => flagProvider()

const handlers:{ [K in keyof PaperEvents]?: PaperHandler<K> } = {}

/** Set (replace) the handler for one kind of click on the letter. */
export function setPaperHandler<K extends keyof PaperEvents>(type: K, fn: PaperHandler<K>) { handlers[type] = fn as never }
export function firePaper<K extends keyof PaperEvents>(type: K, e: PaperEvents[K]) { (handlers[type] as PaperHandler<K> | undefined)?.(e) }
