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
# Notes (match centres):
#   Match centre data arrives pre-split by build_match_centers_export()
#   in 40_match_metrics.R. metrics_list$match_centers_index is the index
#   structure and metrics_list$match_centers_rounds is a named list of
#   per-round data frames keyed by filename (e.g. "team_match_centers_r21.json").
#   This module writes them all via save_json_file() with no logic of its own.
#
#   File layout under json/<season>/matches/:
#     match_centers_index.json          — round list + latest_round
#     team_match_centers_r01.json       — all matches for round 1
#     team_match_centers_r02.json       — all matches for round 2
#     ...
#     team_match_centers_rNN.json       — all matches for round N
#
##########################################################

export_everything <- function(metrics_list) {
    message('INFO: Starting JSON Export...')
    
    json_dir <- file.path('json', CURRENT_SEASON)
    matches_dir <- file.path(json_dir, 'matches')
    by_round_dir <- file.path(matches_dir, 'by-round')
    
    dirs <- c(
      file.path(json_dir, 'league'),
      file.path(json_dir, 'league', 'by-round'),
      file.path(json_dir, 'teams'),
      file.path(json_dir, 'players'),
      matches_dir,
      by_round_dir
    )
    
    for (d in dirs) {
      if (!dir.exists(d)) dir.create(d, recursive = TRUE)
    }
    
    # League
    save_json_file(metrics_list$justice_ladder,        file.path(json_dir, 'league/justice_ladder.json'))
    save_json_file(metrics_list$power_rankings,        file.path(json_dir, 'league/power_rankings.json'))
    save_json_file(metrics_list$power_rankings_index,  file.path(json_dir, 'league/power_rankings_index.json'))
    for (filename in names(metrics_list$power_rankings_rounds)) {
        save_json_file(metrics_list$power_rankings_rounds[[filename]], file.path(json_dir, 'league/by-round', filename))
    }
    save_json_file(metrics_list$robbery_of_the_round,  file.path(json_dir, 'league/robbery_of_the_round.json'))
    save_json_file(metrics_list$story_hooks,           file.path(json_dir, 'league/story_hooks.json'))
    save_json_file(metrics_list$luck_unlucky,          file.path(json_dir, 'league/luck_unlucky.json'))

    # Teams
    save_json_file(metrics_list$team_metrics_history,  file.path(json_dir, 'teams/team_metrics_history.json'))
    
    # Players
    save_json_file(metrics_list$breakout_watch,            file.path(json_dir, 'players/breakout_watch.json'))
    save_json_file(metrics_list$category_kings,            file.path(json_dir, 'players/category_kings.json'))
    save_json_file(metrics_list$top_games_season,          file.path(json_dir, 'players/top_games_season_pir.json'))
    save_json_file(metrics_list$top_games_round,           file.path(json_dir, 'players/top_games_round_pir.json'))
    save_json_file(metrics_list$top_three_round_stretches, file.path(json_dir, 'players/top_three_round_pir.json'))
    save_json_file(metrics_list$team_of_the_round,         file.path(json_dir, 'players/team_of_the_round.json'))
    save_json_file(metrics_list$team_pir_ladder,           file.path(json_dir, 'players/team_pir_ladder.json'))
    save_json_file(metrics_list$meters_gained_metrics,     file.path(json_dir, 'players/meters_gained.json'))
    save_json_file(metrics_list$top_esc_games,             file.path(json_dir, 'players/top_esc_games.json'))
    save_json_file(metrics_list$player_metrics,            file.path(json_dir, 'players/players_pir.json'))
    
    # Matches — index + one file per round
    # Structures prepared by build_match_centers_export() in 40_match_metrics.R.
    save_json_file(metrics_list$match_centers_index, file.path(matches_dir, 'match_centers_index.json'))
    for (filename in names(metrics_list$match_centers_rounds)) {
        save_json_file(metrics_list$match_centers_rounds[[filename]], file.path(matches_dir, filename))
    }
    
    message('INFO: Completed JSON Export')
}