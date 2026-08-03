##########################################################
# Module
#
# Name:
#
# Justice Ladder
#
# Purpose:
#
# Rank teams by football performance (expected) rather than luck.
# Produces a season ladder built on probabilistic expected points
# (rather than a binary "favourite gets 4 points" model), a
# Pythagorean (scoring-based) cross-check to separate "misjudged by
# the model" luck from "won ugly" margin luck, rolling recent-form
# luck, home/away luck splits, a simple strength-of-schedule proxy,
# and a companion "standout games" table for narrative hooks.
#
# Inputs:
#
# Processed Match Evaluations Engine Output. Required columns:
#   home_team, away_team, home_score, away_score,
#   home_raw_xscore, away_raw_xscore
# Optional column:
#   round (numeric) - enables rolling-form luck and per-round
#   standout game grouping. If absent, those features degrade
#   gracefully (NA / whole-of-sample) with an INFO message.
#
# Outputs:
#
# Justice Ladder Data Frame (calculate_justice_ladder)
# Standout Games List (calculate_luck_extremes)
# Optional persisted week-over-week snapshots (save_ladder_snapshot /
# get_ladder_movement)
#
# Dependencies:
#
# 00_config.R, 01_helpers.R
#
##########################################################

library(dplyr)

##########################################################
# Internal Helper: compute_win_probabilities
#
# Description:
#
# Converts a vector of expected-score differentials (home minus away)
# into home win / away win / draw probabilities using a normal-CDF
# win model with a small Gaussian "draw bump" centred on an even
# contest. This replaces the old binary "higher xscore gets all 4
# points" logic with a continuous, confidence-aware expectation.
#
##########################################################
compute_win_probabilities <- function(xscore_diff, sigma = 37, draw_scale = 0.025) {
    z <- xscore_diff / sigma
    p_home_before_draw <- pnorm(z)
    p_draw     <- pmin(draw_scale * dnorm(z), 0.05)
    p_home_win <- p_home_before_draw * (1 - p_draw)
    p_away_win <- (1 - p_home_before_draw) * (1 - p_draw)

    list(p_home_win = p_home_win, p_away_win = p_away_win, p_draw = p_draw)
}

##########################################################
# Internal Helper: build_team_game_level
#
# Description:
#
# Reshapes match-level data into one row per team per game.
#
##########################################################
build_team_game_level <- function(match_evaluations, sigma, draw_scale) {
    probs <- compute_win_probabilities(
        match_evaluations$home_raw_xscore - match_evaluations$away_raw_xscore,
        sigma      = sigma,
        draw_scale = draw_scale
    )

    has_round <- "round" %in% names(match_evaluations)

    home_rows <- match_evaluations |>
        mutate(
            team         = home_team,
            opponent     = away_team,
            is_home      = TRUE,
            team_score   = home_score,
            opp_score    = away_score,
            team_xscore  = home_raw_xscore,
            opp_xscore   = away_raw_xscore,
            win_prob     = probs$p_home_win,
            draw_prob    = probs$p_draw,
            exp_pts      = 4 * win_prob + 2 * draw_prob,
            act_pts      = if_else(home_score > away_score, 4, if_else(home_score == away_score, 2, 0))
        )

    away_rows <- match_evaluations |>
        mutate(
            team         = away_team,
            opponent     = home_team,
            is_home      = FALSE,
            team_score   = away_score,
            opp_score    = home_score,
            team_xscore  = away_raw_xscore,
            opp_xscore   = home_raw_xscore,
            win_prob     = probs$p_away_win,
            draw_prob    = probs$p_draw,
            exp_pts      = 4 * win_prob + 2 * draw_prob,
            act_pts      = if_else(away_score > home_score, 4, if_else(away_score == home_score, 2, 0))
        )

    keep_cols <- c(
        "team", "opponent", "is_home", "team_score", "opp_score",
        "team_xscore", "opp_xscore", "win_prob", "draw_prob", "exp_pts", "act_pts"
    )
    if (has_round) keep_cols <- c(keep_cols, "round")

    bind_rows(home_rows, away_rows) |> select(all_of(keep_cols))
}

