import { useEffect, useState } from 'react'
import { getAgentStatus } from '../api/agent.js'
import { ROLE_NAMES, useAuth } from '../auth/AuthContext.jsx'
import { BLOCKS, getRuns, loadBlocks, saveBlocks } from '../settings.js'

// Примеры строк, чтобы было видно, как выглядит таблица. Настоящий здесь только вы.
const EXAMPLE_USERS = [
  { login: 'm.orlova', role: 'user', runs: 14, last: '09.11.2026' },
  { login: 'd.kim', role: 'user', runs: 6, last: '02.11.2026' },
]

export default function Admin() {
  const { user } = useAuth()
  const [blocks, setBlocks] = useState(loadBlocks)
  const runs = getRuns()
  const [agent, setAgent] = useState(null)

  useEffect(() => {
    getAgentStatus().then(setAgent)
  }, [])

  const toggle = (id) => {
    const next = { ...blocks, [id]: !blocks[id] }
    setBlocks(next)
    saveBlocks(next)
  }

  return (
    <div className="admin">
      <h1>Админ-панель</h1>

      <section className="admin-section">
        <h2>Блоки отчёта</h2>
        <p className="admin-hint">Отключённые блоки не показываются в разборе и не попадают в скопированный отчёт.</p>
        <ul className="toggles">
          {BLOCKS.map((b) => (
            <li key={b.id}>
              <label>
                <input type="checkbox" checked={!!blocks[b.id]} disabled={b.locked} onChange={() => toggle(b.id)} />
                <span>{b.title}</span>
                {b.locked && <em>всегда включён</em>}
              </label>
            </li>
          ))}
        </ul>
      </section>

      <section className="admin-section">
        <h2>Пользователи</h2>
        <p className="admin-hint">
          Добавление пользователей и смена ролей заработают после подключения бэкенда. Строки с пометкой «пример»
          показывают, как будет выглядеть список.
        </p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Логин</th>
                <th>Роль</th>
                <th className="num">Разборов</th>
                <th>Последний вход</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  {user.login} <em>это вы</em>
                </td>
                <td>{ROLE_NAMES[user.role]}</td>
                <td className="num">{runs}</td>
                <td>сейчас в системе</td>
              </tr>
              {EXAMPLE_USERS.map((u) => (
                <tr key={u.login} className="is-example">
                  <td>
                    {u.login} <em>пример</em>
                  </td>
                  <td>{ROLE_NAMES[u.role]}</td>
                  <td className="num">{u.runs}</td>
                  <td>{u.last}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="admin-section">
        <h2>Агент</h2>
        <dl className="facts">
          <div>
            <dt>Состояние</dt>
            <dd>
              {!agent
                ? 'Проверяю…'
                : agent.ready
                  ? 'Модель подключена, ТЗ разбирает ИИ'
                  : `Демо-режим на правилах: ${agent.reason}`}
            </dd>
          </div>
          <div>
            <dt>Модель</dt>
            <dd>{agent?.model || 'неизвестно'} (меняется в файле .env, параметр OLLAMA_MODEL)</dd>
          </div>
          <div>
            <dt>Разборов в этом браузере</dt>
            <dd>{runs}</dd>
          </div>
        </dl>
      </section>
    </div>
  )
}
