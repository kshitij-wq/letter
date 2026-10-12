import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { Button, ConfirmHost, FieldPicker, FilterChip, IconButton, SegmentedControl, TooltipProvider, confirm, type PickerGroup } from '.'

describe('Button', () => {
  it('fires onClick, and ignores clicks while loading', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    const { rerender } = render(<Button onClick={onClick}>Save</Button>)
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(onClick).toHaveBeenCalledTimes(1)
    rerender(<Button onClick={onClick} loading>Save</Button>)
    const b = screen.getByRole('button', { name: 'Save' })
    expect(b.getAttribute('aria-busy')).toBe('true')
    await user.click(b)
    expect(onClick).toHaveBeenCalledTimes(1)
  })
  it('does not fire when disabled and is a real <button type=button> by default', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(<Button disabled onClick={onClick}>Go</Button>)
    const b = screen.getByRole('button', { name: 'Go' }) as HTMLButtonElement
    expect(b.type).toBe('button')
    await user.click(b)
    expect(onClick).not.toHaveBeenCalled()
  })
  it('uses the variant classes (primary is the accent, danger is red)', () => {
    render(<><Button variant="primary">A</Button><Button variant="danger">B</Button></>)
    expect(screen.getByText('A').className).toContain('bg-accent')
    expect(screen.getByText('B').className).toContain('text-err')
  })
})

describe('IconButton', () => {
  it('is named by its label and explains itself in a tooltip on keyboard focus', async () => {
    const user = userEvent.setup()
    render(<TooltipProvider><IconButton label="Undo" shortcut="Ctrl+Z"><svg /></IconButton></TooltipProvider>)
    const b = screen.getByRole('button', { name: 'Undo' })
    await user.tab()
    expect(document.activeElement).toBe(b)
    await waitFor(() => expect(screen.getAllByText('Undo (Ctrl+Z)').length).toBeGreaterThan(0))
  })
})

describe('confirm()', () => {
  it('focuses Cancel when the action is dangerous, so Enter never confirms by accident', async () => {
    const user = userEvent.setup()
    render(<ConfirmHost />)
    let answer: Promise<boolean> | undefined
    act(() => { answer = confirm({ title: 'Remove the data?', body: 'It cannot be undone.', confirmLabel: 'Remove', danger: true }) })
    await screen.findByRole('dialog', { name: 'Remove the data?' })
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancel' })))
    await user.keyboard('{Enter}')
    expect(await answer).toBe(false)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
  it('focuses the confirm button otherwise, and resolves true on it', async () => {
    const user = userEvent.setup()
    render(<ConfirmHost />)
    let answer: Promise<boolean> | undefined
    act(() => { answer = confirm({ title: 'Replace the open letter?', confirmLabel: 'Replace letter' }) })
    const ok = await screen.findByRole('button', { name: 'Replace letter' })
    await waitFor(() => expect(document.activeElement).toBe(ok))
    await user.click(ok)
    expect(await answer).toBe(true)
  })
  it('resolves false on Escape', async () => {
    const user = userEvent.setup()
    render(<ConfirmHost />)
    let answer: Promise<boolean> | undefined
    act(() => { answer = confirm({ title: 'Sure?' }) })
    await screen.findByRole('dialog')
    await user.keyboard('{Escape}')
    expect(await answer).toBe(false)
  })
})

const groups: PickerGroup[] = [
  { heading: 'Salary', options: [{ value: 'ctc', label: 'Current CTC', hint: 'ctc' }, { value: 'old_ctc', label: 'Old CTC', hint: 'old_ctc' }] },
  { heading: 'Personal', options: [{ value: 'first_name', label: 'First name', hint: 'first_name' }] },
]

function Picker({ onPick, allowCustom }: { onPick: (v: string) => void; allowCustom?: boolean }) {
  const [v, setV] = useState('')
  return <FieldPicker aria-label="Field" value={v} groups={groups} allowCustom={allowCustom} onChange={(x) => { setV(x); onPick(x) }} />
}

describe('FieldPicker', () => {
  it('opens from the keyboard, filters as you type, and Enter picks the highlighted field', async () => {
    const user = userEvent.setup()
    const onPick = vi.fn()
    render(<Picker onPick={onPick} />)
    await user.tab()
    await user.keyboard('{Enter}')
    const search = await screen.findByRole('combobox', { name: 'Search fields' })
    await user.type(search, 'old')
    expect(screen.queryByText('First name')).toBeNull()
    await user.keyboard('{Enter}')
    expect(onPick).toHaveBeenCalledWith('old_ctc')
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull())
    expect(screen.getByRole('combobox', { name: 'Field' }).textContent).toContain('Old CTC')
  })
  it('moves with the arrow keys', async () => {
    const user = userEvent.setup()
    const onPick = vi.fn()
    render(<Picker onPick={onPick} />)
    await user.click(screen.getByRole('combobox', { name: 'Field' }))
    await screen.findByRole('listbox')
    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}')
    expect(onPick).toHaveBeenCalledWith('first_name')
  })
  it('offers a typed custom column when allowCustom is on', async () => {
    const user = userEvent.setup()
    const onPick = vi.fn()
    render(<Picker onPick={onPick} allowCustom />)
    await user.click(screen.getByRole('combobox', { name: 'Field' }))
    await user.type(await screen.findByRole('combobox', { name: 'Search fields' }), 'my_col')
    await user.click(await screen.findByText('Use “my_col”'))
    expect(onPick).toHaveBeenCalledWith('my_col')
  })
  it('closes on Escape without picking', async () => {
    const user = userEvent.setup()
    const onPick = vi.fn()
    render(<Picker onPick={onPick} />)
    await user.click(screen.getByRole('combobox', { name: 'Field' }))
    await screen.findByRole('listbox')
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull())
    expect(onPick).not.toHaveBeenCalled()
  })
})

describe('SegmentedControl and FilterChip', () => {
  it('keeps exactly one segment on and moves with the arrow keys', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<SegmentedControl label="View" value="a" onValueChange={onChange} items={[{ value: 'a', label: 'One' }, { value: 'b', label: 'Two' }]} />)
    await user.click(screen.getByRole('radio', { name: 'One' }))   // clicking the one that is on does nothing
    expect(onChange).not.toHaveBeenCalled()
    await user.click(screen.getByRole('radio', { name: 'Two' }))
    expect(onChange).toHaveBeenCalledWith('b')
  })
  it('toggles aria-pressed', async () => {
    const user = userEvent.setup()
    function C() { const [on, setOn] = useState(false); return <FilterChip pressed={on} onPressedChange={setOn} count={3}>Needs a tag</FilterChip> }
    render(<C />)
    const chip = screen.getByRole('button', { name: /Needs a tag/ })
    expect(chip.getAttribute('aria-pressed')).toBe('false')
    await user.click(chip)
    expect(chip.getAttribute('aria-pressed')).toBe('true')
  })
})
