##########################################################
# Module
#
# Name:
#   JSON Export
#
# Purpose:
#   Export all calculated results to JSON
#
# Inputs:
#   Processed metrics data frames
#
# Outputs:
#   JSON files in json/ directory
#
# Dependencies:
#   00_config.R, 01_helpers.R
#
##########################################################

export_everything <- function(metrics_list) {
    message('INFO: Starting JSON Export...')
    
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
    
    save_json_file(metrics_list$justice_ladder, file.path(json_dir, 'league/justice_ladder.json'))
    save_json_file(metrics_list$power_rankings, file.path(json_dir, 'league/power_rankings.json'))
    
    save_json_file(metrics_list$match_centers, file.path(json_dir, 'matches/team_match_centers.json'))
    save_json_file(metrics_list$robbery_of_the_round, file.path(json_dir, 'league/robbery_of_the_round.json'))
    save_json_file(metrics_list$story_hooks, file.path(json_dir, 'league/story_hooks.json'))

    save_json_file(metrics_list$team_metrics_history, file.path(json_dir, 'teams/team_metrics_history.json'))
    
    save_json_file(metrics_list$luck_unlucky, file.path(json_dir, 'league/luck_unlucky.json'))
    
    save_json_file(metrics_list$breakout_watch, file.path(json_dir, 'players/breakout_watch.json'))
    save_json_file(metrics_list$category_kings, file.path(json_dir, 'players/category_kings.json'))
    
    # New Leaderboard Exports
    save_json_file(metrics_list$top_games_season, file.path(json_dir, 'players/top_games_season_pir.json'))
    save_json_file(metrics_list$top_games_round, file.path(json_dir, 'players/top_games_round_pir.json'))
    save_json_file(metrics_list$top_three_round_stretches, file.path(json_dir, 'players/top_three_round_pir.json'))
    save_json_file(metrics_list$team_of_the_round, file.path(json_dir, 'players/team_of_the_round.json'))
    save_json_file(metrics_list$team_pir_ladder, file.path(json_dir, 'players/team_pir_ladder.json'))
    save_json_file(metrics_list$meters_gained_metrics, file.path(json_dir, 'players/meters_gained.json'))
    
    # Renamed output suffix from _pir.json to .json to reflect actual metric format (ESC value, not PIR value)
    save_json_file(metrics_list$top_esc_games, file.path(json_dir, 'players/top_esc_games.json'))
    save_json_file(metrics_list$player_metrics, file.path(json_dir, 'players/players_pir.json'))
    
    message('INFO: Completed JSON Export')
}