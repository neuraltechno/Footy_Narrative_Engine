##########################################################
# Module
#
# Name:
#   Player Advanced Metrics Engine
#
# Purpose:
#   Calculate advanced features: Breakout Watch, Category Kings, Top Games, ESC Leaderboard
#
# Inputs:
#   players_season (Data frame), processed_rounds (Data frame), latest_round (Integer)
#
# Outputs:
#   List of advanced metric data frames/lists
#
# Dependencies:
#   00_config.R, 01_helpers.R
#
##########################################################

library(dplyr)
library(jsonlite)

##########################################################
# Helper: safe_positive_quantile
#
# Description:
#   Returns the requested percentile of the positive values in x.
#   Returns Inf (rather than erroring) when there are no positive
#   values to work with, e.g. a bye-heavy or early-season round
#   where nobody in a position group has a positive form delta -
#   the group simply produces no qualifiers instead of crashing
#   the pipeline.
##########################################################
safe_positive_quantile <- function(x, probs) {
    positive_vals <- x[!is.na(x) & x > 0]
    if (length(positive_vals) == 0) {
        return(Inf)
    }
    quantile(positive_vals, probs, na.rm = TRUE)
}

##########################################################
# Helper: load_category_kings_snapshot / save_category_kings_snapshot
#
# Description:
#   Round-by-round persistence for Category Kings leaderboards. Storing
#   just {player.playerId, rank, score, streak} per category per round lets each
#   run compute this week's rank movement and "reigning king" streaks by
#   diffing against a single prior file, rather than recomputing history
#   from raw stats every time. Snapshots live under CATEGORY_KINGS_SNAPSHOT_DIR
#   (pipeline-internal state) and are distinct from the public JSON output.
##########################################################
load_category_kings_snapshot <- function(round) {
    if (round < 1) return(NULL) 
    path <- file.path(CATEGORY_KINGS_SNAPSHOT_DIR, paste0("round_", round, ".rds"))
    if (!file.exists(path)) return(NULL)
    tryCatch(
        readRDS(path),
        error = function(e) {
            message("WARN: Could not read Category Kings snapshot for round ", round,
                     " - movement/streak tracking will restart from this round.")
            NULL
        }
    )
}

save_category_kings_snapshot <- function(category_kings_leaders, round) {
    if (!dir.exists(CATEGORY_KINGS_SNAPSHOT_DIR)) {
        dir.create(CATEGORY_KINGS_SNAPSHOT_DIR, recursive = TRUE)
    }
    snapshot <- lapply(category_kings_leaders, function(df) {
        # Select the flat playerId from the leaderboard data frame,
        # and name it player.playerId in the saved RDS file to align
        # with the raw joining data frame next week.
        df %>% select(player.playerId = playerId, rank, score, streak)
    })
    path <- file.path(CATEGORY_KINGS_SNAPSHOT_DIR, paste0("round_", round, ".rds"))
    tryCatch(
        saveRDS(snapshot, path),
        error = function(e) {
            message("WARN: Could not save Category Kings snapshot for round ", round,
                     " - next round's movement/streak tracking may be affected.")
        }
    )
}

##########################################################
# Catchup Category Kings Snapshots
#
# Description:
#   Checks the snapshot directory for any missing prior rounds.
#   If any are missing, it processes them sequentially to ensure
#   streaks and rank movement calculate perfectly.
##########################################################
catchup_category_kings_snapshots <- function(players_season, processed_rounds, current_round) {
    all_prior_rounds <- sort(unique(processed_rounds$round.roundNumber))
    all_prior_rounds <- all_prior_rounds[all_prior_rounds < current_round]
    
    if (length(all_prior_rounds) == 0) {
        message("INFO: No prior rounds found to backfill for Category Kings.")
        return(invisible(NULL))
    }
    
    message("INFO: Checking for missing historical Category Kings snapshots...")
    
    for (i in seq_along(all_prior_rounds)) {
        r <- all_prior_rounds[i]
        snapshot_path <- file.path(CATEGORY_KINGS_SNAPSHOT_DIR, paste0("round_", r, ".rds"))
        
        if (!file.exists(snapshot_path)) {
            message("INFO: Category Kings snapshot missing for Round ", r, " - Backfilling now...")
            
            # Filter history up to the round we are backfilling
            historical_rounds <- processed_rounds %>% 
                filter(round.roundNumber <= r)
            
            # Run the advanced metrics engine for that round context.
            # We call the core computation directly by passing the corrected name.
            tryCatch({
                calculate_advanced_metrics_core(
                    players_season = players_season,
                    processed_rounds = historical_rounds,
                    latest_round = r
                )
            }, error = function(e) {
                message("WARN: Failed to generate historical snapshot for Round ", r, ": ", e$message)
            })
        }
    }
    message("INFO: Category Kings snapshot catchup check complete.")
}

