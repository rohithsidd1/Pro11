import { type ComponentType, lazy, Suspense, useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { RequireAdmin, RequireAuth, SignedOutOnly } from './components/Guards'
import { EnterCode } from './pages/auth/EnterCode'
import { SignIn } from './pages/auth/SignIn'
import { SignedOut } from './pages/auth/SignedOut'
import { Welcome } from './pages/auth/Welcome'
import { Home } from './pages/Home'
import { MatchPage } from './pages/MatchPage'
import { SkScreen } from './components/Skeleton'
import { Shell } from './components/Shell'
import { useAuth } from './lib/auth'
import { startLiveUpdates, stopLiveUpdates } from './lib/live'

// Screens most people rarely open load on demand, so the app starts faster on phones.
/** Lazy screens, remembered so they can all be fetched in the background after sign-in. */
const loaders: (() => Promise<unknown>)[] = []
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function page<T extends ComponentType<any>>(load: () => Promise<{ default: T }>) { loaders.push(load); return lazy(load) }

const AdminHome = page(() => import('./pages/admin/AdminHome').then((m) => ({ default: m.AdminHome })))
const AdminMatches = page(() => import('./pages/admin/AdminMatches').then((m) => ({ default: m.AdminMatches })))
const DataSync = page(() => import('./pages/admin/DataSync').then((m) => ({ default: m.DataSync })))
const Members = page(() => import('./pages/admin/Members').then((m) => ({ default: m.Members })))
const SignInCodes = page(() => import('./pages/admin/SignInCodes').then((m) => ({ default: m.SignInCodes })))
const Notifications = page(() => import('./pages/Notifications').then((m) => ({ default: m.Notifications })))
const Ledger = page(() => import('./pages/Ledger').then((m) => ({ default: m.Ledger })))
const LedgerPerson = page(() => import('./pages/LedgerPerson').then((m) => ({ default: m.LedgerPerson })))
const AdminLedger = page(() => import('./pages/admin/AdminLedger').then((m) => ({ default: m.AdminLedger })))
const Ranks = page(() => import('./pages/Ranks').then((m) => ({ default: m.Ranks })))
const Help = page(() => import('./pages/Help').then((m) => ({ default: m.Help })))
const AlertsSetup = page(() => import('./pages/AlertsSetup').then((m) => ({ default: m.AlertsSetup })))
const Install = page(() => import('./pages/Install').then((m) => ({ default: m.Install })))
const Scorecard = page(() => import('./pages/Scorecard').then((m) => ({ default: m.Scorecard })))
const NotificationSettings = page(() => import('./pages/admin/NotificationSettings').then((m) => ({ default: m.NotificationSettings })))
const GeneralSettings = page(() => import('./pages/admin/GeneralSettings').then((m) => ({ default: m.GeneralSettings })))
const Appearance = page(() => import('./pages/admin/Appearance').then((m) => ({ default: m.Appearance })))
const TeamBadges = page(() => import('./pages/admin/TeamBadges').then((m) => ({ default: m.TeamBadges })))
const ActivityLog = page(() => import('./pages/admin/ActivityLog').then((m) => ({ default: m.ActivityLog })))
const SignInSettings = page(() => import('./pages/admin/SignInSettings').then((m) => ({ default: m.SignInSettings })))
const Backup = page(() => import('./pages/admin/Backup').then((m) => ({ default: m.Backup })))
const PickXi = page(() => import('./pages/game/PickXi').then((m) => ({ default: m.PickXi })))
const XiResults = page(() => import('./pages/game/XiResults').then((m) => ({ default: m.XiResults })))
const PickFantasy = page(() => import('./pages/game/PickFantasy').then((m) => ({ default: m.PickFantasy })))
const FantasyResults = page(() => import('./pages/game/FantasyResults').then((m) => ({ default: m.FantasyResults })))
const MatchControl = page(() => import('./pages/admin/MatchControl').then((m) => ({ default: m.MatchControl })))
const GameRules = page(() => import('./pages/admin/GameRules').then((m) => ({ default: m.GameRules })))
const Profile = page(() => import('./pages/Profile').then((m) => ({ default: m.Profile })))

export default function App() {
  const { status } = useAuth()
  useEffect(() => {
    if (status !== 'signed-in') return
    startLiveUpdates()
    // fetch every screen's code once things are quiet, so moving between screens never waits
    const t = window.setTimeout(() => { for (const l of loaders) void l().catch(() => undefined) }, 1500)
    return () => { window.clearTimeout(t); stopLiveUpdates() }
  }, [status])

  return (
    <Suspense fallback={<Shell title="" kicker=" "><SkScreen /></Shell>}>
    <Routes>
      <Route path="/welcome" element={<SignedOutOnly><Welcome /></SignedOutOnly>} />
      <Route path="/sign-in" element={<SignedOutOnly><SignIn /></SignedOutOnly>} />
      <Route path="/sign-in/code" element={<SignedOutOnly><EnterCode /></SignedOutOnly>} />
      <Route path="/signed-out" element={<SignedOutOnly><SignedOut /></SignedOutOnly>} />

      <Route path="/" element={<RequireAuth><Home /></RequireAuth>} />
      <Route path="/me" element={<RequireAuth><Profile /></RequireAuth>} />
      <Route path="/match/:id" element={<RequireAuth><MatchPage /></RequireAuth>} />
      <Route path="/match/:id/xi" element={<RequireAuth><PickXi /></RequireAuth>} />
      <Route path="/match/:id/xi/results" element={<RequireAuth><XiResults /></RequireAuth>} />
      <Route path="/match/:id/fantasy" element={<RequireAuth><PickFantasy /></RequireAuth>} />
      <Route path="/match/:id/fantasy/results" element={<RequireAuth><FantasyResults /></RequireAuth>} />
      <Route path="/ranks" element={<RequireAuth><Ranks /></RequireAuth>} />
      <Route path="/ledger" element={<RequireAuth><Ledger /></RequireAuth>} />
      <Route path="/ledger/:id" element={<RequireAuth><LedgerPerson /></RequireAuth>} />
      <Route path="/wallet/*" element={<Navigate to="/ledger" replace />} />
      <Route path="/admin/ledger" element={<RequireAuth><RequireAdmin><AdminLedger /></RequireAdmin></RequireAuth>} />
      <Route path="/notifications" element={<RequireAuth><Notifications /></RequireAuth>} />
      <Route path="/help" element={<RequireAuth><Help /></RequireAuth>} />
      <Route path="/alerts" element={<RequireAuth><AlertsSetup /></RequireAuth>} />
      <Route path="/install" element={<RequireAuth><Install /></RequireAuth>} />
      <Route path="/match/:id/scorecard" element={<RequireAuth><Scorecard /></RequireAuth>} />

      <Route path="/admin" element={<RequireAuth><RequireAdmin><AdminHome /></RequireAdmin></RequireAuth>} />
      <Route path="/admin/codes" element={<RequireAuth><RequireAdmin><SignInCodes /></RequireAdmin></RequireAuth>} />
      <Route path="/admin/members" element={<RequireAuth><RequireAdmin><Members /></RequireAdmin></RequireAuth>} />
      <Route path="/admin/matches" element={<RequireAuth><RequireAdmin><AdminMatches /></RequireAdmin></RequireAuth>} />
      <Route path="/admin/data" element={<RequireAuth><RequireAdmin><DataSync /></RequireAdmin></RequireAuth>} />
      <Route path="/admin/match/:id" element={<RequireAuth><RequireAdmin><MatchControl /></RequireAdmin></RequireAuth>} />
      <Route path="/admin/rules" element={<RequireAuth><RequireAdmin><GameRules /></RequireAdmin></RequireAuth>} />
      <Route path="/admin/activity" element={<RequireAuth><RequireAdmin><ActivityLog /></RequireAdmin></RequireAuth>} />
      <Route path="/admin/signin" element={<RequireAuth><RequireAdmin><SignInSettings /></RequireAdmin></RequireAuth>} />
      <Route path="/admin/backup" element={<RequireAuth><RequireAdmin><Backup /></RequireAdmin></RequireAuth>} />
      <Route path="/admin/notifications" element={<RequireAuth><RequireAdmin><NotificationSettings /></RequireAdmin></RequireAuth>} />
      <Route path="/admin/general" element={<RequireAuth><RequireAdmin><GeneralSettings /></RequireAdmin></RequireAuth>} />
      <Route path="/admin/appearance" element={<RequireAuth><RequireAdmin><Appearance /></RequireAdmin></RequireAuth>} />
      <Route path="/admin/badges" element={<RequireAuth><RequireAdmin><TeamBadges /></RequireAdmin></RequireAuth>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </Suspense>
  )
}
