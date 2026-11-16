// Сервер AI Expert: извлекает текст из файлов и передаёт ТЗ локальной модели в Ollama.
import express from 'express'
import multer from 'multer'
import mammoth from 'mammoth'
import { extractText, getDocumentProxy } from 'unpdf'

const PORT = Number(process.env.API_PORT) || 8787
const OLLAMA = (process.env.OLLAMA_URL || 'http://127.0.0.1:11434').replace(/\/$/, '')
const MODEL = process.env.OLLAMA_MODEL || 'gemma3:4b'
const MAX_CHARS = 50_000

const app = express()
app.use(express.json({ limit: '2mb' }))
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } })

// ---------- Состояние агента ----------

async function agentStatus() {
  try {
    const r = await fetch(`${OLLAMA}/api/tags`, { signal: AbortSignal.timeout(2500) })
    if (!r.ok) throw new Error()
    const names = ((await r.json()).models || []).map((m) => m.name)
    const wanted = MODEL.includes(':') ? MODEL : `${MODEL}:latest`
    if (!names.includes(wanted))
      return { ready: false, model: MODEL, reason: `в Ollama нет модели ${MODEL}. Скачайте её командой: ollama pull ${MODEL}` }
    return { ready: true, model: MODEL }
  } catch {
    return { ready: false, model: MODEL, reason: 'Ollama не запущена или не установлена' }
  }
}

app.get('/api/status', async (_req, res) => res.json(await agentStatus()))

// ---------- Текст из файла ----------

// В PDF каждая строка приходит отдельно: склеиваем перенесённые строки обратно в абзацы
function reflow(text) {
  const out = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) {
      out.push('')
      continue
    }
    const prev = out[out.length - 1]
    const startsItem = /^(\d+(\.\d+)*[.)]?\s|[-–—•*]\s)/.test(line)
    if (prev && prev.length > 40 && !/[.!?:;]$/.test(prev) && !startsItem) out[out.length - 1] = `${prev} ${line}`
    else out.push(line)
  }
  return out.filter(Boolean).join('\n')
}

app.post('/api/extract', upload.single('file'), async (req, res) => {
  const file = req.file
  if (!file) return res.status(400).json({ error: 'Файл не получен.' })
  const ext = (file.originalname.match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase()
  try {
    let text
    if (ext === 'pdf') {
      const pdf = await getDocumentProxy(new Uint8Array(file.buffer))
      const { text: pages } = await extractText(pdf, { mergePages: false })
      text = reflow(pages.join('\n'))
    } else if (ext === 'docx') {
      text = (await mammoth.extractRawText({ buffer: file.buffer })).value
    } else if (ext === 'txt' || ext === 'md') {
      text = file.buffer.toString('utf8')
    } else {
      return res.status(415).json({ error: 'Поддерживаются файлы PDF, DOCX, TXT и MD. Старый формат .doc пересохраните в .docx.' })
    }
    text = text.replace(/\n{3,}/g, '\n\n').trim()
    if (!text)
      return res.status(422).json({ error: 'В файле нет текста. Если это скан, распознайте его или вставьте текст вручную.' })
    res.json({ text })
  } catch (e) {
    console.error('extract:', e)
    res.status(422).json({ error: 'Не удалось прочитать файл: он повреждён или защищён паролем.' })
  }
})

// ---------- Разбор ТЗ моделью ----------

const item = (extra = {}, required = []) => ({
  type: 'object',
  properties: { text: { type: 'string' }, ref: { type: 'integer' }, ...extra },
  required: ['text', 'ref', ...required],
})

const VERDICTS = ['можно брать в работу', 'сначала уточнить', 'ТЗ сырое']

const SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    summary: { type: 'array', items: item() },
    advice: {
      type: 'object',
      properties: {
        verdict: { type: 'string', enum: VERDICTS },
        text: { type: 'string' },
        steps: { type: 'array', items: { type: 'string' } },
      },
      required: ['verdict', 'text', 'steps'],
    },
    tasks: { type: 'array', items: item({ priority: { type: 'string', enum: ['высокий', 'средний', 'низкий'] } }, ['priority']) },
    nonfunctional: { type: 'array', items: item() },
    stack: {
      type: 'array',
      items: { type: 'object', properties: { name: { type: 'string' }, ref: { type: 'integer' } }, required: ['name', 'ref'] },
    },
    timeline: { type: 'array', items: item() },
    estimate: {
      type: 'object',
      properties: { hours: { type: 'integer' }, note: { type: 'string' } },
      required: ['hours', 'note'],
    },
    risks: {
      type: 'array',
      items: {
        type: 'object',
        properties: { note: { type: 'string' }, quote: { type: 'string' }, ref: { type: 'integer' } },
        required: ['note', 'quote', 'ref'],
      },
    },
  },
  required: ['title', 'summary', 'advice', 'tasks', 'nonfunctional', 'stack', 'timeline', 'estimate', 'risks'],
}

