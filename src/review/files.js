// Чтение файлов для экспертизы. Всё происходит в браузере: DOCX разбирается здесь же,
// PDF передаётся модели как есть (она читает и сканы), TXT и MD читаются как текст.

export const MAX_FILE = 8 * 1024 * 1024
export const MAX_TOTAL = 15 * 1024 * 1024
export const MAX_TEXT = 650_000
export const ACCEPT = '.docx,.pdf,.txt,.md'

export const fileSize = (file) => `${(file.size / 1024 / 1024).toFixed(2)} МБ`

// Возвращает текст ошибки или пустую строку
export function checkFiles(files) {
  for (const file of files) {
    if (!/\.(docx|pdf|txt|md)$/i.test(file.name))
      return `Формат файла «${file.name}» не поддерживается. Выберите DOCX, PDF, TXT или MD.`
    if (!file.size || file.size > MAX_FILE) return `Файл «${file.name}» пустой или больше 8 МБ.`
  }
  return ''
}

function paragraphText(p) {
  const pieces = []
  const visit = (node) => {
    if (node.nodeType !== 1) return
    const n = node.localName
    if (n === 'p' && node !== p) return
    if (n === 'del' || n === 'moveFrom') return // удалённое в режиме правок не читаем
    if (n === 't') return void pieces.push(node.textContent)
    if (n === 'tab') return void pieces.push('\t')
    if (n === 'br' || n === 'cr') return void pieces.push('\n')
    for (const child of node.children) visit(child)
  }
  visit(p)
  return pieces.join('').trim()
}

async function readDocx(file) {
  const { default: JSZip } = await import('jszip')
  let zip
  try {
    zip = await JSZip.loadAsync(await file.arrayBuffer())
  } catch {
    throw new Error(`Не удалось открыть «${file.name}». Убедитесь, что это DOCX без пароля.`)
  }
  const names = [
    'word/document.xml',
    'word/footnotes.xml',
    'word/endnotes.xml',
    ...Object.keys(zip.files)
      .filter((n) => /^word\/(header|footer)\d+\.xml$/i.test(n))
      .sort(),
  ]
  const chunks = []
  let unsupported = false
  for (const name of names) {
    if (!zip.file(name)) continue
    const xml = await zip.file(name).async('string')
    if (xml.length > 5_000_000) throw new Error(`Текст «${file.name}» слишком объёмный для проверки.`)
    if (/<(?:\w+:)?(?:oMath|oMathPara|drawing|pict|object)\b/.test(xml)) unsupported = true
    const dom = new DOMParser().parseFromString(xml, 'application/xml')
    if (dom.getElementsByTagName('parsererror').length) throw new Error(`Не удалось извлечь текст из «${file.name}».`)
    const ps = [...dom.getElementsByTagNameNS('*', 'p')].map(paragraphText).filter(Boolean)
    const label =
      name === 'word/document.xml'
        ? 'ОСНОВНОЙ ТЕКСТ'
        : name === 'word/footnotes.xml'
          ? 'СНОСКИ'
          : name === 'word/endnotes.xml'
            ? 'КОНЦЕВЫЕ СНОСКИ'
            : `КОЛОНТИТУЛ ${name}`
    if (ps.length) chunks.push(`${label}:\n${ps.join('\n')}`)
  }
  if (!chunks.length) throw new Error(`В «${file.name}» нет текста, который можно извлечь. Сканы загружайте в PDF.`)
  const images =
    unsupported ||
    Object.keys(zip.files).some((n) => /^word\/(media|charts|embeddings|diagrams)\//i.test(n) && !zip.files[n].dir)
  return { name: file.name, kind: 'text', text: chunks.join('\n\n'), images }
}

export async function readFile(file) {
  if (/\.docx$/i.test(file.name)) return readDocx(file)
  if (/\.pdf$/i.test(file.name)) {
    const bytes = new Uint8Array(await file.arrayBuffer())
    let s = ''
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
    return { name: file.name, kind: 'pdf', data: btoa(s), images: false }
  }
  const text = await file.text()
  if (!text.trim()) throw new Error(`Файл «${file.name}» не содержит текста.`)
  return { name: file.name, kind: 'text', text, images: false }
}
