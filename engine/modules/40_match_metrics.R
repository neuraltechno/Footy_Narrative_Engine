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
##########################################################
calculate_match_metrics <- function(results, team_line_snapshots, latest_round) {
    message("INFO: Starting Match Engine...")
    
    normalize_team_name <- function(team) {
        case_when(
            team %in% c("Adelaide", "Adelaide Crows") ~ "Adelaide Crows",
            team %in% c("Brisbane", "Brisbane Lions") ~ "Brisbane Lions",
            team %in% c("Carlton", "Carlton Blues")  ~ "Carlton Blues",
            team == "Collingwood"                    ~ "Collingwood Magpies",
            team == "Essendon"                       ~ "Essendon Bombers",
            team == "Fremantle"                      ~ "Fremantle Dockers",
            team %in% c("Geelong", "Geelong Cats")   ~ "Geelong Cats",
            team %in% c("Gold Coast", "Gold Coast SUNS") ~ "Gold Coast Suns",
            team %in% c("GWS", "Greater Western Sydney", "GWS GIANTS") ~ "GWS Giants",
            team == "Hawthorn"                       ~ "Hawthorn Hawks",
            team == "Melbourne"                      ~ "Melbourne Demons",
            team %in% c("North Melbourne", "North")  ~ "North Melbourne Kangaroos",
            team %in% c("Port Adelaide", "Port")     ~ "Port Adelaide Power",
            team == "Richmond"                       ~ "Richmond Tigers",
            team %in% c("St Kilda", "St Kilda Saints") ~ "St Kilda Saints",
            team %in% c("Sydney", "Sydney Swans")     ~ "Sydney Swans",
            team %in% c("West Coast", "West Coast Eagles") ~ "West Coast Eagles",
            team %in% c("Western Bulldogs", "Western") ~ "Western Bulldogs",
            TRUE                                     ~ team
        )
    }

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
            home_raw_xscore = round(((home_goals * 0.55 + home_behinds * 0.35) * 6) + 
                                    ((home_goals * 0.30 + home_behinds * 0.50) * 1), 1),
            
            away_raw_xscore = round(((away_goals * 0.55 + away_behinds * 0.35) * 6) + 
                                    ((away_goals * 0.30 + away_behinds * 0.50) * 1), 1)
        ) |>
        # 3. Join Side-by-Side Team Line PIR & System Dynamics
        left_join(team_line_snapshots, by = c("round" = "round", "home_team" = "team")) |>
        rename_with(~ paste0("home_", .), .cols = c(engine_room_pir, iron_curtain_pir, the_arsenal_pir, system_velocity)) |>
        left_join(team_line_snapshots, by = c("round" = "round", "away_team" = "team")) |>
        rename_with(~ paste0("away_", .), .cols = c(engine_room_pir, iron_curtain_pir, the_arsenal_pir, system_velocity)) |>
        select(-contains("total_player_pir"), -contains("DI_for"), -contains("approx_round_disposals"), -contains("overall_rating")) |>
        mutate(
            expected_winner = if_else(home_raw_xscore > away_raw_xscore, home_team, away_team),
            actual_winner   = if_else(home_score > away_score, home_team, away_team),
            is_robbery      = expected_winner != actual_winner,
            luck_delta      = abs((home_score - away_score) - (home_raw_xscore - away_raw_xscore))
        )

    message("INFO: Completed Match Engine")
    return(match_metrics)
}