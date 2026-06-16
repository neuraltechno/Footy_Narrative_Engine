library(dplyr)
library(jsonlite)
library(purrr)
library(tidyr)

# Load Raw - using absolute path
raw_stats <- readRDS('data/raw/afl_combined_data_2026.rds')

# Helper to normalize team names
normalize_team_name <- function(team) {
  case_when(
    team %in% c("Adelaide", "Adelaide Crows")         ~ "Adelaide Crows",
    team %in% c("Brisbane", "Brisbane Lions")         ~ "Brisbane Lions",
    team %in% c("Carlton", "Carlton Blues")           ~ "Carlton Blues",
    team == "Collingwood"                             ~ "Collingwood Magpies",
    team == "Essendon"                                ~ "Essendon Bombers",
    team == "Fremantle"                               ~ "Fremantle Dockers",
    team %in% c("Geelong", "Geelong Cats")           ~ "Geelong Cats",
    team %in% c("Gold Coast", "Gold Coast SUNS")      ~ "Gold Coast Suns",
    team %in% c("GWS", "Greater Western Sydney", "GWS GIANTS") ~ "GWS Giants",
    team == "Hawthorn"                                ~ "Hawthorn Hawks",
    team == "Melbourne"                               ~ "Melbourne Demons",
    team %in% c("North Melbourne", "North")           ~ "North Melbourne Kangaroos",
    team %in% c("Port Adelaide", "Port")              ~ "Port Adelaide Power",
    team == "Richmond"                                ~ "Richmond Tigers",
    team == "St Kilda"                                ~ "St Kilda Saints",
    team %in% c("Sydney", "Sydney Swans")             ~ "Sydney Swans",
    team %in% c("West Coast", "West Coast Eagles")    ~ "West Coast Eagles",
    team %in% c("Western Bulldogs", "Western")        ~ "Western Bulldogs",
    TRUE                                              ~ team
  )
}

# Vectorized position lookup dictionary
pos_map = c(
  'BPL' = 'Back Pocket',  'BPR' = 'Back Pocket',
  'C'   = 'Inside/Outside Mid',
  'CHB' = 'Centre Half Back', 'CHF' = 'Centre Half Forward',
  'FB'  = 'Full Back',        'FF'  = 'Full Forward',
  'FPL' = 'Forward Pocket',   'FPR' = 'Forward Pocket',
  'HBFL'= 'Half Back Flank',  'HBFR'= 'Half Back Flank',
  'HFFL'= 'Half Forward Flank','HFFR'= 'Half Forward Flank',
  'INT' = 'Utility',
  'R'   = 'Inside Mid',       'RR'  = 'Inside Mid',
  'RK'  = 'Ruckman',
  'WL'  = 'Wing',              'WR'  = 'Wing'
)

# Transform and Calculate PIR
processed_rounds <- raw_stats %>%
  mutate(
    team.name = normalize_team_name(team.name),
    
    # Vectorized Position Mapping
    mapped_position = case_when(
      is.na(player.player.position) | player.player.position %in% c('', 'EMERG') ~ 'Emergency',
      player.player.position %in% names(pos_map) ~ pos_map[player.player.position],
      TRUE ~ 'Midfielder'
    ),
    
    # ==============================================================================
    # PIR RATING CALCULATION (Touch-Relative Efficiency Model)
    # ==============================================================================
    disposal_raw = (kicks * 2.0) + (handballs * 1.0),
    disposal_score = disposal_raw * (disposalEfficiency / 100),
    
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
    
    PIR_Positive = (cat_disposal + cat_contest_clearance + cat_damaging_impact + cat_defensive_grit + cat_ruck),
    
    total_touches = pmax((kicks + handballs), 1.0),
    raw_mistake_points = (clangers * 5.0) + (turnovers * 3.0) + 
      (freesAgainst * 4.0) + (extendedStats.contestDefLosses * 4.0),
    
    mistake_rate = raw_mistake_points / total_touches,
    k = 1.0,
    PIR_Negative = raw_mistake_points * (mistake_rate / (mistake_rate + k)),
    
    TOG_Floor = pmax(timeOnGroundPercentage, 15.0),
    TOG_Modifier = ifelse(timeOnGroundPercentage >= 80.0, 1.0, 1.0 + ((80.0 - TOG_Floor) / 100) * 0.7),
    
    # Match-level Final PIR
    PIR = (PIR_Positive * TOG_Modifier) - PIR_Negative,
    
    # Normalize breakdowns so they scale visually with final PIR on the frontend
    norm_disposal = cat_disposal * TOG_Modifier,
    norm_contest = cat_contest_clearance * TOG_Modifier,
    norm_damage = cat_damaging_impact * TOG_Modifier,
    norm_grit = cat_defensive_grit * TOG_Modifier,
    norm_ruck = cat_ruck * TOG_Modifier
  ) %>% 
  filter(!is.na(jumperNumber) & jumperNumber != '')

