// Состояние экспертизы. Живёт вне компонентов, чтобы проверка на десяток запросов
// не обрывалась при переходе на другую страницу сайта.
import { useSyncExternalStore } from 'react'
import { checkFiles, MAX_TEXT, MAX_TOTAL, readFile } from './files.js'
import { buildTasks, callGemini, countTokens, MODELS } from './gemini.js'

const SAVED = 'ae.review'
const ROWS_TOTAL = 54

const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function loadSaved() {
  try {
    return JSON.parse(localStorage.getItem(SAVED)) || null
  } catch {
    return null
  }
}

let state = {
  kb: null,
  main: null,
  annexes: [],
  extras: [],
  mode: 'full',
  sources: 'all',
  model: MODELS.full,
  date: today(),
  apiKey: '', // только в памяти вкладки
  phase: 'idle', // idle | running | paused | done
  results: loadSaved(), // последнее заключение; файлов после перезагрузки уже нет, продолжить его нельзя
  error: '',
  active: '',
  wait: null, // { until, reason }
  started: 0,
  now: 0,
}

// Вне состояния: то, что не должно вызывать перерисовку
const run = { controller: null, tasks: [], completed: new Set(), config: '', tokenEvents: [], inputEstimate: 0, tpmLimit: 0 }

const listeners = new Set()
function set(patch) {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}
const subscribe = (l) => (listeners.add(l), () => listeners.delete(l))
export const useReview = () => useSyncExternalStore(subscribe, () => state)

export async function loadKnowledge() {
  if (state.kb) return state.kb
  const kb = (await import('../data/review-kb.json')).default
  set({ kb })
  return kb
}

const busy = () => state.phase === 'running'
const canResume = () => state.phase === 'paused' && run.tasks.length > 0

// Любая правка исходных данных делает прежнее заключение неактуальным для продолжения
function edit(patch) {
  if (busy()) return
  set({ ...patch, error: '' })
}

export const setField = (name, value) => {
  if (name === 'mode') {
    const patch = { mode: value }
    if (Object.values(MODELS).includes(state.model)) patch.model = MODELS[value]
    return edit(patch)
  }
  if (name === 'apiKey' || name === 'model') return busy() || set({ [name]: value })
  edit({ [name]: value })
}

export function addFiles(kind, files) {
  if (busy() || !files.length) return
  const error = checkFiles(files)
  if (error) return set({ error })
  edit(kind === 'main' ? { main: files[0] } : { [kind]: [...state[kind], ...files] })
}

export function removeFile(kind, index) {
  edit(kind === 'main' ? { main: null } : { [kind]: state[kind].filter((_, i) => i !== index) })
}

export function stop() {
  run.controller?.abort()
}

// Убирает заключение и возвращает к форме; выбранные файлы и параметры остаются
export function discard() {
  if (busy()) return
  run.tasks = []
  run.completed = new Set()
  run.config = ''
  try {
    localStorage.removeItem(SAVED)
  } catch {}
  set({ results: null, phase: 'idle', error: '' })
}

function signature() {
  const f = (x) => [x.name, x.size, x.lastModified]
  return JSON.stringify({
    main: state.main && f(state.main),
    annexes: state.annexes.map(f),
    extras: state.extras.map(f),
    date: state.date,
    mode: state.mode,
    sources: state.sources,
  })
}

function publish(extra = {}) {
  const r = state.results
  const results = { ...r, rows: { ...r.rows }, outline: { ...r.outline }, steps: { done: run.completed.size, total: run.tasks.length } }
  try {
    localStorage.setItem(SAVED, JSON.stringify(results))
  } catch {
    // место в хранилище кончилось: заключение останется только в этой вкладке
  }
  set({ results, ...extra })
}

