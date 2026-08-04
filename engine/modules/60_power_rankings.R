##########################################################
# Module
#
# Name:
#
# Power Rankings (The Form Pulse)
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
# Power Rankings (The Form Pulse) Data Frame
#
# Dependencies:
#
# 00_config.R, 01_helpers.R
#
##########################################################

library(dplyr)

##########################################################
# Calculate Power Rankings (The Form Pulse)
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
#
# - trend re-based from score momentum to ladder movement: it previously
#   compared strength_adjusted_power_score across two non-overlapping
#   rolling windows (Surging/Faltering/Steady), which read as confusing on
#   the page - a "Faltering" team could still be #1 on the ladder, and the
#   magnitude driving the label wasn't visible anywhere. trend now compares
#   power_rank this round to power_rank the PREVIOUS round (not the
#   previous window - ladder movement is understood round-to-round, not
#   in 3-round chunks) and labels Rising/Falling/Steady off spots moved.
#   New thresholds POWER_TREND_RISING_RANK_SPOTS / POWER_TREND_FALLING_RANK_SPOTS
#   (00_config.R) control how many spots of movement counts as each label.
#   power_score_delta and strength_adjusted_power_score_delta are kept as
#   raw output fields (still useful context, e.g. for narrative copy) but
#   no longer drive trend themselves.
#
# - Fixed a hardcoded assumption that the season always starts at round 1.
#   build_rolling_window(), attach_strength_adjustment(), and the
#   prior_window existence check all clamped their window floor to a
#   literal 1. This broke any season with a round 0 (e.g. a 2026-style
#   opening round where only some teams play, common with an odd number
#   of teams in the draw): build_rolling_window(0) resolved to
#   filter(round >= 1 & round <= 0), an impossible range, so round 0
#   silently returned zero rows despite real data existing for it. The
#   floor is now min_round, the earliest round actually present in
#   team_metrics for this run - so it adapts automatically whether a
#   season starts at round 0, round 1, or anything else, with no
#   season-specific literals baked in.
#
# - Added ladder_position: the actual AFL ladder spot (Actual_Rank from
#   50_justice_ladder.R's calculate_justice_ladder(), which sorts on real
#   competition points and percentage - the literal ladder, nothing
#   probabilistic) is now joined onto the output as ladder_position. This
#   is purely for the frontend to display alongside power_rank ("Ladder
#   #1, Form #8") so readers can see this metric is about recent output
#   quality, not who's actually won the most games - the two numbers are
#   allowed to disagree, and on the site that disagreement is the point.
#   calculate_power_rankings_for_round(), calculate_power_rankings(), and
#   build_power_rankings_export() all take a new optional justice_ladder
#   argument (a data frame with team + Actual_Rank, i.e. what
#   calculate_justice_ladder()/get_ladder_movement() returns) - omit it
#   and ladder_position comes back NA rather than erroring, matching the
#   fallback style already used elsewhere in this file (e.g. the
#   match_evals coverage gap for strength_adjustment_factor above).
#   build_power_rankings_export() needs a DIFFERENT ladder for each
#   historical round (the ladder as it stood after THAT round, not
#   today's), so rather than recomputing calculate_justice_ladder() from
#   scratch per round it reads the existing round_<n>.rds snapshots that
#   50_justice_ladder.R's save_ladder_snapshot()/catchup_justice_snapshots()
#   already maintain - see the new snapshot_dir argument.
#
# - NOTE on naming: the page-facing name is changing from "Power Rankings"
#   to "The Form Pulse" to better signal this is a form/output metric, not
#   a claim about who's actually best. That rename is applied here in
#   comments/log messages only. Internal identifiers (function names,
#   power_score/power_rank/strength_adjusted_power_score column names,
#   the power_rankings_index/power_rankings_rounds keys in
#   process_stats.R, and the power_rankings_r##.json filenames) are left
#   unchanged deliberately - renaming those would ripple into
#   99_export_json.R, the Next.js data-fetching layer, and every existing
#   JSON file on disk, none of which are needed just to change what the
#   page is titled. If a full internal rename is wanted later, treat it as
#   its own change so it doesn't get tangled up with this one.
##########################################################
# Helper to calculate Power Rankings (The Form Pulse) for a single target round
calculate_power_rankings_for_round <- function(team_metrics, match_evals, target_round, justice_ladder = NULL) {
    window <- POWER_RANKINGS_ROLLING_WINDOW

    # Earliest round actually present in the data. Used as the window floor
    # everywhere below instead of a hardcoded 1, so this adapts whether the
    # season begins at round 0, round 1, or anything else - no assumption
    # baked in about which round number a season "starts" on.
    min_round <- min(team_metrics$round, na.rm = TRUE)

    build_rolling_window <- function(end_round) {
        start_round <- max(min_round, end_round - window + 1)

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

    season_strength <- team_metrics |>
        filter(round <= target_round) |>
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

    opponent_lookup <- bind_rows(
        match_evals |> select(round, team = home_team, opponent = away_team),
        match_evals |> select(round, team = away_team, opponent = home_team)
    )

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
        start_round <- max(min_round, end_round - window + 1)

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

    current_window <- build_rolling_window(target_round) |>
        attach_strength_adjustment(target_round)

    # Rank-only snapshot for a given round, reusing the same rolling-window +
    # opponent-adjustment logic as current_window above. Used to look up
    # where a team sat on the power ladder in a specific PRIOR round (not a
    # prior window) so trend can be based on actual ladder movement.
    rank_snapshot_for_round <- function(end_round) {
        build_rolling_window(end_round) |>
            attach_strength_adjustment(end_round) |>
            arrange(desc(strength_adjusted_power_score)) |>
            transmute(team, power_rank = row_number())
    }

    previous_round <- target_round - 1

    previous_round_ranks <- if (previous_round >= min_round) {
        rank_snapshot_for_round(previous_round) |>
            rename(prior_round_power_rank = power_rank)
    } else {
        tibble(team = character(), prior_round_power_rank = integer())
    }

    prior_window_end <- target_round - window

    prior_window <- if (prior_window_end >= min_round) {
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
        left_join(previous_round_ranks, by = "team") |>
        mutate(
            round                = target_round,
            league_avg_strength  = .env$league_avg_strength,
            power_score_delta    = round(power_score - prior_power_score, 1),
            strength_adjusted_power_score_delta = round(strength_adjusted_power_score - prior_strength_adjusted_power_score, 1)
        ) |>
        arrange(desc(strength_adjusted_power_score)) |>
        mutate(
            power_rank = row_number(),
            # Positive = moved UP the ladder since last round (e.g. prior
            # rank 5 -> current rank 3 = +2). Negative = moved down.
            rank_movement = prior_round_power_rank - power_rank,
            trend = case_when(
                is.na(rank_movement)                              ~ "New / Insufficient History",
                rank_movement >= POWER_TREND_RISING_RANK_SPOTS    ~ "Rising",
                rank_movement <= -POWER_TREND_FALLING_RANK_SPOTS  ~ "Falling",
                TRUE                                              ~ "Steady"
            )
        )

    # ladder_position: the real ladder spot (Actual_Rank), for frontend
    # context alongside power_rank. justice_ladder is optional - a data
    # frame with at least team + Actual_Rank (what calculate_justice_ladder()
    # / get_ladder_movement() in 50_justice_ladder.R return). No ladder
    # supplied, or it's missing Actual_Rank -> ladder_position comes back NA
    # rather than erroring, so this module can still be used standalone.
    has_ladder <- !is.null(justice_ladder) && "Actual_Rank" %in% names(justice_ladder)

    rankings <- if (has_ladder) {
        rankings |>
            left_join(
                justice_ladder |> select(team, ladder_position = Actual_Rank),
                by = "team"
            )
    } else {
        rankings |> mutate(ladder_position = NA_integer_)
    }

    return(rankings)
}

calculate_power_rankings <- function(team_metrics, match_evals, latest_round, justice_ladder = NULL) {
    message("INFO: Starting Power Rankings (The Form Pulse)...")
    res <- calculate_power_rankings_for_round(team_metrics, match_evals, latest_round, justice_ladder = justice_ladder)
    message("INFO: Completed Power Rankings (The Form Pulse)")
    return(res)
}

build_power_rankings_export <- function(team_metrics, match_evals, latest_round, snapshot_dir = NULL) {
    message("INFO: Building per-round Form Pulse (power rankings) export structures...")

    available_rounds <- sort(unique(team_metrics$round))
    # Only keep rounds up to latest_round where team metrics exist
    available_rounds <- available_rounds[available_rounds <= latest_round]

    if (length(available_rounds) == 0) {
        available_rounds <- c(latest_round)
    }

    round_index_entries <- vector("list", length(available_rounds))
    rounds_data         <- vector("list", length(available_rounds))

    for (i in seq_along(available_rounds)) {
        rnd      <- available_rounds[i]
        rnd_str  <- sprintf("%02d", rnd)
        filename <- paste0("by-round/power_rankings_r", rnd_str, ".json")

        # ladder_position needs the ladder AS IT STOOD after this specific
        # round, not today's ladder - so each round reads its own snapshot
        # rather than reusing one justice_ladder for every round. These
        # snapshots are already maintained by 50_justice_ladder.R's
        # save_ladder_snapshot() / catchup_justice_snapshots(), called
        # earlier in process_stats.R, so this is a read, not a recompute.
        round_justice_ladder <- NULL
        if (!is.null(snapshot_dir)) {
            snapshot_path <- file.path(snapshot_dir, paste0("round_", rnd, ".rds"))
            if (file.exists(snapshot_path)) {
                round_justice_ladder <- readRDS(snapshot_path)
            } else {
                message("INFO:   No Justice Ladder snapshot for round ", rnd,
                        " - ladder_position will be NA in this round's Form Pulse export.")
            }
        }

        round_rankings <- calculate_power_rankings_for_round(
            team_metrics, match_evals, rnd,
            justice_ladder = round_justice_ladder
        )

        rising_count  <- sum(round_rankings$trend == "Rising", na.rm = TRUE)
        falling_count <- sum(round_rankings$trend == "Falling", na.rm = TRUE)
        leader_team   <- if (nrow(round_rankings) > 0) round_rankings$team[1] else NA_character_
        leader_score  <- if (nrow(round_rankings) > 0) round_rankings$strength_adjusted_power_score[1] else NA_real_

        round_index_entries[[i]] <- list(
            round         = rnd,
            file          = filename,
            team_count    = nrow(round_rankings),
            rising_count  = rising_count,
            falling_count = falling_count,
            leader        = leader_team,
            leader_score  = leader_score
        )

        rounds_data[[i]] <- round_rankings
        names(rounds_data)[i] <- sub("^by-round/", "", filename)

        message(paste0("INFO:   Form Pulse (power rankings) Round ", rnd, " -> ", filename,
                       " (", nrow(round_rankings), " teams)"))
    }

    index <- list(
        season       = CURRENT_SEASON,
        latest_round = latest_round,
        round_count  = length(available_rounds),
        rounds       = round_index_entries
    )

    message(paste0("INFO: Form Pulse (power rankings) export structures built (",
                   length(available_rounds), " rounds)"))

    return(list(
        index  = index,
        rounds = rounds_data
    ))
}