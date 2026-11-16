import { createContext, useCallback, useContext, useMemo, useState } from 'react'

// ВРЕМЕННО: учётные записи лежат во фронтенде, пока нет бэкенда.
// Любой, кто откроет код страницы, увидит их. При подключении сервера
// заменить signIn на запрос к API и убрать этот список.
const USERS = [{ login: 'test', password: 'test123', name: 'test', role: 'admin' }]

const KEY = 'ae.session'
const AuthContext = createContext(null)

function readSession() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || null
  } catch {
    return null
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(readSession)

  const signIn = useCallback((login, password) => {
    const found = USERS.find((u) => u.login === login.trim() && u.password === password)
    if (!found) return false
    const session = { login: found.login, name: found.name, role: found.role }
    localStorage.setItem(KEY, JSON.stringify(session))
    setUser(session)
    return true
  }, [])

  const signOut = useCallback(() => {
    localStorage.removeItem(KEY)
    setUser(null)
  }, [])

  const value = useMemo(() => ({ user, signIn, signOut }), [user, signIn, signOut])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}

export const ROLE_NAMES = { admin: 'Администратор', user: 'Пользователь' }
