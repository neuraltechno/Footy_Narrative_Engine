##########################################################
# Module
#
# Name:
#
# Narratives
#
# Purpose:
#
# Turn the Justice Ladder (and match-level luck extremes) into a short
# list of structured, machine-readable story hooks - NOT prose. Each
# hook is a {team, angle, priority, supporting_stats} object describing
# one newsworthy pattern for a team this round. These get handed to an
# LLM downstream to write the actual copy; this module's only job is
# to decide WHICH stories are worth telling and WHY, with the numbers
# to back each one up.
#
# Inputs:
#
# match_evaluations   - Processed Match Evaluations Engine output for
#                        the current season (all rounds to date).
#                        Required columns: as per calculate_luck_extremes.
#                        Optional columns (for comeback hooks):
#                        actual_winner, is_comeback_win,
#                        biggest_deficit_overcome - see 40_match_metrics.R.
# justice_standings   - Output of calculate_justice_ladder() +
#                        get_ladder_movement() for the current round.
# latest_round        - Numeric round number for the robbery-of-the-
#                        round lookup. NULL/NA is handled gracefully
#                        (falls back to whole-of-sample).
# power_ranks         - Optional. Output of calculate_power_rankings()
#                        (60_power_rankings.R) for the current round.
#                        Required columns for the form_vs_luck_divergence
#                        hook: team, ladder_position, power_rank, trend.
#                        Omit and that hook is simply skipped - matches
#                        the fallback style used throughout this pipeline.
#
# Outputs:
#
# list(
#   robbery_match = single-row tibble/NULL, the biggest statistical
#                    upset of the latest round (from calculate_luck_extremes)
#   story_hooks   = tibble of {team, angle, priority, supporting_stats}
#                    rows, one per newsworthy pattern, sorted by
#                    priority descending
# )
#
# Dependencies:
#
# 00_config.R, 01_helpers.R, 50_justice_ladder.R (calculate_luck_extremes)
#
##########################################################
library(dplyr)
library(tibble)
library(purrr)

##########################################################
# Internal Helper: hook
#
# Description:
#
# Builds one story-hook row. priority is unitless: magnitude / threshold,
# i.e. "how many multiples of the newsworthy bar this team clears". It's
# not a perfect cross-angle comparison (a rank-based magnitude and a
# points-based magnitude aren't the same unit) but it's a reasonable,
# cheap way to sort a mixed bag of angles into a rough "how loud is this
# story" order without hand-tuning per-angle weights.
#
##########################################################
hook <- function(team, angle, magnitude, threshold, supporting_stats) {
    tibble(
        team             = team,
        angle            = angle,
        priority         = round(abs(magnitude) / threshold, 2),
        supporting_stats = list(supporting_stats)
    )
}

