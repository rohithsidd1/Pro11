import { Shell } from '../components/Shell'
import { useAuth } from '../lib/auth'

export function Help() {
  const { settings } = useAuth()
  const s = (settings ?? {}) as Record<string, number | string | boolean>
  const n = (k: string, d: number) => Number(s[k] ?? d)
  const Q = ({ q, children }: { q: string; children: React.ReactNode }) => (
    <details className="panel faq"><summary className="rt">{q}</summary><div className="help" style={{ color: 'var(--ink)', marginTop: 8, lineHeight: 1.55 }}>{children}</div></details>
  )
  return (
    <Shell title="How Pro11 works" back="/me">
      <div style={{ display: 'grid', gap: 8, maxWidth: 760 }}>
        <Q q="How does money work?">There’s no wallet. Each game has an entry amount, which is just the stake: nothing is paid when you join. When the game finishes, everyone who lost owes the winner their entry (split equally if winners tie). Ledger shows, per person, who owes whom across all games, and your overall balance.</Q>
        <Q q="How do I settle up?">Ledger → the person → Settle up. Pay them however you like (UPI, cash), then tap “I paid”. It counts once they confirm. If they say they didn’t receive it, talk to them and record it again.</Q>
        <Q q="Game 1: Predict the Playing XI">Join a match’s game, then pick 11 players from each squad before the toss (about {n('toss_minutes_before', 30)} minutes before the start). You get {n('xi_points_per_correct', 1)} point for every player who really plays, {n('xi_perfect_team_bonus', 5)} extra for a perfect side, and {n('xi_both_perfect_bonus', 10)} more if both sides are perfect.</Q>
        <Q q="Game 2: Fantasy XI">Pick 11 players (most {n('fx_max_per_side', 7)} from one team, with 1–4 wicketkeepers, 3–6 batters, 1–4 all-rounders and 3–6 bowlers) plus a captain ({n('fx_captain_mult', 2)}× points) and a vice-captain ({n('fx_vice_mult', 1.5)}×). You can change your team until the match starts. Points come from the Cricbuzz scorecard using standard fantasy rules (runs, boundaries, wickets, catches and more; the admin can adjust them in Game rules). They update every minute during the match.</Q>
        <Q q="How Fantasy points work">Every run, four, six, wicket, maiden, catch, stumping and run-out earns points from Pro11’s points table (the admin can see and change it in Game rules), plus points for being in the Playing XI, economy and strike rate in T20s and ODIs. On the results screen each player shows where their points came from: <b>Bat</b>, <b>Bowl</b> and <b>Field</b>, plus <b>Other</b> for anything else (such as being in the XI). Your captain’s points count {n('fx_captain_mult', 2)}× and your vice-captain’s {n('fx_vice_mult', 1.5)}×.</Q>
        <Q q="Who wins?">The highest score wins: everyone else owes the winner their entry. If people tie for first, they share it equally. Results are final 30 minutes after the last scores, then they show up in Ledger.</Q>
        <Q q="When is a game cancelled?">If fewer than {n('min_players', 2)} people join by the lock, or if the match is abandoned or has no result. Nobody owes anything for a cancelled game.</Q>
        <Q q="Can others see my picks?">Not until the game locks. After that everyone can see everyone’s picks, including the admin.</Q>
        <Q q="Why don’t I see every match?">Pro11 lists men’s internationals, leagues and domestic matches from Cricbuzz (women’s cricket isn’t shown). The admin can switch match types on or off.</Q>
      </div>
    </Shell>
  )
}
