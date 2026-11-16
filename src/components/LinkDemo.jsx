import { useEffect, useState } from 'react'

// Маленькая живая модель отчёта: вывод справа подсвечивает абзац слева.
const PARAS = [
  { n: 4, text: 'Клиент должен записываться на занятие не позднее чем за час до начала.' },
  { n: 7, text: 'Страницы должны открываться быстро и удобно работать на телефоне.' },
  { n: 9, text: 'Оплата абонемента проходит через СБП и банковские карты.' },
]

const FINDINGS = [
  { ref: 4, text: 'Реализовать запись на занятие' },
  { ref: 7, text: '«Быстро» без цифры: спросить, сколько секунд' },
  { ref: 9, text: 'Стек: СБП, банковские карты' },
]

export default function LinkDemo() {
  const [at, setAt] = useState(0)
  const [held, setHeld] = useState(false)

  useEffect(() => {
    if (held || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const t = setInterval(() => setAt((i) => (i + 1) % FINDINGS.length), 2600)
    return () => clearInterval(t)
  }, [held])

  const ref = FINDINGS[at].ref

  return (
    <figure className="linkdemo" onMouseEnter={() => setHeld(true)} onMouseLeave={() => setHeld(false)}>
      <div className="linkdemo-frame" aria-hidden="true">
        <div className="linkdemo-doc">
          {PARAS.map((p) => (
            <p key={p.n} className={`linkdemo-para${p.n === ref ? ' is-on' : ''}`}>
              <span>{p.n}</span>
              {p.text}
            </p>
          ))}
        </div>
        <ul className="linkdemo-out">
          {FINDINGS.map((f, i) => (
            <li key={f.ref} className={`linkdemo-find${i === at ? ' is-on' : ''}`} onMouseEnter={() => setAt(i)} onClick={() => (setAt(i), setHeld(true))}>
              {f.text}
              <span className="ref">абз. {f.ref}</span>
            </li>
          ))}
        </ul>
      </div>
      <figcaption>Так устроен отчёт: каждый вывод ведёт к абзацу, из которого он сделан. Выберите любой вывод.</figcaption>
    </figure>
  )
}
