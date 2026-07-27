##########################################################
# Module
#
# Name:
#
# Power Rankings
#
# Purpose:
#
# Identify the strongest teams based on rolling metrics, adjusted for
# the quality of opposition faced.
#
# Inputs:
#
# Processed Team Data Profiles, Match Engine Output (for opponent
# lookup), Latest Round Sequence
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
# Calculates a unified power rating from each team's trailing form,
# adjusted for the strength of the opposition that form was built against.
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
# - power_score weights and trend deltas are now named constants in
#   00_config.R (POWER_SCORE_WEIGHT_*, POWER_TREND_*_DELTA) instead of bare
#   literals here.
#
# - Output columns changed: overall_rating/system_velocity are replaced by
#   rolling_overall_rating/rolling_system_velocity to make clear these are
#   window averages, not a single round's value. A rounds_in_window column
#   is included so consumers (e.g. narrative generation) can flag small
#   early-season samples. If any downstream module (e.g. 90_narratives.R)
#   reads power_rankings$overall_rating or $system_velocity directly by
#   name, it will need updating to the new column names.
#
# - trend previously thresholded the CURRENT window's rolling_system_velocity
#   against a fixed absolute level (POWER_TREND_SURGING/FALTERING_THRESHOLD).
#   system_velocity is total_player_pir / approx_round_disposals - a
#   quality-per-possession level, not a rate of change - so it doesn't carry
#   any notion of "improving" or "declining" on its own, and every team's
#   value sat well clear of the old thresholds regardless of form. Every
#   team was landing on "Surging" as a result. trend was then moved to real
#   momentum (this window's power_score vs. the PRIOR non-overlapping
#   window's power_score) - but that still had no notion of opponent
#   quality, so a team beating weak sides by a lot could show "Faltering"
#   purely because PIR output happened to dip, even on a 3-0 stretch.
#
# - Opponent strength adjustment added: a new function parameter,
#   match_evals (the Match Engine's output - see 40_match_metrics.R),
#   supplies round/home_team/away_team so each team's opponent for every
#   round can be looked up (same team/opponent reshape
#   50_justice_ladder.R's build_team_game_level does, minus the scoring
#   columns we don't need here). Opponent quality is proxied by that
#   opponent's own season-to-date power_score (unwindowed average across
#   every round played so far) - deliberately mirroring the same
#   simplification 50_justice_ladder.R's Strength_Of_Schedule already
#   uses (a full-season aggregate rather than a strictly time-respecting
#   "rating as of the round they were played" solver), so this codebase
#   isn't carrying two different SOS philosophies. Justice Ladder's SOS is
#   built from the xscore/expected-scoring model though, not PIR - the two
#   stay conceptually distinct (results/luck vs. player output quality)
#   even though both now touch "opponent strength".
#
#   strength_adjustment_factor = (avg opponent season power_score over the
#   window actually played) / (league-wide average season power_score).
#   strength_adjusted_power_score = power_score * that factor - so beating
#   above-average opposition inflates the score, below-average opposition
#   deflates it, and an average draw of opposition leaves it unchanged.
#   trend now runs off strength_adjusted_power_score's momentum (current
#   window vs. prior window) instead of raw power_score's, so a team
#   winning heavily against weak opposition can legitimately show
#   "Faltering" if their adjusted output is genuinely declining, or
#   "Surging" if it isn't - rather than the raw PIR dip alone driving the
#   label. Raw power_score and power_score_delta are still included
#   unchanged for transparency/comparison.
#
#   Where match_evals has no coverage for a team's round (a data gap, not
#   a real bye - byes simply don't produce a row from either source), the
#   adjustment factor falls back to 1 (i.e. strength_adjusted_power_score
#   equals the unadjusted power_score for that team this run) rather than
#   propagating NA into the ranking/trend logic.
##########################################################
calculate_power_rankings <- function(team_metrics, match_evals, latest_round) {
    message("INFO: Starting Power Rankings...")

    window <- POWER_RANKINGS_ROLLING_WINDOW

    # Builds a rolling summary (+ power_score) for the W-round window ending
    # at end_round. Used for both the current window and the prior window,
    # so the two are always computed identically.
    build_rolling_window <- function(end_round) {
        start_round <- max(1, end_round - window + 1)

        team_metrics |>
            filter(round >= start_round & round <= end_round) |>
            group_by(team) |>
            summarise(
                rounds_in_window        = n(),
                rolling_overall_rating  = round(mean(overall_rating, na.rm = TRUE), 2),
                rolling_system_velocity = round(mean(system_velocity, na.rm = TRUE), 2),
                .groups = 'drop'
            ) |>
            mutate(
                power_score = round((rolling_overall_rating * POWER_SCORE_WEIGHT_RATING) +
                                     (rolling_system_velocity * POWER_SCORE_WEIGHT_VELOCITY), 1)
            )
    }

    # --- Opponent strength (season-to-date, unwindowed - see notes above) ---
    season_strength <- team_metrics |>
        filter(round <= latest_round) |>
        group_by(team) |>
        summarise(
            season_overall_rating  = mean(overall_rating, na.rm = TRUE),
            season_system_velocity = mean(system_velocity, na.rm = TRUE),
            .groups = 'drop'
        ) |>
        mutate(
            season_power_score = round((season_overall_rating * POWER_SCORE_WEIGHT_RATING) +
                                        (season_system_velocity * POWER_SCORE_WEIGHT_VELOCITY), 1)
        )

    league_avg_strength <- round(mean(season_strength$season_power_score, na.rm = TRUE), 1)

    # One row per (round, team, opponent) - reshaped from match-level data.
    opponent_lookup <- bind_rows(
        match_evals |> select(round, team = home_team, opponent = away_team),
        match_evals |> select(round, team = away_team, opponent = home_team)
    )

    # Average season strength of whoever a team actually played within a
    # given round window - "how tough was this specific stretch", not a
    # whole-season figure.
    opponent_strength_for_window <- function(start_round, end_round) {
        opponent_lookup |>
            filter(round >= start_round & round <= end_round) |>
            left_join(season_strength |> select(team, season_power_score), by = c("opponent" = "team")) |>
            group_by(team) |>
            summarise(
                opponent_strength_index = round(mean(season_power_score, na.rm = TRUE), 1),
                .groups = 'drop'
            )
    }

    attach_strength_adjustment <- function(window_df, end_round) {
        start_round <- max(1, end_round - window + 1)

        window_df |>
            left_join(opponent_strength_for_window(start_round, end_round), by = "team") |>
            mutate(
                strength_adjustment_factor = if_else(
                    is.na(opponent_strength_index),
                    1,
                    round(opponent_strength_index / .env$league_avg_strength, 3)
                ),
                strength_adjusted_power_score = if_else(
                    is.na(opponent_strength_index),
                    power_score,
                    round(power_score * strength_adjustment_factor, 1)
                )
            )
    }

    current_window <- build_rolling_window(latest_round) |>
        attach_strength_adjustment(latest_round)

    # Prior window is the W rounds immediately before the current window
    # (non-overlapping), e.g. current = rounds 18-20, prior = rounds 15-17.
    # This avoids a single round's swing flipping the label, matching the
    # same "don't trust one round" reasoning used for the window itself.
    prior_window_end <- latest_round - window

    prior_window <- if (prior_window_end >= 1) {
        build_rolling_window(prior_window_end) |>
            attach_strength_adjustment(prior_window_end) |>
            select(
                team,
                prior_power_score                   = power_score,
                prior_strength_adjusted_power_score = strength_adjusted_power_score
            )
    } else {
        tibble(team = character(), prior_power_score = double(), prior_strength_adjusted_power_score = double())
    }

    rankings <- current_window |>
        left_join(prior_window, by = "team") |>
        mutate(
            round                = latest_round,
            league_avg_strength  = .env$league_avg_strength,
            power_score_delta    = round(power_score - prior_power_score, 1),
            strength_adjusted_power_score_delta = round(strength_adjusted_power_score - prior_strength_adjusted_power_score, 1),
            trend = case_when(
                is.na(strength_adjusted_power_score_delta)                         ~ "New / Insufficient History",
                strength_adjusted_power_score_delta >= POWER_TREND_SURGING_DELTA   ~ "Surging",
                strength_adjusted_power_score_delta <= POWER_TREND_FALTERING_DELTA ~ "Faltering",
                TRUE                                                               ~ "Steady"
            )
        ) |>
        arrange(desc(strength_adjusted_power_score)) |>
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

    missing_opponent_strength <- rankings |>
        filter(is.na(opponent_strength_index)) |>
        pull(team)

    if (length(missing_opponent_strength) > 0) {
        message(
            "WARNING: No opponent-strength data found (missing match_evals coverage) for: ",
            paste(missing_opponent_strength, collapse = ", "),
            " - strength_adjusted_power_score falls back to the unadjusted power_score for these teams this run."
        )
    }

    message("INFO: Completed Power Rankings")
    return(rankings)
}