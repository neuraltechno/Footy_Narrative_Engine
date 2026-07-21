##########################################################
# Module
#
# Name:
#
# Match Engine
#
# Purpose:
#
# Generate complete match summaries (expected scores, robbery index)
#
# Inputs:
#
# Raw Results Dataset, Calculated Team Line Snapshots, Latest Round
#
# Outputs:
#
# Match-level metrics data frame
#
# Dependencies:
#
# 00_config.R, 01_helpers.R
#
##########################################################

library(dplyr)

##########################################################
# Calculate Match Metrics
#
# Description:
#
# Calculates match-level metrics for game summaries.
#
# Notes (fixes applied):
#
# - normalize_team_name() now comes from 00_config.R only, instead of being
#   redefined locally (see 30_team_metrics.R for the matching note).
#
# - Draws are now handled explicitly. expected_winner / actual_winner
#   previously used if_else() with no tie branch, so a drawn match
#   (home_score == away_score) had actual_winner silently set to
#   away_team - fabricating a result, and potentially flagging a fair draw
#   as a "robbery" if the xscore model favoured the home side.
#
# - Expected-score coefficients are now named constants in 00_config.R
#   (XSCORE_W_*) instead of bare literals here, with a comment there
#   explaining what they currently represent (see 00_config.R).
##########################################################
calculate_match_metrics <- function(results, team_line_snapshots, latest_round) {
    message("INFO: Starting Match Engine...")

    # 1. Structure match pairings from source JSON schedules
    match_pairings <- results |>
        filter(round.roundNumber <= latest_round & status == "CONCLUDED") |>
        select(
            round        = round.roundNumber,
            home_team    = match.homeTeam.name,
            away_team    = match.awayTeam.name,
            home_score   = homeTeamScore.matchScore.totalScore,
            away_score   = awayTeamScore.matchScore.totalScore,
            home_goals   = homeTeamScore.matchScore.goals,
            home_behinds = homeTeamScore.matchScore.behinds,
            away_goals   = awayTeamScore.matchScore.goals,
            away_behinds = awayTeamScore.matchScore.behinds
        ) |>
        mutate(
            home_team = sapply(home_team, normalize_team_name),
            away_team = sapply(away_team, normalize_team_name)
        )

    # 2. Convert raw scoring events to expected score performance baselines
    match_metrics <- match_pairings |>
        mutate(
            home_raw_xscore = round(((home_goals * XSCORE_W_GOAL_AS_GOAL + home_behinds * XSCORE_W_BEHIND_AS_GOAL) * 6) +
                                    ((home_goals * XSCORE_W_GOAL_AS_BEHIND + home_behinds * XSCORE_W_BEHIND_AS_BEHIND) * 1), 1),

            away_raw_xscore = round(((away_goals * XSCORE_W_GOAL_AS_GOAL + away_behinds * XSCORE_W_BEHIND_AS_GOAL) * 6) +
                                    ((away_goals * XSCORE_W_GOAL_AS_BEHIND + away_behinds * XSCORE_W_BEHIND_AS_BEHIND) * 1), 1)
        ) |>
        # 3. Join Side-by-Side Team Line PIR & System Dynamics
        left_join(team_line_snapshots, by = c("round" = "round", "home_team" = "team")) |>
        rename_with(~ paste0("home_", .), .cols = c(engine_room_pir, iron_curtain_pir, the_arsenal_pir, system_velocity)) |>
        left_join(team_line_snapshots, by = c("round" = "round", "away_team" = "team")) |>
        rename_with(~ paste0("away_", .), .cols = c(engine_room_pir, iron_curtain_pir, the_arsenal_pir, system_velocity)) |>
        select(-contains("total_player_pir"), -contains("DI_for"), -contains("approx_round_disposals"), -contains("overall_rating")) |>
        mutate(
            expected_winner = case_when(
                home_raw_xscore > away_raw_xscore ~ home_team,
                away_raw_xscore > home_raw_xscore ~ away_team,
                TRUE                              ~ "Draw"
            ),
            actual_winner = case_when(
                home_score > away_score ~ home_team,
                away_score > home_score ~ away_team,
                TRUE                    ~ "Draw"
            ),
            # A genuine draw is its own outcome, not a mismatch against
            # expectation - only flag a robbery when both sides produced a
            # real winner and they disagree.
            is_robbery = actual_winner != "Draw" & expected_winner != "Draw" & expected_winner != actual_winner,
            luck_delta = abs((home_score - away_score) - (home_raw_xscore - away_raw_xscore))
        )

    missing_lines <- match_metrics |>
        filter(is.na(home_system_velocity) | is.na(away_system_velocity)) |>
        nrow()

    if (missing_lines > 0) {
        message(
            "WARNING: ", missing_lines,
            " match(es) missing a team-line snapshot after join (bye rounds, finals, or data gaps) - ",
            "check team_line_snapshots coverage for the affected round(s)."
        )
    }

    message("INFO: Completed Match Engine")
    return(match_metrics)
}