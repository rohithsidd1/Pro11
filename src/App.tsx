import { Navigate, Route, Routes } from 'react-router-dom'
import { RequireAdmin, RequireAuth, SignedOutOnly } from './components/Guards'
import { AdminHome } from './pages/admin/AdminHome'
import { AdminMatches } from './pages/admin/AdminMatches'
import { CricketData } from './pages/admin/CricketData'
import { Members } from './pages/admin/Members'
import { SignInCodes } from './pages/admin/SignInCodes'
import { EnterCode } from './pages/auth/EnterCode'
import { SignIn } from './pages/auth/SignIn'
import { SignedOut } from './pages/auth/SignedOut'
import { Welcome } from './pages/auth/Welcome'
import { ComingSoon } from './pages/ComingSoon'
import { Home } from './pages/Home'
import { MatchPage } from './pages/MatchPage'
import { Profile } from './pages/Profile'

export default function App() {
  return (
    <Routes>
      <Route path="/welcome" element={<SignedOutOnly><Welcome /></SignedOutOnly>} />
      <Route path="/sign-in" element={<SignedOutOnly><SignIn /></SignedOutOnly>} />
      <Route path="/sign-in/code" element={<SignedOutOnly><EnterCode /></SignedOutOnly>} />
      <Route path="/signed-out" element={<SignedOutOnly><SignedOut /></SignedOutOnly>} />

      <Route path="/" element={<RequireAuth><Home /></RequireAuth>} />
      <Route path="/me" element={<RequireAuth><Profile /></RequireAuth>} />
      <Route path="/match/:id" element={<RequireAuth><MatchPage /></RequireAuth>} />
      <Route path="/wallet" element={<RequireAuth><ComingSoon title="Wallet" icon="wallet" text="Add money, withdraw and your history arrive in step 3." /></RequireAuth>} />
      <Route path="/ranks" element={<RequireAuth><ComingSoon title="Ranks" icon="trophy" text="The leaderboard arrives once games are live." /></RequireAuth>} />

      <Route path="/admin" element={<RequireAuth><RequireAdmin><AdminHome /></RequireAdmin></RequireAuth>} />
      <Route path="/admin/codes" element={<RequireAuth><RequireAdmin><SignInCodes /></RequireAdmin></RequireAuth>} />
      <Route path="/admin/members" element={<RequireAuth><RequireAdmin><Members /></RequireAdmin></RequireAuth>} />
      <Route path="/admin/matches" element={<RequireAuth><RequireAdmin><AdminMatches /></RequireAdmin></RequireAuth>} />
      <Route path="/admin/data" element={<RequireAuth><RequireAdmin><CricketData /></RequireAdmin></RequireAuth>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