##########################################################
# Calculate Justice Ladder
#
# Description:
#
# Calculates expected vs actual performance tiers, ranks, and
# percentages with POSITIVE luck values representing good fortune.
#
##########################################################
calculate_justice_ladder <- function(match_evaluations,
                                      sigma = 37,
                                      draw_scale = 0.025,
                                      pythagorean_exponent = 2,
                                      rolling_window = 5,
                                      min_sample_games = 4,
                                      cursed_threshold_per_game = -0.3,  # per-game so it means the same thing at round 3 or round 23
                                      lucky_threshold_per_game = 0.3,
                                      buried_threshold = 3,              # Rank_Delta magnitude for ladder-position tags
                                      undersold_threshold = 1,
                                      model_scoreboard_gap_threshold = 4) { # |Luck_Rating - Pythagorean_Luck|
    message("INFO: Starting Justice Ladder...")

    # 0. Validate schema
    required_cols <- c(
        "home_team", "away_team", "home_score", "away_score",
        "home_raw_xscore", "away_raw_xscore"
    )
    missing_cols <- setdiff(required_cols, names(match_evaluations))
    if (length(missing_cols) > 0) {
        stop("Justice Ladder: missing required column(s): ", paste(missing_cols, collapse = ", "))
    }

    has_round <- "round" %in% names(match_evaluations) && is.numeric(match_evaluations$round)

    # Drop unplayed/incomplete fixtures
    match_evaluations <- match_evaluations |>
        filter(!is.na(home_score), !is.na(away_score))

    # 1. Reshape to one row per team per game
    team_game_level <- build_team_game_level(match_evaluations, sigma, draw_scale)

    # 2. Season totals using probabilistic points
    # 💡 FIX: Luck_Rating is now Actual_Points - Expected_Points (Positive = Lucky)
    base_ladder <- team_game_level |>
        group_by(team) |>
        summarise(
            Games_Played           = n(),
            Expected_Points        = round(sum(exp_pts), 1),
            Actual_Points          = sum(act_pts),
            Actual_Score_For       = sum(team_score),
            Actual_Score_Against   = sum(opp_score),
            Expected_Score_For     = sum(team_xscore),
            Expected_Score_Against = sum(opp_xscore),
            Actual_Percent   = round(if_else(sum(opp_score) == 0, NA_real_,
                                       sum(team_score) / sum(opp_score) * 100), 1),
            Expected_Percent = round(if_else(sum(opp_xscore) == 0, NA_real_,
                                       sum(team_xscore) / sum(opp_xscore) * 100), 1),
            Net_xScore_Marg  = round((sum(team_xscore) - sum(opp_xscore)) / n(), 1),
            .groups = "drop"
        ) |>
        mutate(
            Luck_Rating          = round(Actual_Points - Expected_Points, 1),
            Luck_Rating_Per_Game = round(Luck_Rating / Games_Played, 2),
            Low_Sample_Warning   = Games_Played < min_sample_games
        )

    # 3. Pythagorean cross-check
    # 💡 FIX: Pythagorean_Luck is now Actual_Points - Pythagorean_Expected_Points
    base_ladder <- base_ladder |>
        mutate(
            Pythagorean_Win_Pct = if_else(
                (Actual_Score_For^pythagorean_exponent + Actual_Score_Against^pythagorean_exponent) == 0,
                NA_real_,
                Actual_Score_For^pythagorean_exponent /
                    (Actual_Score_For^pythagorean_exponent + Actual_Score_Against^pythagorean_exponent)
            ),
            Pythagorean_Expected_Points = round(Pythagorean_Win_Pct * 4 * Games_Played, 1),
            Pythagorean_Luck            = round(Actual_Points - Pythagorean_Expected_Points, 1)
        )

    # 4. Home / away luck split
    # 💡 FIX: Split ratings are now Actual - Expected
    home_luck <- team_game_level |>
        filter(is_home) |>
        group_by(team) |>
        summarise(Home_Luck_Rating = round(sum(act_pts) - sum(exp_pts), 1), .groups = "drop")

    away_luck <- team_game_level |>
        filter(!is_home) |>
        group_by(team) |>
        summarise(Away_Luck_Rating = round(sum(act_pts) - sum(exp_pts), 1), .groups = "drop")

    base_ladder <- base_ladder |>
        left_join(home_luck, by = "team") |>
        left_join(away_luck, by = "team")

    # 5. Rolling recent-form luck
    # 💡 FIX: Rolling luck is now Actual - Expected
    if (has_round) {
        rolling_luck <- team_game_level |>
            arrange(team, desc(round)) |>
            group_by(team) |>
            slice_head(n = rolling_window) |>
            summarise(
                Rolling_Games       = n(),
                Rolling_Luck_Rating = round(sum(act_pts) - sum(exp_pts), 1),
                .groups = "drop"
            )
        base_ladder <- base_ladder |> left_join(rolling_luck, by = "team")
    } else {
        base_ladder$Rolling_Games       <- NA_integer_
        base_ladder$Rolling_Luck_Rating <- NA_real_
    }

    # 6. Strength-of-schedule proxy
    opponent_strength_lookup <- base_ladder |>
        select(team, Expected_Percent) |>
        rename(opponent = team, opponent_expected_percent = Expected_Percent)

    sos <- team_game_level |>
        left_join(opponent_strength_lookup, by = "opponent") |>
        group_by(team) |>
        summarise(Strength_Of_Schedule = round(mean(opponent_expected_percent, na.rm = TRUE), 1), .groups = "drop")

    base_ladder <- base_ladder |> left_join(sos, by = "team")

    # 7. Determine Actual Ladder Positions
    actual_standings <- base_ladder |>
        arrange(desc(Actual_Points), desc(Actual_Percent), team) |>
        mutate(Actual_Rank = row_number()) |>
        select(team, Actual_Rank)

    # 8. Finalize Justice Ladder & Merge Rank Deltas
    # 💡 FIX: Luck_Status checks are updated to reflect the new sign logic
    ladder <- base_ladder |>
        left_join(actual_standings, by = "team") |>
        arrange(desc(Expected_Points), desc(Expected_Percent), team) |>
        mutate(
            Justice_Rank = row_number(),
            Rank_Delta    = Actual_Rank - Justice_Rank,
            # 💡 FIX: Sign now matches Luck_Rating convention - positive = overperformed expectation
            Percent_Delta = round(Actual_Percent - Expected_Percent, 1),
            # 💡 FIX: Thresholds are now per-game so the tag means the same thing in round 3
            # and round 23, instead of getting easier to trip as points accumulate.
            Luck_Status   = case_when(
                Luck_Rating_Per_Game < cursed_threshold_per_game ~ "Snakebitten",
                Luck_Rating_Per_Game > lucky_threshold_per_game  ~ "Riding the breaks",
                TRUE                                             ~ "Getting what they deserve"
            ),
            # 💡 NEW: Points-luck (Luck_Status) only tells you whether a team is earning the
            # points the model expects. It says nothing about whether OTHER teams' luck has
            # pushed them up or down the actual ladder relative to their deserved position.
            # This tag answers that second, independent question using Rank_Delta.
            Ladder_Luck_Status = case_when(
                Rank_Delta >=  buried_threshold      ~ "Buried by others' luck",
                Rank_Delta >=  undersold_threshold   ~ "Undersold",
                Rank_Delta <= -buried_threshold       ~ "Overplaced",
                Rank_Delta <= -undersold_threshold    ~ "Flattered",
                TRUE                                  ~ "Right where they belong"
            ),
            # 💡 NEW: Luck_Rating (model-based, from win probabilities) and Pythagorean_Luck
            # (scoreboard-based, from points for/against) usually agree. When they diverge a
            # lot, that's its own story - e.g. "the model rates them unlucky but they're
            # winning ugly games their scoreline doesn't support".
            Model_Vs_Scoreboard_Gap    = round(Luck_Rating - Pythagorean_Luck, 1),
            Model_Scoreboard_Disagreement = abs(Model_Vs_Scoreboard_Gap) > model_scoreboard_gap_threshold
        ) |>
        select(
            team, Games_Played, Justice_Rank, Actual_Rank, Rank_Delta,
            Expected_Points, Actual_Points, Luck_Rating, Luck_Rating_Per_Game,
            Pythagorean_Expected_Points, Pythagorean_Luck,
            Model_Vs_Scoreboard_Gap, Model_Scoreboard_Disagreement,
            Home_Luck_Rating, Away_Luck_Rating,
            Rolling_Games, Rolling_Luck_Rating,
            Expected_Percent, Actual_Percent, Percent_Delta,
            Net_xScore_Marg, Strength_Of_Schedule,
            Low_Sample_Warning, Luck_Status, Ladder_Luck_Status
        )

    message("INFO: Completed Justice Ladder")
    return(ladder)
}

