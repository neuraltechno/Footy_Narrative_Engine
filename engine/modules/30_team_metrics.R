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
# Processed player data
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

##########################################################
# Calculate Team Metrics
#
# Description:
#
# Calculates aggregate ratings per team.
#
# Inputs:
#
# player_data
#
# Returns:
#
# Team Metric Data Frame
#
##########################################################
calculate_team_metrics <- function(player_data) {
    message("INFO: Starting Team Metrics...")
    
    # Calculation logic (weighted aggregation aligning to actual schema)
    team_metrics <- player_data |>
        group_by(team = team.name) |> 
        summarise(
            overall_rating = mean(PIR, na.rm = TRUE),
            attack_rating  = if("expected_score_contribution" %in% names(player_data)) 
                mean(expected_score_contribution, na.rm = TRUE) else 0,
            pressure_rating = if("pressure_rating" %in% names(player_data)) 
                mean(pressure_rating, na.rm = TRUE) else 0,
            .groups = "drop"
        )

    message("INFO: Completed Team Metrics")
    return(team_metrics)
}