##########################################################
# Internal Helper: build_team_story_hooks
#
# Description:
#
# Scans one row of the Justice Ladder (optionally joined with Form Pulse
# / power rankings - see generate_narrative_summaries) and returns zero
# or more candidate story hooks for that team. A team can carry multiple
# hooks at once (e.g. both "snakebitten" AND "buried by others' luck") -
# that combination is often the real story, so this deliberately does
# not force a single hook per team.
#
# Thresholds default to the centralised JUSTICE_*/NARRATIVE_* constants
# in 00_config.R. Angles 1-3 below deliberately trigger off the
# already-computed Luck_Status / Ladder_Luck_Status / Model_Scoreboard_
# Disagreement columns rather than re-deriving the same condition from
# raw numbers with locally-hardcoded thresholds - those columns are built
# in 50_justice_ladder.R off these exact same constants, so reading them
# directly means this module can't silently drift out of sync with what
# the Justice Ladder page itself displays if a threshold is ever retuned.
#
##########################################################
build_team_story_hooks <- function(row,
                                    rank_buried_threshold      = JUSTICE_BURIED_THRESHOLD,
                                    cursed_threshold_per_game  = abs(JUSTICE_CURSED_THRESHOLD_PER_GAME),
                                    lucky_threshold_per_game   = JUSTICE_LUCKY_THRESHOLD_PER_GAME,
                                    model_scoreboard_threshold = JUSTICE_MODEL_SCOREBOARD_GAP_THRESHOLD,
                                    home_road_split_threshold  = NARRATIVE_HOME_ROAD_SPLIT_THRESHOLD,
                                    rank_movement_threshold    = NARRATIVE_RANK_MOVEMENT_THRESHOLD,
                                    form_divergence_threshold  = NARRATIVE_FORM_DIVERGENCE_THRESHOLD) {

    hooks <- list()

    # 1. Ladder-position luck: deserves better/worse than the real ladder shows
    if (!is.na(row$Ladder_Luck_Status) && identical(row$Ladder_Luck_Status, "Buried by others' luck")) {
        hooks[[length(hooks) + 1]] <- hook(
            row$team, "buried_by_others_luck", row$Rank_Delta, rank_buried_threshold,
            list(
                Justice_Rank = row$Justice_Rank, Actual_Rank = row$Actual_Rank,
                Rank_Delta = row$Rank_Delta, Luck_Status = row$Luck_Status,
                Ladder_Luck_Status = row$Ladder_Luck_Status, Luck_Rating = row$Luck_Rating
            )
        )
    }
    if (!is.na(row$Ladder_Luck_Status) && identical(row$Ladder_Luck_Status, "Overplaced")) {
        hooks[[length(hooks) + 1]] <- hook(
            row$team, "overplaced", row$Rank_Delta, rank_buried_threshold,
            list(
                Justice_Rank = row$Justice_Rank, Actual_Rank = row$Actual_Rank,
                Rank_Delta = row$Rank_Delta, Luck_Status = row$Luck_Status,
                Ladder_Luck_Status = row$Ladder_Luck_Status, Luck_Rating = row$Luck_Rating
            )
        )
    }

    # 2. Points luck: is the scoreboard rewarding/punishing this team relative to the model
    if (!is.na(row$Luck_Status) && identical(row$Luck_Status, "Snakebitten")) {
        hooks[[length(hooks) + 1]] <- hook(
            row$team, "snakebitten", row$Luck_Rating_Per_Game, cursed_threshold_per_game,
            list(
                Luck_Rating = row$Luck_Rating, Luck_Rating_Per_Game = row$Luck_Rating_Per_Game,
                Expected_Points = row$Expected_Points, Actual_Points = row$Actual_Points,
                Luck_Status = row$Luck_Status
            )
        )
    }
    if (!is.na(row$Luck_Status) && identical(row$Luck_Status, "Riding the breaks")) {
        hooks[[length(hooks) + 1]] <- hook(
            row$team, "riding_the_breaks", row$Luck_Rating_Per_Game, lucky_threshold_per_game,
            list(
                Luck_Rating = row$Luck_Rating, Luck_Rating_Per_Game = row$Luck_Rating_Per_Game,
                Expected_Points = row$Expected_Points, Actual_Points = row$Actual_Points,
                Luck_Status = row$Luck_Status
            )
        )
    }

    # 3. Model vs scoreboard disagreement: the win-probability model and the raw
    # points-for/against model disagree on how lucky this team has been. Direction
    # is reported, not diagnosed - left for the downstream LLM to interpret with
    # the full numbers rather than asserting a single causal story here.
    if (!is.na(row$Model_Scoreboard_Disagreement) && isTRUE(row$Model_Scoreboard_Disagreement)) {
        direction <- if (row$Model_Vs_Scoreboard_Gap > 0) "model_more_generous" else "scoreboard_more_generous"
        hooks[[length(hooks) + 1]] <- hook(
            row$team, "model_scoreboard_split", row$Model_Vs_Scoreboard_Gap, model_scoreboard_threshold,
            list(
                direction = direction,
                Luck_Rating = row$Luck_Rating, Pythagorean_Luck = row$Pythagorean_Luck,
                Model_Vs_Scoreboard_Gap = row$Model_Vs_Scoreboard_Gap
            )
        )
    }

    # 4. Home/road split: season luck is masking a real venue-based pattern
    if (!is.na(row$Home_Luck_Rating) && !is.na(row$Away_Luck_Rating)) {
        split <- row$Home_Luck_Rating - row$Away_Luck_Rating
        if (abs(split) >= home_road_split_threshold) {
            hooks[[length(hooks) + 1]] <- hook(
                row$team, "home_road_split", split, home_road_split_threshold,
                list(
                    Home_Luck_Rating = row$Home_Luck_Rating, Away_Luck_Rating = row$Away_Luck_Rating,
                    Luck_Rating = row$Luck_Rating
                )
            )
        }
    }

    # 5. Form shift: recent rolling luck diverging from the season-long pattern
    if (!is.na(row$Rolling_Luck_Rating) && !is.na(row$Rolling_Games) && !is.na(row$Luck_Rating_Per_Game)) {
        expected_rolling <- row$Luck_Rating_Per_Game * row$Rolling_Games
        shift <- row$Rolling_Luck_Rating - expected_rolling
        # Threshold scales with the rolling window so a 5-game window and a
        # (degraded) 3-game window use a proportionally fair bar.
        shift_threshold <- lucky_threshold_per_game * row$Rolling_Games * 2
        if (shift_threshold > 0 && abs(shift) >= shift_threshold) {
            hooks[[length(hooks) + 1]] <- hook(
                row$team, if (shift > 0) "hot_streak" else "cold_streak", shift, shift_threshold,
                list(
                    Rolling_Games = row$Rolling_Games, Rolling_Luck_Rating = row$Rolling_Luck_Rating,
                    Season_Luck_Rating_Per_Game = row$Luck_Rating_Per_Game
                )
            )
        }
    }

    # 6. Deserved-rank movement: this week's biggest Justice Rank climbers/fallers
    if (!is.na(row$Justice_Rank_Movement) && abs(row$Justice_Rank_Movement) >= rank_movement_threshold) {
        hooks[[length(hooks) + 1]] <- hook(
            row$team, if (row$Justice_Rank_Movement > 0) "justice_rank_climb" else "justice_rank_fall",
            row$Justice_Rank_Movement, rank_movement_threshold,
            list(
                Justice_Rank = row$Justice_Rank, Justice_Rank_Prev = row$Justice_Rank_Prev,
                Justice_Rank_Movement = row$Justice_Rank_Movement,
                Luck_Rating_Change = row$Luck_Rating_Change
            )
        )
    }

    # 7. Form vs justice-ladder divergence: the Form Pulse (power rankings,
    # PIR/output-quality based) and the Justice Ladder (win-probability/luck
    # based) are two independently-built "what does this team deserve"
    # signals. When they diverge a lot, that's a genuinely different story
    # from plain scoreboard luck - e.g. a team whose underlying output has
    # turned a corner well before the ladder (even the luck-adjusted ladder)
    # shows it. NA-safe: if power_ranks wasn't supplied to
    # generate_narrative_summaries(), ladder_position/power_rank are NA and
    # this hook is simply skipped for every team. Direction is reported,
    # not diagnosed, same convention as hook 3 above - the downstream LLM
    # is better placed to interpret e.g. "outperforming the ladder AND
    # snakebitten" as a compounding pattern than this module is.
    if (!is.na(row$ladder_position) && !is.na(row$power_rank)) {
        divergence <- row$ladder_position - row$power_rank
        if (abs(divergence) >= form_divergence_threshold) {
            direction <- if (divergence > 0) "outperforming_ladder" else "underperforming_ladder"
            hooks[[length(hooks) + 1]] <- hook(
                row$team, "form_vs_luck_divergence", divergence, form_divergence_threshold,
                list(
                    direction = direction,
                    ladder_position = row$ladder_position, power_rank = row$power_rank,
                    power_trend = row$trend, Luck_Status = row$Luck_Status, Luck_Rating = row$Luck_Rating
                )
            )
        }
    }

    if (length(hooks) == 0) return(NULL)
    bind_rows(hooks)
}

