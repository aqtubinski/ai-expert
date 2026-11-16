import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.jsx'
import { ThemeButton } from '../components/Shell.jsx'
import { getConsent, saveConsent } from '../legal/operator.js'

export default function Login() {
  const { user, signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [agreed, setAgreed] = useState(() => !!getConsent())

  if (user) return <Navigate to="/" replace />

  const submit = (e) => {
    e.preventDefault()
    if (!agreed) return
    if (signIn(login, password)) {
      saveConsent()
      navigate(location.state?.from || '/', { replace: true })
    } else setError('Неверный логин или пароль. Проверьте раскладку и Caps Lock.')
  }

  return (
    <div className="login">
      <section className="login-demo" aria-label="Как работает разбор">
        <p className="brand">AI Expert</p>
        <div className="login-sheet">
          <p className="login-quote">
            Требуется добавить онлайн-оплату абонементов банковской картой, <mark>через СБП и т.д.</mark> Интерфейс
            должен быть современным и удобным.
          </p>
          <p className="login-note">
            <strong>Что сделать?</strong> Запросить у заказчика полный список способов оплаты: перечень в ТЗ не
            закрыт.
          </p>
        </div>
        <h1 className="login-title">Агент читает ТЗ и говорит, что с ним делать</h1>
      </section>

      <section className="login-form-side">
        <div className="login-theme">
          <ThemeButton />
        </div>
        <form className="login-form" onSubmit={submit} noValidate>
          <h2>Вход</h2>
          <label className="field">
            <span>Логин</span>
            <input
              value={login}
              onChange={(e) => (setLogin(e.target.value), setError(''))}
              autoComplete="username"
              autoFocus
              required
            />
          </label>
          <label className="field">
            <span>Пароль</span>
            <input
              type="password"
              value={password}
              onChange={(e) => (setPassword(e.target.value), setError(''))}
              autoComplete="current-password"
              required
            />
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <label className="consent">
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
            <span>
              Я даю{' '}
              <a href="/legal/consent" target="_blank" rel="noreferrer">
                согласие на обработку персональных данных
              </a>
            </span>
          </label>
          <button className="btn btn-solid btn-wide" type="submit" disabled={!login || !password || !agreed}>
            Войти
          </button>
          <p className="login-legal">
            Входя, вы принимаете{' '}
            <a href="/legal/terms" target="_blank" rel="noreferrer">
              пользовательское соглашение
            </a>{' '}
            и{' '}
            <a href="/legal/privacy" target="_blank" rel="noreferrer">
              политику обработки данных
            </a>
            .
          </p>
        </form>
      </section>
    </div>
  )
}
