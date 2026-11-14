export type Role = 'member' | 'admin'

export interface Profile {
  id: string
  name: string
  phone: string
  role: Role
  color: string
  upi_id: string | null
  can_play: boolean
  blocked: boolean
  created_at: string
  last_seen_at: string | null
  signout_at?: string | null
}

export interface AppSettings {
  app_name: string
  admin_name: string
  admin_phone: string
  upi_id: string
  payee_name: string
  code_length: number
  code_ttl_minutes: number
  session_days: number
  code_requests_per_hour: number
  members_only_codes: boolean
  session_epoch: number
  min_topup?: number
  max_topup?: number
  min_withdrawal?: number
  accept_phonepe?: boolean
  accept_gpay?: boolean
  accept_paytm?: boolean
  accept_other_upi?: boolean
}

export type CodeStatus = 'pending' | 'used' | 'expired' | 'blocked' | 'ignored'

export interface OtpRequest {
  id: string
  phone: string
  name: string
  code: string
  status: CodeStatus
  attempts: number
  is_member: boolean
  expires_at: string
  created_at: string
  used_at: string | null
}

export interface PendingSignIn {
  name: string
  phone: string
  expiresAt: string
  codeLength: number
  adminName: string
  forAdmin: boolean
  sessionDays?: number
}

export type Format = 'T20' | 'ODI' | 'Test' | 'Other'
export type Category = 'international' | 'league' | 'domestic' | 'other'
export type Visibility = 'auto' | 'shown' | 'hidden'

export interface InningScore { r?: number; w?: number; o?: number; inning?: string }

export interface Match {
  id: string
  name: string
  label: string | null
  series_name: string | null
  format: Format
  category: Category
  is_women: boolean
  venue: string | null
  starts_at: string
  team_a: string
  team_b: string
  team_a_short: string | null
  team_b_short: string | null
  team_a_img: string | null
  team_b_img: string | null
  status_text: string | null
  started: boolean
  ended: boolean
  toss_winner: string | null
  toss_choice: string | null
  winner: string | null
  score: InningScore[]
  has_squad: boolean
  fantasy_ok: boolean
  visibility: Visibility
  squad_fetched_at: string | null
  info_fetched_at: string | null
  last_synced_at: string
  xi_checked_at?: string | null
  squad_attempted_at?: string | null
  series_id?: string | null
  live_points_at?: string | null
  final_points_at?: string | null
  xi_source?: 'api' | 'admin' | null
}

export interface MatchPlayer {
  match_id: string
  player_id: string
  name: string
  team: string
  role: 'WK' | 'BAT' | 'AR' | 'BOWL'
  api_role: string | null
  img: string | null
  in_xi: boolean | null
  manual?: boolean
}

export interface DataSettings {
  daily_credit_cap: number
  list_refresh_hours: number
  fixtures_refresh_hours: number
  fixtures_pages: number
  show_men_intl: boolean
  show_women_intl: boolean
  show_leagues: boolean
  show_domestic: boolean
  sync_paused: boolean
  last_list_sync_at: string | null
  last_fixtures_sync_at: string | null
  only_game_ready?: boolean
  auto_xi_check?: boolean
}

export interface ApiUsage { day: string; credits: number; calls: number; hits_today: number | null; hits_limit: number | null }
export interface ApiCall { id: number; at: string; endpoint: string; match_id: string | null; credits: number; ok: boolean; trigger: 'auto' | 'admin'; note: string | null }

export type TxnKind = 'topup' | 'withdrawal' | 'withdrawal_release' | 'entry' | 'refund' | 'payout' | 'adjustment'
export interface WalletTxn { id: string; user_id: string; amount: number; kind: TxnKind; ref_id: string | null; note: string | null; created_by: string | null; created_at: string }

export type ProofStatus = 'pending' | 'approved' | 'rejected' | 'cancelled'
export interface PaymentProof {
  id: string; user_id: string; amount: number; utr: string | null; app: 'phonepe' | 'gpay' | 'paytm' | 'other'
  paid_at: string | null; paid_to: string | null; screenshot_path: string
  ocr: { amount?: number | null; amountMatches?: boolean; utr?: string | null; paidAt?: string | null; paidTo?: string | null; toMatches?: boolean; text?: string }
  status: ProofStatus; reject_reason: string | null; reviewed_by: string | null; reviewed_at: string | null; created_at: string
}

export type WithdrawalStatus = 'pending' | 'paid' | 'rejected' | 'cancelled'
export interface Withdrawal {
  id: string; user_id: string; amount: number; upi_id: string; status: WithdrawalStatus; utr: string | null; proof_path: string | null
  reject_reason: string | null; handled_by: string | null; handled_at: string | null; created_at: string
}

export interface MoneySettings {
  upi_id: string; payee_name: string; admin_phone: string; admin_name: string
  min_topup: number; max_topup: number; min_withdrawal: number
  accept_phonepe: boolean; accept_gpay: boolean; accept_paytm: boolean; accept_other_upi: boolean
}

export type GameKind = 'xi' | 'fantasy'
export type ContestStatus = 'open' | 'locked' | 'scored' | 'paid' | 'cancelled'
export interface Contest {
  id: string; match_id: string; game: GameKind; fee: number; enabled: boolean; status: ContestStatus
  lock_at: string; cancel_reason: string | null; scored_at: string | null; settled_at: string | null; live_at?: string | null
}
export interface Entry {
  id: string; contest_id: string; user_id: string; points: number; correct: number; rank: number | null; payout: number
  created_at: string; updated_at: string
  who?: { name: string; color: string } | null
}
export interface XiPick { entry_id: string; player_id: string; team: string }

export interface GameSettings {
  xi_points_per_correct: number; xi_perfect_team_bonus: number; xi_both_perfect_bonus: number
  xi_lock_at: 'toss' | 'start'; toss_minutes_before: number; tie_rule: 'split' | 'earliest'
  default_fee_xi: number; default_fee_fantasy: number; min_players: number
}

export interface FantasyPick { entry_id: string; player_id: string; team: string; role: MatchPlayer['role']; captain: boolean; vice: boolean }
export interface PlayerPoints { match_id: string; player_id: string; points: number; final: boolean; updated_at: string }
export interface TeamRules {
  fx_max_per_side: number; fx_wk_min: number; fx_wk_max: number; fx_bat_min: number; fx_bat_max: number
  fx_ar_min: number; fx_ar_max: number; fx_bowl_min: number; fx_bowl_max: number
  fx_captain_mult: number; fx_vice_mult: number; fx_live_update: boolean
}