##########################################################
# Internal Helper: build_match_story_hooks
#
# Description:
#
# Scans this round's matches for comeback stories, using the quarter-
# level momentum fields 40_match_metrics.R's build_match_momentum()
# already computes (is_comeback_win, biggest_deficit_overcome). Both
# hooks below come off the SAME number: the deficit the winner overcame
# is, by definition, the lead the loser held and then lost - so this
# deliberately does NOT use largest_lead_surrendered. As currently
# computed in build_match_momentum(), largest_lead_surrendered reduces
# to the exact same value as biggest_deficit_overcome (both resolve to
# -min(winner_view) - see the two max()/min() lines there), so it isn't
# a safe source for an independent "blew a lead but still won" story
# yet. That looks like a bug worth a look in 40_match_metrics.R; flagged
# here rather than silently built on.
#
# Only scans round_matches (the same latest-round slice used for the
# robbery lookup) - comebacks are a "this week" story, not a season
# aggregate.
#
##########################################################
build_match_story_hooks <- function(round_matches, comeback_threshold = NARRATIVE_COMEBACK_MIN_DEFICIT) {
    required_cols <- c("home_team", "away_team", "home_score", "away_score",
                        "actual_winner", "is_comeback_win", "biggest_deficit_overcome")
    if (nrow(round_matches) == 0 || !all(required_cols %in% names(round_matches))) return(NULL)

    candidates <- round_matches |>
        filter(
            !is.na(is_comeback_win), is_comeback_win,
            !is.na(biggest_deficit_overcome), biggest_deficit_overcome >= comeback_threshold
        ) |>
        mutate(loser_team = if_else(actual_winner == home_team, away_team, home_team))

    if (nrow(candidates) == 0) return(NULL)

    round_col <- if ("round" %in% names(candidates)) candidates$round else rep(NA_real_, nrow(candidates))

    hooks <- purrr::pmap(
        list(
            winner  = candidates$actual_winner,
            loser   = candidates$loser_team,
            home_team = candidates$home_team,
            away_team = candidates$away_team,
            home_score = candidates$home_score,
            away_score = candidates$away_score,
            deficit = candidates$biggest_deficit_overcome,
            rnd     = round_col
        ),
        function(winner, loser, home_team, away_team, home_score, away_score, deficit, rnd) {
            bind_rows(
                hook(
                    winner, "comeback_win", deficit, comeback_threshold,
                    list(
                        round = rnd, opponent = loser, home_team = home_team, away_team = away_team,
                        home_score = home_score, away_score = away_score,
                        biggest_deficit_overcome = deficit
                    )
                ),
                hook(
                    loser, "surrendered_lead", deficit, comeback_threshold,
                    list(
                        round = rnd, opponent = winner, home_team = home_team, away_team = away_team,
                        home_score = home_score, away_score = away_score,
                        lead_surrendered = deficit
                    )
                )
            )
        }
    )

    bind_rows(hooks)
}

