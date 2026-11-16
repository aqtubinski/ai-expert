import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { buildDocx, NOT_DONE, sourceState, STANDING_LIMITS } from '../review/docx.js'
import { ACCEPT, fileSize } from '../review/files.js'
import { buildTasks } from '../review/gemini.js'
import { addFiles, discard, loadKnowledge, removeFile, resumable, setField, start, stop, summarize, useReview } from '../review/store.js'

const MODE_HINT = {
  full: 'Проверяются 54 строки формы и отдельно все 113 пунктов контрольного оглавления.',
  quick: 'Только 54 строки формы. Оглавление отдельно не проверяется, комментарии короче.',
}
const SOURCE_HINT = {
  all: 'В каждом запросе уходит полный текст стандарта и методики. Точнее, но расходует больше токенов.',
  graph: 'В запрос попадают только фрагменты, связанные с проверяемым разделом. Дешевле, но полнота проверки всех норм не подтверждается.',
}

function FileRow({ file, note, onRemove, locked }) {
  return (
    <li className="rv-file">
      <span className="rv-file-name">{file.name}</span>
      <span className="rv-file-meta">
        {note ? `${note}, ` : ''}
        {fileSize(file)}
      </span>
      <button className="btn btn-small" onClick={onRemove} disabled={locked} aria-label={`Убрать файл ${file.name}`}>
        Убрать
      </button>
    </li>
  )
}

function ExtraFiles({ kind, title, hint, files }) {
  const input = useRef(null)
  return (
    <div className="rv-extra">
      <div className="rv-extra-head">
        <div>
          <strong>{title}</strong>
          <span>{hint}</span>
        </div>
        <input
          ref={input}
          type="file"
          accept={ACCEPT}
          multiple
          hidden
          onChange={(e) => (addFiles(kind, [...e.target.files]), (e.target.value = ''))}
        />
        <button className="btn btn-small" onClick={() => input.current.click()}>
          Добавить
        </button>
      </div>
      {files.length > 0 && (
        <ul className="rv-files">
          {files.map((f, i) => (
            <FileRow key={`${f.name}-${i}`} file={f} onRemove={() => removeFile(kind, i)} />
          ))}
        </ul>
      )}
    </div>
  )
}

