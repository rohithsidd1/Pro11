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
}

export interface ApiUsage { day: string; credits: number; calls: number; hits_today: number | null; hits_limit: number | null }
export interface ApiCall { id: number; at: string; endpoint: string; match_id: string | null; credits: number; ok: boolean; trigger: 'auto' | 'admin'; note: string | null }