##########################################################
# Calculate Luck Extremes (True Robberies Only)
#
# Description:
#
# Identifies games where the actual winner was the statistical 
# underdog. It ranks them by the scale of the statistical robbery.
#
##########################################################
calculate_luck_extremes <- function(match_evaluations,
                                     sigma = 37,
                                     draw_scale = 0.025,
                                     top_n = 3,
                                     group_by_round = TRUE) {
    
    completed_matches <- match_evaluations |>
        filter(!is.na(home_score), !is.na(away_score))
    
    if (nrow(completed_matches) == 0) {
        return(tibble())
    }

    probs <- compute_win_probabilities(
        completed_matches$home_raw_xscore - completed_matches$away_raw_xscore,
        sigma      = sigma,
        draw_scale = draw_scale
    )

    match_variance <- completed_matches |>
        mutate(
            home_win_prob = probs$p_home_win,
            draw_prob     = probs$p_draw,
            away_win_prob = probs$p_away_win,
            home_exp_pts  = 4 * home_win_prob + 2 * draw_prob,
            away_exp_pts  = 4 * away_win_prob + 2 * draw_prob,
            home_act_pts  = case_when(
                home_score > away_score ~ 4,
                home_score == away_score ~ 2,
                TRUE                     ~ 0
            ),
            away_act_pts  = case_when(
                away_score > home_score ~ 4,
                home_score == away_score ~ 2,
                TRUE                     ~ 0
            ),
            actual_winner = case_when(
                home_score > away_score ~ "home",
                away_score > home_score ~ "away",
                TRUE                    ~ "draw"
            ),
            expected_winner = case_when(
                home_raw_xscore > away_raw_xscore ~ "home",
                away_raw_xscore > home_raw_xscore ~ "away",
                TRUE                              ~ "draw"
            )
        ) |>
        filter(
            actual_winner != expected_winner,
            actual_winner != "draw",
            expected_winner != "draw"
        ) |>
        # 💡 SIGN FIX applied here as well
        mutate(
            lucky_team = if_else(actual_winner == "home", home_team, away_team),
            unlucky_team = if_else(actual_winner == "home", away_team, home_team),
            # Lucky team gets a positive rating, unlucky gets the negative counterpart
            luck_variance = if_else(actual_winner == "home", home_act_pts - home_exp_pts, away_act_pts - away_exp_pts)
        )

    has_round <- group_by_round && "round" %in% names(match_variance) && is.numeric(match_variance$round)
    group_cols <- if (has_round) "round" else character(0)

    luck_extremes <- match_variance |>
        group_by(across(all_of(group_cols))) |>
        slice_max(luck_variance, n = top_n, with_ties = FALSE) |>
        ungroup() |>
        select(
            any_of("round"),
            lucky_team,
            unlucky_team,
            home_team,
            away_team,
            home_score,
            away_score,
            home_xscore = home_raw_xscore,
            away_xscore = away_raw_xscore,
            luck_variance
        )

    return(luck_extremes)
}

