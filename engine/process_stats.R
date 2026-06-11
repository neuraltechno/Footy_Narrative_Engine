library(dplyr)
library(jsonlite)

# Load Raw - using absolute path
raw_stats <- readRDS('data/raw/afl_combined_data_2026.rds')

# Helper to normalize team names
normalize_team_name <- function(team) {
  case_when(
    team == "Adelaide" | team == "Adelaide Crows"    ~ "Adelaide Crows",
    team == "Brisbane" | team == "Brisbane Lions"    ~ "Brisbane Lions",
    team == "Carlton" | team == "Carlton Blues"      ~ "Carlton Blues",
    team == "Collingwood"                            ~ "Collingwood Magpies",
    team == "Essendon"                               ~ "Essendon Bombers",
    team == "Fremantle"                              ~ "Fremantle Dockers",
    team == "Geelong" | team == "Geelong Cats"       ~ "Geelong Cats",
    team == "Gold Coast" | team == "Gold Coast SUNS" ~ "Gold Coast Suns",
    team == "GWS" | team == "Greater Western Sydney" | team == "GWS GIANTS"  ~ "GWS Giants",
    team == "Hawthorn"                               ~ "Hawthorn Hawks",
    team == "Melbourne"                              ~ "Melbourne Demons",
    team == "North Melbourne" | team == "North"      ~ "North Melbourne Kangaroos",
    team == "Port Adelaide" | team == "Port"         ~ "Port Adelaide Power",
    team == "Richmond"                               ~ "Richmond Tigers",
    team == "St Kilda"                               ~ "St Kilda Saints",
    team == "Sydney" | team == "Sydney Swans"        ~ "Sydney Swans",
    team == "West Coast" | team == "West Coast Eagles" ~ "West Coast Eagles",
    team == "Western Bulldogs" | team == "Western"   ~ "Western Bulldogs",
    TRUE                                             ~ team
  )
}

# Transform and Calculate PIR
processed_rounds <- raw_stats %>%
  mutate(
    team.name = normalize_team_name(team.name),
    # ==============================================================================
    # PIR RATING CALCULATION (Touch-Relative Efficiency Model)
    # ==============================================================================
    
    # 1. Raw Disposal Score (Efficiency-Weighted)
    disposal_raw = (kicks * 2.0) + (handballs * 1.0),
    disposal_score = disposal_raw * (disposalEfficiency / 100),
    
    # 2. Category Breakdowns (Positive Contribution)
    cat_disposal = disposal_score + (metresGained * 0.05) + (bounces * 1.5) + 
      (extendedStats.kickins * 0.5) + (extendedStats.kickinsPlayon * 1.0),
    
    cat_contest_clearance = (contestedPossessions * 4.0) + (uncontestedPossessions * 0.5) + 
      (clearances.centreClearances * 6.0) + (clearances.stoppageClearances * 4.5) + 
      (contestedMarks * 8.0) + (marks * 1.0) + (marksInside50 * 4.0) + 
      (extendedStats.marksOnLead * 2.5) + (extendedStats.groundBallGets * 2.0) + 
      (extendedStats.f50GroundBallGets * 4.0),
    
    cat_damaging_impact = (goals * 15.0) + (behinds * 2.0) + (goalAssists * 8.0) + 
      (scoreInvolvements * 3.0) + (extendedStats.scoreLaunches * 6.0),
    
    cat_defensive_grit = (tackles * 3.0) + (tacklesInside50 * 5.0) + 
      (extendedStats.defHalfPressureActs * 1.0) + (extendedStats.pressureActs * 0.5) + 
      (onePercenters * 2.0) + (extendedStats.spoils * 3.0) + 
      (intercepts * 5.0) + (extendedStats.interceptMarks * 4.0),
    
    cat_ruck = ((hitouts * 0.2) * (extendedStats.hitoutToAdvantageRate / 100)) + 
      (extendedStats.hitoutsToAdvantage * 5.0),
    
    # Total Positive PIR
    PIR_Positive = (cat_disposal + cat_contest_clearance + cat_damaging_impact + cat_defensive_grit + cat_ruck),
    
    
    # ==============================================================================
    # 3. Touch-Relative Negative Drag (Tuned for Elite High-Volume Players)
    # ==============================================================================
    total_touches = pmax((kicks + handballs), 1.0),
    
    raw_mistake_points = (clangers * 5.0) + (turnovers * 3.0) + 
      (freesAgainst * 4.0) + (extendedStats.contestDefLosses * 4.0),
    
    mistake_rate = raw_mistake_points / total_touches,
    
    # Dampening Coefficient (k)
    # Raise this to protect high-volume players more; lower it to punish them more.
    # Setting k = 2.5 provides a strong buffer for elite mid/ruck volume.
    k = 1.0,
    
    # Tuned Negative Drag calculation
    PIR_Negative = raw_mistake_points * (mistake_rate / (mistake_rate + k)),
    
    
    # 4. Time On Ground (TOG) Normalization
    TOG_Floor = pmax(timeOnGroundPercentage, 15.0),
    TOG_Modifier = ifelse(timeOnGroundPercentage >= 80.0, 1.0, 1.0 + ((80.0 - TOG_Floor) / 100) * 0.7),
    
    
    # 5. Final PIR Output
    PIR = (PIR_Positive * TOG_Modifier) - PIR_Negative
  )
