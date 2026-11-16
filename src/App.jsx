import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { useAuth } from './auth/AuthContext.jsx'
import Shell from './components/Shell.jsx'
import Login from './pages/Login.jsx'
import Workspace from './pages/Workspace.jsx'
import Admin from './pages/Admin.jsx'
import Legal from './pages/Legal.jsx'
import History, { HistoryEntry } from './pages/History.jsx'
import Review from './pages/Review.jsx'
import Knowledge from './pages/Knowledge.jsx'

function RequireAuth() {
  const { user } = useAuth()
  const location = useLocation()
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return (
    <Shell>
      <Outlet />
    </Shell>
  )
}

function RequireAdmin() {
  const { user } = useAuth()
  return user?.role === 'admin' ? <Outlet /> : <Navigate to="/" replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/legal/:doc" element={<Legal />} />
      <Route element={<RequireAuth />}>
        <Route path="/" element={<Workspace />} />
        <Route path="/review" element={<Review />} />
        <Route path="/knowledge" element={<Knowledge />} />
        <Route path="/history" element={<History />} />
        <Route path="/history/:id" element={<HistoryEntry />} />
        <Route element={<RequireAdmin />}>
          <Route path="/admin" element={<Admin />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
