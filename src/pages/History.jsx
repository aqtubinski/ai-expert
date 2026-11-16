import { useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import Analysis from '../components/Analysis.jsx'
import { clearHistory, getHistoryEntry, loadHistory, plural, removeHistory, saveHistoryDone } from '../settings.js'

const when = (iso) =>
  new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })

// Один сохранённый разбор: тот же отчёт, без повторного чтения
export function HistoryEntry() {
  const { id } = useParams()
  const navigate = useNavigate()
  const entry = getHistoryEntry(id)
  if (!entry) return <Navigate to="/history" replace />
  return (
    <Analysis
      key={id}
      analysis={entry.analysis}
      reading={false}
      initialDone={entry.done}
      onDoneChange={(done) => saveHistoryDone(id, done)}
      onReset={() => navigate('/')}
    />
  )
}

export default function History() {
  const [list, setList] = useState(loadHistory)

  const remove = (e) => {
    if (!window.confirm(`Удалить разбор «${e.analysis.title}»? Вернуть его будет нельзя.`)) return
    removeHistory(e.id)
    setList(loadHistory())
  }

  const clear = () => {
    if (!window.confirm(`Удалить всю историю (${list.length})? Вернуть разборы будет нельзя.`)) return
    clearHistory()
    setList([])
  }

  return (
    <div className="admin history">
      <h1>История разборов</h1>
      <p className="admin-hint">
        Разборы хранятся только в этом браузере, последние 20. В другом браузере или после очистки данных сайта
        их не будет.
      </p>

      {list.length === 0 ? (
        <div className="history-empty">
          <p>Здесь появится каждое ТЗ, которое вы разберёте, вместе с отчётом и отметками о сделанных задачах.</p>
          <Link className="btn btn-solid" to="/">
            Разобрать первое ТЗ
          </Link>
        </div>
      ) : (
        <>
          <ul className="history-list">
            {list.map((e) => {
              const a = e.analysis
              const doneCount = a.tasks.filter((t) => e.done?.[t.id]).length
              return (
                <li key={e.id}>
                  <Link to={`/history/${e.id}`} className="history-row">
                    <span className="history-title">{a.title}</span>
                    <span className="history-meta">
                      {when(e.at)}, {a.mode === 'ai' ? `модель ${a.modeNote}` : 'демо-режим'}
                      {a.advice && <b>{a.advice.verdict}</b>}
                    </span>
                    <span className="history-meta">
                      {a.tasks.length} {plural(a.tasks.length, ['задача', 'задачи', 'задач'])}, сделано {doneCount};{' '}
                      {a.risks.length} {plural(a.risks.length, ['неясное место', 'неясных места', 'неясных мест'])}
                    </span>
                    <span className="history-bar">
                      <i style={{ width: `${a.tasks.length ? (doneCount / a.tasks.length) * 100 : 0}%` }} />
                    </span>
                  </Link>
                  <button className="btn btn-small" onClick={() => remove(e)} aria-label={`Удалить разбор «${a.title}»`}>
                    Удалить
                  </button>
                </li>
              )
            })}
          </ul>
          <button className="btn btn-ghost history-clear" onClick={clear}>
            Удалить всю историю
          </button>
        </>
      )}
    </div>
  )
}