##########################################################
# Internal Helper: build_robbery_hooks
#
# Description:
#
# Turns the single biggest statistical upset of the round (robbery_match,
# from calculate_luck_extremes) into a hook for each side of that match,
# and cross-references it against the season-long hooks already built for
# those teams - so a team that just got robbed AND has been snakebitten
# all season (or just rode a lucky break AND has been riding them all
# season) surfaces as a compounding pattern rather than two coincidental,
# disconnected hooks the downstream LLM has to notice by chance.
#
# robbery_threshold reuses JUSTICE_LUCKY_THRESHOLD_PER_GAME (0.3):
# luck_variance is a single-game version of the same Actual_Points -
# Expected_Points quantity Luck_Rating_Per_Game measures across a
# season, so it's the same unit and the same bar is appropriate.
#
##########################################################
build_robbery_hooks <- function(robbery_match, existing_hooks,
                                 robbery_threshold = JUSTICE_LUCKY_THRESHOLD_PER_GAME) {
    if (is.null(robbery_match) || nrow(robbery_match) == 0) return(NULL)

    r <- robbery_match |> slice(1)
    rnd <- if ("round" %in% names(r)) r$round else NA_real_

    has_season_hook <- function(team_name, angles) {
        if (nrow(existing_hooks) == 0) return(FALSE)
        any(existing_hooks$team == team_name & existing_hooks$angle %in% angles)
    }

    lucky_compounds   <- has_season_hook(r$lucky_team,   c("riding_the_breaks", "buried_by_others_luck"))
    unlucky_compounds <- has_season_hook(r$unlucky_team, c("snakebitten", "overplaced"))

    bind_rows(
        hook(
            r$lucky_team, "robbery_beneficiary", r$luck_variance, robbery_threshold,
            list(
                round = rnd, opponent = r$unlucky_team,
                home_team = r$home_team, away_team = r$away_team,
                home_score = r$home_score, away_score = r$away_score,
                home_xscore = r$home_xscore, away_xscore = r$away_xscore,
                luck_variance = r$luck_variance,
                compounds_with_season_pattern = lucky_compounds
            )
        ),
        hook(
            r$unlucky_team, "robbery_victim", r$luck_variance, robbery_threshold,
            list(
                round = rnd, opponent = r$lucky_team,
                home_team = r$home_team, away_team = r$away_team,
                home_score = r$home_score, away_score = r$away_score,
                home_xscore = r$home_xscore, away_xscore = r$away_xscore,
                luck_variance = r$luck_variance,
                compounds_with_season_pattern = unlucky_compounds
            )
        )
    )
}

