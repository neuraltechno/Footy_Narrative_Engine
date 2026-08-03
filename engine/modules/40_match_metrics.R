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
# Raw Results Dataset, Calculated Team Line Snapshots, Latest Round,
# Quarter Scores (optional - see calculate_match_metrics())
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
# Internal Helper: build_match_momentum
#
# Description:
#
# Builds the per-quarter scoring timeline for a single match from
# quarter_scores (long format: match_id, round, team, quarter, goals,
# behinds - see update_data.R) and derives momentum/comeback metrics
# from it: how many quarter-breaks each side led at, whether the winner
# came from behind, and the biggest deficit/lead swing during the game.
#
# Degrades to an all-NA/empty result if this match has no quarter data
# (e.g. the score-worm fetch failed for that specific match in
# update_data.R) rather than erroring the whole match engine - a gap in
# quarter-level detail shouldn't take down full-game metrics that don't
# need it.
##########################################################
build_match_momentum <- function(match_id, home_team, away_team, actual_winner, quarter_scores) {
    empty_result <- tibble(
        quarter_breakdown        = list(tibble()),
        quarters_led_home        = NA_integer_,
        quarters_led_away        = NA_integer_,
        is_comeback_win          = NA,
        biggest_deficit_overcome = NA_real_,
        largest_lead_surrendered = NA_real_
    )

    if (is.na(match_id)) return(empty_result)

    q <- quarter_scores |> filter(.data$match_id == .env$match_id)
    if (nrow(q) == 0) return(empty_result)

    home_q <- q |>
        filter(.data$team == home_team) |>
        arrange(.data$quarter) |>
        select(quarter, home_goals = goals, home_behinds = behinds)

    away_q <- q |>
        filter(.data$team == away_team) |>
        arrange(.data$quarter) |>
        select(quarter, away_goals = goals, away_behinds = behinds)

    if (nrow(home_q) == 0 || nrow(away_q) == 0) return(empty_result)

    # Uses the same XSCORE_W_* weights as the full-game calculation below
    # (00_config.R), just applied per-quarter instead of to the game total.
    timeline <- full_join(home_q, away_q, by = "quarter") |>
        arrange(.data$quarter) |>
        mutate(
            across(c(home_goals, home_behinds, away_goals, away_behinds), ~ tidyr::replace_na(.x, 0)),
            # Cumulative goals/behinds - not just cumulative points - so the
            # frontend can render standard "quarter time" notation (e.g.
            # 2.3.15), where the goals.behinds count is cumulative to that
            # point in the match, not just that quarter's own tally.
            home_goals_cum   = cumsum(home_goals),
            home_behinds_cum = cumsum(home_behinds),
            away_goals_cum   = cumsum(away_goals),
            away_behinds_cum = cumsum(away_behinds),
            home_score_qtr  = home_goals * 6 + home_behinds,
            away_score_qtr  = away_goals * 6 + away_behinds,
            home_score_cum  = cumsum(home_score_qtr),
            away_score_cum  = cumsum(away_score_qtr),
            home_xscore_qtr = round(((home_goals * XSCORE_W_GOAL_AS_GOAL + home_behinds * XSCORE_W_BEHIND_AS_GOAL) * 6) +
                                     ((home_goals * XSCORE_W_GOAL_AS_BEHIND + home_behinds * XSCORE_W_BEHIND_AS_BEHIND) * 1), 1),
            away_xscore_qtr = round(((away_goals * XSCORE_W_GOAL_AS_GOAL + away_behinds * XSCORE_W_BEHIND_AS_GOAL) * 6) +
                                     ((away_goals * XSCORE_W_GOAL_AS_BEHIND + away_behinds * XSCORE_W_BEHIND_AS_BEHIND) * 1), 1),
            home_xscore_cum  = round(cumsum(home_xscore_qtr), 1),
            away_xscore_cum  = round(cumsum(away_xscore_qtr), 1),
            margin_at_break  = home_score_cum - away_score_cum,
            xmargin_at_break = round(home_xscore_cum - away_xscore_cum, 1)
        )

    # Draws (or a missing actual_winner) have no "winner's deficit" to
    # measure - still return the timeline (useful for a score-worm chart)
    # but leave the winner-relative fields NA rather than fabricating a
    # side to measure from.
    if (is.na(actual_winner) || actual_winner == "Draw") {
        return(tibble(
            quarter_breakdown        = list(timeline),
            quarters_led_home        = sum(timeline$margin_at_break > 0),
            quarters_led_away        = sum(timeline$margin_at_break < 0),
            is_comeback_win          = NA,
            biggest_deficit_overcome = NA_real_,
            largest_lead_surrendered = NA_real_
        ))
    }

    # In-game breaks only (Q1/Q2/Q3 ends) - excludes the final quarter's own
    # result, since "overcame a deficit" / "surrendered a lead" only makes
    # sense at a break *before* the game is decided.
    in_game_breaks <- head(timeline$margin_at_break, -1)
    winner_sign     <- if (actual_winner == home_team) 1 else -1
    winner_view      <- in_game_breaks * winner_sign  # positive = winner was ahead at that break

    biggest_deficit_overcome <- if (length(winner_view) == 0) 0 else max(0, -min(winner_view))
    largest_lead_surrendered <- if (length(winner_view) == 0) 0 else max(0, max(-winner_view))

    tibble(
        quarter_breakdown        = list(timeline),
        quarters_led_home        = sum(timeline$margin_at_break > 0),
        quarters_led_away        = sum(timeline$margin_at_break < 0),
        is_comeback_win          = biggest_deficit_overcome > 0,
        biggest_deficit_overcome = round(biggest_deficit_overcome, 1),
        largest_lead_surrendered = round(largest_lead_surrendered, 1)
    )
}