const SYSTEM = `Ты аналитик, который разбирает технические задания для команды разработки. Тебе дают текст ТЗ, разбитый на пронумерованные абзацы вида [номер] текст. Прочитай его целиком и верни разбор в JSON.

Опирайся только на то, что написано в ТЗ: команда будет сверять каждый твой вывод с исходным абзацем, поэтому выдуманное требование или срок сразу подорвёт доверие к разбору. В поле ref указывай номер абзаца, из которого сделан вывод. Если вывод о том, чего в ТЗ нет (например, не указан бюджет), ставь ref: 0.

Поля ответа:
- title: короткое название проекта своими словами.
- summary: 2–4 предложения о том, что и зачем нужно сделать. Пиши так, чтобы человек, не читавший ТЗ, понял суть.
- advice: твой совет руководителю команды, который решает, что делать с этим ТЗ. verdict: «можно брать в работу», если объём и условия понятны; «сначала уточнить», если работу можно оценить только после ответов заказчика; «ТЗ сырое», если нет базовых условий и текст надо возвращать. text: одно-два предложения, почему такой вывод, с опорой на конкретные места ТЗ. steps: от трёх до пяти следующих шагов по порядку, каждый — конкретное действие («Спросить у заказчика, сколько клубов подключается на старте»), а не общий совет вроде «уточнить требования».
- tasks: что конкретно нужно сделать исполнителю. Каждая задача — одно действие, начинается с глагола («Реализовать запись на занятие»). Приоритет «высокий» для обязательного и для того, без чего остальное не работает, «низкий» для желательного и необязательного, иначе «средний».
- nonfunctional: требования к скорости, нагрузке, безопасности, совместимости, хранению данных.
- stack: технологии, сервисы и системы, прямо названные в ТЗ. Только названия.
- timeline: сроки, этапы и даты из ТЗ.
- estimate: твоя грубая оценка трудоёмкости всех задач в часах и одно предложение в note о том, из чего она сложилась и что может её сильно изменить.
- risks: места, которые помешают оценить или сдать работу: размытые формулировки без критерия («быстро», «удобно»), незакрытые перечни («и т.д.»), противоречия между абзацами, отложенные решения, отсутствие сроков, бюджета или критериев приёмки. В note напиши, что не так и что спросить у заказчика; в quote приведи дословный фрагмент из ТЗ или пустую строку, если ref: 0.

Пиши по-русски, кратко и по делу.`

const clip = (s, n) => String(s ?? '').trim().slice(0, n)

