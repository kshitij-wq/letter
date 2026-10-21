// Helpers shared by the engine's unit tests (*.test.js). Not part of the page.
import JSZip from 'jszip'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import { state } from './state.js'

/** The placeholder row for a text in the letter. */
export const rowFor = (find) => state.rows.find((r) => r.find === find)

/** A letter from tests_ui/fixtures/versions, shaped like the File the page gets. */
export function versionFile(name){
  const b = readFileSync(resolve(process.cwd(), '../tests_ui/fixtures/versions', name))
  return { name, arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) }
}

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
/** The smallest .docx Word opens: `body` is the XML inside <w:body>, `header` (optional) the XML of a header part. */
export function docxFrom(body, header = ''){
  const z = new JSZip()
  z.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')
  z.file('word/document.xml', `<?xml version="1.0"?><w:document ${W}><w:body>${body}</w:body></w:document>`)
  if (header) z.file('word/header1.xml', `<?xml version="1.0"?><w:hdr ${W}>${header}</w:hdr>`)
  return z.generateAsync({ type: 'arraybuffer' })
}