async function pause(seconds, reason) {
  const signal = run.controller.signal
  if (signal.aborted) throw new DOMException('Проверка остановлена', 'AbortError')
  set({ wait: { until: Date.now() + seconds * 1000, reason } })
  try {
    await new Promise((resolve, reject) => {
      const onAbort = () => {
        clearTimeout(timer)
        reject(new DOMException('Проверка остановлена', 'AbortError'))
      }
      const timer = setTimeout(() => {
        signal.removeEventListener('abort', onAbort)
        resolve()
      }, seconds * 1000)
      signal.addEventListener('abort', onAbort, { once: true })
    })
  } finally {
    set({ wait: null })
  }
}

// Не отправляем запрос, если вместе с недавними он превысит минутный лимит токенов
async function pace() {
  if (!run.tpmLimit || !run.inputEstimate || !run.tokenEvents.length) return
  const now = Date.now()
  run.tokenEvents = run.tokenEvents.filter((e) => now - e.at < 61_000)
  let used = run.tokenEvents.reduce((sum, e) => sum + e.tokens, 0)
  const expected = Math.ceil(run.inputEstimate * 1.12)
  if (expected >= run.tpmLimit) return
  for (const event of run.tokenEvents) {
    if (used + expected <= run.tpmLimit) break
    used -= event.tokens
    const delay = Math.ceil((event.at + 62_000 - Date.now()) / 1000)
    if (delay > 0) await pause(delay, 'Пауза из-за минутного лимита Gemini')
  }
}

async function runTask(task, docs) {
  const { kb } = state
  const signal = run.controller.signal
  set({ active: task.title })
  let result
  let measured = false
  const retries = { 429: 0, 503: 0 }
  for (;;) {
    await pace()
    const requestedAt = Date.now()
    try {
      result = await callGemini({ kb, task, docs, run: state.results, key: state.apiKey.trim(), model: state.model.trim(), signal })
      if (result.usedTokens > 0) {
        run.inputEstimate = Math.max(run.inputEstimate, result.usedTokens)
        run.tokenEvents.push({ at: requestedAt, tokens: result.usedTokens })
      }
      break
    } catch (err) {
      if (err.tpmLimit) run.tpmLimit = err.tpmLimit
      if (err.status === 429 && err.tpmLimit && !measured) {
        measured = true
        const estimated = await countTokens(err.measure, state.apiKey.trim(), signal)
        if (signal.aborted) throw new DOMException('Проверка остановлена', 'AbortError')
        if (estimated > 0) run.inputEstimate = Math.max(run.inputEstimate, estimated)
        if (estimated > err.tpmLimit * 1.01)
          throw new Error(
            `Один запрос занимает примерно ${estimated.toLocaleString('ru-RU')} токенов при лимите ${err.tpmLimit.toLocaleString('ru-RU')} в минуту. Ожидание не поможет: выберите источники «По связям», разделите ТЗ на части или используйте проект Gemini с большим лимитом.`,
          )
      }
      if ((err.status === 429 || err.status === 503) && err.retrySeconds > 0 && retries[err.status] < 3) {
        retries[err.status]++
        const delay = Math.min(120, Math.ceil(err.retrySeconds * (err.status === 503 ? 2 ** (retries[503] - 1) : 1) + 2))
        await pause(delay, err.status === 503 ? 'Gemini временно перегружен' : 'Достигнут минутный лимит Gemini')
        continue
      }
      if (err.status === 503) err.message += ' Можно подождать и продолжить или выбрать другую модель; готовые этапы сохранятся.'
      if (err.status === 429) err.message += ' Подождите и нажмите «Продолжить проверку»; если повторится, проверьте лимиты модели в Google AI Studio.'
      throw err
    }
  }
  if (signal.aborted) throw new DOMException('Проверка остановлена', 'AbortError')

  const r = state.results
  const model = state.model.trim()
  if (!r.models.includes(model)) r.models = [...r.models, model]
  if (task.kind === 'meta') r.meta = result.output
  else {
    // Если в ТЗ есть картинки, которые не прочитаны, «не имеется» утверждать нельзя
    if ([docs.main, ...docs.annexes].some((x) => x.images))
      for (const v of Object.values(result.output))
        if (v.status === 'Не имеется') {
          v.status = 'Не удалось проверить'
          v.comment += '\nВ ТЗ есть изображения, которые не извлечены; отсутствие сведений не подтверждено.'
        }
    Object.assign(task.kind === 'rows' ? r.rows : r.outline, result.output)
  }
  run.completed.add(task.key)
  publish()
}