##########################################################
# Calculate Match Metrics
#
# Description:
#
# Calculates match-level metrics for game summaries.
#
# Inputs:
#
# quarter_scores (optional) - long-format data frame from update_data.R
# (columns: match_id, round, team, quarter, goals, behinds). When
# supplied AND `results` carries a unique, auto-detected match-ID column,
# adds a nested per-quarter score/xscore timeline (`quarter_breakdown`)
# plus momentum summary columns (`quarters_led_home`, `quarters_led_away`,
# `is_comeback_win`, `biggest_deficit_overcome`, `largest_lead_surrendered`)
# to every match row. When omitted, or when no match-ID column can be
# found on `results`, these columns are still present but NA/empty - the
# rest of the match engine (xscore, robbery, luck_delta) is unaffected
# either way.
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
#
# - The team_line_snapshots cleanup select() was still dropping a column
#   named DI_for, which 30_team_metrics.R renamed to actual_round_disposals
#   a while back (see notes there). Since only 4 of the 8 metric columns
#   on team_line_snapshots get a home_/away_ prefix between the two
#   left_join()s below, the other 4 collide on the second join and dplyr
#   suffixes them .x/.y - the old DI_for pattern no longer matched
#   anything, so actual_round_disposals.x/.y were silently leaking through
#   into match_metrics (and from there into team_match_centers.json)
#   uncleaned. Swapped the stale DI_for pattern for actual_round_disposals.
##########################################################
calculate_match_metrics <- function(results, team_line_snapshots, latest_round, quarter_scores = NULL) {
    message("INFO: Starting Match Engine...")

    # Match key: `matchId` on `results` - the same flat column update_data.R
    # uses to build quarter_scores (see the note there). Quarter-level
    # momentum metrics degrade gracefully (all NA/empty) if this column is
    # missing or quarter_scores wasn't supplied, rather than failing the
    # whole match engine over an optional feature.
    has_match_id_col <- "matchId" %in% names(results)

    if (!is.null(quarter_scores) && !has_match_id_col) {
        message("WARNING: quarter_scores was supplied but no `matchId` column was found on `results` - quarter-level momentum metrics will be skipped.")
    }
    if (is.null(quarter_scores)) {
        message("INFO: No quarter_scores supplied - quarter-level momentum metrics will be skipped.")
    }

    enrich_with_quarters <- has_match_id_col && !is.null(quarter_scores)

    # 1. Structure match pairings from source JSON schedules
    results_prepped <- results |>
        filter(round.roundNumber <= latest_round & status == "CONCLUDED")

    if (has_match_id_col) {
        results_prepped$match_id <- results_prepped$matchId
    } else {
        results_prepped$match_id <- NA_character_
    }

    match_pairings <- results_prepped |>
        select(
            round        = round.roundNumber,
            home_team    = match.homeTeam.name,
            away_team    = match.awayTeam.name,
            home_score   = homeTeamScore.matchScore.totalScore,
            away_score   = awayTeamScore.matchScore.totalScore,
            home_goals   = homeTeamScore.matchScore.goals,
            home_behinds = homeTeamScore.matchScore.behinds,
            away_goals   = awayTeamScore.matchScore.goals,
            away_behinds = awayTeamScore.matchScore.behinds,
            match_id
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
        select(-contains("total_player_pir"), -contains("actual_round_disposals"), -contains("approx_round_disposals"), -contains("overall_rating")) |>
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

    # 4. Quarter-Level Momentum & Luck (only when a match-ID column and
    #    quarter_scores are both available - see enrich_with_quarters above)
    if (enrich_with_quarters) {
        message("INFO: Enriching with quarter-level momentum metrics from score-worm data...")

        quarter_metrics <- purrr::pmap_dfr(
            list(
                match_id      = match_metrics$match_id,
                home_team     = match_metrics$home_team,
                away_team     = match_metrics$away_team,
                actual_winner = match_metrics$actual_winner
            ),
            build_match_momentum,
            quarter_scores = quarter_scores
        )

        match_metrics <- bind_cols(match_metrics, quarter_metrics)

        matches_without_quarters <- sum(lengths(lapply(match_metrics$quarter_breakdown, function(x) if (is.data.frame(x)) nrow(x) else 0)) == 0)
        if (matches_without_quarters > 0) {
            message(
                "INFO: ", matches_without_quarters,
                " match(es) have no quarter-level data (score-worm fetch gap for that match) - ",
                "momentum fields are NA for those rows; full-game metrics are unaffected."
            )
        }
    } else {
        match_metrics <- match_metrics |>
            mutate(
                quarter_breakdown        = vector("list", n()),
                quarters_led_home        = NA_integer_,
                quarters_led_away        = NA_integer_,
                is_comeback_win          = NA,
                biggest_deficit_overcome = NA_real_,
                largest_lead_surrendered = NA_real_
            )
    }

    message("INFO: Completed Match Engine")
    return(match_metrics)
}

##########################################################
# build_match_centers_export
#
# Description:
#
# Prepares the per-round match centre data structures that
# 99_export_json.R writes to disk. All splitting, indexing,
# and summary logic lives here so the export module stays
# as pure save_json_file() calls with no embedded logic.
#
# Inputs:
#
# match_metrics  — full data frame returned by calculate_match_metrics()
#                  (all concluded rounds, NOT pre-filtered)
# latest_round   — integer; the most recently completed round, used to
#                  set the "default" round in the frontend index
#
# Output:
#
# A named list:
#   $index         — list written to match_centers_index.json
#                    {season, latest_round, round_count, rounds:[...]}
#                    Each rounds entry includes the filename, match count,
#                    robbery flag, and a compact match-summary array so
#                    the frontend can render a round-selector without
#                    fetching the full per-round file.
#   $rounds        — named list of data frames, one per round.
#                    Names are the zero-padded filenames, e.g.
#                    "team_match_centers_r01.json". The exporter iterates
#                    this list and calls save_json_file() on each element.
#
# File layout produced (under json/<season>/matches/):
#   match_centers_index.json
#   team_match_centers_r01.json
#   team_match_centers_r02.json
#   ...
#   team_match_centers_rNN.json
##########################################################
build_match_centers_export <- function(match_metrics, latest_round) {
    message("INFO: Building per-round match centre export structures...")

    if (is.null(match_metrics) || nrow(match_metrics) == 0) {
        message("WARNING: match_metrics is empty - returning empty match centre export.")
        return(list(
            index  = list(
                season       = CURRENT_SEASON,
                latest_round = latest_round,
                round_count  = 0L,
                rounds       = list()
            ),
            rounds = list()
        ))
    }

    available_rounds    <- sort(unique(match_metrics$round))
    round_index_entries <- vector("list", length(available_rounds))
    rounds_data         <- vector("list", length(available_rounds))

    for (i in seq_along(available_rounds)) {
        rnd      <- available_rounds[i]
        # Zero-pad so filenames sort correctly in the filesystem:
        # r01, r02 ... r09, r10 ... rather than r1, r10, r2 ...
        rnd_str  <- sprintf("%02d", rnd)
        filename <- paste0("by-round/team_match_centers_r", rnd_str, ".json")

        round_data <- match_metrics |>
            dplyr::filter(round == rnd)

        # Compact per-match summary for the index — enough for a round-
        # selector UI without pulling the full match file.
        match_summaries <- lapply(seq_len(nrow(round_data)), function(j) {
            list(
                home_team    = round_data$home_team[j],
                away_team    = round_data$away_team[j],
                score_string = paste0(round_data$home_score[j], " - ", round_data$away_score[j]),
                winner       = round_data$actual_winner[j],
                is_robbery   = round_data$is_robbery[j]
            )
        })

        round_index_entries[[i]] <- list(
            round       = rnd,
            file        = filename,
            match_count = nrow(round_data),
            has_robbery = any(round_data$is_robbery, na.rm = TRUE),
            matches     = match_summaries
        )

        rounds_data[[i]] <- round_data
        names(rounds_data)[i] <- filename

        message(paste0("INFO:   Round ", rnd, " -> ", filename,
                       " (", nrow(round_data), " matches)"))
    }

    index <- list(
        season       = CURRENT_SEASON,
        latest_round = latest_round,
        round_count  = length(available_rounds),
        rounds       = round_index_entries
    )

    message(paste0("INFO: Match centre export structures built (",
                   length(available_rounds), " rounds)"))

    list(
        index  = index,
        rounds = rounds_data
    )
}