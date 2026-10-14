import { Plus, Trash2 } from 'lucide-react'
import { useId, useState } from 'react'
import { es, useEngineRev } from '@/hooks/useEngine'
import { Button, Checkbox, IconButton, Input, Select, confirm } from '@/ui'
import { chooseTeamClient, fmtWhen, loadTeamSetup, plural, setTeamNew, setTeamUse, teamCreateClient, teamDeleteSetup, teamSaveChoices, teamSaveSetup } from '../../engine'

const NONE = '__none'

type Client = { id: string; name?: string; labels?: object; cells?: object; columns?: unknown[]; updatedAt?: string; use?: boolean }
type Setup = { id: string; name: string; fileName?: string; savedAt?: string; noSource?: boolean }

/** The setup name box starts from the letter's name; it is its own component so it restarts when another letter opens. */
function SetupName({ client }: { client: Client }) {
  const [name, setName] = useState(() => (es.fileName || '').replace(/\.docx$/i, ''))
  return (
    <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); teamSaveSetup(name) }}>
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name, e.g. Appraisal letter 2026" aria-label="Setup name" />
      <Button type="submit" aria-label={`Save setup for ${client.name || client.id}`}>Save setup</Button>
    </form>
  )
}

/**
 * Team library (only on claude.ai, where the tool's shared database exists): pick or add a client, save the letter's choices
 * for it so the next letter for that client starts with them, and keep or load whole setups.
 */
export function TeamGroup({ onReport }: { onReport: (text: string) => void }) {
  useEngineRev()
  const clientId = useId(), newId = useId()
  const [newName, setNewName] = useState('')
  const status = es.teamStatus as string
  const clients = (es.teamClients || []) as Client[]
  const t = es.team as Client | null
  const readOnly = !!es.teamReadOnly
  const setups = (es.teamSetups || []) as Setup[]

  const body = () => {
    if (status === 'none') return <p className="text-sm text-muted">The team library works when this tool is open on claude.ai.</p>
    if (status === 'error') return <p className="text-sm text-muted">The team library couldn't load. Reload the page to try again.</p>
    if (status !== 'ready') return <p className="text-sm text-muted">Connecting to the team library…</p>
    const nl = Object.keys(t?.labels || {}).length, nc = Object.keys(t?.cells || {}).length, ncol = (t?.columns || []).length
    return (
      <div className="grid gap-3">
        <div className="grid gap-1">
          <label htmlFor={clientId} className="text-sm text-muted">Client{clients.length ? <span className="tnum"> · {plural(clients.length, 'client')} in the library</span> : null}</label>
          <div className="flex gap-2">
            <Select id={clientId} value={t?.id ?? NONE} onValueChange={(v) => chooseTeamClient(v === NONE ? '' : v)} placeholder="Choose a client…"
              options={[{ value: NONE, label: 'Choose a client…' }, ...clients.map((c) => ({ value: c.id, label: c.name || c.id }))]} />
            {!readOnly && <Button icon={<Plus aria-hidden />} aria-expanded={!!es.teamNew} onClick={() => setTeamNew(!es.teamNew)}>New client</Button>}
          </div>
        </div>
        {es.teamNew && !readOnly && (
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); teamCreateClient(newName).then(() => setNewName('')) }}>
            <Input id={newId} autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Client name, e.g. Northwind Appliances" aria-label="New client name" />
            <Button type="submit" variant="primary">Add</Button>
          </form>
        )}
        {t ? (
          <>
            <Checkbox checked={t.use !== false} onCheckedChange={setTeamUse}>Use the choices saved for {t.name} as suggestions in this letter</Checkbox>
            <p className="text-sm text-muted tnum">{plural(nl, 'text tag')} · {plural(nc, 'table cell')} · {plural(ncol, 'column name')}{t.updatedAt ? ` · updated ${fmtWhen(Date.parse(t.updatedAt))}` : ''}</p>
            {readOnly
              ? <p className="text-sm text-muted">You can use this library but not save to it. Ask the owner of this tool for Contributor access to save.</p>
              : <div><Button variant="primary" onClick={() => teamSaveChoices()}>Save this letter's choices to {t.name}</Button></div>}
            <div className="grid gap-2 border-t border-hairline-soft pt-3">
              <h4 className="text-sm font-semibold">Saved setups for {t.name}</h4>
              {setups.length ? (
                <ul className="grid gap-2">
                  {setups.map((s) => (
                    <li key={s.id} className="flex items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold" title={s.name}>{s.name}</p>
                        <p className="truncate text-sm text-muted">{s.fileName || ''}{s.savedAt ? ` · ${fmtWhen(Date.parse(s.savedAt))}` : ''}{s.noSource ? ' · choices only' : ''}</p>
                      </div>
                      <Button size="sm" aria-label={`Load ${s.name}`} onClick={() => { const text = loadTeamSetup(s.id); if (text) onReport(text) }}>Load</Button>
                      {!readOnly && (
                        <IconButton label={`Delete ${s.name}`} size="sm" onClick={async () => {
                          if (await confirm({ title: 'Delete this saved setup?', body: `“${s.name}” is removed from the team library for everyone.`, confirmLabel: 'Delete', danger: true })) teamDeleteSetup(s.id)
                        }}><Trash2 aria-hidden /></IconButton>
                      )}
                    </li>
                  ))}
                </ul>
              ) : <p className="text-sm text-muted">No saved setups yet.</p>}
              {!readOnly && <SetupName key={es.fileName} client={t} />}
            </div>
          </>
        ) : !clients.length ? <p className="text-sm text-muted">{readOnly ? 'No clients in the library yet.' : 'No clients yet. Add one to start sharing tag choices.'}</p> : null}
      </div>
    )
  }

  return (
    <div className="grid gap-3">
      <h3 className="text-base font-semibold">Team library</h3>
      <p className="text-sm text-muted">Shared with everyone who can open this tool. Save a client's column names and tag choices once, and whoever tags that client's next letter gets them as suggestions.</p>
      {body()}
    </div>
  )
}