##########################################################
# Internal Core Calculation
#
# Description:
#   The explicit functional execution layer decoupled from the catchup loop
#   to prevent recursive calls during backfill execution.
##########################################################
calculate_advanced_metrics_core <- function(players_season, processed_rounds, latest_round) {
    # ==========================================================================
    # 1. Breakout Watch
    # ==========================================================================
    recent_form <- processed_rounds %>%
        filter(round.roundNumber > (latest_round - BREAKOUT_ROLLING_WINDOW)) %>%
        arrange(player.playerId, round.roundNumber) %>%
        group_by(player.playerId) %>%
        summarise(
            Recent_Games_Played   = n(),
            Last_3_Rounds_Avg_PIR = mean(PIR, na.rm = TRUE),
            Recent_PIR_SD         = sd(PIR, na.rm = TRUE),
            Is_Trending_Up        = Recent_Games_Played >= 2 && last(PIR) >= first(PIR),
            .groups               = 'drop'
        ) %>%
        filter(Recent_Games_Played >= BREAKOUT_MIN_RECENT_GAMES)

    season_game_counts <- processed_rounds %>%
        group_by(player.playerId) %>%
        summarise(
            Total_Games_Played = n(), 
            .groups            = 'drop'
        )

    has_career_games <- "careerGames" %in% names(players_season)
    if (!has_career_games) {
        message(
            "WARN: 'careerGames' not found in players_season - Breakout Watch ",
            "eligibility will use Age only. Add a career-games field upstream ",
            "to enable the <", BREAKOUT_MAX_CAREER_GAMES, "-games emerging-talent pathway."
        )
    }

    players_season_gated <- players_season %>%
        mutate(
            Meets_Breakout_Eligibility = if (has_career_games) {
                Age <= BREAKOUT_MAX_AGE | careerGames < BREAKOUT_MAX_CAREER_GAMES
            } else {
                Age <= BREAKOUT_MAX_AGE
            },
            Career_Games_Display = if (has_career_games) careerGames else NA_integer_
        )

    breakout_watch <- players_season_gated %>%
        filter(Meets_Breakout_Eligibility) %>%
        left_join(POS_NAME_LOOKUP, by = c("playerPosition" = "position_name"), relationship = "many-to-one") %>%
        mutate(position_group = coalesce(position_group, "Unknown")) %>%
        inner_join(recent_form, by = "player.playerId") %>%
        inner_join(season_game_counts, by = "player.playerId") %>%
        filter(Total_Games_Played > Recent_Games_Played) %>%
        mutate(
            Form_Delta        = Last_3_Rounds_Avg_PIR - Season_Avg_PIR,
            Age_Weight        = case_when(
                Age <= BREAKOUT_AGE_TAPER_START ~ BREAKOUT_AGE_WEIGHT_YOUNG,
                Age <= BREAKOUT_AGE_TAPER_END   ~ BREAKOUT_AGE_WEIGHT_YOUNG -
                                                   ((Age - BREAKOUT_AGE_TAPER_START) * BREAKOUT_AGE_TAPER_SLOPE),
                TRUE                             ~ BREAKOUT_AGE_WEIGHT_FLOOR
            ),
            Sample_Confidence = case_when(
                Recent_Games_Played >= BREAKOUT_ROLLING_WINDOW ~ BREAKOUT_SAMPLE_CONF_FULL_GAMES,
                TRUE                                           ~ BREAKOUT_SAMPLE_CONF_MIN_GAMES
            ),
            Trend_Label       = case_when(
                !Is_Trending_Up ~ "one_off_spike",
                (Recent_PIR_SD / Last_3_Rounds_Avg_PIR) <= BREAKOUT_CV_THRESHOLD ~ "sustained_riser",
                TRUE ~ "accelerating"
            ),
            Breakout_Score    = ((Form_Delta * Age_Weight) + (Season_Avg_PIR * BREAKOUT_BASELINE_WEIGHT)) * Sample_Confidence,
            Qualifies_Via     = case_when(
                Age <= BREAKOUT_MAX_AGE ~ "age",
                TRUE                    ~ "career_games"
            )
        ) %>%
        group_by(position_group) %>%
        mutate(Position_Delta_Threshold = safe_positive_quantile(Form_Delta, BREAKOUT_DELTA_PERCENTILE)) %>%
        ungroup() %>%
        filter(
            Form_Delta > Position_Delta_Threshold,
            Season_Avg_PIR > quantile(Season_Avg_PIR, BREAKOUT_QUALITY_PERCENTILE, na.rm = TRUE)
        ) %>%
        arrange(desc(Breakout_Score)) %>%
        slice_head(n = BREAKOUT_LIST_SIZE) %>%
        mutate(
            season_avg = round(Season_Avg_PIR, 1),
            recent_avg = round(Last_3_Rounds_Avg_PIR, 1),
            delta      = round(Form_Delta, 1)
        ) %>%
        select(
            playerId       = player.playerId, 
            givenName      = player.givenName, 
            surname        = player.surname, 
            team           = team.name, 
            photoURL, 
            age            = Age, 
            career_games   = Career_Games_Display,
            qualifies_via  = Qualifies_Via,
            position       = playerPosition,
            position_group,
            season_avg, 
            recent_avg, 
            delta,
            trend_label    = Trend_Label,
            breakout_score = Breakout_Score, 
            peak_game      = Max_PIR
        )

    # ==========================================================================
    # 2. Category Kings
    # ==========================================================================
    # Category scores are derived directly from processed_rounds, NOT from
    # players_season. players_season only ever holds the CURRENT run's
    # season-to-date totals; catchup_category_kings_snapshots() truncates
    # processed_rounds to "games up to round r" when backfilling history,
    # but players_season is passed through unchanged for every backfilled
    # round. Sourcing the category scores from players_season would mean
    # every backfilled round is scored on today's season averages - i.e.
    # every historical snapshot ends up identical to the current one, which
    # is why movement showed "same" everywhere and streaks were inflated to
    # the full season. Averaging the raw per-game norm_* columns straight
    # from processed_rounds keeps each backfilled round genuinely "as of
    # that round".
    category_averages <- processed_rounds %>%
        group_by(player.playerId) %>%
        summarise(
            Avg_cat_disposal          = mean(norm_disposal, na.rm = TRUE),
            Avg_cat_contest_clearance = mean(norm_contest,  na.rm = TRUE),
            Avg_cat_damaging_impact   = mean(norm_damage,   na.rm = TRUE),
            Avg_cat_defensive_grit    = mean(norm_grit,     na.rm = TRUE),
            Avg_cat_ruck              = mean(norm_ruck,     na.rm = TRUE),
            Total_Games_Played        = n(),
            .groups                   = 'drop'
        ) %>%
        filter(Total_Games_Played >= CATEGORY_KINGS_MIN_GAMES)

    # Static player attributes (name, team, photo, position group) are fine
    # to take from players_season - those don't need to be point-in-time.
    eligible_season_data <- players_season %>%
        select(player.playerId, player.givenName, player.surname, team.name, photoURL, playerGroup) %>%
        inner_join(category_averages, by = "player.playerId")

    previous_kings_snapshot <- load_category_kings_snapshot(latest_round - 1)

    build_category_king <- function(data, def, previous_snapshot) {
        pool <- data
        if (!is.na(def$filter_group)) {
            pool <- pool %>% filter(playerGroup == def$filter_group)
        }

        col  <- def$column
        prev <- previous_snapshot[[def$key]]

        leaders <- pool %>%
            filter(!is.na(.data[[col]])) %>%
            arrange(desc(.data[[col]]), desc(Total_Games_Played)) %>%
            head(CATEGORY_KINGS_LIST_SIZE) %>%
            mutate(
                rank  = row_number(),
                score = round(.data[[col]], 1)
            )

        if (!is.null(prev)) {
            leaders <- leaders %>%
                left_join(
                    prev %>% select(player.playerId, prev_rank = rank, prev_streak = streak),
                    by = "player.playerId"
                )
        } else {
            leaders <- leaders %>% mutate(prev_rank = NA_integer_, prev_streak = NA_integer_)
        }

        leaders %>%
            mutate(
                movement = case_when(
                    is.na(prev_rank)  ~ "new",
                    prev_rank > rank  ~ "up",
                    prev_rank < rank  ~ "down",
                    TRUE              ~ "same"
                ),
                streak = if_else(
                    rank == 1,
                    if_else(!is.na(prev_rank) & prev_rank == 1, coalesce(prev_streak, 1) + 1, 1),
                    NA_integer_
                )
            ) %>%
            select(
                rank,
                playerId  = player.playerId, 
                givenName = player.givenName, 
                surname   = player.surname, 
                team      = team.name, 
                photoURL, 
                score,
                movement,
                streak
            )
    }

    category_kings_categories <- lapply(seq_len(nrow(CATEGORY_KINGS_DEFS)), function(i) {
        def     <- CATEGORY_KINGS_DEFS[i, ]
        leaders <- build_category_king(eligible_season_data, def, previous_kings_snapshot)
        list(
            label            = def$label,
            stat_description = def$stat_description,
            gap_to_second    = if (nrow(leaders) >= 2) round(leaders$score[1] - leaders$score[2], 1) else NA_real_,
            leaders          = leaders
        )
    })
    names(category_kings_categories) <- CATEGORY_KINGS_DEFS$key

    category_kings <- list(
        generated_round = latest_round,
        categories      = category_kings_categories
    )

    save_category_kings_snapshot(
        lapply(category_kings_categories, `[[`, "leaders"),
        latest_round
    )

    # ==========================================================================
    # 3. Top Games (Sorted by Traditional PIR)
    # ==========================================================================
    top_games <- processed_rounds %>%
        mutate(
            raw_opponent       = ifelse(teamStatus == "home", away.team.name, home.team.name),
            match.opponentName = sapply(raw_opponent, normalize_team_name)
        ) %>%
        arrange(desc(PIR)) %>%
        slice(1:50) %>%
        mutate(
            game_title = paste0("Round ", round.roundNumber, " vs ", match.opponentName)
        ) %>%
        select(
            playerId    = player.playerId, 
            givenName   = player.givenName, 
            surname     = player.surname, 
            team        = team.name, 
            jumperNumber, 
            photoURL    = player.photoURL, 
            round       = round.roundNumber, 
            opponent    = match.opponentName, 
            PIR, 
            disposal    = norm_disposal, 
            contest     = norm_contest, 
            damage      = norm_damage, 
            grit        = norm_grit, 
            ruck        = norm_ruck, 
            game_title
        )

    # ==========================================================================
    # 4. Expected Score Contribution (ESC) Leaderboard
    # ==========================================================================
    top_esc_games <- processed_rounds %>%
        mutate(
            raw_opponent       = ifelse(teamStatus == "home", away.team.name, home.team.name),
            match.opponentName = sapply(raw_opponent, normalize_team_name),
            
            ESC = (coalesce(goals, 0) * 6.0) + 
                  (coalesce(behinds, 0) * 1.0) + 
                  (coalesce(goalAssists, 0) * 3.0) + 
                  (coalesce(extendedStats.scoreLaunches, 0) * 2.0) + 
                  (coalesce(scoreInvolvements, 0) * 0.5) + 
                  (coalesce(inside50s, 0) * 0.8) + 
                  (coalesce(clearances.totalClearances, 0) * 0.6) + 
                  (coalesce(intercepts, 0) * 0.7) + 
                  (coalesce(extendedStats.pressureActs, 0) * 0.1) + 
                  (coalesce(metresGained, 0) * 0.002) - 
                  (coalesce(turnovers, 0) * 1.2)
        ) %>%
        arrange(desc(ESC)) %>%
        slice(1:50) %>%
        mutate(
            game_title = paste0("Round ", round.roundNumber, " vs ", match.opponentName),
            ESC        = round(ESC, 1) 
        ) %>%
        select(
            playerId    = player.playerId, 
            givenName   = player.givenName, 
            surname     = player.surname, 
            team        = team.name, 
            jumperNumber, 
            photoURL    = player.photoURL, 
            round       = round.roundNumber, 
            opponent    = match.opponentName, 
            ESC,
            game_title
        )
    
    return(list(
        breakout_watch = breakout_watch, 
        category_kings = category_kings, 
        top_games      = top_games,       
        top_esc_games  = top_esc_games    
    ))
}

##########################################################
# Calculate Advanced Metrics (Public Entry Point)
#
# Description:
#   Generates breakout, category kings, top games, and ESC data.
#   Triggers the catchup method automatically to verify history.
##########################################################
calculate_advanced_metrics <- function(players_season, processed_rounds, latest_round) {
    message("INFO: Starting Advanced Metrics Orchestration...")
    
    # Run the self-healing snapshot check first
    catchup_category_kings_snapshots(players_season, processed_rounds, latest_round)
    
    message("INFO: Running advanced metric calculations for current round ", latest_round, "...")
    outputs <- calculate_advanced_metrics_core(players_season, processed_rounds, latest_round)
    
    message("INFO: Completed Advanced Metrics")
    return(outputs)
}