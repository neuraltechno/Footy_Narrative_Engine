# Plan: Add Round Navigation to Team Power Rankings

## Goal
Enable users to navigate through previous rounds in `team-power-rankings.tsx`, matching the design and UX pattern established by `match-centre.tsx`, while updating the backend R pipeline to export per-round power rankings JSON files (or pre-calculate all rounds so the frontend can instantly switch between rounds).

---

## 1. Backend Architecture Changes (R Engine)
- **Module:** `engine/modules/60_power_rankings.R` & `engine/modules/99_export_json.R` & `engine/process_stats.R`
- **What needs to change:**
  - Currently, `calculate_power_rankings` only calculates power rankings for the single latest round (`latest_round`).
  - We need to compute power rankings for *every* available round in the season (or all rounds up to `latest_round`), exactly like `calculate_match_metrics` / `build_match_centers_export` does for match centers, or export an index and per-round JSON files.
  - Let's check how `match-centre.tsx` structures its round files:
    - `match_centers_index.json` containing `latest_round` and list of rounds.
    - Per-round files like `team_match_centers_r01.json`, `team_match_centers_r02.json`, etc., or a single index/history file or per-round power rankings files.
  - Wait, let's look at what `team-power-rankings.tsx` needs per round:
    - `powerRankings` for the selected round.
    - `teamHistory` (season-to-date or all round metrics up to selected round, or all round metrics for the season so sparklines and line breakdowns work correctly).
  - Let's check how `team-power-rankings.tsx` uses `teamHistory`:
    - `latestRound` is computed as `Math.max(...teamHistory.map(r => r.round))`.
    - `latestRoundByTeam` filters `teamHistory` where `round === latestRound`.
    - `velocityHistoryByTeam` collects all system velocity values across all rounds in `teamHistory` for sparklines.
  - Therefore, if `teamHistory` (`team_metrics_history.json`) contains all rounds across the season, and `power_rankings.json` is replaced by (or supplemented with) a round index and per-round power rankings files (e.g. `power_rankings_index.json` and `power_rankings_r01.json`, `power_rankings_r02.json`, etc.), or if all round power rankings are bundled into an object / exported per round:
    - Let's check what pattern `match-centre.tsx` uses:
      - `match_centers_index.json`: `{ season, latest_round, round_count, rounds: [{ round, file, match_count, ... }] }`
      - Per-round JSON files in `json/<season>/league/` (or `matches/` or `league/by-round/`).
      - Let's design `power_rankings_index.json` and `league/by-round/power_rankings_rNN.json` (or `league/power_rankings_rNN.json`).

---

## 2. Frontend Implementation (`pages/stats/team-power-rankings.tsx`)
- **Round Navigator Component:**
  - Mirror the round selector / round navigation bar used in `match-centre.tsx`.
  - Allow selecting any available round from `1` up to `latest_round`.
  - Instant client-side switching between rounds since all rounds' power rankings are pre-loaded via `getStaticProps`.
- **Props update:**
  - `index`: `PowerRankingsIndex` (listing available rounds, latest round, etc.)
  - `allRounds`: `Record<number, PowerRanking[]>` (keyed by round number)
  - `teamHistory`: `TeamRoundMetrics[]` (all rounds, used for sparklines and line breakdowns)
  - `currentSeason`: `string`

---

## 3. Detailed Steps
1. **R Backend (`60_power_rankings.R` / `99_export_json.R` / `process_stats.R`):**
   - Create a helper or loop in `calculate_power_rankings` (or an export wrapper `build_power_rankings_export`) that computes `calculate_power_rankings(team_profiles, match_evals, r)` for every round `r` from 1 to `latest_round` (or rounds where metrics exist).
   - Generate an index structure `power_rankings_index.json`:
     ```json
     {
       "season": 2026,
       "latest_round": 21,
       "rounds": [1, 2, ..., 21]
     }
     ```
   - Export per-round files: `json/<CURRENT_SEASON>/league/by-round/power_rankings_r01.json`, etc. (or similar path structure).
2. **Next.js Page (`team-power-rankings.tsx`):**
   - Update `getStaticProps` to read `power_rankings_index.json` and load all per-round rankings into `allRounds`.
   - Add state for `selectedRound` (defaulting to `index.latest_round`).
   - Render the round navigation bar at the top (allowing quick switching between rounds).
   - Filter/display `powerRankings` for `selectedRound`.
