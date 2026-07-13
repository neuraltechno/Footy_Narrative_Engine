##########################################################
# Module
#
# Name:
#
# Helpers
#
# Purpose:
#
# Generic helper functions
#
##########################################################

library(jsonlite)
library(dplyr)

##########################################################
# Save JSON File
#
# Description:
#
# Exports a data frame or list to a JSON file.
#
# Inputs:
#
# data, file_path
#
# Returns:
#
# None
#
##########################################################
save_json_file <- function(data, file_path) {
    json_data <- jsonlite::toJSON(data, pretty = TRUE, auto_unbox = TRUE)
    write(json_data, file = file_path)
}

check_and_sync_missing_rounds <- function(current_round, season_year = 2026, data_dir = file.path("data/processed", season_year), raw_stats) {
  
  # 1. Dynamically pull all unique rounds played so far (safely handles Round 0 if it exists)
  completed_rounds <- raw_stats %>% 
    filter(round.roundNumber <= current_round) %>% 
    pull(round.roundNumber) %>% 
    unique() %>% 
    sort()
  
  message("Checking for missing PIR files in ", data_dir, " for rounds: ", paste(completed_rounds, collapse = ", "), "...")
  
  # 2. Loop through each discovered round and check for the file
  purrr::walk(completed_rounds, function(rd) {
    file_name <- paste0(season_year, "_round_", rd, "_pir.rds")
    file_path <- file.path(data_dir, file_name)
    
    if (!file.exists(file_path)) {
      message("⚠️ Missing file detected: ", file_name, ". Generating now...")
      
      # 3. Use modular aggregation logic to generate the round data
      tryCatch({
        # Filter raw stats for ALL rounds up to and including the target round
        round_data <- raw_stats %>% filter(round.roundNumber <= rd)
        
        if (nrow(round_data) == 0) {
          warning("No data found for cumulative rounds up to Round ", rd)
          return(NULL)
        }
        
        # Calculate PIR metrics using the cumulative data
        processed_round_stats <- calculate_player_metrics(round_data)
        agg_result <- calculate_season_aggregation(processed_round_stats)
        
        round_pir_data <- agg_result$final_processed_stats
        
        # Ensure directory exists before saving
        if (!dir.exists(data_dir)) dir.create(data_dir, recursive = TRUE)
        
        saveRDS(round_pir_data, file = file_path)
        message("✅ Successfully backfilled: ", file_name)
        
      }, error = function(e) {
        warning("❌ Failed to backfill Round ", rd, ": ", e$message)
      })
    }
  })
}