# Calculate latest round dynamically
latest_round <- max(processed_rounds$round.roundNumber, na.rm = TRUE)
print(paste('Latest round detected as:', latest_round))

# ==============================================================================
# CORRECTED: Aggregate round PIR scores, Running Averages, and Dynamic Ranking
# ==============================================================================
round_pir_series <- processed_rounds %>%
  select(player.playerId, round.roundNumber, PIR) %>%
  
  # 1. Complete the timeline grid so EVERY player has a row for EVERY round
  complete(player.playerId, round.roundNumber = seq(min(round.roundNumber), max(round.roundNumber))) %>%
  arrange(player.playerId, round.roundNumber) %>%
  
  group_by(player.playerId) %>%
  mutate(
    # Track precise actual games played up to this specific point in time
    games_played_so_far = cumsum(!is.na(PIR)),
    
    # Generate static running average across active weeks + bye weeks
    running_sum_pir = cumsum(coalesce(PIR, 0)),
    running_avg_pir = ifelse(games_played_so_far > 0, running_sum_pir / games_played_so_far, 0)
  ) %>%
  ungroup() %>%
  
  # 2. Enforce 3-game minimum rule before allocating values
  mutate(
    running_avg_pir = ifelse(games_played_so_far >= 3, running_avg_pir, NA_real_)
  ) %>%
  
  # 3. Rank players dynamically round-by-round based on their dynamic running averages
  group_by(round.roundNumber) %>%
  mutate(
    rank = if_else(is.na(running_avg_pir), 9999, rank(-running_avg_pir, ties.method = "min"))
  ) %>%
  ungroup() %>%
  
  # 4. Collapse back into historical array list format for JSON extraction
  group_by(player.playerId) %>%
  summarise(
    Games_Played_2026 = sum(!is.na(PIR), na.rm = TRUE),
    PIR_History = list(data.frame(
      round = round.roundNumber, 
      pir = replace_na(PIR, 0), 
      rank = rank,
      running_avg_pir = replace_na(running_avg_pir, 0)
    )),
    .groups = 'drop'
  )

# Aggregate season-level and category-level details
current_year <- as.integer(format(Sys.Date(), '%Y'))
players_season <- processed_rounds %>%
  group_by(player.playerId, player.givenName, player.surname, team.name) %>%
  summarise(
    # Get the most common mapped position for the player
    playerPosition = names(sort(table(mapped_position), decreasing = TRUE))[1],
    photoURL = first(player.photoURL),
    playerJumperNumber = first(jumperNumber),
    dateOfBirth = first(dateOfBirth),
    Age = current_year - as.integer(substr(first(dateOfBirth), 1, 4)),
    heightInCm = first(HT),
    weightInKg = first(WT),
    careerGames = first(careerGames),
    careerWins = first(careerWins),
    careerDraws = first(careerDraws),
    careerLosses = first(careerLosses),
    
    Season_Avg_PIR = mean(PIR, na.rm = TRUE),
    Latest_Round_PIR = sum(ifelse(round.roundNumber == latest_round, PIR, 0), na.rm = TRUE),
    
    # True balanced component averages
    Avg_cat_disposal = mean(norm_disposal, na.rm = TRUE),
    Avg_cat_contest_clearance = mean(norm_contest, na.rm = TRUE),
    Avg_cat_damaging_impact = mean(norm_damage, na.rm = TRUE),
    Avg_cat_defensive_grit = mean(norm_grit, na.rm = TRUE),
    Avg_cat_ruck = mean(norm_ruck, na.rm = TRUE),
    Avg_PIR_Negative = mean(PIR_Negative, na.rm = TRUE),
    .groups = 'drop'
  )

# Merge season-level with their true history array
final_processed_stats <- left_join(players_season, round_pir_series, by = 'player.playerId') %>%
  mutate(
    # 1. Store the raw numeric change in rank positions
    Rank_Delta = map_dbl(PIR_History, ~ {
      history <- .x
      valid_history <- history %>% filter(rank != 9999)
      
      if (nrow(valid_history) < 2) return(0)
      
      latest_rank <- valid_history$rank[nrow(valid_history)]
      prev_rank   <- valid_history$rank[nrow(valid_history) - 1]
      
      # Any move counts: prev_rank minus latest_rank matches climbing behavior
      # Example: Rank #40 down to #35 = 40 - 35 = +5 spots moved UP.
      return(prev_rank - latest_rank)
    }),
    
    # 2. Derive the text token for the UI icon rendering state
    Trend = case_when(
      Rank_Delta > 0  ~ "up",
      Rank_Delta < 0  ~ "down",
      TRUE            ~ "stable"
    )
  )

# Ensure output directory exists
if (!dir.exists('data/processed')) {
  dir.create('data/processed', recursive = TRUE)
}

# Save results for backend/historical analytics
saveRDS(final_processed_stats, paste0('data/processed/2026_round_', latest_round, '_pir.rds'))

# Convert to JSON for React frontend
write_json(final_processed_stats, 'data/processed/players_pir.json', pretty = TRUE)