##########################################################
# Save Ladder Snapshot
##########################################################
save_ladder_snapshot <- function(ladder, round_number, snapshot_dir) {
    if (!dir.exists(snapshot_dir)) dir.create(snapshot_dir, recursive = TRUE)
    snapshot_path <- file.path(snapshot_dir, paste0("round_", round_number, ".rds"))
    saveRDS(ladder, snapshot_path)
    message("INFO: Saved Justice Ladder snapshot for round ", round_number, " -> ", snapshot_path)
    invisible(ladder)
}

##########################################################
# Get Ladder Movement
##########################################################
get_ladder_movement <- function(current_ladder, previous_round_number, snapshot_dir) {
    prev_path <- file.path(snapshot_dir, paste0("round_", previous_round_number, ".rds"))

    if (!file.exists(prev_path)) {
        message("INFO: No prior snapshot found for round ", previous_round_number, " - skipping week-over-week movement")
        return(
            current_ladder |>
                mutate(
                    Justice_Rank_Prev     = NA_integer_,
                    Justice_Rank_Movement = NA_integer_,
                    Luck_Rating_Prev      = NA_real_,
                    # 💡 FIX: Changed to Luck_Rating_Change to reflect correct nomenclature
                    Luck_Rating_Change    = NA_real_
                )
        )
    }

    previous_ladder <- readRDS(prev_path) |>
        select(team, Justice_Rank_Prev = Justice_Rank, Luck_Rating_Prev = Luck_Rating)

    current_ladder |>
        left_join(previous_ladder, by = "team") |>
        mutate(
            Justice_Rank_Movement = Justice_Rank_Prev - Justice_Rank,
            # 💡 FIX: Signed delta (Current Luck - Previous Luck)
            # If current luck is +4.0 and previous was +2.0, change is +2.0 (got luckier)
            Luck_Rating_Change    = round(Luck_Rating - Luck_Rating_Prev, 1)
        )
}

