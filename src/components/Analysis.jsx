import { useEffect, useMemo, useRef, useState } from 'react'
import { toMarkdown } from '../api/agent.js'
import { BLOCKS, loadBlocks, plural } from '../settings.js'

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

const STEPS = ['Читаю документ', 'Выделяю требования и сроки', 'Ищу неясные места']

function Ref({ n }) {
  return n ? <span className="ref">абз. {n}</span> : <span className="ref ref-none">нет в тексте</span>
}

const clock = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

const PRIOS = ['высокий', 'средний', 'низкий']

// Число набегает от нуля, когда отчёт открывается
function CountUp({ to }) {
  const [v, setV] = useState(reducedMotion() ? to : 0)
  useEffect(() => {
    if (reducedMotion()) {
      setV(to)
      return
    }
    let raf
    const t0 = performance.now()
    const tick = (t) => {
      const k = Math.min(1, (t - t0) / 700)
      setV(Math.round(to * (1 - (1 - k) ** 3)))
      if (k < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    const settle = setTimeout(() => setV(to), 900) // если вкладка в фоне и кадры не идут
    return () => (cancelAnimationFrame(raf), clearTimeout(settle))
  }, [to])
  return v
}

export default function Analysis({ analysis: a, reading, onDone, onCancel, onReset, initialDone, onDoneChange }) {
  const [waited, setWaited] = useState(0)
  const total = a.paragraphs.length
  const [readCount, setReadCount] = useState(reading ? 0 : total)
  const [active, setActive] = useState(null)
  const [pane, setPane] = useState('out')
  const [done, setDone] = useState(initialDone || {})
  const toggleDone = (id) => {
    const next = { ...done, [id]: !done[id] }
    setDone(next)
    onDoneChange?.(next)
  }
  const [copied, setCopied] = useState(false)
  const [prio, setPrio] = useState(null)
  const docRef = useRef(null)
  const blocks = useMemo(loadBlocks, [])

  // Прогон «чтения»: абзацы проявляются по очереди, затем открываются выводы
  useEffect(() => {
    if (!reading) return
    if (reducedMotion()) {
      setReadCount(total)
      const t = setTimeout(onDone, 300)
      return () => clearTimeout(t)
    }
    const step = Math.min(160, Math.max(45, 2800 / total))
    const timer = setInterval(() => setReadCount((c) => Math.min(total, c + 1)), step)
    return () => clearInterval(timer)
  }, [reading, total]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!reading || reducedMotion()) return
    if (readCount >= total) {
      const t = setTimeout(() => {
        docRef.current?.scrollTo({ top: 0 })
        onDone()
      }, 450)
      return () => clearTimeout(t)
    }
    docRef.current?.querySelector(`[data-n="${readCount + 1}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [readCount, reading, total]) // eslint-disable-line react-hooks/exhaustive-deps

  // Чтение закончено, а модель ещё думает: считаем время ожидания
  const waiting = reading && readCount >= total
  useEffect(() => {
    if (!waiting) return
    const t = setInterval(() => setWaited((s) => s + 1), 1000)
    return () => clearInterval(t)
  }, [waiting])

  const cited = useMemo(() => {
    const set = new Set()
    if (!a.tasks) return set
    for (const list of [a.summary, a.tasks, a.requirements.nonfunctional, a.requirements.stack, a.timeline, a.risks])
      for (const x of list) if (x.ref) set.add(x.ref)
    return set
  }, [a])

  const show = (ref) => {
    if (!ref) return
    setActive(ref)
    setPane('doc')
    requestAnimationFrame(() =>
      docRef.current
        ?.querySelector(`[data-n="${ref}"]`)
        ?.scrollIntoView({ block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' }),
    )
  }

  const jump = (n) => {
    if (cited.has(n)) setActive(n)
    docRef.current
      ?.querySelector(`[data-n="${n}"]`)
      ?.scrollIntoView({ block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' })
  }

  const copy = async () => {
    await navigator.clipboard.writeText(toMarkdown(a, blocks))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const download = () => {
    const url = URL.createObjectURL(new Blob([toMarkdown(a, blocks)], { type: 'text/markdown;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `${a.title.replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 60) || 'Разбор ТЗ'}.md`
    link.click()
    URL.revokeObjectURL(url)
  }

  const tasks = a.tasks || []
  const doneCount = tasks.filter((x) => done[x.id]).length
  const shownTasks = prio ? tasks.filter((x) => x.priority === prio) : tasks
  const tiles = a.tasks
    ? [
        { n: tasks.length, label: plural(tasks.length, ['задача', 'задачи', 'задач']), href: '#b-tasks' },
        blocks.risks && {
          n: a.risks.length,
          label: plural(a.risks.length, ['неясное место', 'неясных места', 'неясных мест']),
          href: '#b-risks',
        },
        blocks.timeline && {
          n: a.estimate.hours,
          label: `${plural(a.estimate.hours, ['час', 'часа', 'часов'])} по оценке`,
          href: '#b-timeline',
        },
        { n: cited.size, tail: ` из ${total}`, label: 'абзацев дали выводы' },
      ].filter(Boolean)
    : []

  const item = (x, body) => (
    <li key={x.id ?? x.name} className={`finding${active && x.ref === active ? ' is-linked' : ''}`}>
      <button className="finding-btn" onClick={() => show(x.ref)} disabled={!x.ref} title={x.ref ? 'Показать в тексте ТЗ' : undefined}>
        <span className="finding-body">{body}</span>
        <Ref n={x.ref} />
      </button>
    </li>
  )

  const stepIndex = Math.min(STEPS.length - 1, Math.floor((readCount / Math.max(1, total)) * STEPS.length))
  const visible = BLOCKS.filter((b) => blocks[b.id] && (b.id !== 'advice' || a.advice))

  return (
    <div className="analysis" data-pane={pane}>
      <div className="pane-switch" role="tablist" aria-label="Что показать">
        <button role="tab" aria-selected={pane === 'doc'} onClick={() => setPane('doc')}>
          Текст ТЗ
        </button>
        <button role="tab" aria-selected={pane === 'out'} onClick={() => setPane('out')}>
          Выводы
        </button>
      </div>

      <div className="doc-wrap">
      <div className="minimap" aria-hidden="true">
        {a.paragraphs.map((p) => (
          <button
            key={p.n}
            tabIndex={-1}
            title={`Абзац ${p.n}`}
            className={[cited.has(p.n) && !reading && 'is-cited', active === p.n && 'is-active', p.n > readCount && 'is-unread']
              .filter(Boolean)
              .join(' ')}
            onClick={() => !reading && jump(p.n)}
          />
        ))}
      </div>
      <article className="doc" ref={docRef} aria-label="Текст ТЗ">
        <p className="doc-source">{a.sourceName}</p>
        {a.paragraphs.map((p) => (
          <div
            key={p.n}
            data-n={p.n}
            className={[
              'para',
              p.heading && 'para-heading',
              p.n > readCount && 'is-unread',
              reading && p.n === readCount && 'is-current',
              active === p.n && 'is-active',
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={() => !reading && cited.has(p.n) && setActive(active === p.n ? null : p.n)}
          >
            <span className="para-n" aria-hidden="true">
              {p.n}
              {!reading && cited.has(p.n) && <i className="para-mark" />}
            </span>
            <p>{p.text}</p>
          </div>
        ))}
      </article>
      </div>

      <aside className="out" aria-label="Выводы агента">
        {reading ? (
          <div className="reading" role="status">
            <h2>{waiting ? 'Формирую выводы' : STEPS[stepIndex]}</h2>
            <p className="reading-count">
              {waiting && waited >= 2
                ? `Модель думает ${clock(waited)}. Локальной модели нужно от одной до нескольких минут.`
                : `Прочитано ${readCount} из ${total} абзацев`}
            </p>
            <div className="reading-bar">
              <i style={{ width: `${(readCount / Math.max(1, total)) * 100}%` }} />
            </div>
            <ol className="reading-steps">
              {STEPS.map((s, i) => (
                <li key={s} className={i < stepIndex ? 'is-done' : i === stepIndex ? 'is-now' : ''}>
                  {s}
                </li>
              ))}
            </ol>
            <button className="btn btn-small reading-cancel" onClick={onCancel}>
              Отменить
            </button>
          </div>
        ) : (
          <>
            <header className="out-head">
              <h1>{a.title}</h1>
              <p className="demo-note">
                {a.mode === 'ai'
                  ? `Разбор сделала локальная модель ${a.modeNote}. Она может ошибаться: сверяйте выводы с абзацами по ссылкам.`
                  : `Демо-режим: ${a.modeNote}. Выводы собраны простыми правилами по тексту, без ИИ.`}
              </p>
              <ul className="tiles">
                {tiles.map((t) => {
                  const body = (
                    <>
                      <strong>
                        <CountUp to={t.n} />
                        {t.tail}
                      </strong>
                      <span>{t.label}</span>
                    </>
                  )
                  return <li key={t.label}>{t.href ? <a href={t.href}>{body}</a> : <div>{body}</div>}</li>
                })}
              </ul>
              <div className="out-actions">
                <button className="btn btn-small" onClick={copy}>
                  {copied ? 'Скопировано' : 'Скопировать отчёт'}
                </button>
                <button className="btn btn-small" onClick={download}>
                  Скачать .md
                </button>
                <button className="btn btn-small" onClick={onReset}>
                  Новый разбор
                </button>
              </div>
              <nav className="out-nav" aria-label="Блоки отчёта">
                {visible.map((b) => (
                  <a key={b.id} href={`#b-${b.id}`}>
                    {b.title}
                  </a>
                ))}
              </nav>
            </header>

            {blocks.summary && (
              <section id="b-summary" className="block">
                <h2>Краткое содержание</h2>
                <ul className="findings">{a.summary.map((x) => item(x, x.text))}</ul>
                <p className="block-meta">
                  В документе заголовков: {a.counts.sections}, абзацев: {a.counts.paragraphs}.
                </p>
              </section>
            )}

            {blocks.advice && a.advice && (
              <section id="b-advice" className="block advice">
                <h2>Совет агента</h2>
                <p className="advice-verdict">{a.advice.verdict}</p>
                <p className="advice-text">{a.advice.text}</p>
                {a.advice.steps.length > 0 && (
                  <>
                    <h3>Что делать дальше, по порядку</h3>
                    <ol className="advice-steps">
                      {a.advice.steps.map((s) => (
                        <li key={s}>{s}</li>
                      ))}
                    </ol>
                  </>
                )}
                {a.mode !== 'ai' && (
                  <p className="advice-note">
                    В демо-режиме совет собран по правилам из найденных задач и пробелов. Модель напишет его по
                    содержанию ТЗ.
                  </p>
                )}
              </section>
            )}

            {blocks.tasks && (
              <section id="b-tasks" className="block">
                <h2>
                  Что сделать? <span className="count">{a.tasks.length}</span>
                </h2>
                {a.tasks.length > 0 && (
                  <div className="task-tools">
                    <div className="filters" role="group" aria-label="Показать задачи с приоритетом">
                      <button aria-pressed={!prio} onClick={() => setPrio(null)}>
                        Все <span>{tasks.length}</span>
                      </button>
                      {PRIOS.map((p) => {
                        const n = tasks.filter((x) => x.priority === p).length
                        return (
                          n > 0 && (
                            <button key={p} aria-pressed={prio === p} onClick={() => setPrio(prio === p ? null : p)}>
                              {p} <span>{n}</span>
                            </button>
                          )
                        )
                      })}
                    </div>
                    <p className="progress-text">
                      Сделано {doneCount} из {tasks.length}
                    </p>
                    <div className="progress">
                      <i style={{ width: `${(doneCount / tasks.length) * 100}%` }} />
                    </div>
                  </div>
                )}
                {a.tasks.length ? (
                  <ul className="findings">
                    {shownTasks.map((x) => (
                      <li key={x.id} className={`finding finding-task${active === x.ref ? ' is-linked' : ''}${done[x.id] ? ' is-checked' : ''}`}>
                        <input
                          type="checkbox"
                          checked={!!done[x.id]}
                          onChange={() => toggleDone(x.id)}
                          aria-label={`Отметить выполненным: ${x.text}`}
                        />
                        <button className="finding-btn" onClick={() => show(x.ref)} title="Показать в тексте ТЗ">
                          <span className="finding-body">
                            {x.text}
                            <span className="finding-sub">приоритет {x.priority}</span>
                          </span>
                          <Ref n={x.ref} />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="empty">
                    В тексте нет формулировок-требований («должен», «необходимо», «реализовать»). Проверьте, что
                    загружено именно ТЗ.
                  </p>
                )}
              </section>
            )}

            {blocks.requirements && (
              <section id="b-requirements" className="block">
                <h2>Требования и стек</h2>
                <h3>Нефункциональные требования</h3>
                {a.requirements.nonfunctional.length ? (
                  <ul className="findings">{a.requirements.nonfunctional.map((x) => item(x, x.text))}</ul>
                ) : (
                  <p className="empty">Требований к скорости, нагрузке и безопасности в ТЗ нет. Стоит уточнить.</p>
                )}
                <h3>Технологии, названные в ТЗ</h3>
                {a.requirements.stack.length ? (
                  <ul className="chips">
                    {a.requirements.stack.map((x) => (
                      <li key={x.name}>
                        <button className={`chip${active === x.ref ? ' is-linked' : ''}`} onClick={() => show(x.ref)}>
                          {x.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="empty">Стек в ТЗ не задан: выбор технологий остаётся за исполнителем.</p>
                )}
              </section>
            )}

            {blocks.timeline && (
              <section id="b-timeline" className="block">
                <h2>Сроки и оценка</h2>
                {a.timeline.length ? (
                  <ul className="findings">{a.timeline.map((x) => item(x, x.text))}</ul>
                ) : (
                  <p className="empty">Сроки и этапы в ТЗ не указаны.</p>
                )}
                <p className="estimate">
                  <strong>{a.estimate.hours} ч</strong>
                  <span>{a.estimate.note}</span>
                </p>
              </section>
            )}

            {blocks.risks && (
              <section id="b-risks" className="block">
                <h2>
                  Риски и неясности <span className="count">{a.risks.length}</span>
                </h2>
                {a.risks.length ? (
                  <ul className="findings">
                    {a.risks.map((x) =>
                      item(
                        x,
                        <>
                          {x.note}
                          {x.quote && <span className="finding-quote">«{x.quote}»</span>}
                        </>,
                      ),
                    )}
                  </ul>
                ) : (
                  <p className="empty">Размытых формулировок не найдено.</p>
                )}
              </section>
            )}
          </>
        )}
      </aside>
    </div>
  )
}
