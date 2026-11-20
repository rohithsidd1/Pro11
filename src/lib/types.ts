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
  show_men_intl: boolean
  show_women_intl: boolean
  show_leagues: boolean
  show_domestic: boolean
  sync_paused: boolean
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
export interface PlayerPoints { match_id: string; player_id: string; points: number; bat?: number; bowl?: number; field?: number; final: boolean; updated_at: string }
export interface TeamRules {
  fx_max_per_side: number; fx_wk_min: number; fx_wk_max: number; fx_bat_min: number; fx_bat_max: number
  fx_ar_min: number; fx_ar_max: number; fx_bowl_min: number; fx_bowl_max: number
  fx_captain_mult: number; fx_vice_mult: number; fx_live_update: boolean
}