export async function start() {
  if (busy()) return
  const kb = await loadKnowledge()
  const fail = (error) => set({ error })
  if (!state.main) return fail('Выберите файл технического задания.')
  if (!state.apiKey.trim()) return fail('Введите API-ключ Gemini.')
  if (!/^[a-zA-Z0-9._-]+$/.test(state.model.trim())) return fail('Проверьте название модели Gemini: допустимы латинские буквы, цифры, точка и дефис.')
  if (!state.date) return fail('Укажите дату проверки.')
  const all = [state.main, ...state.annexes, ...state.extras]
  if (all.reduce((s, f) => s + f.size, 0) > MAX_TOTAL) return fail('Общий размер выбранных файлов больше 15 МБ.')

  const config = signature()
  if (!canResume() || config !== run.config) {
    run.tasks = buildTasks(kb, state.mode)
    run.completed = new Set()
    run.config = config
    run.tokenEvents = []
    run.inputEstimate = 0
    run.tpmLimit = 0
    state.results = {
      rows: {},
      outline: {},
      meta: null,
      date: state.date,
      mode: state.mode,
      sources: state.sources,
      main: state.main.name,
      annexes: state.annexes.map((f) => f.name),
      extras: state.extras.map((f) => f.name),
      models: [],
      warnings: [],
    }
  }

  run.controller = new AbortController()
  publish({ phase: 'running', error: '', active: 'подготовка файлов', started: Date.now(), now: Date.now(), wait: null })
  const clock = setInterval(() => set({ now: Date.now() }), 1000)
  try {
    const [main, ...rest] = await Promise.all(all.map(readFile))
    const docs = { main, annexes: rest.slice(0, state.annexes.length), extras: rest.slice(state.annexes.length) }
    if ([main, ...rest].reduce((sum, x) => sum + (x.text?.length || 0), 0) > MAX_TEXT)
      throw new Error('Текст выбранных файлов слишком велик для одной проверки. Разделите ТЗ на части.')
    const withImages = [main, ...rest].filter((x) => x.images).map((x) => x.name)
    state.results.warnings = [
      ...(withImages.length
        ? [`Изображения, схемы или формулы в DOCX не извлечены: ${withImages.join(', ')}. Их содержимое нужно проверить отдельно.`]
        : []),
      ...(state.results.sources === 'graph'
        ? ['Стандарт и методика передавались выборочными фрагментами. Полнота проверки всех норм не подтверждена: отдельные требования могли не попасть в запрос.']
        : []),
    ]
    for (const task of run.tasks) {
      if (task.kind === 'meta' || run.completed.has(task.key)) continue
      await runTask(task, docs)
    }
    const meta = run.tasks.find((t) => t.kind === 'meta')
    if (!run.completed.has(meta.key)) await runTask(meta, docs)
    publish({ phase: 'done' })
  } catch (err) {
    publish({
      phase: 'paused',
      error: err.name === 'AbortError' ? 'Проверка остановлена. Готовые этапы сохранены, её можно продолжить.' : err.message,
    })
  } finally {
    clearInterval(clock)
    run.controller = null
    set({ active: '', wait: null })
  }
}

// Сводка по строкам формы для плиток и истории
export function summarize(results) {
  const rows = Object.values(results.rows)
  const yes = rows.filter((x) => x.status === 'Имеется').length
  const gaps = rows.filter((x) => x.status === 'Имеется частично' || x.status === 'Не имеется').length
  const steps = results.steps || { done: 0, total: 0 }
  return {
    processed: rows.length,
    total: ROWS_TOTAL,
    yes,
    gaps,
    open: ROWS_TOTAL - yes - gaps,
    complete: steps.total > 0 && steps.done === steps.total,
    steps,
  }
}

export const resumable = () => canResume()
