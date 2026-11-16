// Проект заключения в формате DOCX: собирается в браузере, порядок разделов повторяет шаблон.

export const NOT_DONE = { status: 'Не удалось проверить', comment: 'Этап проверки не завершён.' }

export const sourceState = (i) =>
  i === 11 || i === 12
    ? 'Предоставленная копия включена; применимость и редакция требуют подтверждения.'
    : 'Текст и применимая редакция не подтверждены; автоматическая проверка не выполнена.'

export const STANDING_LIMITS = [
  'Действующие редакции нормативных актов через интернет не проверяются.',
  'Схемы и изображения в DOCX не обрабатываются.',
  'Проверка текста не подтверждает выполнение работ, испытаний или официальное решение.',
]

const xml = (s) =>
  String(s ?? '')
    .replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c])
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')

const p = (text, style = 'Normal') =>
  `<w:p><w:pPr><w:pStyle w:val="${style}"/></w:pPr><w:r>${String(text ?? '')
    .split('\n')
    .map((t, i) => `${i ? '<w:br/>' : ''}<w:t xml:space="preserve">${xml(t)}</w:t>`)
    .join('')}</w:r></w:p>`

const cell = (text, width) => `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/><w:vAlign w:val="top"/></w:tcPr>${p(text)}</w:tc>`

function table(rows, map) {
  const side = (name, color) => `<w:${name} w:val="single" w:sz="4" w:color="${color}"/>`
  const borders = `<w:tblBorders>${['top', 'left', 'bottom', 'right'].map((n) => side(n, '808080')).join('')}${side('insideH', 'BFBFBF')}${side('insideV', 'BFBFBF')}</w:tblBorders>`
  let out = `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/>${borders}</w:tblPr><w:tblGrid><w:gridCol w:w="3300"/><w:gridCol w:w="1600"/><w:gridCol w:w="4300"/></w:tblGrid><w:tr>${cell('Наименование пункта', 3300)}${cell('Статус', 1600)}${cell('Комментарий', 4300)}</w:tr>`
  for (const row of rows) {
    const v = map[row.id] || NOT_DONE
    out += `<w:tr>${cell(row.label, 3300)}${cell(v.status, 1600)}${cell(v.comment, 4300)}</w:tr>`
  }
  return out + '</w:tbl>'
}

const STYLES =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:rPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:rPr><w:b/><w:sz w:val="30"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/><w:rPr><w:i/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="100"/></w:pPr><w:rPr><w:b/><w:sz w:val="24"/></w:rPr></w:style></w:styles>'

export async function buildDocx(kb, r, complete) {
  const m = r.meta || {}
  const quick = r.mode === 'quick'
  let body = p(`${complete ? 'Проект для проверки специалистом' : 'Проверка не завершена — предварительный проект'} — ${quick ? 'быстрый' : 'полный'} режим`, 'Subtitle')
  body += p(m.title || `Заключение экспертизы на техническое задание «${r.main}»`, 'Title')
  body += p('1. Документы, представленные на рассмотрение', 'Heading1')
  body += p(
    `Техническое задание: ${r.main}. Дата проверки: ${r.date}. Приложения: ${r.annexes.join(', ') || 'не указаны'}. Модели Gemini: ${r.models.join(', ') || 'не определены'}. ${m.description || 'Реквизиты требуют уточнения.'}`,
  )
  body += p('2. Документы, принятые во внимание при рассмотрении', 'Heading1')
  kb.sourceList.forEach((s, i) => (body += p(`${s} — ${sourceState(i)}`)))
  if (r.extras.length) body += p(`Дополнительные загруженные источники: ${r.extras.join(', ')}. Применимость и редакция требуют подтверждения.`)
  body += p('3. Используемые сокращения', 'Heading1') + p(m.abbreviations || 'Не определены.')
  for (const s of kb.sections) body += p(s.title, 'Heading1') + table(s.rows, r.rows)
  body += p('Выводы и рекомендации', 'Heading1') + p(m.conclusion || 'Итоговый вывод не сформирован: проверка не завершена.')
  body += p('Приложение А. Дополнительные пункты и несопоставленные заголовки', 'Heading1') + p(m.extras || 'Не проверено.')
  body +=
    p('Приложение Б. Детализация проверки контрольного оглавления', 'Heading1') +
    (quick ? p('Быстрый режим: отдельная проверка 113 пунктов оглавления не проводилась.') : table(kb.outline, r.outline))
  body +=
    p('Приложение В. Проверки вне строк шаблона и ограничения', 'Heading1') +
    p(m.outside || 'Дополнительные проверки не завершены.') +
    p(m.limitations || '') +
    p([...STANDING_LIMITS, ...r.warnings].join('\n'))

  const { default: JSZip } = await import('jszip')
  const zip = new JSZip()
  const head = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
  const rels = 'http://schemas.openxmlformats.org/package/2006/relationships'
  const office = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
  const wml = 'application/vnd.openxmlformats-officedocument.wordprocessingml'
  zip.file(
    '[Content_Types].xml',
    `${head}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="${wml}.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="${wml}.styles+xml"/></Types>`,
  )
  zip.file('_rels/.rels', `${head}<Relationships xmlns="${rels}"><Relationship Id="rId1" Type="${office}/officeDocument" Target="word/document.xml"/></Relationships>`)
  zip.file('word/_rels/document.xml.rels', `${head}<Relationships xmlns="${rels}"><Relationship Id="rId1" Type="${office}/styles" Target="styles.xml"/></Relationships>`)
  zip.file('word/styles.xml', STYLES)
  zip.file(
    'word/document.xml',
    `${head}<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1000" w:right="850" w:bottom="1000" w:left="850" w:header="500" w:footer="500" w:gutter="0"/></w:sectPr></w:body></w:document>`,
  )
  return zip.generateAsync({ type: 'blob', mimeType: `${wml}.document`, compression: 'DEFLATE' })
}
