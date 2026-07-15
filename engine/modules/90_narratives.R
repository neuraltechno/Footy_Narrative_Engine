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
# Match Evaluations Data, Justice Ladder Outputs, Latest Round
#
# Outputs:
#
# Structured list of Narrative data points and targeted game summaries
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
# Isolates game robberies and prepares data blocks for AI context windows.
#
##########################################################
generate_narrative_summaries <- function(match_evaluations, justice_ladder, latest_round) {
    message("INFO: Starting Narrative Engine...")
    
    # 1. Pull out the round's single highest luck delta game
    robbery_of_the_round_match <- match_evaluations |>
        filter(round == latest_round) |>
        arrange(desc(luck_delta)) |>
        slice_head(n = 1)
    
    # 2. Construct AI-ready background profiles per team
    narratives <- justice_ladder |>
        mutate(
            confidence = if_else(Luck_Status == "Balanced", 85, 95),
            summary = paste0(
                team, " is currently sitting at #", Justice_Rank, 
                " on the performance-based Justice Ladder. System status is evaluated as ", 
                Luck_Status, " with an expected points percentage of ", Expected_Percent, "%."
            )
        )

    message("INFO: Completed Narrative Engine")
    
    return(list(
        team_narratives = narratives,
        robbery_match   = robbery_of_the_round_match
    ))
}