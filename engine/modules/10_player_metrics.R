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
            
            # Prefer Champion Data's own quality-adjusted effective counts over
            # reconstructing an approximation from the blended overall
            # disposalEfficiency%. effectiveKicks is provided directly;
            # effective handballs are backed out as effectiveDisposals minus
            # effectiveKicks. Falls back to the old blended-efficiency
            # approximation for any row missing the extended fields (e.g.
            # historical data gaps) so this never produces an NA.
            effective_kicks = extendedStats.effectiveKicks,
            effective_handballs = pmax(extendedStats.effectiveDisposals - extendedStats.effectiveKicks, 0.0),
            disposal_score_precise = (effective_kicks * PIR_W_KICK) + (effective_handballs * PIR_W_HANDBALL),
            disposal_score_fallback = ((kicks * PIR_W_KICK) + (handballs * PIR_W_HANDBALL)) * (disposalEfficiency / 100),
            disposal_score = if_else(
                !is.na(extendedStats.effectiveDisposals) & !is.na(extendedStats.effectiveKicks),
                disposal_score_precise,
                disposal_score_fallback
            ),
            
            cat_disposal = disposal_score + (metresGained * PIR_W_METRES_GAINED) + (bounces * PIR_W_BOUNCE) + (extendedStats.kickins * PIR_W_KICKIN) + (extendedStats.kickinsPlayon * PIR_W_KICKIN_PLAYON),
            cat_contest_clearance = (contestedPossessions * PIR_W_CONTESTED_POSSESSION) + (uncontestedPossessions * PIR_W_UNCONTESTED_POSSESSION) + (clearances.centreClearances * PIR_W_CENTRE_CLEARANCE) + (clearances.stoppageClearances * PIR_W_STOPPAGE_CLEARANCE) + (contestedMarks * PIR_W_CONTESTED_MARK) + (marks * PIR_W_MARK) + (marksInside50 * PIR_W_MARK_INSIDE_50) + (extendedStats.marksOnLead * PIR_W_MARK_ON_LEAD) + (extendedStats.groundBallGets * PIR_W_GROUND_BALL_GET) + (extendedStats.f50GroundBallGets * PIR_W_F50_GROUND_BALL_GET),
            cat_damaging_impact = (goals * PIR_W_GOAL) + (behinds * PIR_W_BEHIND) + (goalAssists * PIR_W_GOAL_ASSIST) + (scoreInvolvements * PIR_W_SCORE_INVOLVEMENT) + (extendedStats.scoreLaunches * PIR_W_SCORE_LAUNCH),
            cat_defensive_grit = (tackles * PIR_W_TACKLE) + (tacklesInside50 * PIR_W_TACKLE_INSIDE_50) + (extendedStats.defHalfPressureActs * PIR_W_DEF_HALF_PRESSURE_ACT) + (extendedStats.pressureActs * PIR_W_PRESSURE_ACT) + (onePercenters * PIR_W_ONE_PERCENTER) + (extendedStats.spoils * PIR_W_SPOIL) + (intercepts * PIR_W_INTERCEPT) + (extendedStats.interceptMarks * PIR_W_INTERCEPT_MARK),
            cat_ruck = ((hitouts * PIR_W_HITOUT_RAW) * (extendedStats.hitoutToAdvantageRate / 100)) + (extendedStats.hitoutsToAdvantage * PIR_W_HITOUT_TO_ADVANTAGE),
            
            PIR_Positive = (cat_disposal + cat_contest_clearance + cat_damaging_impact + cat_defensive_grit + cat_ruck),
            
            total_actions = pmax((kicks + handballs + onePercenters + extendedStats.spoils + intercepts + extendedStats.hitoutsToAdvantage), 1.0),
            # turnovers dropped: Champion Data's clangers stat already includes
            # turnovers as a subset (a clanger kick/handball is, by definition,
            # a turnover), so including both double-counted the same errors -
            # generally over-penalising high-disposal players whose clangers
            # skew turnover-heavy relative to other error types (dropped
            # marks, missed shots).
            raw_mistake_points = (clangers * PIR_W_CLANGER) + (freesAgainst * PIR_W_FREE_AGAINST) + (extendedStats.contestDefLosses * PIR_W_CONTEST_DEF_LOSS),
            mistake_rate = raw_mistake_points / total_actions,
            PIR_Negative = raw_mistake_points * (mistake_rate / (mistake_rate + 1.0)),
            
            TOG_Floor = pmax(timeOnGroundPercentage, PIR_TOG_FLOOR),
            TOG_Modifier = ifelse(timeOnGroundPercentage >= PIR_TOG_FULL_GAME_THRESHOLD, 1.0, 1.0 + ((PIR_TOG_FULL_GAME_THRESHOLD - TOG_Floor) / 100) * PIR_TOG_BOOST_SLOPE),
            
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