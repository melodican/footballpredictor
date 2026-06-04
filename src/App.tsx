import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import HomePage from './pages/HomePage'
import EnterPage from './pages/EnterPage'
import DashboardPage from './pages/DashboardPage'
import AdminPage from './pages/AdminPage'
import SubmittedPage from './pages/SubmittedPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/enter" element={<EnterPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/admin/:secret" element={<AdminPage />} />
        <Route path="/submitted" element={<SubmittedPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
