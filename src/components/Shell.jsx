import { useEffect, useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { LEGAL_DOCS } from '../legal/operator.js'
import { getAgentStatus } from '../api/agent.js'
import { ROLE_NAMES, useAuth } from '../auth/AuthContext.jsx'
import { useThemeToggle } from '../settings.js'

export function ThemeButton() {
  const toggle = useThemeToggle()
  return (
    <button className="icon-btn" onClick={toggle} aria-label="Переключить тему: тёмная или светлая" title="Сменить тему">
      <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
        <circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M10 2a8 8 0 0 1 0 16z" fill="currentColor" />
      </svg>
    </button>
  )
}

function AgentPill({ admin }) {
  const [agent, setAgent] = useState(null)
  useEffect(() => {
    getAgentStatus().then(setAgent)
  }, [])
  if (!agent) return null
  const body = (
    <>
      <i className={`dot${agent.ready ? ' is-on' : ''}`} />
      {agent.ready ? `Модель ${agent.model}` : 'Демо-режим'}
    </>
  )
  const title = agent.ready ? 'ТЗ разбирает локальная модель' : `Разбор идёт по правилам: ${agent.reason}`
  return admin ? (
    <NavLink to="/admin" className="agent-pill" title={title}>
      {body}
    </NavLink>
  ) : (
    <span className="agent-pill" title={title}>
      {body}
    </span>
  )
}

export default function Shell({ children }) {
  const { user, signOut } = useAuth()
  return (
    <div className="shell">
      <header className="topbar">
        <NavLink to="/" className="brand">
          AI Expert
        </NavLink>
        <nav className="topnav" aria-label="Разделы">
          <NavLink to="/" end>
            Разбор ТЗ
          </NavLink>
          <NavLink to="/review">Экспертиза</NavLink>
          <NavLink to="/knowledge">База знаний</NavLink>
          <NavLink to="/history">История</NavLink>
          {user.role === 'admin' && <NavLink to="/admin">Админ-панель</NavLink>}
        </nav>
        <div className="topbar-end">
          <AgentPill admin={user.role === 'admin'} />
          <span className="who">
            {user.name}
            <span className="who-role">{ROLE_NAMES[user.role]}</span>
          </span>
          <ThemeButton />
          <button className="btn btn-small" onClick={signOut}>
            Выйти
          </button>
        </div>
      </header>
      <main className="shell-main">{children}</main>
      <footer className="shell-foot">
        <span>Разбор делает ИИ и может ошибаться</span>
        <nav aria-label="Документы">
          {LEGAL_DOCS.map((d) => (
            <Link key={d.id} to={`/legal/${d.id}`}>
              {d.short}
            </Link>
          ))}
        </nav>
      </footer>
    </div>
  )
}
