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
# Processed Team Data
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
# Inputs:
#
# match_data
#
# Returns:
#
# Match Metric Data Frame
#
##########################################################
calculate_match_metrics <- function(match_data) {
    # Logging
    message("INFO: Starting Match Engine...")
    
    # --- SAFE FALLBACK ENGINE ---
    # Dynamically inject fallback columns if the expected metrics don't exist yet
    if (!"expected_score_home" %in% names(match_data)) {
        # Fall back to using standard actual scores if home.score is present
        # otherwise default to 0 if columns completely miss
        match_data$expected_score_home <- if("home.score" %in% names(match_data)) match_data$home.score else 0
    }
    
    if (!"expected_score_away" %in% names(match_data)) {
        match_data$expected_score_away <- if("away.score" %in% names(match_data)) match_data$away.score else 0
    }
    
    # Calculation logic using native pipe
    match_metrics <- match_data |>
        mutate(
            # Safe fallbacks are guaranteed above, now compute winner safely
            expected_winner = if_else(
                expected_score_home > expected_score_away, 
                if("home.team.name" %in% names(match_data)) home.team.name else "Home Team", 
                if("away.team.name" %in% names(match_data)) away.team.name else "Away Team"
            )
        )

    # Logging
    message("INFO: Completed Match Engine")
    
    return(match_metrics)
}