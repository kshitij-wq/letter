import { dataSummary as rawDataSummary } from '../../engine'

type Sheets = { names: string[]; current: string; book: string; canSwitch: boolean }
export type DataExtra = {
  name: string; kind: 'names' | 'one-row' | 'rows'; names: number; columns: number; rows: number; params: boolean
  matched: number; employees: number; matchBy: string; sheets: Sheets | null
}
export type DataSummary = {
  name: string; meta: string; kind: 'mapping' | 'keys' | 'params' | 'sample'
  used: number; alias: number; employees: number; total: number; keys: number; canAddExtra: boolean
  sheets: Sheets | null
  filter: { columns: { col: string; values: { value: string; count: number }[] }[]; col: string; value: string; auto: boolean; shown: number; total: number } | null
  sampleRows: { used: number; current: number; options: { index: number; label: string }[] } | null
  extras: DataExtra[]
}

/** The employee-data card as data (engine/data.js dataSummary), typed. */
export const dataSummary = () => rawDataSummary() as DataSummary | null
