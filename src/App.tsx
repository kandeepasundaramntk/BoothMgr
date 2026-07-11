import { lazy, Suspense } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Link, Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth, useEffectiveProfile, useViewAs } from './auth/AuthContext'
import { isDemoMode } from './data/api'
import { ROLE_LABEL } from './data/roles'
import { LangProvider, useLang, useT } from './i18n'
import PendingApprovalPage from './pages/PendingApprovalPage'

const LoginPage = lazy(() => import('./pages/LoginPage'))
const SignupPage = lazy(() => import('./pages/SignupPage'))
const ApprovalsPage = lazy(() => import('./pages/ApprovalsPage'))
const AssembliesPage = lazy(() => import('./pages/AssembliesPage'))
const BlankFormPage = lazy(() => import('./pages/BlankFormPage'))
const BoothListPage = lazy(() => import('./pages/BoothListPage'))
const BoothPage = lazy(() => import('./pages/BoothPage'))
const BoothPrintPage = lazy(() => import('./pages/BoothPrintPage'))
const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const SuperadminToolsPage = lazy(() => import('./pages/SuperadminToolsPage'))

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
})

function Shell() {
  const { loading, signedIn, email, profile, profileLoading, signOut } = useAuth()
  const effectiveProfile = useEffectiveProfile()
  const { isViewingAs, viewAsProfile, stopViewAs } = useViewAs()
  const { lang, setLang } = useLang()
  const t = useT()
  if (loading || (signedIn && profileLoading)) return <div className="container">Loading…</div>
  if (!signedIn) return <Navigate to="/login" replace />
  // Account approval status is real, not simulated by view-as.
  const approved = profile?.status === 'approved'
  const canApprove =
    approved &&
    (effectiveProfile?.role === 'admin' || effectiveProfile?.role === 'superadmin' || effectiveProfile?.role === 'assembly_poc')
  const isSuperadmin = effectiveProfile?.role === 'superadmin'
  return (
    <>
      {isDemoMode && (
        <div className="demo-banner">
          DEMO MODE — மாதிரித் தரவு மட்டும் (fictional data only, stored in this browser)
        </div>
      )}
      {isViewingAs && viewAsProfile && (
        <div className="view-as-banner">
          {t(
            `இப்போது பார்வையிடுகிறீர்கள்: ${viewAsProfile.full_name} (${ROLE_LABEL[viewAsProfile.role].ta}) — படிக்க மட்டும்`,
            `Viewing as: ${viewAsProfile.full_name} (${ROLE_LABEL[viewAsProfile.role].en}) — read-only`,
          )}
          <button className="btn small" onClick={() => void stopViewAs()}>
            {t('வெளியேறு', 'Exit')}
          </button>
        </div>
      )}
      <header className="app-header">
        <h1>
          <Link to="/">BoothMgr — பூத் மேலாண்மை</Link>
        </h1>
        <span className="sub">{t('2026 இடைத்தேர்தல்', '2026 By-Election', ' — ')}</span>
        <span className="spacer" />
        {canApprove && (
          <Link className="btn small secondary" to="/approvals">
            {t('ஒப்புதல்கள்', 'Approvals')}
          </Link>
        )}
        {isSuperadmin && (
          <Link className="btn small secondary" to="/admin">
            {t('மேலாண்மை', 'Admin Tools')}
          </Link>
        )}
        <button
          className="btn small secondary"
          onClick={() => setLang(lang === 'ta' ? 'en' : 'ta')}
          title={lang === 'ta' ? 'Switch to English-first labels' : 'தமிழ் முதன்மை நிலைக்கு மாற்று'}
        >
          {lang === 'ta' ? 'English' : 'தமிழ்'}
        </button>
        <span className="who">
          {email}
          {profile && (
            <span className="role-badge"> {lang === 'ta' ? ROLE_LABEL[profile.role].ta : ROLE_LABEL[profile.role].en}</span>
          )}
        </span>
        <button className="btn small secondary" onClick={() => void signOut()}>
          {t('வெளியேறு', 'Sign out')}
        </button>
      </header>
      <main className="container">
        {approved ? (
          isViewingAs ? (
            <fieldset className="view-as-lock" disabled>
              <Outlet />
            </fieldset>
          ) : (
            <Outlet />
          )
        ) : (
          <PendingApprovalPage />
        )}
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
            <Suspense fallback={<div className="container">Loading…</div>}>
              <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route path="/signup" element={<SignupPage />} />
                <Route element={<Shell />}>
                  <Route path="/" element={<AssembliesPage />} />
                  <Route path="/approvals" element={<ApprovalsPage />} />
                  <Route path="/assembly/:assemblyId" element={<BoothListPage />} />
                  <Route path="/assembly/:assemblyId/dashboard" element={<DashboardPage />} />
                  <Route path="/booth/:boothId" element={<BoothPage />} />
                  <Route path="/booth/:boothId/print" element={<BoothPrintPage />} />
                  <Route path="/blank-form" element={<BlankFormPage />} />
                  <Route path="/admin" element={<SuperadminToolsPage />} />
                </Route>
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </LangProvider>
      </AuthProvider>
    </QueryClientProvider>
  )
}
