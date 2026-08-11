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
source("engine/modules/95_narrative_copy.R")
source("engine/modules/99_export_json.R")

main <- function() {
    print("Starting AFL Narrative Engine Pipeline...")
    
    # 1. Load raw data
    raw_stats <- readRDS(file.path(DATA_RAW_DIR, paste0("afl_combined_data_", CURRENT_SEASON, ".rds")))
    
    # 2. Process Row-Level Statistics
    processed_stats <- calculate_player_metrics(raw_stats)
    
    # 3. Process Season Multi-Level Aggregations & Grid Completions
    season_agg <- calculate_season_aggregation(processed_stats)

    # MOVED & UPDATED CATCHUP LOGIC HERE
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
    # Note: This step automatically triggers the internal catchup historical loop!
    advanced_metrics <- calculate_advanced_metrics(
        players_season   = season_agg$players_season, 
        processed_rounds = season_agg$clean_processed_rounds, 
        latest_round     = season_agg$latest_round
    )
    message("INFO: processed_rounds rows = ", nrow(season_agg$clean_processed_rounds))
    message("INFO: top_games_season rows = ", nrow(advanced_metrics$top_games_season))
    message("INFO: top_games_round rows = ", nrow(advanced_metrics$top_games_round))
    message("INFO: top_three_round_stretches rows = ", nrow(advanced_metrics$top_three_round_stretches))
    message("INFO: team_of_the_round rows = ", nrow(advanced_metrics$team_of_the_round))
    
    # ==============================================================================
    # 6. CALCULATE ADVANCED TEAM & MATCH ENGINE METRICS
    # ==============================================================================
    message("INFO: Sourcing raw database structures for team analytics allocation...")
    team_stats_raw <- readRDS(file.path(DATA_RAW_DIR, paste0("afl_team_stats_", CURRENT_SEASON, ".rds")))
    results_raw    <- readRDS(file.path(DATA_RAW_DIR, paste0("afl_results_", CURRENT_SEASON, ".rds")))

    # Quarter-by-quarter team scores (score-worm data) from update_data.R -
    # optional: if the file doesn't exist yet (e.g. update_data.R hasn't
    # been run since this feature was added), the match engine falls back
    # to full-game-only metrics rather than failing the whole pipeline.
    quarter_scores_path <- file.path(DATA_RAW_DIR, paste0("afl_quarter_scores_", CURRENT_SEASON, ".rds"))
    quarter_scores <- if (file.exists(quarter_scores_path)) {
        readRDS(quarter_scores_path)
    } else {
        message(
            "INFO: No quarter_scores RDS found at ", quarter_scores_path,
            " - match engine will skip quarter-level momentum metrics this run."
        )
        NULL
    }

    # Run modular calculation chains passing targeted parameters
    # team_stats_raw (DI_for etc.) is no longer used here - team_metrics now
    # derives real per-round disposal totals from clean_processed_rounds
    # (actual player-level per-round data) instead of approximating from a
    # season-cumulative total. See notes in 30_team_metrics.R.
    team_profiles <- calculate_team_metrics(season_agg$final_processed_stats, season_agg$clean_processed_rounds, season_agg$latest_round)

    # match_evals contains ALL rounds (not filtered). build_match_centers_export()
    # then splits it into the per-round structures ready for the exporter.
    match_evals         <- calculate_match_metrics(results_raw, team_profiles, season_agg$latest_round, quarter_scores = quarter_scores)
    match_centers_export <- build_match_centers_export(match_evals, season_agg$latest_round)
    
    # --- PROBABILISTIC SNAPSHOT & MOVEMENT LIFECYCLE ---
    current_round <- season_agg$latest_round
    
    # Resolve the year-based snapshot path dynamically
    season_snapshot_dir = file.path("data/justice_ladder_snapshots", CURRENT_SEASON)
    
    # 💡 CATCHUP: Chronologically backfill any missing prior snapshots (handles Round 0 automatically)
    catchup_justice_snapshots(match_evals, current_round, season_snapshot_dir)
    
    # Dynamically determine the true previous round from the actual data sequence
    all_rounds   <- sort(unique(match_evals$round))
    prior_rounds <- all_rounds[all_rounds < current_round]
    prev_round   <- if (length(prior_rounds) > 0) max(prior_rounds) else -1
    
    # A. Calculate the raw base Justice Ladder using probabilistic formulas
    raw_justice_ladder <- calculate_justice_ladder(match_evals)
    
    # B. Compare current standings against the previous round's saved snapshot for THIS season
    justice_standings <- get_ladder_movement(
        current_ladder        = raw_justice_ladder, 
        previous_round_number = prev_round, 
        snapshot_dir          = season_snapshot_dir
    )
    
    # C. Commit current results to disk under the seasonal folder as next week's baseline
    save_ladder_snapshot(
        ladder        = justice_standings, 
        round_number  = current_round, 
        snapshot_dir  = season_snapshot_dir
    )
    
    # D. Calculate extreme luck outcomes (single row per robbery)
    luck_unlucky <- calculate_luck_extremes(match_evals, group_by_round = TRUE)
    # ----------------------------------------------------
    
    # justice_standings (current-round ladder, already computed above) feeds
    # the single-round power_ranks call directly. build_power_rankings_export
    # needs a different ladder per historical round instead, so it's given
    # season_snapshot_dir and reads each round's own snapshot internally -
    # see 60_power_rankings.R for why.
    power_ranks       <- calculate_power_rankings(team_profiles, match_evals, season_agg$latest_round, justice_ladder = justice_standings)
    power_ranks_export <- build_power_rankings_export(team_profiles, match_evals, season_agg$latest_round, snapshot_dir = season_snapshot_dir)
    narrative_outputs <- generate_narrative_summaries(match_evals, justice_standings, season_agg$latest_round, power_ranks = power_ranks)
    team_narratives <- generate_narrative_copy(narrative_outputs$story_hooks)
    
    # 7. Final Export Dictionary compilation
    metrics_list <- list(
        player_metrics       = season_agg$final_processed_stats, # Context rich df with timelines
        justice_ladder       = justice_standings,

        # --- Match Centres ---
        # Pre-split by build_match_centers_export() in 40_match_metrics.R.
        # The exporter receives ready-to-write structures and calls
        # save_json_file() directly — no logic in 99_export_json.R.
        match_centers_index  = match_centers_export$index,
        match_centers_rounds = match_centers_export$rounds,

        # --- Power Rankings (page-facing name: The Form Pulse) ---
        power_rankings_index  = power_ranks_export$index,
        power_rankings_rounds = power_ranks_export$rounds,

        robbery_of_the_round = narrative_outputs$robbery_match,
        power_rankings       = power_ranks,
        # Full multi-round team_profiles history (not just the latest round)
        # so the frontend can render team trend charts (PIR by line, system
        # velocity, etc.) with zero client-side calculation, matching the
        # rest of the "static JSON, no client compute" design.
        team_metrics_history = team_profiles,
        breakout_watch             = advanced_metrics$breakout_watch,   # Key matched to 15_ and 99_
        category_kings              = advanced_metrics$category_kings,
        top_games_season           = advanced_metrics$top_games_season,
        top_games_round            = advanced_metrics$top_games_round,
        top_three_round_stretches  = advanced_metrics$top_three_round_stretches,
        team_of_the_round          = advanced_metrics$team_of_the_round,
        top_esc_games              = advanced_metrics$top_esc_games,
        team_pir_ladder            = advanced_metrics$team_pir_ladder,
        meters_gained_metrics      = advanced_metrics$meters_gained_metrics,
        # Streamlined single-source luck metrics
        luck_unlucky         = luck_unlucky,
        # AI-ready story hooks: {team, angle, priority, supporting_stats} rows
        # for the downstream narrative-writing LLM to draw from
        story_hooks           = narrative_outputs$story_hooks,
        # Publish-ready article copy + chart specs, one row per team,
        # derived from story_hooks - see 95_narrative_copy.R. This is what
        # the Team Insights page actually renders; story_hooks.json stays
        # around as the upstream AI-ready layer other consumers can draw
        # their own copy from.
        team_narratives        = team_narratives
    )
    
    export_everything(metrics_list)
    print("Pipeline completed successfully.")
}

main()