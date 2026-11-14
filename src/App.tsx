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
import { PickXi } from './pages/game/PickXi'
import { XiResults } from './pages/game/XiResults'
import { MatchControl } from './pages/admin/MatchControl'
import { EditXi } from './pages/admin/EditXi'
import { GameRules } from './pages/admin/GameRules'
import { Wallet } from './pages/wallet/Wallet'
import { AddMoney } from './pages/wallet/AddMoney'
import { PaymentDetail } from './pages/wallet/PaymentDetail'
import { Withdraw } from './pages/wallet/Withdraw'
import { WithdrawalDetail } from './pages/wallet/WithdrawalDetail'
import { Payments } from './pages/admin/Payments'
import { Withdrawals } from './pages/admin/Withdrawals'
import { Balances } from './pages/admin/Balances'
import { MoneySettings } from './pages/admin/MoneySettings'
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
      <Route path="/match/:id/xi" element={<RequireAuth><PickXi /></RequireAuth>} />
      <Route path="/match/:id/xi/results" element={<RequireAuth><XiResults /></RequireAuth>} />
      <Route path="/wallet" element={<RequireAuth><Wallet /></RequireAuth>} />
      <Route path="/wallet/add" element={<RequireAuth><AddMoney /></RequireAuth>} />
      <Route path="/wallet/payment/:id" element={<RequireAuth><PaymentDetail /></RequireAuth>} />
      <Route path="/wallet/withdraw" element={<RequireAuth><Withdraw /></RequireAuth>} />
      <Route path="/wallet/withdrawal/:id" element={<RequireAuth><WithdrawalDetail /></RequireAuth>} />
      <Route path="/ranks" element={<RequireAuth><ComingSoon title="Ranks" icon="trophy" text="The leaderboard arrives once games are live." /></RequireAuth>} />

      <Route path="/admin" element={<RequireAuth><RequireAdmin><AdminHome /></RequireAdmin></RequireAuth>} />
      <Route path="/admin/codes" element={<RequireAuth><RequireAdmin><SignInCodes /></RequireAdmin></RequireAuth>} />
      <Route path="/admin/members" element={<RequireAuth><RequireAdmin><Members /></RequireAdmin></RequireAuth>} />
      <Route path="/admin/matches" element={<RequireAuth><RequireAdmin><AdminMatches /></RequireAdmin></RequireAuth>} />
      <Route path="/admin/data" element={<RequireAuth><RequireAdmin><CricketData /></RequireAdmin></RequireAuth>} />
      <Route path="/admin/payments" element={<RequireAuth><RequireAdmin><Payments /></RequireAdmin></RequireAuth>} />
      <Route path="/admin/withdrawals" element={<RequireAuth><RequireAdmin><Withdrawals /></RequireAdmin></RequireAuth>} />
      <Route path="/admin/balances" element={<RequireAuth><RequireAdmin><Balances /></RequireAdmin></RequireAuth>} />
      <Route path="/admin/money" element={<RequireAuth><RequireAdmin><MoneySettings /></RequireAdmin></RequireAuth>} />
      <Route path="/admin/match/:id" element={<RequireAuth><RequireAdmin><MatchControl /></RequireAdmin></RequireAuth>} />
      <Route path="/admin/match/:id/xi" element={<RequireAuth><RequireAdmin><EditXi /></RequireAdmin></RequireAuth>} />
      <Route path="/admin/rules" element={<RequireAuth><RequireAdmin><GameRules /></RequireAdmin></RequireAuth>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
