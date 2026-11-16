// Клиент агента.
// analyzeSpec отправляет ТЗ на сервер (server/index.js), который передаёт его локальной модели.
// Если модель недоступна, выводы собираются простыми правилами по тексту, и интерфейс об этом говорит.

const HOURS_PER_TASK = 8

const TECH = [
  'React', 'Vue', 'Angular', 'Next.js', 'Svelte', 'TypeScript', 'JavaScript', 'Node.js', 'Python',
  'Django', 'FastAPI', 'PHP', 'Laravel', 'Java', 'Kotlin', 'Swift', 'Flutter', 'Golang', 'C#', '.NET',
  'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'ClickHouse', 'Docker', 'Kubernetes', 'Nginx',
  'REST', 'GraphQL', 'OAuth', 'JWT', 'Figma', '1С', 'Битрикс', 'WordPress', 'Tilda', 'Telegram',
  'iOS', 'Android', 'СБП',
]

const TASK_RE = /(долж[ен]|необходимо|нужно|требуется|следует|реализовать|разработать|создать|добавить|обеспечить|предусмотреть|интегрир)/i
const NONFUNC_RE = /(производительн|безопасн|нагрузк|быстр|время отклика|адаптив|доступност|браузер|секунд|шифр|резерв|масштаб|персональн)/i
const TIME_RE = /(срок|дедлайн|этап\s*\d|\d+\s*(рабочих\s+)?(дн|недел|месяц)|\d{1,2}\.\d{1,2}\.\d{2,4}|квартал)/i

const VAGUE = [
  { re: /и\s+т\.\s?[дп]\.|и\s+др\.|и\s+прочее/i, note: 'Перечень не закрыт. Попросите у заказчика полный список.' },
  { re: /быстр|оперативн|мгновенн/i, note: 'Нет измеримого критерия скорости. Нужна цифра: секунды, условия замера.' },
  { re: /удобн|интуитивн|современн|красив|качественн|дружелюбн/i, note: 'Субъективная формулировка. Нужен критерий приёмки или референс.' },
  { re: /при необходимости|по возможности|желательно|опционально/i, note: 'Непонятно, входит ли это в объём работ. Зафиксируйте: да или нет.' },
  { re: /по согласованию|будет уточн|уточняется|позже|TBD/i, note: 'Решение отложено. Уточните, кто и к какой дате его принимает.' },
]

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const clip = (s, n = 200) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s)
const clean = (s) => s.replace(/^[\s\-–—•*]+/, '').replace(/^\d+[.)]\s+/, '').trim()

