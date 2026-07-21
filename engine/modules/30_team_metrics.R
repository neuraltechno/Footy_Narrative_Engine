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
# Processed player data, team_stats baseline, latest_round
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
# - Player-game rows are no longer filtered to pir > 0. That filter
#   silently dropped every zero AND negative PIR performance before
#   summing team totals, which understated genuinely poor games and
#   inflated total_player_pir / overall_rating / system_velocity for teams
#   carrying bad individual performances. Only rows with a missing (NA)
#   PIR value are excluded now, since those aren't a real recorded game.
#
# - approx_round_disposals no longer divides by the pipeline's global
#   latest_round. DI_for is a season-to-date cumulative disposal count, so
#   dividing it by latest_round applied "today's" average retroactively to
#   every historical round in team_metrics - meaning Round 3's
#   system_velocity would change value every week for the rest of the
#   season just because latest_round kept climbing. It's now divided by
#   each row's OWN round number, so a round's derived metrics stay fixed
#   once that round has been played. The fallback constant
#   (TEAM_METRICS_DEFAULT_ROUND_DISPOSALS) is already a single-round
#   estimate and is used as-is, not divided further.
##########################################################
calculate_team_metrics <- function(player_season_data, team_stats, latest_round) {
    message("INFO: Starting Team Metrics...")

    # 1. Unnest individual player match-by-match PIR records.
    #    Zero and negative PIR games are intentionally kept - a bad game is
    #    still a real team contribution and should count toward the total.
    player_game_rows <- player_season_data |>
        select(player.playerId, team = team.name, playerLine, PIR_History) |>
        unnest(PIR_History) |>
        filter(!is.na(pir))

    # 2. Pull season disposal metrics for velocity weightings
    team_disposal_baselines <- team_stats |>
        mutate(Team = sapply(Team, normalize_team_name)) |>
        select(team = Team, DI_for)

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
        left_join(team_disposal_baselines, by = "team") |>
        mutate(
            approx_round_disposals = if_else(
                is.na(DI_for),
                TEAM_METRICS_DEFAULT_ROUND_DISPOSALS,
                DI_for / pmax(round, 1)
            ),
            system_velocity = round(total_player_pir / approx_round_disposals, 2),
            overall_rating  = round(total_player_pir / 22, 1) # Mean player baseline match score
        )

    missing_baseline_teams <- team_metrics |>
        filter(is.na(DI_for)) |>
        pull(team) |>
        unique()

    if (length(missing_baseline_teams) > 0) {
        message(
            "WARNING: No team_stats disposal baseline found for: ",
            paste(missing_baseline_teams, collapse = ", "),
            " - using default fallback of ", TEAM_METRICS_DEFAULT_ROUND_DISPOSALS, " disposals/round."
        )
    }

    message("INFO: Completed Team Metrics")
    return(team_metrics)
}