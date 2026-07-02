##########################################################
# Module
#
# Name:
#
# Justice Ladder
#
# Purpose:
#
# Rank teams by football performance (expected) rather than luck
#
# Inputs:
#
# Processed Team Data
#
# Outputs:
#
# Justice Ladder Data Frame
#
# Dependencies:
#
# 00_config.R, 01_helpers.R
#
##########################################################

library(dplyr)

##########################################################
# Calculate Justice Ladder
#
# Description:
#
# Calculates expected wins, losses, and luck index.
#
# Inputs:
#
# team_data
#
# Returns:
#
# Justice Ladder Data Frame
#
##########################################################
calculate_justice_ladder <- function(team_data) {
    message("INFO: Starting Justice Ladder...")
    
    # --- SAFE FALLBACK ENGINE ---
    # Dynamically inject fallback columns if wins/losses functionality isn't built yet
    if (!"actual_wins" %in% names(team_data)) {
        team_data$actual_wins <- 0
    }
    
    if (!"expected_wins" %in% names(team_data)) {
        # Fall back to using overall performance rating as a ranking baseline if wins are missing
        team_data$expected_wins <- if("overall_rating" %in% names(team_data)) team_data$overall_rating else 0
    }
    
    # Calculation logic using native pipe
    ladder <- team_data |>
        mutate(
            luck_index = actual_wins - expected_wins,
            justice_position = rank(-expected_wins, ties.method = "min")
        ) |>
        arrange(justice_position)

    message("INFO: Completed Justice Ladder")
    
    return(ladder)
}