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
    message('INFO: Starting JSON Export...')
    
    # Create season-specific directories for JSON outputs to prevent collisions
    json_dir <- file.path('json', CURRENT_SEASON)
    
    dirs <- c(
      file.path(json_dir, 'league'),
      file.path(json_dir, 'teams'),
      file.path(json_dir, 'players'),
      file.path(json_dir, 'matches')
    )
    
    for (d in dirs) {
      if (!dir.exists(d)) dir.create(d, recursive = TRUE)
    }
    
    # Export structural league and team performance files
    save_json_file(metrics_list$justice_ladder, file.path(json_dir, 'league/justice_ladder.json'))
    save_json_file(metrics_list$power_rankings, file.path(json_dir, 'league/power_rankings.json'))
    
    # Export advanced match engine files
    save_json_file(metrics_list$match_centers, file.path(json_dir, 'matches/team_match_centers.json'))
    save_json_file(metrics_list$robbery_of_the_round, file.path(json_dir, 'league/robbery_of_the_round.json'))
    
    # Combined luck/unluckiest games list (replaced luckiest_wins and unluckiest_losses)
    save_json_file(metrics_list$luck_unlucky, file.path(json_dir, 'league/luck_unlucky.json'))
    
    # Export advanced metrics
    save_json_file(metrics_list$breakout_watch, file.path(json_dir, 'players/breakout_watch.json'))
    save_json_file(metrics_list$category_kings, file.path(json_dir, 'players/category_kings.json'))
    save_json_file(metrics_list$top_games, file.path(json_dir, 'players/top_games_pir.json'))
    save_json_file(metrics_list$top_esc_games, file.path(json_dir, 'players/top_esc_games_pir.json'))
    save_json_file(metrics_list$player_metrics, file.path(json_dir, 'players/players_pir.json'))
    
    message('INFO: Completed JSON Export')
}