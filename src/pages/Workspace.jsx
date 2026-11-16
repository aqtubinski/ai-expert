import { useDeferredValue, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { analyzeSpec, extractFile, prescan, splitParagraphs } from '../api/agent.js'
import Analysis from '../components/Analysis.jsx'
import LinkDemo from '../components/LinkDemo.jsx'
import { SAMPLE_NAME, SAMPLE_SPEC } from '../data/sampleSpec.js'
import { addHistory, countRun, saveHistoryDone } from '../settings.js'

const MIN_CHARS = 80

export default function Workspace() {
  const [running, setRunning] = useState(false)
  const [animDone, setAnimDone] = useState(false)
  const [ready, setReady] = useState(false)
  const [text, setText] = useState('')
  const [sourceName, setSourceName] = useState('')
  const [error, setError] = useState('')
  const [dragging, setDragging] = useState(false)
  const [loadingFile, setLoadingFile] = useState(false)
  const [analysis, setAnalysis] = useState(null)
  const fileInput = useRef(null)
  const abort = useRef(null)
  const historyId = useRef(null)
  const deferredText = useDeferredValue(text)
  const scan = useMemo(() => prescan(deferredText), [deferredText])

  const readFile = async (file) => {
    if (!file) return
    setError('')
    setLoadingFile(true)
    try {
      const isPlain = file.type.startsWith('text/') || /\.(txt|md)$/i.test(file.name)
      setText(isPlain ? await file.text() : await extractFile(file))
      setSourceName(file.name)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoadingFile(false)
    }
  }

  const start = async () => {
    const base = { sourceName: sourceName || 'Вставленный текст', paragraphs: splitParagraphs(text) }
    setAnalysis(base)
    setAnimDone(false)
    setReady(false)
    setRunning(true)
    abort.current = new AbortController()
    try {
      const result = await analyzeSpec(text, base, abort.current.signal)
      setAnalysis(result)
      historyId.current = addHistory(result)
      setReady(true)
      countRun()
    } catch {
      // отменено пользователем: возвращаемся к вводу, текст сохраняется
    }
  }

  const cancel = () => {
    abort.current?.abort()
    setRunning(false)
    setAnalysis(null)
  }

  const reset = () => {
    cancel()
    setText('')
    setSourceName('')
  }

  if (running)
    return (
      <Analysis
        analysis={analysis}
        reading={!(animDone && ready)}
        onDone={() => setAnimDone(true)}
        onCancel={cancel}
        onReset={reset}
        onDoneChange={(done) => historyId.current && saveHistoryDone(historyId.current, done)}
      />
    )

  const tooShort = text.trim().length < MIN_CHARS

  return (
    <div className="intake">
      <div className="intake-lead">
        <h1>Что написано в ТЗ и что с этим делать</h1>
        <p>
          Загрузите техническое задание. Агент прочитает его целиком и соберёт краткое содержание, список задач,
          требования, сроки и места, которые стоит уточнить у заказчика. Каждый вывод ссылается на абзац, из
          которого он сделан.
        </p>
        <LinkDemo />
      </div>

      <div className="intake-panel">
        <div
          className={`dropfield${dragging ? ' is-dragging' : ''}`}
          onDragOver={(e) => (e.preventDefault(), setDragging(true))}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            readFile(e.dataTransfer.files[0])
          }}
        >
          <label htmlFor="spec" className="dropfield-label">
            Текст ТЗ
            {sourceName && <span className="dropfield-source">{sourceName}</span>}
          </label>
          <textarea
            id="spec"
            value={text}
            onChange={(e) => (setText(e.target.value), setError(''))}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !tooShort && !loadingFile) start()
            }}
            placeholder="Вставьте текст сюда или перетащите файл PDF, DOCX, TXT, MD"
            spellCheck={false}
          />
          {(dragging || loadingFile) && (
            <div className="dropfield-hint">{loadingFile ? 'Читаю файл…' : 'Отпустите файл, чтобы загрузить'}</div>
          )}
        </div>

        <ul className={`scan${scan.paragraphs ? '' : ' is-empty'}`} aria-label="Что видно в тексте до разбора">
          <li>
            <strong>{scan.paragraphs}</strong> абзацев
          </li>
          <li>
            <strong>{scan.sections}</strong> заголовков
          </li>
          <li>
            <strong>{scan.demands}</strong> похоже на требования
          </li>
          <li>
            <strong>{scan.minutes}</strong> мин читать самому
          </li>
        </ul>

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}

        <div className="intake-actions">
          <input
            ref={fileInput}
            type="file"
            accept=".txt,.md,.pdf,.docx,text/plain"
            hidden
            onChange={(e) => (readFile(e.target.files[0]), (e.target.value = ''))}
          />
          <button className="btn" onClick={() => fileInput.current.click()} disabled={loadingFile}>
            Выбрать файл
          </button>
          <button className="btn btn-ghost" onClick={() => (setText(SAMPLE_SPEC), setSourceName(SAMPLE_NAME), setError(''))}>
            Пример ТЗ
          </button>
          <span className="intake-count" aria-live="polite">
            {text.trim() && tooShort
              ? `Слишком коротко: нужно хотя бы ${MIN_CHARS} символов`
              : `${text.length.toLocaleString('ru-RU')} симв.`}
          </span>
          <button className="btn btn-solid" onClick={start} disabled={tooShort || loadingFile} title="Ctrl + Enter">
            Разобрать ТЗ
            <kbd>Ctrl ↵</kbd>
          </button>
        </div>

        <p className="intake-legal">
          Загружайте только те ТЗ, которые вправе передавать. Текст обрабатывается на сервере сайта и не уходит
          сторонним сервисам. <Link to="/legal/agent">Что происходит с вашим ТЗ</Link>
        </p>
      </div>
    </div>
  )
}