function sentences(text) {
  return text
    .split(/(?<=[.!?;])\s+(?=[А-ЯЁA-Z0-9«"(])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 8)
}

function priority(s) {
  if (/желательно|по возможности|опционально|при необходимости/i.test(s)) return 'низкий'
  if (/долж[ен]|обязательн|критич|необходимо/i.test(s)) return 'высокий'
  return 'средний'
}

export function splitParagraphs(rawText) {
  return rawText
    .split(/\r?\n+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((text, i) => ({ n: i + 1, text, heading: text.length <= 90 && !/[.;,!?]$/.test(text) }))
}

// Быстрый подсчёт по тексту, пока человек его вставляет: без модели, только чтобы показать объём
export function prescan(rawText) {
  const paragraphs = splitParagraphs(rawText)
  const body = paragraphs.filter((p) => !p.heading)
  const words = rawText.trim().split(/\s+/).filter(Boolean).length
  return {
    paragraphs: paragraphs.length,
    sections: paragraphs.length - body.length,
    demands: body.flatMap((p) => sentences(p.text)).filter((s) => TASK_RE.test(s)).length,
    minutes: words ? Math.max(1, Math.round(words / 180)) : 0,
  }
}

function analyzeByRules(paragraphs, rawText) {
  const all = paragraphs.filter((p) => !p.heading).flatMap((p) => sentences(p.text).map((s) => ({ s, ref: p.n })))

  const tasks = []
  const nonfunctional = []
  const timeline = []
  const risks = []

  for (const { s, ref } of all) {
    const text = clip(clean(s))
    if (TIME_RE.test(s)) timeline.push({ text, ref })
    if (NONFUNC_RE.test(s)) nonfunctional.push({ text, ref })
    else if (TASK_RE.test(s)) tasks.push({ text, ref, priority: priority(s) })
    for (const v of VAGUE) if (v.re.test(s)) risks.push({ quote: clip(clean(s), 140), note: v.note, ref })
  }

  const stack = []
  for (const name of TECH) {
    const re = new RegExp(`(?<![\\p{L}\\d])${esc(name)}(?![\\p{L}\\d])`, 'u')
    const p = paragraphs.find((x) => re.test(x.text))
    if (p) stack.push({ name, ref: p.n })
  }

  // Чего в документе нет вовсе
  if (!timeline.length) risks.push({ note: 'В ТЗ не найдены сроки. Запросите даты этапов и финальный дедлайн.', ref: null })
  if (!/бюджет|стоимост|оплат[аы] работ|цена/i.test(rawText))
    risks.push({ note: 'Не указан бюджет и порядок оплаты работ.', ref: null })
  if (!/при[её]мк|критери/i.test(rawText))
    risks.push({ note: 'Не описаны критерии приёмки: неясно, когда работа считается сданной.', ref: null })

  const goal = all.find(({ s }) => /цель|назначени|предназначен/i.test(s)) || all[0]
  const second = all.find((x) => x !== goal)

  return {
    title: clip(paragraphs.find((p) => p.heading)?.text || paragraphs[0]?.text || 'Без названия', 110),
    summary: [goal, second].filter(Boolean).map(({ s, ref }) => ({ text: clip(clean(s), 260), ref })),
    tasks,
    nonfunctional,
    stack,
    timeline,
    estimate: {
      hours: tasks.length * HOURS_PER_TASK,
      note: `Условное правило демо-режима: ${tasks.length} задач × ${HOURS_PER_TASK} ч. Модель заменит его своей оценкой.`,
    },
    risks,
  }
}

// Совет в демо-режиме: собирается из того, что нашли правила. Модель пишет свой.
function adviceByRules(f) {
  const missing = f.risks.filter((r) => !r.ref)
  const vague = f.risks.filter((r) => r.ref)
  const high = f.tasks.filter((t) => t.priority === 'высокий')

  let verdict = 'сначала уточнить'
  if (!f.tasks.length || missing.length >= 3) verdict = 'ТЗ сырое'
  else if (!missing.length && vague.length <= 2) verdict = 'можно брать в работу'

  const text = {
    'можно брать в работу': 'Объём работ понятен, серьёзных пробелов правила не нашли. Оставшиеся вопросы можно закрыть по ходу.',
    'сначала уточнить': 'Задачи в целом ясны, но оценку и срок по такому тексту давать рано: часть формулировок заказчик и исполнитель поймут по-разному.',
    'ТЗ сырое': 'По этому тексту нельзя назвать ни срок, ни цену: не хватает базовых условий. Верните ТЗ заказчику со списком вопросов.',
  }[verdict]

  const steps = []
  const absent = missing.map((r) =>
    /срок/i.test(r.note) ? 'даты этапов и финальный срок' : /бюджет/i.test(r.note) ? 'бюджет и порядок оплаты' : 'критерии приёмки',
  )
  if (absent.length) steps.push(`Запросить у заказчика то, чего в ТЗ нет: ${absent.join(', ')}.`)
  if (vague.length)
    steps.push(`Снять размытые формулировки (${vague.length}): начните с абзаца ${vague[0].ref}, вопросы есть в блоке «Риски и неясности».`)
  if (!f.stack.length) steps.push('Согласовать стек: в ТЗ он не задан, а от него зависит оценка.')
  if (high.length) steps.push(`Оценку начать с задач высокого приоритета (${high.length}). Первая: «${clip(high[0].text, 90)}»`)
  steps.push('Ответы заказчика внести в текст ТЗ до старта работ, а не оставлять в переписке.')

  return { verdict, text, steps: steps.slice(0, 5) }
}

async function analyzeByModel(paragraphs, signal) {
  let res
  try {
    res = await fetch('/api/analyze', {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paragraphs: paragraphs.map(({ n, text }) => ({ n, text })) }),
    })
  } catch (e) {
    if (e.name === 'AbortError') throw e
    throw new Error('сервер сайта не отвечает')
  }
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new Error(data?.error || `сервер ответил ошибкой ${res.status}`)
  return data
}

// Возвращает разбор. Бросает исключение только при отмене (AbortError).
export async function analyzeSpec(rawText, base, signal) {
  const { paragraphs } = base
  let findings
  let mode = 'ai'
  let modeNote = ''
  try {
    findings = await analyzeByModel(paragraphs, signal)
    modeNote = findings.model
  } catch (e) {
    if (e.name === 'AbortError') throw e
    findings = analyzeByRules(paragraphs, rawText)
    mode = 'rules'
    modeNote = e.message
  }

  let id = 0
  const withIds = (list) => list.map((x) => ({ ...x, id: ++id }))
  return {
    ...base,
    mode,
    modeNote,
    title: findings.title || base.sourceName,
    counts: { paragraphs: paragraphs.length, sections: paragraphs.filter((p) => p.heading).length },
    summary: withIds(findings.summary),
    tasks: withIds(findings.tasks),
    requirements: { nonfunctional: withIds(findings.nonfunctional), stack: findings.stack },
    timeline: withIds(findings.timeline),
    estimate: findings.estimate,
    risks: withIds(findings.risks),
    advice: mode === 'ai' ? findings.advice || null : adviceByRules(findings),
  }
}

export async function extractFile(file) {
  const body = new FormData()
  body.append('file', file)
  let res
  try {
    res = await fetch('/api/extract', { method: 'POST', body })
  } catch {
    throw new Error('Сервер сайта не отвечает, файл не прочитан. Запустите сайт командой npm run dev.')
  }
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new Error(data?.error || `Сервер ответил ошибкой ${res.status}.`)
  return data.text
}

export async function getAgentStatus() {
  try {
    const res = await fetch('/api/status')
    if (!res.ok) throw new Error()
    return await res.json()
  } catch {
    return { ready: false, model: null, reason: 'сервер сайта не отвечает' }
  }
}

export function toMarkdown(a, blocks) {
  const ref = (r) => (r ? ` (абз. ${r})` : '')
  const out = [`# ${a.title}`, '']
  if (blocks.summary) out.push('## Краткое содержание', ...a.summary.map((x) => `- ${x.text}${ref(x.ref)}`), '')
  if (blocks.advice && a.advice)
    out.push('## Совет агента', `**Вывод: ${a.advice.verdict}.** ${a.advice.text}`, '', ...a.advice.steps.map((s, i) => `${i + 1}. ${s}`), '')
  if (blocks.tasks) out.push('## Что сделать?', ...a.tasks.map((x) => `- [ ] ${x.text} — приоритет ${x.priority}${ref(x.ref)}`), '')
  if (blocks.requirements)
    out.push(
      '## Требования и стек',
      ...a.requirements.nonfunctional.map((x) => `- ${x.text}${ref(x.ref)}`),
      a.requirements.stack.length ? `- Стек: ${a.requirements.stack.map((x) => x.name).join(', ')}` : '',
      '',
    )
  if (blocks.timeline)
    out.push('## Сроки и оценка', ...a.timeline.map((x) => `- ${x.text}${ref(x.ref)}`), `- Оценка: ${a.estimate.hours} ч. ${a.estimate.note}`, '')
  if (blocks.risks)
    out.push('## Риски и неясности', ...a.risks.map((x) => `- ${x.note}${x.quote ? ` «${x.quote}»` : ''}${ref(x.ref)}`), '')
  return out.filter((l, i, arr) => !(l === '' && arr[i - 1] === '')).join('\n')
}
