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
# Calculate Advanced Metrics
#
# Description:
#   Generates breakout, category kings, top games, and ESC data.
##########################################################
calculate_advanced_metrics <- function(players_season, processed_rounds, latest_round) {
    message("INFO: Starting Advanced Metrics...")
    
    # ==========================================================================
    # 1. Breakout Watch
    # ==========================================================================
    recent_form <- processed_rounds %>%
        filter(round.roundNumber > (latest_round - 3)) %>%
        group_by(player.playerId) %>%
        summarise(
            Recent_Games_Played   = n(),
            Last_3_Rounds_Avg_PIR = mean(PIR, na.rm = TRUE),
            .groups               = 'drop'
        ) %>%
        filter(Recent_Games_Played >= 2)

    season_game_counts <- processed_rounds %>%
        group_by(player.playerId) %>%
        summarise(
            Total_Games_Played = n(), 
            .groups            = 'drop'
        )

    breakout_watch <- players_season %>%
        inner_join(recent_form, by = "player.playerId") %>%
        inner_join(season_game_counts, by = "player.playerId") %>%
        filter(Total_Games_Played > Recent_Games_Played) %>% 
        mutate(
            Form_Delta     = Last_3_Rounds_Avg_PIR - Season_Avg_PIR,
            Age_Weight     = case_when(
                Age <= 21 ~ 1.5, 
                Age <= 25 ~ 1.5 - ((Age - 21) * 0.125), 
                TRUE      ~ 1.0
            ),
            Breakout_Score = (Form_Delta * Age_Weight) + (Season_Avg_PIR * 0.2)
        ) %>%
        filter(
            Form_Delta > quantile(Form_Delta[Form_Delta > 0], 0.85, na.rm = TRUE),
            Season_Avg_PIR > quantile(Season_Avg_PIR, 0.40, na.rm = TRUE)
        ) %>%
        arrange(desc(Breakout_Score)) %>%
        slice_head(n = 15) %>%
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
            position       = playerPosition, 
            season_avg, 
            recent_avg, 
            delta, 
            breakout_score = Breakout_Score, 
            peak_game      = Max_PIR
        )

    # ==========================================================================
    # 2. Category Kings
    # ==========================================================================
    eligible_player_ids <- processed_rounds %>%
        group_by(player.playerId) %>%
        summarise(
            actual_games = n_distinct(round.roundNumber), 
            .groups      = 'drop'
        ) %>%
        filter(actual_games >= 3) %>%
        pull(player.playerId)

    eligible_season_data <- players_season %>% 
        filter(player.playerId %in% eligible_player_ids)
    
    category_kings <- list(
        Avg_cat_disposal = eligible_season_data %>% 
            arrange(desc(Avg_cat_disposal)) %>% 
            head(5) %>% 
            select(name = player.surname, team = team.name, photoURL, score = Avg_cat_disposal),
        
        Avg_cat_contest_clearance = eligible_season_data %>% 
            arrange(desc(Avg_cat_contest_clearance)) %>% 
            head(5) %>% 
            select(name = player.surname, team = team.name, photoURL, score = Avg_cat_contest_clearance),
        
        Avg_cat_damaging_impact = eligible_season_data %>% 
            arrange(desc(Avg_cat_damaging_impact)) %>% 
            head(5) %>% 
            select(name = player.surname, team = team.name, photoURL, score = Avg_cat_damaging_impact),
        
        Avg_cat_defensive_grit = eligible_season_data %>% 
            arrange(desc(Avg_cat_defensive_grit)) %>% 
            head(5) %>% 
            select(name = player.surname, team = team.name, photoURL, score = Avg_cat_defensive_grit),
        
        Avg_cat_ruck = eligible_season_data %>% 
            filter(playerGroup == "Ruck") %>% 
            arrange(desc(Avg_cat_ruck)) %>% 
            head(5) %>% 
            select(name = player.surname, team = team.name, photoURL, score = Avg_cat_ruck)
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
            
            # Compute ESC row-by-row using action-based probability weighting
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
        # Arrange to showcase the pure offensive impact masterclasses
        arrange(desc(ESC)) %>%
        slice(1:50) %>%
        mutate(
            game_title = paste0("Round ", round.roundNumber, " vs ", match.opponentName),
            ESC        = round(ESC, 1) # Format decimals for seamless API payload consumption
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

    message("INFO: Completed Advanced Metrics")
    
    return(list(
        breakout_watch = breakout_watch, 
        category_kings = category_kings, 
        top_games      = top_games,       # Traditional masterclasses (PIR)
        top_esc_games  = top_esc_games    # Pure chain creation & scoring value (ESC)
    ))
}