##########################################################
# Generate Narrative Summaries
##########################################################
generate_narrative_summaries <- function(match_evaluations, justice_standings, latest_round = NA, power_ranks = NULL) {
    message("INFO: Starting Narrative Story Hooks...")

    # A. Robbery of the round - biggest statistical upset in the latest round.
    # Falls back to whole-of-sample if latest_round isn't usable, so this
    # degrades gracefully rather than failing the pipeline.
    round_matches <- if (!is.null(latest_round) && length(latest_round) == 1 && is.finite(latest_round) &&
                          "round" %in% names(match_evaluations)) {
        match_evaluations |> filter(round == latest_round)
    } else {
        match_evaluations
    }

    robbery_candidates <- calculate_luck_extremes(round_matches, top_n = 1, group_by_round = FALSE)
    robbery_match <- if (nrow(robbery_candidates) == 0) NULL else robbery_candidates |> slice(1)

    # B. Attach Form Pulse (power rankings) context, if supplied, so
    # build_team_story_hooks() can compare it against the Justice Ladder.
    # Optional and NA-safe: narratives still runs fine without it (e.g.
    # called standalone or before 60_power_rankings.R exists in a given
    # pipeline run) - it just skips the form_vs_luck_divergence hook,
    # matching the fallback style used throughout this codebase.
    has_power_ranks <- !is.null(power_ranks) &&
        all(c("team", "ladder_position", "power_rank", "trend") %in% names(power_ranks))

    justice_standings <- if (has_power_ranks) {
        justice_standings |>
            left_join(
                power_ranks |> select(team, ladder_position, power_rank, trend),
                by = "team"
            )
    } else {
        justice_standings |>
            mutate(ladder_position = NA_integer_, power_rank = NA_integer_, trend = NA_character_)
    }

    # C. Team-level story hooks - scan every team on the ladder for newsworthy patterns
    story_hooks <- if (nrow(justice_standings) == 0) {
        tibble(team = character(), angle = character(),
               priority = double(), supporting_stats = list())
    } else {
        justice_standings |>
            split(seq_len(nrow(justice_standings))) |>
            map(build_team_story_hooks) |>
            compact() |>
            bind_rows()
    }

    # D. Match-level story hooks (comebacks) for the latest round
    match_hooks <- build_match_story_hooks(round_matches)
    if (!is.null(match_hooks)) story_hooks <- bind_rows(story_hooks, match_hooks)

    # E. Robbery-of-the-round hooks, cross-referenced against every hook
    # already built above so compounding season patterns are flagged.
    robbery_hooks <- build_robbery_hooks(robbery_match, story_hooks)
    if (!is.null(robbery_hooks)) story_hooks <- bind_rows(story_hooks, robbery_hooks)

    if (nrow(story_hooks) > 0) {
        story_hooks <- story_hooks |> arrange(desc(priority))
    }

    message("INFO: Completed Narrative Story Hooks - ", nrow(story_hooks), " hook(s) generated")

    list(
        robbery_match = robbery_match,
        story_hooks   = story_hooks
    )
}