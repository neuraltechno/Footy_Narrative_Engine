##########################################################
# Module
#
# Name:
#
# Power Rankings
#
# Purpose:
#
# Identify the strongest teams based on rolling metrics
#
# Inputs:
#
# Processed Team Data
#
# Outputs:
#
# Power Rankings Data Frame
#
# Dependencies:
#
# 00_config.R, 01_helpers.R
#
##########################################################

library(dplyr)

##########################################################
# Calculate Power Rankings
#
# Description:
#
# Calculates power score and identifies trends.
#
# Inputs:
#
# team_data
#
# Returns:
#
# Power Rankings Data Frame
#
##########################################################
calculate_power_rankings <- function(team_data) {
    message("INFO: Starting Power Rankings...")
    
    # --- SAFE FALLBACK ENGINE ---
    # Ensure overall_rating exists so the power calculations don't crash
    if (!"overall_rating" %in% names(team_data)) {
        team_data$overall_rating <- 0
    }
    
    # Calculation logic using native pipe
    rankings <- team_data |>
        mutate(
            power_score = overall_rating * 1.1,
            trend = if_else(overall_rating > 105, "up", "steady")
        ) |>
        arrange(desc(power_score))

    message("INFO: Completed Power Rankings")
    
    return(rankings)
}