app.post('/api/analyze', async (req, res) => {
  const paragraphs = Array.isArray(req.body?.paragraphs) ? req.body.paragraphs : []
  if (!paragraphs.length) return res.status(400).json({ error: 'Текст ТЗ пуст.' })
  const doc = paragraphs.map((p) => `[${p.n}] ${p.text}`).join('\n')
  if (doc.length > MAX_CHARS)
    return res.status(413).json({
      error: `ТЗ слишком длинное для локальной модели: ${doc.length.toLocaleString('ru-RU')} символов при пределе ${MAX_CHARS.toLocaleString('ru-RU')}. Разберите его по частям`,
    })

  const status = await agentStatus()
  if (!status.ready) return res.status(503).json({ error: status.reason })

  const abort = new AbortController()
  res.on('close', () => !res.writableEnded && abort.abort())

  // Кириллица расходует примерно токен на два символа; окно должно вместить ТЗ и ответ
  const numCtx = Math.min(32768, Math.max(8192, Math.ceil(doc.length / 2) + 6144))

  try {
    const r = await fetch(`${OLLAMA}/api/chat`, {
      method: 'POST',
      signal: abort.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        stream: true, // поток нужен, чтобы долгий ответ не упёрся в таймаут соединения
        format: SCHEMA,
        options: { temperature: 0, num_ctx: numCtx },
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: `Текст ТЗ:\n\n${doc}` },
        ],
      }),
    })
    if (!r.ok) throw new Error(`Ollama ответила ${r.status}: ${clip(await r.text(), 300)}`)

    let content = ''
    let buffer = ''
    const decoder = new TextDecoder()
    for await (const chunk of r.body) {
      buffer += decoder.decode(chunk, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop()
      for (const line of lines) {
        if (!line.trim()) continue
        const part = JSON.parse(line)
        if (part.error) throw new Error(part.error)
        content += part.message?.content || ''
      }
    }

    let data
    try {
      data = JSON.parse(content)
    } catch {
      throw new Error('модель вернула ответ не в формате JSON (возможно, не хватило контекста)')
    }

    const max = paragraphs.length
    const ref = (v) => (Number.isInteger(v) && v >= 1 && v <= max ? v : null)
    const list = (arr, map) => (Array.isArray(arr) ? arr.map(map).filter(Boolean) : [])
    const texted = (x) => (x?.text ? { text: clip(x.text, 400), ref: ref(x.ref) } : null)

    res.json({
      model: MODEL,
      title: clip(data.title, 140),
      summary: list(data.summary, texted),
      advice: data.advice?.text
        ? {
            verdict: VERDICTS.includes(data.advice.verdict) ? data.advice.verdict : 'сначала уточнить',
            text: clip(data.advice.text, 500),
            steps: list(data.advice.steps, (s) => clip(s, 300) || null).slice(0, 5),
          }
        : null,
      tasks: list(data.tasks, (x) => {
        const t = texted(x)
        return t && { ...t, priority: ['высокий', 'средний', 'низкий'].includes(x.priority) ? x.priority : 'средний' }
      }),
      nonfunctional: list(data.nonfunctional, texted),
      stack: list(data.stack, (x) => (x?.name ? { name: clip(x.name, 40), ref: ref(x.ref) } : null)),
      timeline: list(data.timeline, texted),
      estimate: { hours: Math.max(0, Math.round(Number(data.estimate?.hours) || 0)), note: clip(data.estimate?.note, 400) },
      risks: list(data.risks, (x) => (x?.note ? { note: clip(x.note, 400), quote: clip(x.quote, 200), ref: ref(x.ref) } : null)),
    })
  } catch (e) {
    if (abort.signal.aborted) return
    console.error('analyze:', e)
    res.status(502).json({ error: `модель не справилась с разбором: ${e.message}` })
  }
})

app.use((err, _req, res, _next) => {
  if (err?.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'Файл больше 20 МБ.' })
  if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Запрос не в формате JSON.' })
  if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'Текст ТЗ слишком большой.' })
  console.error(err)
  res.status(500).json({ error: 'Внутренняя ошибка сервера.' })
})

app.listen(PORT, '127.0.0.1', () => console.log(`API: http://127.0.0.1:${PORT}, модель ${MODEL}, Ollama ${OLLAMA}`))
