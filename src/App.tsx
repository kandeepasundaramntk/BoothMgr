import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Link, Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth/AuthContext'
import { isDemoMode } from './data/api'
import { LangProvider, useLang, useT } from './i18n'
import LoginPage from './pages/LoginPage'
import AssembliesPage from './pages/AssembliesPage'
import BlankFormPage from './pages/BlankFormPage'
import BoothListPage from './pages/BoothListPage'
import BoothPage from './pages/BoothPage'
import BoothPrintPage from './pages/BoothPrintPage'
import DashboardPage from './pages/DashboardPage'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
})

function Shell() {
  const { loading, signedIn, email, signOut } = useAuth()
  const { lang, setLang } = useLang()
  const t = useT()
  if (loading) return <div className="container">Loading…</div>
  if (!signedIn) return <Navigate to="/login" replace />
  return (
    <>
      {isDemoMode && (
        <div className="demo-banner">
          DEMO MODE — மாதிரித் தரவு மட்டும் (fictional data only, stored in this browser)
        </div>
      )}
      <header className="app-header">
        <h1>
          <Link to="/">BoothMgr — பூத் மேலாண்மை</Link>
        </h1>
        <span className="sub">{t('2026 இடைத்தேர்தல்', '2026 By-Election', ' — ')}</span>
        <span className="spacer" />
        <button
          className="btn small secondary"
          onClick={() => setLang(lang === 'ta' ? 'en' : 'ta')}
          title={lang === 'ta' ? 'Switch to English-first labels' : 'தமிழ் முதன்மை நிலைக்கு மாற்று'}
        >
          {lang === 'ta' ? 'English' : 'தமிழ்'}
        </button>
        <span className="who">{email}</span>
        <button className="btn small secondary" onClick={() => void signOut()}>
          {t('வெளியேறு', 'Sign out')}
        </button>
      </header>
      <main className="container">
        <Outlet />
      </main>
    </>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <LangProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route element={<Shell />}>
                <Route path="/" element={<AssembliesPage />} />
                <Route path="/assembly/:assemblyId" element={<BoothListPage />} />
                <Route path="/assembly/:assemblyId/dashboard" element={<DashboardPage />} />
                <Route path="/booth/:boothId" element={<BoothPage />} />
                <Route path="/booth/:boothId/print" element={<BoothPrintPage />} />
                <Route path="/blank-form" element={<BlankFormPage />} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </LangProvider>
      </AuthProvider>
    </QueryClientProvider>
  )
}