##########################################################
# Catchup Justice Snapshots
##########################################################
catchup_justice_snapshots <- function(match_evaluations, current_round, snapshot_dir) {
    all_prior_rounds <- sort(unique(match_evaluations$round))
    all_prior_rounds <- all_prior_rounds[all_prior_rounds < current_round]
    
    if (length(all_prior_rounds) == 0) {
        message("INFO: No prior rounds found to backfill.")
        return(invisible(NULL))
    }
    
    message("INFO: Checking for missing historical Justice Ladder snapshots...")
    
    for (i in seq_along(all_prior_rounds)) {
        r <- all_prior_rounds[i]
        snapshot_path <- file.path(snapshot_dir, paste0("round_", r, ".rds"))
        
        if (!file.exists(snapshot_path)) {
            message("INFO: Snapshot missing for Round ", r, " - Backfilling now...")
            
            historical_matches <- match_evaluations |> 
                filter(round <= r)
            
            raw_historical_ladder <- calculate_justice_ladder(historical_matches)
            
            prev_r <- if (i == 1) -1 else all_prior_rounds[i - 1]
            
            historical_ladder_with_movement <- get_ladder_movement(
                current_ladder        = raw_historical_ladder,
                previous_round_number = prev_r,
                snapshot_dir          = snapshot_dir
            )
            
            save_ladder_snapshot(
                ladder       = historical_ladder_with_movement,
                round_number = r,
                snapshot_dir = snapshot_dir
            )
        }
    }
    message("INFO: Snapshot catchup check complete.")
}