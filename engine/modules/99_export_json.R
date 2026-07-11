##########################################################
# Module
#
# Name:
#
# JSON Export
#
# Purpose:
#
# Export all calculated results to JSON
#
# Inputs:
#
# Processed metrics data frames
#
# Outputs:
#
# JSON files in json/ directory
#
# Dependencies:
#
# 00_config.R, 01_helpers.R
#
##########################################################

##########################################################
# Export Everything
#
# Description:
#
# Orchestrates export of all final JSON reports.
#
# Inputs:
#
# metrics_list
#
# Returns:
#
# None
#
##########################################################
export_everything <- function(metrics_list) {
    message("INFO: Starting JSON Export...")
    
    # Ensure directories exist
    if (!dir.exists("json/league")) dir.create("json/league", recursive = TRUE)
    if (!dir.exists("json/teams")) dir.create("json/teams", recursive = TRUE)
    if (!dir.exists("json/players")) dir.create("json/players", recursive = TRUE)
    if (!dir.exists("json/matches")) dir.create("json/matches", recursive = TRUE)
    if (!dir.exists("data/processed")) dir.create("data/processed", recursive = TRUE) # Ensure this exists
    
    # Export specific files
    save_json_file(metrics_list$justice_ladder, "json/league/justice_ladder.json")
    save_json_file(metrics_list$power_rankings, "json/league/power_rankings.json")
    
    # Export advanced metrics
    save_json_file(metrics_list$breakout_watch, "json/players/breakout_watch.json")
    save_json_file(metrics_list$category_kings, "json/players/category_kings.json")
    save_json_file(metrics_list$top_games, "json/players/top_games_pir.json")
    save_json_file(metrics_list$top_esc_games, "json/players/top_esc_games_pir.json")
    save_json_file(metrics_list$player_metrics, "json/players/players_pir.json")
    
    message("INFO: Completed JSON Export")
}
