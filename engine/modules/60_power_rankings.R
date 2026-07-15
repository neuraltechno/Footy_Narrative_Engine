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
# Processed Team Data Profiles, Latest Round Sequence
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
# Calculates unified power rating using system velocity trends.
#
##########################################################
calculate_power_rankings <- function(team_metrics, latest_round) {
    message("INFO: Starting Power Rankings...")
    
    # Isolate current round profile to calculate form power rankings
    rankings <- team_metrics |>
        filter(round == latest_round) |>
        mutate(
            power_score = round((overall_rating * 0.7) + (system_velocity * 30), 1),
            trend = case_when(
                system_velocity >= 1.5 ~ "Surging",
                system_velocity <= 0.9 ~ "Faltering",
                TRUE                   ~ "Steady"
            )
        ) |>
        arrange(desc(power_score)) |>
        mutate(power_rank = row_number())

    message("INFO: Completed Power Rankings")
    return(rankings)
}