function Form({ s }) {
  const input = useRef(null)
  const [dragging, setDragging] = useState(false)
  const [showKey, setShowKey] = useState(false)
  const requests = s.kb ? buildTasks(s.kb, s.mode).length : null

  return (
    <div className="intake">
      <div className="intake-lead">
        <h1>Соответствует ли ТЗ стандарту</h1>
        <p>
          Загрузите техническое задание на информационную систему. Агент сверит его со стандартом СТ РК 34.015-2002
          и методикой реинжиниринга и составит проект заключения по утверждённой форме: статус и комментарий к
          каждой строке.
        </p>
        <dl className="rv-basis">
          <div>
            <dt>СТ РК 34.015-2002</dt>
            <dd>состав и содержание ТЗ</dd>
          </div>
          <div>
            <dt>Методика реинжиниринга № 512/НҚ</dt>
            <dd>бизнес-процессы и BPMN</dd>
          </div>
          <div>
            <dt>Шаблон заключения</dt>
            <dd>10 таблиц, 54 строки</dd>
          </div>
          <div>
            <dt>Контрольное оглавление</dt>
            <dd>113 пунктов</dd>
          </div>
        </dl>
        <p className="rv-basis-link">
          <Link to="/knowledge">Открыть базу знаний</Link>
        </p>
      </div>

      <div className="intake-panel">
        <input
          ref={input}
          type="file"
          accept={ACCEPT}
          hidden
          onChange={(e) => (addFiles('main', [...e.target.files]), (e.target.value = ''))}
        />
        {s.main ? (
          <ul className="rv-files rv-files-main">
            <FileRow file={s.main} note="основное ТЗ" onRemove={() => removeFile('main')} />
          </ul>
        ) : (
          <button
            className={`rv-drop${dragging ? ' is-dragging' : ''}`}
            onClick={() => input.current.click()}
            onDragOver={(e) => (e.preventDefault(), setDragging(true))}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragging(false)
              addFiles('main', [...e.dataTransfer.files].slice(0, 1))
            }}
          >
            <strong>Выберите файл ТЗ или перетащите его сюда</strong>
            <span>DOCX, PDF, TXT или MD, до 8 МБ</span>
          </button>
        )}

        <ExtraFiles kind="annexes" title="Приложения к ТЗ" hint="Файлы, которые относятся к проверяемому ТЗ" files={s.annexes} />
        <ExtraFiles
          kind="extras"
          title="Дополнительные источники"
          hint="Редакции нормативных актов для этой проверки"
          files={s.extras}
        />

        <div className="rv-fields">
          <label className="field">
            <span>Режим проверки</span>
            <select value={s.mode} onChange={(e) => setField('mode', e.target.value)}>
              <option value="full">Полный</option>
              <option value="quick">Быстрый</option>
            </select>
            <small>{MODE_HINT[s.mode]}</small>
          </label>
          <label className="field">
            <span>Источники в запросах</span>
            <select value={s.sources} onChange={(e) => setField('sources', e.target.value)}>
              <option value="all">Все источники</option>
              <option value="graph">По связям</option>
            </select>
            <small>{SOURCE_HINT[s.sources]}</small>
          </label>
          <label className="field rv-key">
            <span>API-ключ Gemini</span>
            <span className="rv-key-row">
              <input
                type={showKey ? 'text' : 'password'}
                value={s.apiKey}
                onChange={(e) => setField('apiKey', e.target.value)}
                autoComplete="off"
                spellCheck={false}
              />
              <button type="button" className="btn btn-small" onClick={() => setShowKey(!showKey)}>
                {showKey ? 'Скрыть' : 'Показать'}
              </button>
            </span>
            <small>Ключ остаётся в памяти этой вкладки: сайт его не сохраняет и на свой сервер не передаёт.</small>
          </label>
          <label className="field">
            <span>Модель</span>
            <input value={s.model} onChange={(e) => setField('model', e.target.value)} spellCheck={false} />
          </label>
          <label className="field">
            <span>Дата проверки</span>
            <input type="date" value={s.date} onChange={(e) => setField('date', e.target.value)} />
          </label>
        </div>

        {s.error && (
          <p className="form-error" role="alert">
            {s.error}
          </p>
        )}

        <div className="intake-actions">
          <span className="rv-requests">{requests ? `${requests} запросов к Gemini, по одному` : 'Загружаю базу знаний…'}</span>
          <button className="btn btn-solid" onClick={start} disabled={!s.kb}>
            Начать проверку
          </button>
        </div>

        <p className="intake-legal">
          В этом режиме ТЗ, приложения и база знаний отправляются из вашего браузера в Google Gemini. На бесплатном
          тарифе Google может использовать данные для улучшения своих сервисов.{' '}
          <Link to="/legal/agent">Что происходит с вашим ТЗ</Link>
        </p>
      </div>
    </div>
  )
}

// ---------- Заключение ----------

const GAPS = ['Имеется частично', 'Не имеется']
const pillClass = (status) => (status === 'Имеется' ? 'is-ok' : GAPS.includes(status) ? 'is-gap' : 'is-open')
const FILTERS = [
  { id: 'all', label: 'Все', test: () => true },
  { id: 'gap', label: 'С замечаниями', test: (v) => GAPS.includes(v.status) },
  { id: 'open', label: 'Не проверено и уточнить', test: (v) => v.status !== 'Имеется' && !GAPS.includes(v.status) },
]

