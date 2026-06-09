library(dplyr)
library(jsonlite)

# Load Raw - using absolute path
raw_stats <- readRDS("data/raw/afl_stats_2026.rds")

# Load player details
player_details <- readRDS("data/raw/afl_player_details_2026.rds")

# Transform and Calculate PIR
processed_rounds <- raw_stats %>%
  mutate(
    # Extract numeric part from player ID (e.g., 'CD_I1008091' -> 1008091)
    player.playerId = as.integer(gsub("[^0-9]", "", player.playerId)),
    disposal_raw = (kicks * 2.0) + (handballs * 1.0),
    disposal_score = disposal_raw * (disposalEfficiency / 100),
    
    # Category Breakdowns
    cat_disposal = disposal_score + (metresGained * 0.05) + (bounces * 1.5) + (extendedStats.kickins * 0.5) + (extendedStats.kickinsPlayon * 1.0),
    cat_contest_clearance = (contestedPossessions * 4.0) + (uncontestedPossessions * 0.5) + (clearances.centreClearances * 6.0) + (clearances.stoppageClearances * 4.5) + (contestedMarks * 8.0) + (marks * 1.0) + (marksInside50 * 4.0) + (extendedStats.marksOnLead * 2.5) + (extendedStats.groundBallGets * 2.0) + (extendedStats.f50GroundBallGets * 4.0),
    cat_damaging_impact = (goals * 15.0) + (behinds * 2.0) + (goalAssists * 8.0) + (scoreInvolvements * 3.0) + (extendedStats.scoreLaunches * 6.0),
    cat_defensive_grit = (tackles * 3.0) + (tacklesInside50 * 5.0) + (extendedStats.defHalfPressureActs * 1.0) + (extendedStats.pressureActs * 0.5) + (onePercenters * 2.0) + (extendedStats.spoils * 3.0) + (intercepts * 5.0) + (extendedStats.interceptMarks * 4.0),
    cat_ruck = ((hitouts * 0.2) * (extendedStats.hitoutToAdvantageRate / 100)) + (extendedStats.hitoutsToAdvantage * 5.0),
    
    PIR_Positive = (cat_disposal + cat_contest_clearance + cat_damaging_impact + cat_defensive_grit + cat_ruck),
    
    PIR_Negative = (clangers * 5.0) + (turnovers * 3.0) + (freesAgainst * 4.0) + (extendedStats.contestDefLosses * 4.0),
    
    TOG_Floor = pmax(timeOnGroundPercentage, 15.0),
    TOG_Modifier = ifelse(timeOnGroundPercentage >= 80.0, 1.0, 1.0 + ((80.0 - TOG_Floor) / 100) * 0.7),
    
    PIR = (PIR_Positive * TOG_Modifier) - PIR_Negative
  )

# Calculate latest round and aggregation
latest_round <- 13
print(paste("Latest round set to:", latest_round))

# Helper to map AFL standard position shortcodes to clear full display strings
map_position <- function(pos) {
  # Common mappings
  if (is.na(pos) || pos == "" || pos == "EMERG") return("Emergency")
  
  pos_map <- c(
    "BPL" = "Back Pocket",
    "BPR" = "Back Pocket",
    "C" = "Inside Mid",
    "CHB" = "Centre Half Back",
    "CHF" = "Centre Half Forward",
    "FB" = "Full Back",
    "FF" = "Full Forward",
    "FPL" = "Forward Pocket",
    "FPR" = "Forward Pocket",
    "HBFL" = "Half Back Flank",
    "HBFR" = "Half Back Flank",
    "HFFL" = "Half Forward Flank",
    "HFFR" = "Half Forward Flank",
    "INT" = "Utility",
    "R" = "Ruck Rover",
    "RK" = "Ruckman",
    "RR" = "Ruck Rover",
    "WL" = "Wing",
    "WR" = "Wing"
  )
  
  resolved <- pos_map[pos]
  if (is.na(resolved)) return("Midfielder")
  return(resolved)
}

# Add a mapped position helper
processed_rounds$mapped_position <- sapply(processed_rounds$player.player.position, map_position)

# Aggregate round PIR scores per player
round_pir_series <- processed_rounds %>%
  group_by(player.playerId) %>%
  arrange(round.roundNumber) %>%
  summarise(
    Games_Played = n_distinct(round.roundNumber),
    # Map round-by-round PIR stats
    PIR_History = list(data.frame(round = round.roundNumber, pir = PIR)),
    .groups = "drop"
  )

# Aggregate season-level and category-level details
players_season <- processed_rounds %>%
  group_by(player.playerId) %>%
  summarise(
    givenName = first(player.givenName),
    surname = first(player.surname),
    teamName = first(team.name),
    # Get the most common mapped position for the player
    Player_Position = names(sort(table(mapped_position), decreasing = TRUE))[1],
    photoURL = first(player.photoURL),
    playerJumperNumber = first(player.playerJumperNumber),
    GamesPlayed = n_distinct(gamesPlayed),
    Season_Avg_PIR = mean(PIR, na.rm = TRUE),
    Latest_Round_PIR = sum(ifelse(round.roundNumber == latest_round, PIR, 0), na.rm = TRUE),
    Avg_cat_disposal = mean(cat_disposal, na.rm = TRUE),
    Avg_cat_contest_clearance = mean(cat_contest_clearance, na.rm = TRUE),
    Avg_cat_damaging_impact = mean(cat_damaging_impact, na.rm = TRUE),
    Avg_cat_defensive_grit = mean(cat_defensive_grit, na.rm = TRUE),
    Avg_cat_ruck = mean(cat_ruck, na.rm = TRUE),
    Avg_PIR_Negative = mean(PIR_Negative, na.rm = TRUE),
    .groups = "drop"
  )

# Merge season-level with their true history array
final_processed_stats <- left_join(players_season, 
                                   round_pir_series, 
                                   by = "player.playerId")

# Join with player details to add additional information
cat("Player details columns:", names(player_details), "\n")
# Find the ID column (could be named various things)
id_col <- if ("id" %in% names(player_details)) "id" else if ("playerId" %in% names(player_details)) "playerId" else if ("ID" %in% names(player_details)) "ID" else NULL
if (is.null(id_col)) {
  stop("Could not find ID column in player_details. Available columns: ", paste(names(player_details), collapse = ", "))
}
player_details_clean <- player_details %>%
  mutate(
    # Combine firstName and surname for consistency
    fullName = paste(firstName, surname),
    # Ensure jumperNumber is numeric
    jumperNumber = as.numeric(jumperNumber),
    # Use providerId (the one that matches raw_stats) to create playerId
    playerId = as.integer(gsub("[^0-9]", "", providerId)),
    # Calculate Age
    Age = as.integer(floor(as.numeric(difftime(Sys.Date(), as.Date(dateOfBirth), units = "days")) / 365.25))
  ) %>%
  select(
    playerId,
    fullName,
    dateOfBirth,
    Age,
    heightInCm,
    weightInKg,
    debutYear,
    recruitedFrom,
    draftYear,
    draftType,
    draftPosition,
    jumperNumber
  )


# Join player details with processed stats
final_processed_stats <- final_processed_stats %>%
  left_join(player_details_clean, by = c("player.playerId" = "playerId"), relationship = "one-to-one")


# Ensure output directory exists
if (!dir.exists("data/processed")) {
  dir.create("data/processed", recursive = TRUE)
}

# Save results for frontend
saveRDS(final_processed_stats, "data/processed/round_13_pir.rds")

# Convert to JSON for React frontend
write_json(final_processed_stats, "data/processed/players_pir.json", pretty = TRUE)