processed_rounds <- processed_rounds %>% filter(!is.na(jumperNumber) & jumperNumber != '')

# Calculate latest round dynamically
latest_round <- max(processed_rounds$round.roundNumber, na.rm = TRUE)
print(paste('Latest round detected as:', latest_round))

# Helper to map AFL standard position shortcodes to clear full display strings
map_position <- function(pos) {
  # Common mappings
  if (is.na(pos) || pos == '' || pos == 'EMERG') return('Emergency')
  
  pos_map <- c(
    'BPL' = 'Back Pocket',
    'BPR' = 'Back Pocket',
    'C' = 'Inside/Outside Mid',
    'CHB' = 'Centre Half Back',
    'CHF' = 'Centre Half Forward',
    'FB' = 'Full Back',
    'FF' = 'Full Forward',
    'FPL' = 'Forward Pocket',
    'FPR' = 'Forward Pocket',
    'HBFL' = 'Half Back Flank',
    'HBFR' = 'Half Back Flank',
    'HFFL' = 'Half Forward Flank',
    'HFFR' = 'Half Forward Flank',
    'INT' = 'Utility',
    'R' = 'Inside Mid',
    'RK' = 'Ruckman',
    'RR' = 'Inside Mid',
    'WL' = 'Wing',
    'WR' = 'Wing'
  )
  
  resolved <- pos_map[pos]
  if (is.na(resolved)) return('Midfielder')
  return(resolved)
}

# Add a mapped position helper
processed_rounds$mapped_position <- sapply(processed_rounds$player.player.position, map_position)

# Aggregate round PIR scores per player
round_pir_series <- processed_rounds %>%
  arrange(round.roundNumber) %>%
  group_by(player.playerId) %>%
  summarise(
    Games_Played_2026 = n_distinct(round.roundNumber),
    # Map round-by-round PIR stats
    PIR_History = list(data.frame(round = round.roundNumber, pir = PIR))
  )

# Aggregate season-level and category-level details
players_season <- processed_rounds %>%
  group_by(player.playerId, player.givenName, player.surname, team.name) %>%
  summarise(
    # Get the most common mapped position for the player
    playerPosition = paste(first(position), names(sort(table(mapped_position), decreasing = TRUE))[1]),
    photoURL = first(player.photoURL),
    playerJumperNumber = first(jumperNumber),
    dateOfBirth = first(dateOfBirth),
    dob = as.Date(dateOfBirth),
    Age = as.integer(format(Sys.Date(), '%Y')) - as.integer(format(dob, '%Y')) - (format(Sys.Date(), '%m%d') < format(dob, '%m%d')),
    heightInCm = first(HT),
    weightInKg = first(WT),
    careerGames = first(careerGames),
    careerWins = first(careerWins),
    careerDraws = first(careerDraws),
    careerLosses = first(careerLosses),
    Season_Avg_PIR = mean(PIR, na.rm = TRUE),
    Latest_Round_PIR = sum(ifelse(round.roundNumber == latest_round, PIR, 0), na.rm = TRUE),
    Avg_cat_disposal = mean(cat_disposal, na.rm = TRUE),
    Avg_cat_contest_clearance = mean(cat_contest_clearance, na.rm = TRUE),
    Avg_cat_damaging_impact = mean(cat_damaging_impact, na.rm = TRUE),
    Avg_cat_defensive_grit = mean(cat_defensive_grit, na.rm = TRUE),
    Avg_cat_ruck = mean(cat_ruck, na.rm = TRUE),
    Avg_PIR_Negative = mean(PIR_Negative, na.rm = TRUE),
    .groups = 'drop'
  )

# Merge season-level with their true history array
final_processed_stats <- left_join(players_season, round_pir_series, by = 'player.playerId')

# Ensure output directory exists
if (!dir.exists('data/processed')) {
  dir.create('data/processed', recursive = TRUE)
}

# Save results for frontend with dynamic round number
saveRDS(final_processed_stats, paste0('data/processed/2026_round_', latest_round, '_pir.rds'))

# Convert to JSON for React frontend
write_json(final_processed_stats, 'data/processed/players_pir.json', pretty = TRUE)


