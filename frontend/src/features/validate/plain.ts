/*
 * Everyday wording for what Validate (and the toasts, the tag editor and Combine) tell the person.
 *
 * The engine's own sentences stay as they are: the page and the server (`_friendly` in renderer/engine.py) word them alike, and the
 * parity test compares them with the old page. This layer only changes what is shown: what is wrong in everyday words, then what
 * to do. The engine's original sentence is kept as "technical details" for the inspector.
 */

type Rule = [RegExp, string | ((...m: string[]) => string)]

const plural = (n: string, one: string, many: string) => (n === '1' ? one : many)

const RULES: Rule[] = [
  // ---- tag mistakes (the page's own checks)
  [/^Unclosed or stray tag braces in: /, 'A curly bracket { or } in this sentence has no partner, so a tag is broken. Find it in the letter and fix it: '],
  [/A quote isn't closed in this tag\. Every " or ' needs its pair\./, 'A quotation mark in this tag has no partner. Add the missing " or \'.'],
  [/A bracket \( or \[ is opened but not closed in this tag\./, 'A bracket in this tag is opened but never closed. Add the missing ) or ].'],
  [/There is a \) or \] without its opening bracket in this tag\./, 'A closing bracket in this tag has no opening one. Remove it, or add the missing ( or [.'],
  [/This \{% %\} tag is empty or starts with something that isn't a keyword \([^)]*\)\./, "This tag is empty, or doesn't start with a word CompUp knows (if, else, endif, for, set). Fill it in, or delete it."],
  [/“\{% (\w+) %\}” isn't a Jinja tag\. Check the spelling \([^)]*\)\./, (_m, kw) => `“${kw}” isn't a word CompUp knows here. Check the spelling. The words that work are if, elif, else, endif, for, endfor and set.`],
  [/Use == to compare inside a condition, e\.g\. \{% if band == "A" %\}\. A single = only works in \{% set %\}\./, "To compare in a condition, use two equals signs (==), for example band == \"A\". A single = doesn't work there."],
  [/\{% (if|elif) %\} needs a condition after it, e\.g\. \{% (?:if|elif) band == "A" %\}\./, (_m, k) => `This “${k}” has no condition. Write what to check after it, for example band == "A".`],
  [/“\| (\w+)” isn't a filter Jinja knows\. Check the spelling \([^)]*\)\./, (_m, f) => `“| ${f}” isn't a formatting word CompUp knows. Check the spelling. Common ones are float, int, indian_comma and lower.`],
  [/(<code>[^<]*<\/code>) has no matching <code>\{% (if|for) %\}<\/code> above it\./, (_m, c, w) => `${c} has no “${w}” before it. Add the missing “${w}” above it, or delete this line.`],
  [/(<code>[^<]*<\/code>) is never closed\. Add <code>\{% end(if|for) %\}<\/code> where it should stop\./, (_m, c, w) => `${c} starts an “${w}” that never ends. Add an “end ${w}” after the last paragraph it should cover.`],
  [/A condition opens and closes in different table cells: (<code>[^<]*<\/code>)\. Keep both in the same cell\./, (_m, c) => `A condition starts in one table cell and ends in another: ${c}. Move both ends into the same cell.`],
  // ---- fields and numbers
  [/(<code>[^<]*<\/code>) is used with <code>\| (?:int|float)<\/code> but isn't in your data file\. For any employee without it, Jinja stops the whole letter with “[^”]*”\. Adding <code>\| default\(0\)<\/code> makes a missing value count as 0\./,
    (_m, c) => `${c} is used in a calculation but isn't in your data file. For any employee without a value, the whole letter can't be made. Adding <code>| default(0)</code> makes a missing value count as 0.`],
  [/(<code>[^<]*<\/code>) is used with <code>[^<]*<\/code> but without <code>\| float<\/code>\. Uploaded values are text, so CompUp can stop with an error or compare them as words\. Write (<code>[^<]*<\/code>) instead\./,
    (_m, c, w) => `${c} is compared with a number, but values from your upload are text, so CompUp may fail or compare them as words. Write ${w} so it is read as a number.`],
  [/(<code>[^<]*<\/code>) has capital letters\. Tags are case sensitive; CompUp tags are lower case\./, (_m, c) => `${c} has capital letters. Tag names must be lower case, or the value prints empty. Change it to lower case.`],
  [/(\d+) conditions? tests? a value directly, e\.g\. <code>[^<]*<\/code>\. Uploaded values are text, and the text “0” counts as true, so the line or cell still shows \(printing 0\) when the upload has 0\./,
    (_m, n) => `${n} ${plural(n, 'condition checks', 'conditions check')} a field on its own. Values from your upload are text, so even “0” counts as filled in and the line still shows.`],
  [/(\d+) logic tags? sits? on a line of its own without the <code>-<\/code> trim marks, so that line stays blank in the letter CompUp turns into a PDF:/,
    (_m, n) => `${n} condition ${plural(n, 'line would leave an empty line', 'lines would leave empty lines')} in the PDF:`],
  [/(\d+) tags? prints? a decimal number such as 1234567\.0 in CompUp, because the result comes from <code>\| float<\/code>, <code>\| round<\/code> or <code>\/<\/code>\. End (?:them|it) with <code>\| int<\/code> or a comma filter:/,
    (_m, n) => `${n} ${plural(n, 'tag would show', 'tags would show')} a number like 1234567.0 instead of 1234567. End ${plural(n, 'it', 'them')} with <code>| int</code> or a comma format:`],
  // ---- what the full check (the engine CompUp uses) reports
  [/“([^”]+)” isn't in the data for this employee, and the tag uses it in a way that needs a value \(for example with \| float\)\. Add the column, or write (\S+) \| default\(0\)\./,
    (_m, f, w) => `“${f}” has no value for this employee, so their letter can't be made. Add the column to your data, or write ${w} | default(0) so a missing value counts as 0.`],
  [/“([^”]+)” is missing for this employee \(for example custom_schema\.[^)]*\), and the tag needs a value there\. Add the column, or use \| default\(…\)\./,
    (_m, f) => `“${f}” has no value for this employee, so their letter can't be made. Add that column to your data file, or add | default(…) to the tag.`],
  [/^A value is missing for this employee: /, "A value is missing for this employee, so their letter can't be made. "],
  [/There is a \{% (\w+) %\} without the \{% if %\} \(or \{% for %\}\) it belongs to above it\./, (_m, k) => `There is an “${k}” with no “if” or “for” before it. Add the missing start above it, or delete this line.`],
  [/An \{% (\w+) %\} is never closed\. Add \{% end\w+ %\} where it should stop\./, (_m, k) => `An “${k}” starts but never ends. Add an “end ${k}” where it should stop.`],
  [/A tag has a typing mistake near “([^”]*)”: a missing quote, bracket or \| , or two words without and \/ or between them\./, (_m, g) => `A tag has a typing mistake near “${g}”. Look for a missing quote or bracket, or two words with no “and” / “or” between them.`],
  [/^A tag has a typing mistake: /, 'A tag has a typing mistake. '],
  [/^An if or for block isn't closed properly: /, "An “if” or “for” isn't closed properly. "],
  [/^The letter couldn't be filled: /, "The letter couldn't be made: "],
  // ---- names of the checks
  [/Real Jinja \(the engine CompUp uses\)/, 'The full check (the engine CompUp uses)'],
  [/marked "Real Jinja" below/, 'marked “Full check” below'],
  [/with real Jinja…/, "with CompUp's engine…"],
  [/^Real Jinja check didn't finish/, "The full check didn't finish"],
  [/the real Jinja check/, 'the full check'],
  [/real Jinja filled them too/, "CompUp's engine filled them too"],
]

/** Quotes come HTML-escaped from the page's checks; match on the plain characters. */
const unescapeQuotes = (s: string) => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'")

/** The message in everyday words. `original` is set only when the wording changed (technical details for the inspector). */
export function plainMessage(text: string): { html: string; original: string } {
  const src = unescapeQuotes(String(text ?? ''))
  let out = src
  for (const [rx, to] of RULES) out = out.replace(rx, to as never)
  return { html: out, original: out === src ? '' : String(text) }
}

/** A toast or other single line: same rules, tags removed. */
export function plainLine(text: string): string {
  return plainMessage(text).html.replace(/<[^>]+>/g, '')
}

/** What each group of findings is called, why it matters and how to fix it, with no jargon. */
export const PLAIN_CATS: Record<string, { name: string; why: string; fix: string }> = {
  syntax: { name: 'Tags with mistakes', why: "The letters can't be made until this is fixed.", fix: 'Click the tag in the letter and correct it. If there is a one-click fix button, use it.' },
  fields: { name: 'Fields that are not in your data', why: 'These values will be blank in every letter.', fix: 'Pick a field that exists in your data file from the list, or check the spelling.' },
  mapping: { name: 'Text with no field yet', why: 'This text stays exactly as typed in every letter.', fix: 'Choose which employee field each one should show.' },
  review: { name: 'Suggestions to check', why: 'A wrong guess would put the wrong value in every letter.', fix: 'Look at each suggestion and confirm it, or pick a different field.' },
  cells: { name: 'Empty table cells', why: 'Empty cells stay blank in every letter.', fix: 'Choose a field for each empty cell in the table.' },
  conditions: { name: 'Show / hide rules', why: 'If a rule never applies, or always applies, the wrong text can show.', fix: 'Check the field and the value in the rule.' },
  format: { name: 'Numbers and text', why: 'Numbers or text may look different from what you expect.', fix: 'Follow the note in the message, for example choose a comma format.' },
  render: { name: 'Letters that cannot be made', why: "The letter can't be made, or looks wrong, for some employees.", fix: 'Fix the tag named in the message, then test every employee again.' },
  other: { name: 'Other things to know', why: 'Worth knowing before the letters go out.', fix: 'Read the message and decide whether it needs action.' },
}

type Engine = { kind: 'none' | 'unavailable' | 'error' | 'checking' | 'notrun' | 'failed' | 'passed'; title: string; detail: string }
/** The line about the full check (the engine CompUp uses). */
export function plainEngine(e: Engine): Engine {
  const n = e.title.match(/failed: (\d+) typing mistake/)?.[1]
  const f = e.title.match(/passed: .*?(\d+) fields? used/)?.[1]
  switch (e.kind) {
    case 'unavailable': return { ...e, title: "The full check isn't available here; these are the page's own checks." }
    case 'error': return { ...e, title: e.title.replace(/^Real Jinja check didn't run/, "The full check didn't run") }
    case 'checking': return { ...e, title: `${/again/.test(e.title) ? 'Checking again' : 'Checking'} with the engine CompUp uses…` }
    case 'notrun': return { ...e, title: "The full check hasn't run yet." }
    case 'failed': return { ...e, title: `The full check found ${n ?? 'some'} mistake${n === '1' ? '' : 's'} that would stop letters being made. They are listed first below.`, detail: e.detail.replace(/Jinja stops at the first mistake/, 'It stops at the first mistake') }
    case 'passed': return { ...e, title: `The full check passed: CompUp's engine can fill this letter.${f ? ` ${f} field${f === '1' ? '' : 's'} used.` : ''}` }
    default: return e
  }
}
