##########################################################
# Module
#
# Name:
#
# Player Metrics Engine
#
# Purpose:
#
# Calculate all player metrics (PIR, Expected Score Contribution, etc.)
#
# Inputs:
#
# Raw stats
#
# Outputs:
#
# Processed player metrics data frame
#
# Dependencies:
#
# 00_config.R, 01_helpers.R
#
##########################################################

library(dplyr)

##########################################################
# Calculate Player Metrics
#
# Description:
#
# Calculates PIR, Expected Score Contribution, and ratings.
#
# Inputs:
#
# raw_stats (Data frame)
#
# Returns:
#
# Processed Player Data (Data frame)
#
##########################################################
##########################################################
# Module
#
# Name:
#
# Player Metrics Engine
#
# Purpose:
#
# Calculate all player metrics (PIR, Expected Score Contribution, etc.)
#
# Inputs:
#
# Raw stats
#
# Outputs:
#
# Processed player metrics data frame
#
# Dependencies:
#
# 00_config.R, 01_helpers.R
#
##########################################################

library(dplyr)

##########################################################
# Calculate Player Metrics
#
# Description:
#
# Calculates PIR, Expected Score Contribution, and ratings.
#
# Inputs:
#
# raw_stats (Data frame)
#
# Returns:
#
# Processed Player Data (Data frame)
#
##########################################################
calculate_player_metrics <- function(raw_stats) {
    message("INFO: Starting Player Metrics...")

    processed_data <- raw_stats |>
        mutate(
            team.name = normalize_team_name(team.name),
            join_pos = if_else(is.na(player.player.position) | player.player.position %in% c('', 'EMERG'), NA_character_, player.player.position)
        ) |>
        left_join(POS_REFERENCE, by = c("join_pos" = "pos_code")) |>
        mutate(
            position_name  = coalesce(position_name, "Emergency"),
            position_group = coalesce(position_group, "Interchange"),
            position_line  = coalesce(position_line, "Interchange"),
            
            disposal_raw = (kicks * 2.0) + (handballs * 1.0),
            disposal_score = disposal_raw * (disposalEfficiency / 100),
            
            cat_disposal = disposal_score + (metresGained * 0.05) + (bounces * 1.5) + (extendedStats.kickins * 0.5) + (extendedStats.kickinsPlayon * 1.0),
            cat_contest_clearance = (contestedPossessions * 4.0) + (uncontestedPossessions * 0.5) + (clearances.centreClearances * 6.0) + (clearances.stoppageClearances * 4.0) + (contestedMarks * 6.0) + (marks * 1.0) + (marksInside50 * 4.0) + (extendedStats.marksOnLead * 2.5) + (extendedStats.groundBallGets * 2.0) + (extendedStats.f50GroundBallGets * 4.0),
            cat_damaging_impact = (goals * 15.0) + (behinds * 2.0) + (goalAssists * 8.0) + (scoreInvolvements * 3.0) + (extendedStats.scoreLaunches * 6.0),
            cat_defensive_grit = (tackles * 3.0) + (tacklesInside50 * 5.0) + (extendedStats.defHalfPressureActs * 1.0) + (extendedStats.pressureActs * 0.5) + (onePercenters * 2.0) + (extendedStats.spoils * 6.0) + (intercepts * 7.0) + (extendedStats.interceptMarks * 8.0),
            cat_ruck = ((hitouts * 0.1) * (extendedStats.hitoutToAdvantageRate / 100)) + (extendedStats.hitoutsToAdvantage * 4.0),
            
            PIR_Positive = (cat_disposal + cat_contest_clearance + cat_damaging_impact + cat_defensive_grit + cat_ruck),
            
            total_actions = pmax((kicks + handballs + onePercenters + extendedStats.spoils + intercepts + extendedStats.hitoutsToAdvantage), 1.0),
            raw_mistake_points = (clangers * 5.0) + (turnovers * 3.0) + (freesAgainst * 4.0) + (extendedStats.contestDefLosses * 4.0),
            mistake_rate = raw_mistake_points / total_actions,
            PIR_Negative = raw_mistake_points * (mistake_rate / (mistake_rate + 1.0)),
            
            TOG_Floor = pmax(timeOnGroundPercentage, 15.0),
            TOG_Modifier = ifelse(timeOnGroundPercentage >= 80.0, 1.0, 1.0 + ((80.0 - TOG_Floor) / 100) * 0.7),
            
            PIR = (PIR_Positive * TOG_Modifier) - PIR_Negative,
            
           
            norm_disposal = cat_disposal * TOG_Modifier,
            norm_contest  = cat_contest_clearance * TOG_Modifier,
            norm_damage   = cat_damaging_impact * TOG_Modifier,
            norm_grit     = cat_defensive_grit * TOG_Modifier,
            norm_ruck     = cat_ruck * TOG_Modifier
        )

    message("INFO: Completed Player Metrics")
    message(paste("INFO: Rows Processed:", nrow(processed_data)))

    return(processed_data)
}
