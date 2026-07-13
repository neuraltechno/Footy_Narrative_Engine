##########################################################
# Module
#
# Name:
#
# Master Controller
#
# Purpose:
#
# Orchestrate data pipeline and JSON export
#
##########################################################
library(dplyr)
library(jsonlite)
library(purrr)
library(tidyr)

# Load configuration and helpers
source("engine/modules/00_config.R")
source("engine/modules/01_helpers.R")

# Load modules
source("engine/modules/10_player_metrics.R")
source("engine/modules/20_season_aggregation.R") # Added bridge link
source("engine/modules/15_player_advanced_metrics.R")
source("engine/modules/30_team_metrics.R")
source("engine/modules/40_match_metrics.R")
source("engine/modules/50_justice_ladder.R")
source("engine/modules/60_power_rankings.R")
source("engine/modules/90_narratives.R")
source("engine/modules/99_export_json.R")

main <- function() {
    print("Starting AFL Narrative Engine Pipeline...")
    
    # 1. Load raw data
    raw_stats <- readRDS(file.path(DATA_RAW_DIR, paste0("afl_combined_data_", CURRENT_SEASON, ".rds")))
    
    # 2. Process Row-Level Statistics
    processed_stats <- calculate_player_metrics(raw_stats)
    
    # 3. Process Season Multi-Level Aggregations & Grid Completions
    season_agg <- calculate_season_aggregation(processed_stats)

    # 💡 MOVED & UPDATED CATCHUP LOGIC HERE
    # Use the true latest_round discovered by the aggregation engine
    if (!is.null(season_agg$latest_round) && is.finite(season_agg$latest_round)) {
        check_and_sync_missing_rounds(season_agg$latest_round, CURRENT_SEASON, DATA_PROCESSED_DIR, raw_stats)
    }

    # 4. MASTER FILE SAVES THE INTERNAL BINARY BACKUP ---
    if (!dir.exists(DATA_PROCESSED_DIR)) dir.create(DATA_PROCESSED_DIR, recursive = TRUE)
    rds_filename <- file.path(DATA_PROCESSED_DIR, paste0(CURRENT_SEASON, "_round_", season_agg$latest_round, "_pir.rds"))
    saveRDS(season_agg$final_processed_stats, rds_filename)
    message(paste("INFO: Saved seasonal RDS backup to", rds_filename))
    
    # 5. Calculate Advanced Metrics passing the expected parameters
    advanced_metrics <- calculate_advanced_metrics(
        players_season   = season_agg$players_season, 
        processed_rounds = season_agg$clean_processed_rounds, 
        latest_round     = season_agg$latest_round
    )
    
    # 6. Calculate Team & League Metrics
    team_metrics  <- calculate_team_metrics(processed_stats)
    match_metrics <- calculate_match_metrics(processed_stats)
    ladder        <- calculate_justice_ladder(team_metrics)
    rankings      <- calculate_power_rankings(team_metrics)
    
    # 7. Final Export Dictionary compilation
    metrics_list <- list(
        player_metrics = season_agg$final_processed_stats, # Context rich df with timelines
        team_metrics   = team_metrics,
        justice_ladder = ladder,
        power_rankings = rankings,
        breakout_watch = advanced_metrics$breakout_watch,   # Key matched to 15_ and 99_
        category_kings = advanced_metrics$category_kings,
        top_games      = advanced_metrics$top_games,
        top_esc_games  = advanced_metrics$top_esc_games
    )
    
    export_everything(metrics_list)
    print("Pipeline completed successfully.")
}

main()