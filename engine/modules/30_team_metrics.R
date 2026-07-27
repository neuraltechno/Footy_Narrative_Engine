##########################################################
# Module
#
# Name:
#
# Team Metrics Engine
#
# Purpose:
#
# Aggregate player ratings into team ratings
#
# Inputs:
#
# Processed player data, per-round player stats (for real disposal totals), latest_round
#
# Outputs:
#
# Team-level metrics data frame
#
# Dependencies:
#
# 00_config.R, 01_helpers.R
#
##########################################################

library(dplyr)
library(tidyr)

##########################################################
# Calculate Team Metrics
#
# Description:
#
# Calculates aggregate ratings per team and structural metrics.
#
# Notes (fixes applied):
#
# - normalize_team_name() now comes from 00_config.R only. It was
#   previously redefined locally in this file (and duplicated again in
#   40_match_metrics.R), so a club-name mapping change had to be made in
#   multiple places to take effect everywhere.
#
# - Player-game rows are no longer filtered to pir > 0 (that silently
#   dropped real zero AND negative PIR performances - see prior note
#   below) - but pir being non-NA turned out to be the wrong test for
#   "was this a real game" anyway. PIR_History is grid-completed in
#   20_season_aggregation.R (complete(player.playerId, round.roundNumber =
#   seq(min_rd, max_rd))) so every player has a row for every round in the
#   season regardless of whether they played it - a bye, a pre-debut round,
#   or a round most of the competition sits out (e.g. round 0 / "Opening
#   Round", which typically only features a handful of teams) all produce
#   a filler row with pir replaced to 0 (not NA) and played = FALSE. Those
#   filler rows were passing the old `!is.na(pir)` filter as if they were
#   real games, giving every team a phantom row for rounds they never
#   played - which is what the "No real disposal data found for round 0"
#   warnings from calculate_team_metrics() were actually flagging (the
#   real disposal-totals join correctly has nothing for a round a team
#   didn't play; the phantom PIR row did). Filtering on the `played` flag
#   PIR_History already carries fixes both the original 0-PIR-game
#   understatement and this phantom-row issue at once: real games with a
#   genuine 0 or negative PIR still have played = TRUE and are kept; grid
#   filler for rounds never played is now correctly excluded.
#
# - approx_round_disposals previously divided DI_for (a season-to-date
#   cumulative disposal total, confirmed via raw team_stats export - one row
#   per team, no Round column at all) by either the pipeline's global
#   latest_round or each row's own round number, and either way was only
#   ever an APPROXIMATION of a round's true disposal count, since team_stats
#   simply doesn't carry round-level data. That approximation was the root
#   cause of every team showing a positive power_score_delta / "Surging"
#   trend regardless of real form - see history in 60_power_rankings.R and
#   00_config.R for the full trail.
#
#   Replaced entirely: raw per-player, per-round data already contains a
#   real `disposals` figure (confirmed via raw_stats export) that survives
#   unchanged through 10_player_metrics.R, but gets dropped by the
#   `select(player.playerId, round.roundNumber, PIR)` in
#   20_season_aggregation.R's round_pir_series (which becomes PIR_History -
#   the only per-round structure this function used to receive). Rather
#   than widening PIR_History's shape (bigger blast radius - other
#   consumers rely on its current columns), this function now takes a
#   second input, player_round_stats, sourced from
#   season_agg$clean_processed_rounds (already returned by
#   calculate_season_aggregation(), already used elsewhere in
#   process_stats.R) - the pre-PIR_History per-round rows that still carry
#   `disposals` and `team.name`. Team disposal totals are summed directly
#   from real played games and joined on (round, team) together, not team
#   alone - this is now an exact figure, not an approximation, so it won't
#   drift on re-run and needs no divisor logic at all. team_stats/DI_for is
#   no longer used by this function.
##########################################################
calculate_team_metrics <- function(player_season_data, player_round_stats, latest_round) {
    message("INFO: Starting Team Metrics...")

    # 1. Unnest individual player match-by-match PIR records.
    #    Zero and negative PIR games are intentionally kept - a bad game is
    #    still a real team contribution and should count toward the total.
    player_game_rows <- player_season_data |>
        select(player.playerId, team = team.name, playerLine, PIR_History) |>
        unnest(PIR_History) |>
        filter(played)

    # 2. Real per-round, per-team disposal totals, summed directly from
    #    played games (team.name is already normalized upstream in
    #    10_player_metrics.R, so no re-normalization needed here).
    team_disposal_totals <- player_round_stats |>
        filter(!is.na(disposals)) |>
        group_by(round = round.roundNumber, team = team.name) |>
        summarise(
            actual_round_disposals = sum(disposals, na.rm = TRUE),
            .groups = 'drop'
        )

    # 3. Core structural team line calculations
    team_metrics <- player_game_rows |>
        group_by(round, team) |>
        summarise(
            engine_room_pir   = round(sum(pir[playerLine %in% c("Midfield", "Ruck")], na.rm = TRUE), 1),
            iron_curtain_pir  = round(sum(pir[playerLine == "Backs"], na.rm = TRUE), 1),
            the_arsenal_pir   = round(sum(pir[playerLine == "Forwards"], na.rm = TRUE), 1),
            total_player_pir  = sum(pir, na.rm = TRUE),
            .groups = 'drop'
        ) |>
        mutate(team = sapply(team, normalize_team_name)) |>
        left_join(team_disposal_totals, by = c("round", "team")) |>
        mutate(
            approx_round_disposals = if_else(
                is.na(actual_round_disposals),
                TEAM_METRICS_DEFAULT_ROUND_DISPOSALS,
                actual_round_disposals
            ),
            system_velocity = round(total_player_pir / approx_round_disposals, 2),
            overall_rating  = round(total_player_pir / 22, 1) # Mean player baseline match score
        )

    missing_baseline_teams <- team_metrics |>
        filter(is.na(actual_round_disposals)) |>
        distinct(round, team)

    if (nrow(missing_baseline_teams) > 0) {
        message(
            "WARNING: No real disposal data found for ",
            nrow(missing_baseline_teams), " round/team combination(s) - using default fallback of ",
            TEAM_METRICS_DEFAULT_ROUND_DISPOSALS, " disposals/round. E.g.: ",
            paste(utils::head(paste0(missing_baseline_teams$team, " (round ", missing_baseline_teams$round, ")"), 5), collapse = ", ")
        )
    }

    message("INFO: Completed Team Metrics")
    return(team_metrics)
}