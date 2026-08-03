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
# justice_standings   - Output of calculate_justice_ladder() +
#                        get_ladder_movement() for the current round.
# latest_round        - Numeric round number for the robbery-of-the-
#                        round lookup. NULL/NA is handled gracefully
#                        (falls back to whole-of-sample).
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
# Scans one row of the Justice Ladder and returns zero or more
# candidate story hooks for that team. A team can carry multiple hooks
# at once (e.g. both "snakebitten" AND "buried by others' luck") -
# that combination is often the real story, so this deliberately does
# not force a single hook per team.
#
##########################################################
build_team_story_hooks <- function(row,
                                    rank_buried_threshold    = 3,
                                    luck_per_game_threshold  = 0.3,
                                    model_scoreboard_threshold = 4,
                                    home_road_split_threshold = 8,
                                    rank_movement_threshold  = 2) {

    hooks <- list()

    # 1. Ladder-position luck: deserves better/worse than the real ladder shows
    if (!is.na(row$Rank_Delta) && row$Rank_Delta >= rank_buried_threshold) {
        hooks[[length(hooks) + 1]] <- hook(
            row$team, "buried_by_others_luck", row$Rank_Delta, rank_buried_threshold,
            list(
                Justice_Rank = row$Justice_Rank, Actual_Rank = row$Actual_Rank,
                Rank_Delta = row$Rank_Delta, Luck_Status = row$Luck_Status,
                Luck_Rating = row$Luck_Rating
            )
        )
    }
    if (!is.na(row$Rank_Delta) && row$Rank_Delta <= -rank_buried_threshold) {
        hooks[[length(hooks) + 1]] <- hook(
            row$team, "overplaced", row$Rank_Delta, rank_buried_threshold,
            list(
                Justice_Rank = row$Justice_Rank, Actual_Rank = row$Actual_Rank,
                Rank_Delta = row$Rank_Delta, Luck_Status = row$Luck_Status,
                Luck_Rating = row$Luck_Rating
            )
        )
    }

    # 2. Points luck: is the scoreboard rewarding/punishing this team relative to the model
    if (!is.na(row$Luck_Rating_Per_Game) && row$Luck_Rating_Per_Game <= -luck_per_game_threshold) {
        hooks[[length(hooks) + 1]] <- hook(
            row$team, "snakebitten", row$Luck_Rating_Per_Game, luck_per_game_threshold,
            list(
                Luck_Rating = row$Luck_Rating, Luck_Rating_Per_Game = row$Luck_Rating_Per_Game,
                Expected_Points = row$Expected_Points, Actual_Points = row$Actual_Points
            )
        )
    }
    if (!is.na(row$Luck_Rating_Per_Game) && row$Luck_Rating_Per_Game >= luck_per_game_threshold) {
        hooks[[length(hooks) + 1]] <- hook(
            row$team, "riding_the_breaks", row$Luck_Rating_Per_Game, luck_per_game_threshold,
            list(
                Luck_Rating = row$Luck_Rating, Luck_Rating_Per_Game = row$Luck_Rating_Per_Game,
                Expected_Points = row$Expected_Points, Actual_Points = row$Actual_Points
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
        shift_threshold <- luck_per_game_threshold * row$Rolling_Games * 2
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

    if (length(hooks) == 0) return(NULL)
    bind_rows(hooks)
}

##########################################################
# Generate Narrative Summaries
##########################################################
generate_narrative_summaries <- function(match_evaluations, justice_standings, latest_round = NA) {
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

    # B. Story hooks - scan every team on the ladder for newsworthy patterns
    if (nrow(justice_standings) == 0) {
        story_hooks <- tibble(team = character(), angle = character(),
                               priority = double(), supporting_stats = list())
    } else {
        story_hooks <- justice_standings |>
            split(seq_len(nrow(justice_standings))) |>
            map(build_team_story_hooks) |>
            compact() |>
            bind_rows()

        if (nrow(story_hooks) > 0) {
            story_hooks <- story_hooks |> arrange(desc(priority))
        }
    }

    message("INFO: Completed Narrative Story Hooks - ", nrow(story_hooks), " hook(s) generated")

    list(
        robbery_match = robbery_match,
        story_hooks   = story_hooks
    )
}