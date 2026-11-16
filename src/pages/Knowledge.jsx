import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { sourceState } from '../review/docx.js'
import { loadKnowledge, useReview } from '../review/store.js'

// Адрес в конце строки источника превращаем в ссылку
function Source({ text }) {
  const m = text.match(/^(.*?)\s*(https?:\/\/\S+)\s*$/s)
  if (!m) return text
  return (
    <>
      {m[1]}{' '}
      <a href={m[2]} target="_blank" rel="noreferrer">
        открыть на zan.gov.kz
      </a>
    </>
  )
}

function Fragments({ kb, document }) {
  return kb.fragments
    .filter((f) => f.document === document)
    .map((f) => (
      <details key={f.id} className="kb-fragment">
        <summary>{f.title}</summary>
        <p className="kb-text">{kb[document].slice(f.start, f.end)}</p>
      </details>
    ))
}

export default function Knowledge() {
  const { kb } = useReview()
  useEffect(() => {
    loadKnowledge()
  }, [])

  if (!kb)
    return (
      <div className="admin">
        <h1>База знаний</h1>
        <p className="admin-hint">Загружаю материалы…</p>
      </div>
    )

  const titles = Object.fromEntries(kb.fragments.map((f) => [f.id, f.title]))
  const count = (doc) => kb.fragments.filter((f) => f.document === doc).length

  return (
    <div className="admin kb">
      <h1>База знаний</h1>
      <p className="admin-hint">
        Материалы, по которым агент проводит <Link to="/review">экспертизу ТЗ</Link>. Это предоставленные копии
        документов: действующая редакция актов через интернет не проверяется.
      </p>

      <section className="admin-section">
        <h2>СТ РК 34.015-2002</h2>
        <p className="admin-hint">
          Стандарт на состав, содержание и оформление технического задания. {kb.standard.length.toLocaleString('ru-RU')} знаков,{' '}
          {count('standard')} фрагментов.
        </p>
        <div className="kb-list">
          <Fragments kb={kb} document="standard" />
        </div>
      </section>

      <section className="admin-section">
        <h2>Методика реинжиниринга бизнес-процессов</h2>
        <p className="admin-hint">
          Приказ № 512/НҚ от 26.12.2022. {kb.methodology.length.toLocaleString('ru-RU')} знаков, {count('methodology')} фрагментов.
          Рисунки и формулы в текст не попали.
        </p>
        <div className="kb-list">
          <Fragments kb={kb} document="methodology" />
        </div>
      </section>

      <section className="admin-section">
        <h2>Шаблон заключения</h2>
        <p className="admin-hint">
          {kb.sections.length} таблиц, {kb.sections.reduce((n, s) => n + s.rows.length, 0)} строки. По каждой строке агент ставит
          статус и пишет комментарий. Под таблицей указано, какие фрагменты источников с ней связаны: именно они уходят в
          запрос при выборе источников «По связям».
        </p>
        <div className="kb-list">
          {kb.sections.map((s) => (
            <details key={s.id} className="kb-fragment">
              <summary>
                {s.title} <em>{s.rows.length}</em>
              </summary>
              <ol className="kb-rows">
                {s.rows.map((r) => (
                  <li key={r.id}>{r.label}</li>
                ))}
              </ol>
              <p className="kb-links">
                Связанные фрагменты: {(kb.sectionSources[s.id] || []).map((id) => titles[id]).join('; ') || 'нет'}.
              </p>
            </details>
          ))}
        </div>
      </section>

      <section className="admin-section">
        <h2>Контрольное оглавление</h2>
        <p className="admin-hint">
          {kb.outline.length} пунктов и подпунктов. В полном режиме агент отдельно проверяет, есть ли каждый из них в ТЗ.
        </p>
        <details className="kb-fragment">
          <summary>Показать все пункты</summary>
          <ul className="kb-outline">
            {kb.outline.map((o) => (
              <li key={o.id}>{o.label}</li>
            ))}
          </ul>
        </details>
      </section>

      <section className="admin-section">
        <h2>Нормативные источники заключения</h2>
        <p className="admin-hint">
          Перечень из раздела 2 формы. Тексты большинства актов в базу не загружены: в заключении они помечаются как
          непроверенные. Нужную редакцию можно приложить к проверке как дополнительный источник.
        </p>
        <ol className="kb-sources">
          {kb.sourceList.map((s, i) => (
            <li key={i}>
              <Source text={s.replace(/^\d+\)\s*/, '')} /> <em>{sourceState(i)}</em>
            </li>
          ))}
        </ol>
      </section>

      <section className="admin-section">
        <h2>Инструкция агента</h2>
        <p className="admin-hint">Правила, по которым модель проводит проверку. Передаются ей в каждом запросе целиком.</p>
        <details className="kb-fragment">
          <summary>Показать инструкцию</summary>
          <p className="kb-text">{kb.agent}</p>
        </details>
      </section>
    </div>
  )
}
