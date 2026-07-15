##########################################################
# Module
#
# Name:
#
# Team Metrics Engine
#
# Purpose:
#
# Aggregate player ratings into team ratings
#
# Inputs:
#
# Processed player data, team_stats baseline, latest_round
#
# Outputs:
#
# Team-level metrics data frame
#
# Dependencies:
#
# 00_config.R, 01_helpers.R
#
##########################################################

library(dplyr)
library(tidyr)

##########################################################
# Calculate Team Metrics
#
# Description:
#
# Calculates aggregate ratings per team and structural metrics.
#
##########################################################
calculate_team_metrics <- function(player_season_data, team_stats, latest_round) {
    message("INFO: Starting Team Metrics...")
    
    # 1. Team Name Normalization
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

    # 2. Unnest individual player match-by-match PIR records
    player_game_rows <- player_season_data |>
        select(player.playerId, team = team.name, playerLine, PIR_History) |>
        unnest(PIR_History) |>
        filter(pir > 0)

    # 3. Pull season disposal metrics for velocity weightings
    team_disposal_baselines <- team_stats |>
        mutate(Team = sapply(Team, normalize_team_name)) |>
        select(team = Team, DI_for)

    # 4. Core structural team line calculations
    team_metrics <- player_game_rows |>
        group_by(round, team) |>
        summarise(
            engine_room_pir   = round(sum(pir[playerLine %in% c("Midfield", "Ruck")], na.rm = TRUE), 1),
            iron_curtain_pir  = round(sum(pir[playerLine == "Backs"], na.rm = TRUE), 1),
            the_arsenal_pir   = round(sum(pir[playerLine == "Forwards"], na.rm = TRUE), 1),
            total_player_pir  = sum(pir, na.rm = TRUE),
            .groups = 'drop'
        ) |>
        mutate(team = sapply(team, normalize_team_name)) |>
        left_join(team_disposal_baselines, by = "team") |>
        mutate(
            approx_round_disposals = coalesce(DI_for, 350) / latest_round,
            system_velocity        = round(total_player_pir / approx_round_disposals, 2),
            overall_rating         = round(total_player_pir / 22, 1) # Mean player baseline match score
        )

    message("INFO: Completed Team Metrics")
    return(team_metrics)
}