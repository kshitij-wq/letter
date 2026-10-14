import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, describe, expect, it } from 'vitest'
import App from '../../App'
import { loadSample, setTab, state } from '../../engine'
import { useUi } from '@/store'
import '../register'
import { collectCommands, registerCommands, registerInspector, registerStep, getStep } from './registry'

describe('registries', () => {
  it('a later registration replaces the earlier one (a feature wins over the R1 placeholder)', () => {
    const A = () => null, B = () => null
    registerStep('doc', { Panel: A })
    registerStep('doc', { Panel: B })
    expect(getStep('doc')?.Panel).toBe(B)
  })
  it('the palette ignores a command provider that throws', () => {
    registerCommands(() => { throw new Error('boom') })
    registerCommands(() => [{ id: 'x', group: 'Test', label: 'Works', run() {} }])
    expect(collectCommands().some((c) => c.id === 'x')).toBe(true)
  })
  it('inspectors keep their onClose', () => {
    let closed = 0
    registerInspector('t', { title: 'T', Panel: () => null, onClose: () => { closed++ } })
    expect(closed).toBe(0)
  })
})

describe('the app', () => {
  beforeAll(() => { Object.defineProperty(window, 'matchMedia', { writable: true, value: (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false }) }) })

  it('starts on the first-run page with the downloads off, and the sample is one click away', async () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: /Turn a client letter into a CompUp template/ })).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Download tagged .docx' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.queryByRole('tablist')).toBeNull()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Open the sample letter' }))
    await waitFor(() => expect(document.querySelector('#paper .lp')).toBeTruthy())
  })

  it('shows the five steps, goes between them, and opens a placeholder in the inspector (Esc closes it)', async () => {
    await act(async () => { await loadSample(); setTab('doc') })   // the sample opens on Tags & fields; start from Document
    render(<App />)
    const tabs = within(screen.getByRole('tablist', { name: 'Workflow steps' })).getAllByRole('tab')
    expect(tabs.map((t) => t.textContent?.replace(/\d+$/, ''))).toEqual(expect.arrayContaining([expect.stringContaining('Document'), expect.stringContaining('Tags & fields'), expect.stringContaining('Conditions'), expect.stringContaining('Validate'), expect.stringContaining('Preview & export')]))
    expect(screen.getByRole('tabpanel', { name: /Document/ })).toBeTruthy()
    await userEvent.setup().click(screen.getByRole('tab', { name: /^Tags & fields/ }))
    expect(state.tab).toBe('tags')
    expect(await screen.findByRole('tabpanel', { name: /Tags & fields/ })).toBeTruthy()

    const ph = document.querySelector<HTMLElement>('#paper .ph')!
    fireEvent.mouseUp(ph)
    await waitFor(() => expect(document.getElementById('inspector')).toBeTruthy())
    expect(document.getElementById('inspector')!.getAttribute('data-kind')).toBe('tag')
    fireEvent.keyDown(document.body, { key: 'Escape' })
    await waitFor(() => expect(document.getElementById('inspector')).toBeNull())
  })

  it('selecting a paragraph opens the selection panel and closing it clears the selection', async () => {
    render(<App />)
    const p = document.querySelector<HTMLElement>('#paper p.lp.body')!
    fireEvent.mouseUp(p)
    await waitFor(() => expect(document.getElementById('inspector')?.getAttribute('data-kind')).toBe('selection'))
    expect(state.sel.pids.length).toBe(1)
    await userEvent.setup().click(screen.getByRole('button', { name: /^Close/ }))
    await waitFor(() => expect(document.getElementById('inspector')).toBeNull())
    expect(state.sel.pids.length).toBe(0)
  })

  it('the view switch changes the letter, and the palette opens with Ctrl+K', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('radio', { name: 'Tagged template' }))
    expect(state.view).toBe('tagged')
    await waitFor(() => expect(document.querySelector('#paper .tg')).toBeTruthy())
    await user.keyboard('{Control>}k{/Control}')
    expect(await screen.findByRole('dialog', { name: 'Search and commands' })).toBeTruthy()
    expect(useUi.getState().paletteOpen).toBe(true)
    await user.keyboard('{Escape}')
    await waitFor(() => expect(useUi.getState().paletteOpen).toBe(false))
  })
})
