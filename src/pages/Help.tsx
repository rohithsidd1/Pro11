import { Shell } from '../components/Shell'
import { useAuth } from '../lib/auth'
import { rupees } from '../lib/money'

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
        <Q q="How do I add money?">Wallet → Add money. Pay {String(s.payee_name ?? 'the admin')} on any UPI app, upload the payment screenshot, check the details and send. Your balance updates once it’s approved. Top-ups are {rupees(n('min_topup', 10))} to {rupees(n('max_topup', 2000))}.</Q>
        <Q q="How do I withdraw?">Wallet → Withdraw (at least {rupees(n('min_withdrawal', 50))}). The amount leaves your balance straight away so it can’t be spent twice, and it’s paid to your UPI ID. If it’s rejected or you cancel, it comes straight back.</Q>
        <Q q="Game 1: Predict the Playing XI">Join a match’s game, then pick 11 players from each squad before the toss (about {n('toss_minutes_before', 30)} minutes before the start). You get {n('xi_points_per_correct', 1)} point for every player who really plays, {n('xi_perfect_team_bonus', 5)} extra for a perfect side, and {n('xi_both_perfect_bonus', 10)} more if both sides are perfect.</Q>
        <Q q="Game 2: Fantasy XI">Pick 11 players (most {n('fx_max_per_side', 7)} from one team, with 1–4 wicketkeepers, 3–6 batters, 1–4 all-rounders and 3–6 bowlers) plus a captain ({n('fx_captain_mult', 2)}× points) and a vice-captain ({n('fx_vice_mult', 1.5)}×). You can change your team until the match starts. Points for runs, wickets, catches and more come from CricketData’s fantasy points rules (the admin can choose a custom rule set in Game rules): a live update around the innings break and the final points when the match ends.</Q>
        <Q q="How Fantasy points work">Every run, four, six, wicket, maiden, catch, stumping and run-out earns points under CricketData’s fantasy rules, plus points for being in the Playing XI where those rules give them. On the results screen each player shows where their points came from: <b>Bat</b>, <b>Bowl</b> and <b>Field</b>, plus <b>Other</b> for anything else (such as being in the XI). Your captain’s points count {n('fx_captain_mult', 2)}× and your vice-captain’s {n('fx_vice_mult', 1.5)}×.</Q>
        <Q q="Who wins?">The highest score takes the whole pot (entry fee × players). Pro11 never takes a cut. If people tie for first, the pot is split equally. Winnings reach your wallet 30 minutes after the final scores.</Q>
        <Q q="When is a game cancelled?">If fewer than {n('min_players', 2)} people join by the lock, if the match is abandoned or has no result, or if CricketData doesn’t have the data the game needs. Your entry always comes back to your wallet automatically.</Q>
        <Q q="Can others see my picks?">Not until the game locks. After that everyone can see everyone’s picks, including the admin.</Q>
        <Q q="Why don’t I see every match?">Pro11 only lists matches CricketData has squad and fantasy data for, so every game can be scored automatically.</Q>
      </div>
    </Shell>
  )
}