function ResultTable({ rows, map, filter }) {
  const shown = rows.map((row) => ({ row, v: map[row.id] || NOT_DONE })).filter(({ v }) => filter.test(v))
  if (!shown.length) return <p className="rv-none">В этой таблице таких строк нет.</p>
  return (
    <div className="table-wrap">
      <table className="rv-table">
        <thead>
          <tr>
            <th>Наименование пункта</th>
            <th>Статус</th>
            <th>Комментарий</th>
          </tr>
        </thead>
        <tbody>
          {shown.map(({ row, v }) => (
            <tr key={row.id}>
              <td>{row.label}</td>
              <td>
                <span className={`rv-pill ${pillClass(v.status)}`}>{v.status}</span>
              </td>
              <td>{v.comment}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Section({ title, count, open, children }) {
  return (
    <details className="rv-section" open={open}>
      <summary>
        <span>{title}</span>
        {count && <span className="rv-count">{count}</span>}
      </summary>
      <div className="rv-body">{children}</div>
    </details>
  )
}

function RunStrip({ s, sum }) {
  const { steps } = sum
  if (s.phase === 'running') {
    const left = s.wait ? Math.max(0, Math.ceil((s.wait.until - s.now) / 1000)) : 0
    return (
      <div className="rv-run" role="status">
        <div className="rv-run-top">
          <strong>Проверка: {s.active || 'обработка результата'}</strong>
          <span>
            {steps.done} из {steps.total} этапов
          </span>
        </div>
        <div className="progress">
          <i style={{ width: `${steps.total ? (100 * steps.done) / steps.total : 0}%` }} />
        </div>
        <p>
          {s.wait
            ? `${s.wait.reason}. Повторим автоматически через ${left} с. Готовые этапы сохранены.`
            : `Идёт ${Math.floor((s.now - s.started) / 1000)} с. На один запрос отведено до 90 секунд. Можно перейти на другую страницу сайта: проверка продолжится.`}
        </p>
        <button className="btn btn-small" onClick={stop}>
          Остановить проверку
        </button>
      </div>
    )
  }
  if (sum.complete) return null
  if (!resumable())
    return (
      <div className="rv-run" role="status">
        <strong>Проверка не была завершена</strong>
        <p>
          Выполнено этапов: {steps.done} из {steps.total}. Продолжить её нельзя: после перезагрузки страницы выбранные
          файлы не сохраняются. Запустите новую проверку.
        </p>
      </div>
    )
  return (
    <div className="rv-run" role="alert">
      <div className="rv-run-top">
        <strong>Проверка приостановлена</strong>
        <span>
          {steps.done} из {steps.total} этапов
        </span>
      </div>
      <p>{s.error}</p>
      <div className="rv-resume">
        <label className="field">
          <span>Модель</span>
          <input value={s.model} onChange={(e) => setField('model', e.target.value)} spellCheck={false} />
        </label>
        <label className="field">
          <span>API-ключ Gemini</span>
          <input type="password" value={s.apiKey} onChange={(e) => setField('apiKey', e.target.value)} autoComplete="off" />
        </label>
        <button className="btn btn-solid" onClick={start}>
          Продолжить проверку
        </button>
      </div>
    </div>
  )
}

const Report = memo(function Report({ kb, r, filter }) {
  const meta = r.meta || {}
  const quick = r.mode === 'quick'
  const warnings = [
    ...(quick ? ['Быстрая проверка: 113 пунктов контрольного оглавления отдельно не проверялись.'] : []),
    ...STANDING_LIMITS,
    ...r.warnings,
  ]
  return (
    <>
      <Section title="Выводы и рекомендации" open>
        <p className="rv-text">{meta.conclusion || 'Итоговый вывод не сформирован: проверка не завершена.'}</p>
      </Section>

      {kb.sections.map((sec) => (
        <Section key={sec.id} title={sec.title} count={`${sec.rows.filter((x) => r.rows[x.id]).length} из ${sec.rows.length}`}>
          <ResultTable rows={sec.rows} map={r.rows} filter={filter} />
        </Section>
      ))}

      <Section title="1–3. Документы и сокращения">
        <h3>Документы, представленные на рассмотрение</h3>
        <p className="rv-text">
          {r.main}
          {r.annexes.length ? `. Приложения: ${r.annexes.join(', ')}` : ''}. {meta.description || 'Реквизиты и полнота комплекта требуют уточнения.'}
        </p>
        <h3>Документы, принятые во внимание</h3>
        <ol className="rv-sources">
          {kb.sourceList.map((src, i) => (
            <li key={i}>
              {src} <em>{sourceState(i)}</em>
            </li>
          ))}
        </ol>
        {r.extras.length > 0 && (
          <p className="rv-text">
            Дополнительные загруженные источники: {r.extras.join(', ')}. Их применимость и редакция требуют подтверждения.
          </p>
        )}
        <h3>Используемые сокращения</h3>
        <p className="rv-text">{meta.abbreviations || 'Не определены.'}</p>
      </Section>

      <Section title="Приложение А. Дополнительные пункты">
        <p className="rv-text">{meta.extras || 'Не проверено.'}</p>
      </Section>
      <Section
        title="Приложение Б. Контрольное оглавление"
        count={quick ? 'не проверялось' : `${Object.keys(r.outline).length} из ${kb.outline.length}`}
      >
        {quick ? (
          <p className="rv-text">Быстрый режим: отдельная проверка 113 пунктов оглавления не проводилась. Для неё запустите полный режим.</p>
        ) : (
          <ResultTable rows={kb.outline} map={r.outline} filter={filter} />
        )}
      </Section>
      <Section title="Приложение В. Дополнительные проверки и ограничения">
        <p className="rv-text">{meta.outside || 'Дополнительные проверки не завершены.'}</p>
        {meta.limitations && <p className="rv-text">{meta.limitations}</p>}
        <ul className="rv-limits">
          {warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      </Section>
    </>
  )
})

function Conclusion({ s }) {
  const r = s.results
  const sum = useMemo(() => summarize(r), [r])
  const [filterId, setFilterId] = useState('all')
  const filter = FILTERS.find((f) => f.id === filterId)
  const [saving, setSaving] = useState(false)

  const download = async () => {
    setSaving(true)
    try {
      const blob = await buildDocx(s.kb, r, sum.complete)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'Заключение_проект.docx'
      document.body.append(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 3000)
    } finally {
      setSaving(false)
    }
  }

  const restart = () => {
    if (!sum.complete || window.confirm('Убрать это заключение и начать новую проверку? Несохранённый DOCX вернуть будет нельзя.')) discard()
  }

  return (
    <div className="review">
      <p className="rv-tag">
        {sum.complete ? 'Проект для проверки специалистом' : 'Проверка не завершена'}, {r.mode === 'quick' ? 'быстрый' : 'полный'} режим
      </p>
      <h1>{r.meta?.title || `Заключение по файлу «${r.main}»`}</h1>
      <p className="admin-hint">
        {r.main}, дата проверки {r.date}. Модели: {r.models.join(', ') || 'пока не определены'}.
      </p>
      <div className="out-actions">
        <button className="btn btn-solid" onClick={download} disabled={!s.kb || saving}>
          {saving ? 'Готовлю файл…' : 'Скачать DOCX'}
        </button>
        <button className="btn" onClick={restart} disabled={s.phase === 'running'}>
          Новая проверка
        </button>
      </div>

      <RunStrip s={s} sum={sum} />

      <ul className="tiles">
        <li>
          <div>
            <strong>
              {sum.processed}/{sum.total}
            </strong>
            <span>строк формы обработано</span>
          </div>
        </li>
        <li>
          <div>
            <strong>{sum.yes}</strong>
            <span>имеется по оценке модели</span>
          </div>
        </li>
        <li>
          <div>
            <strong>{sum.gaps}</strong>
            <span>частично или не имеется</span>
          </div>
        </li>
        <li>
          <div>
            <strong>{sum.open}</strong>
            <span>не проверено, уточнить, не применимо</span>
          </div>
        </li>
      </ul>

      <div className="filters rv-filters" role="group" aria-label="Какие строки показывать в таблицах">
        {FILTERS.map((f) => (
          <button key={f.id} aria-pressed={f.id === filterId} onClick={() => setFilterId(f.id)}>
            {f.label}
          </button>
        ))}
      </div>

      {s.kb ? <Report kb={s.kb} r={r} filter={filter} /> : <p className="rv-none">Загружаю базу знаний…</p>}
    </div>
  )
}

export default function Review() {
  const s = useReview()
  useEffect(() => {
    loadKnowledge()
  }, [])
  return s.results ? <Conclusion s={s} /> : <Form s={s} />
}
