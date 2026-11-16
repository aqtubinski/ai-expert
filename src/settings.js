// Блоки отчёта. Админ может отключать их в админ-панели.
export const BLOCKS = [
  { id: 'summary', title: 'Краткое содержание', locked: true },
  { id: 'advice', title: 'Совет агента' },
  { id: 'tasks', title: 'Что сделать?', locked: true },
  { id: 'requirements', title: 'Требования и стек' },
  { id: 'timeline', title: 'Сроки и оценка' },
  { id: 'risks', title: 'Риски и неясности' },
]

const KEY = 'ae.blocks'
const RUNS = 'ae.runs'

export function loadBlocks() {
  const all = Object.fromEntries(BLOCKS.map((b) => [b.id, true]))
  try {
    return { ...all, ...JSON.parse(localStorage.getItem(KEY) || '{}') }
  } catch {
    return all
  }
}

export function saveBlocks(blocks) {
  localStorage.setItem(KEY, JSON.stringify(blocks))
}

export function getRuns() {
  return Number(localStorage.getItem(RUNS)) || 0
}

export function countRun() {
  localStorage.setItem(RUNS, String(getRuns() + 1))
}

// plural(3, ['задача', 'задачи', 'задач']) → 'задачи'
export function plural(n, forms) {
  const a = n % 10
  const b = n % 100
  if (a === 1 && b !== 11) return forms[0]
  if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return forms[1]
  return forms[2]
}

// ---------- История разборов: хранится в этом браузере ----------

const HISTORY = 'ae.history'
const HISTORY_MAX = 20

export function loadHistory() {
  try {
    const list = JSON.parse(localStorage.getItem(HISTORY) || '[]')
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

// Если место в хранилище кончилось, убираем самые старые разборы, пока не поместится
function saveHistory(list) {
  const next = list.slice(0, HISTORY_MAX)
  while (next.length) {
    try {
      localStorage.setItem(HISTORY, JSON.stringify(next))
      return
    } catch {
      next.pop()
    }
  }
  localStorage.removeItem(HISTORY)
}

export function addHistory(analysis) {
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  saveHistory([{ id, at: new Date().toISOString(), done: {}, analysis }, ...loadHistory()])
  return id
}

export const getHistoryEntry = (id) => loadHistory().find((e) => e.id === id) || null

export function saveHistoryDone(id, done) {
  saveHistory(loadHistory().map((e) => (e.id === id ? { ...e, done } : e)))
}

export function removeHistory(id) {
  saveHistory(loadHistory().filter((e) => e.id !== id))
}

export function clearHistory() {
  localStorage.removeItem(HISTORY)
}

export function useThemeToggle() {
  return (e) => {
    const root = document.documentElement
    const apply = () => {
      const next = root.dataset.theme === 'light' ? 'dark' : 'light'
      root.dataset.theme = next
      try {
        localStorage.setItem('ae.theme', next)
      } catch {}
    }
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!document.startViewTransition || still) return apply()

    // Новая тема расходится кругом от кнопки
    const box = e?.currentTarget?.getBoundingClientRect()
    const x = box ? box.left + box.width / 2 : innerWidth / 2
    const y = box ? box.top + box.height / 2 : 0
    const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y))
    document.startViewTransition(apply).ready.then(() =>
      root.animate(
        { clipPath: [`circle(0 at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
        { duration: 480, easing: 'ease-out', pseudoElement: '::view-transition-new(root)' },
      ),
    )
  }
}
