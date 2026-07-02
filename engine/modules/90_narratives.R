##########################################################
# Module
#
# Name:
#
# Narrative Engine
#
# Purpose:
#
# Prepare structured, AI-ready information for Gemini
#
# Inputs:
#
# Processed Team/Match Data
#
# Outputs:
#
# AI-ready narrative summary data frame
#
# Dependencies:
#
# 00_config.R, 01_helpers.R
#
##########################################################

library(dplyr)

##########################################################
# Generate Narrative Summaries
#
# Description:
#
# Prepares data points for AI prompt generation.
#
# Inputs:
#
# summary_data
#
# Returns:
#
# Narrative Summary Data Frame
#
##########################################################
generate_narrative_summaries <- function(summary_data) {
    message("INFO: Starting Narrative Engine...")
    
    # --- SAFE FALLBACK ENGINE ---
    # Dynamically handle missing columns used in the text output string
    if (!"team" %in% names(summary_data)) {
        summary_data$team <- "Unknown Team"
    }
    if (!"overall_rating" %in% names(summary_data)) {
        summary_data$overall_rating <- 0
    }
    if (!"trend" %in% names(summary_data)) {
        summary_data$trend <- "stable"
    }
    
    # Calculation logic using native pipe
    narratives <- summary_data |>
        mutate(
            confidence = 90,
            summary = paste(team, "had a", trend, "trend with an overall rating of", round(overall_rating, 1))
        )

    message("INFO: Completed Narrative Engine")
    
    return(narratives)
}