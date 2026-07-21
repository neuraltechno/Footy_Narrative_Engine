##########################################################
# Module
#
# Name:
#
# Power Rankings
#
# Purpose:
#
# Identify the strongest teams based on rolling metrics
#
# Inputs:
#
# Processed Team Data Profiles, Latest Round Sequence
#
# Outputs:
#
# Power Rankings Data Frame
#
# Dependencies:
#
# 00_config.R, 01_helpers.R
#
##########################################################

library(dplyr)

##########################################################
# Calculate Power Rankings
#
# Description:
#
# Calculates a unified power rating from each team's trailing form.
#
# Notes (fixes applied):
#
# - This previously filtered to a single round (round == latest_round) and
#   scored teams purely off that one round's numbers, despite the module
#   purpose stating "rolling metrics". A single round is noisy - one
#   blowout could flip a team from "Faltering" to "Surging" week to week.
#   It now averages overall_rating and system_velocity across the trailing
#   POWER_RANKINGS_ROLLING_WINDOW rounds (default 3, see 00_config.R).
#
# - power_score weights and trend thresholds are now named constants in
#   00_config.R (POWER_SCORE_WEIGHT_*, POWER_TREND_*_THRESHOLD) instead of
#   bare literals here.
#
# - Output columns changed: overall_rating/system_velocity are replaced by
#   rolling_overall_rating/rolling_system_velocity to make clear these are
#   window averages, not a single round's value. A rounds_in_window column
#   is included so consumers (e.g. narrative generation) can flag small
#   early-season samples. If any downstream module (e.g. 90_narratives.R)
#   reads power_rankings$overall_rating or $system_velocity directly by
#   name, it will need updating to the new column names.
##########################################################
calculate_power_rankings <- function(team_metrics, latest_round) {
    message("INFO: Starting Power Rankings...")

    window_start <- max(1, latest_round - POWER_RANKINGS_ROLLING_WINDOW + 1)

    rolling_form <- team_metrics |>
        filter(round >= window_start & round <= latest_round) |>
        group_by(team) |>
        summarise(
            rounds_in_window        = n(),
            rolling_overall_rating  = round(mean(overall_rating, na.rm = TRUE), 2),
            rolling_system_velocity = round(mean(system_velocity, na.rm = TRUE), 2),
            .groups = 'drop'
        )

    rankings <- rolling_form |>
        mutate(
            round       = latest_round,
            power_score = round((rolling_overall_rating * POWER_SCORE_WEIGHT_RATING) +
                                 (rolling_system_velocity * POWER_SCORE_WEIGHT_VELOCITY), 1),
            trend = case_when(
                rolling_system_velocity >= POWER_TREND_SURGING_THRESHOLD   ~ "Surging",
                rolling_system_velocity <= POWER_TREND_FALTERING_THRESHOLD ~ "Faltering",
                TRUE                                                      ~ "Steady"
            )
        ) |>
        arrange(desc(power_score)) |>
        mutate(power_rank = row_number())

    thin_sample_teams <- rankings |>
        filter(rounds_in_window < POWER_RANKINGS_ROLLING_WINDOW) |>
        pull(team)

    if (length(thin_sample_teams) > 0) {
        message(
            "INFO: Rolling window not yet full (early season / byes) for: ",
            paste(thin_sample_teams, collapse = ", ")
        )
    }

    message("INFO: Completed Power Rankings")
    return(rankings)
}