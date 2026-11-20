import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { RequireAdmin, RequireAuth, SignedOutOnly } from './components/Guards'
import { EnterCode } from './pages/auth/EnterCode'
import { SignIn } from './pages/auth/SignIn'
import { SignedOut } from './pages/auth/SignedOut'
import { Welcome } from './pages/auth/Welcome'
import { Home } from './pages/Home'
import { MatchPage } from './pages/MatchPage'
import { SkScreen } from './components/Skeleton'

// Screens most people rarely open load on demand, so the app starts faster on phones.
const AdminHome = lazy(() => import('./pages/admin/AdminHome').then((m) => ({ default: m.AdminHome })))
const AdminMatches = lazy(() => import('./pages/admin/AdminMatches').then((m) => ({ default: m.AdminMatches })))
const DataSync = lazy(() => import('./pages/admin/DataSync').then((m) => ({ default: m.DataSync })))
const Members = lazy(() => import('./pages/admin/Members').then((m) => ({ default: m.Members })))
const SignInCodes = lazy(() => import('./pages/admin/SignInCodes').then((m) => ({ default: m.SignInCodes })))
const Notifications = lazy(() => import('./pages/Notifications').then((m) => ({ default: m.Notifications })))
const Ledger = lazy(() => import('./pages/Ledger').then((m) => ({ default: m.Ledger })))
const LedgerPerson = lazy(() => import('./pages/LedgerPerson').then((m) => ({ default: m.LedgerPerson })))
const AdminLedger = lazy(() => import('./pages/admin/AdminLedger').then((m) => ({ default: m.AdminLedger })))
const Ranks = lazy(() => import('./pages/Ranks').then((m) => ({ default: m.Ranks })))
const Help = lazy(() => import('./pages/Help').then((m) => ({ default: m.Help })))
const AlertsSetup = lazy(() => import('./pages/AlertsSetup').then((m) => ({ default: m.AlertsSetup })))
const Install = lazy(() => import('./pages/Install').then((m) => ({ default: m.Install })))
const Scorecard = lazy(() => import('./pages/Scorecard').then((m) => ({ default: m.Scorecard })))
const NotificationSettings = lazy(() => import('./pages/admin/NotificationSettings').then((m) => ({ default: m.NotificationSettings })))
const GeneralSettings = lazy(() => import('./pages/admin/GeneralSettings').then((m) => ({ default: m.GeneralSettings })))
const Appearance = lazy(() => import('./pages/admin/Appearance').then((m) => ({ default: m.Appearance })))
const TeamBadges = lazy(() => import('./pages/admin/TeamBadges').then((m) => ({ default: m.TeamBadges })))
const ActivityLog = lazy(() => import('./pages/admin/ActivityLog').then((m) => ({ default: m.ActivityLog })))
const SignInSettings = lazy(() => import('./pages/admin/SignInSettings').then((m) => ({ default: m.SignInSettings })))
const Backup = lazy(() => import('./pages/admin/Backup').then((m) => ({ default: m.Backup })))
const PickXi = lazy(() => import('./pages/game/PickXi').then((m) => ({ default: m.PickXi })))
const XiResults = lazy(() => import('./pages/game/XiResults').then((m) => ({ default: m.XiResults })))
const PickFantasy = lazy(() => import('./pages/game/PickFantasy').then((m) => ({ default: m.PickFantasy })))
const FantasyResults = lazy(() => import('./pages/game/FantasyResults').then((m) => ({ default: m.FantasyResults })))
const MatchControl = lazy(() => import('./pages/admin/MatchControl').then((m) => ({ default: m.MatchControl })))
const GameRules = lazy(() => import('./pages/admin/GameRules').then((m) => ({ default: m.GameRules })))
const Profile = lazy(() => import('./pages/Profile').then((m) => ({ default: m.Profile })))

export default function App() {
  return (
    <Suspense fallback={<div className="route-loading"><SkScreen /></div>}>
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
