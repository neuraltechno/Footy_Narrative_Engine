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
    team %in% c("Geelong", "Geelong Cats")            ~ "Geelong Cats",
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

# ==============================================================================
# NEW STRUCTURAL POSITION REF TABLE (Supports Line & Group Filters)
# ==============================================================================
pos_reference <- tribble(
  ~pos_code, ~position_name,       ~position_group,    ~position_line,
  # --- Backs ---
  "FB",      "Full Back",          "Key Backs",        "Backs",
  "CHB",     "Centre Half Back",   "Key Backs",        "Backs",
  "BPL",     "Back Pocket",        "General Backs",    "Backs",
  "BPR",     "Back Pocket",        "General Backs",    "Backs",
  "HBFL",    "Half Back Flank",    "General Backs",    "Backs",
  "HBFR",    "Half Back Flank",    "General Backs",    "Backs",
  
  # --- Midfield & Ruck ---
  "C",       "Inside/Outside Mid", "Midfield",         "Midfield",
  "R",       "Inside Mid",         "Midfield",         "Midfield",
  "RR",      "Inside Mid",         "Midfield",         "Midfield",
  "WL",      "Wing",               "Midfield",         "Midfield",
  "WR",      "Wing",               "Midfield",         "Midfield",
  "RK",      "Ruckman",            "Ruck",             "Ruck",
  
  # --- Forwards ---
  "CHF",     "Centre Half Forward","Key Forwards",     "Forwards",
  "FF",      "Full Forward",       "Key Forwards",     "Forwards",
  "FPL",     "Forward Pocket",     "General Forwards", "Forwards",
  "FPR",     "Forward Pocket",     "General Forwards", "Forwards",
  "HFFL",    "Half Forward Flank", "General Forwards", "Forwards",
  "HFFR",    "Half Forward Flank", "General Forwards", "Forwards",
  
  # --- Bench / Specials ---
  "INT",     "Utility",            "Interchange",      "Interchange"
)

# Transform and Calculate PIR
processed_rounds <- raw_stats %>%
  mutate(
    team.name = normalize_team_name(team.name),
    
    # Safe fallback cleaning for positional join
    join_pos = if_else(is.na(player.player.position) | player.player.position %in% c('', 'EMERG'), NA_character_, player.player.position)
  ) %>%
  # Merge new multi-level position hierarchy
  left_join(pos_reference, by = c("join_pos" = "pos_code")) %>%
  mutate(
    # Handle missing/emergency/irregular fallback options cleanly 
    position_name  = coalesce(position_name, "Emergency"),
    position_group = coalesce(position_group, "Interchange"),
    position_line  = coalesce(position_line, "Interchange"),
    
    # ==============================================================================
    # PIR RATING CALCULATION (Optimized Rebalanced Model)
    # ==============================================================================
    disposal_raw = (kicks * 2.0) + (handballs * 1.0),
    disposal_score = disposal_raw * (disposalEfficiency / 100),
    
    cat_disposal = disposal_score + (metresGained * 0.05) + (bounces * 1.5) + 
      (extendedStats.kickins * 0.5) + (extendedStats.kickinsPlayon * 1.0),
    
    # TWEAK: Trimmed Contested Marks slightly (8 -> 6) and Stoppage Clearances (4.5 -> 4.0)
    # This gently cools off the dual midfielder/ruck types without hurting pure inside mids.
    cat_contest_clearance = (contestedPossessions * 4.0) + (uncontestedPossessions * 0.5) + 
      (clearances.centreClearances * 6.0) + (clearances.stoppageClearances * 4.0) + 
      (contestedMarks * 6.0) + (marks * 1.0) + (marksInside50 * 4.0) + 
      (extendedStats.marksOnLead * 2.5) + (extendedStats.groundBallGets * 2.0) + 
      (extendedStats.f50GroundBallGets * 4.0),
    
    cat_damaging_impact = (goals * 15.0) + (behinds * 2.0) + (goalAssists * 8.0) + 
      (scoreInvolvements * 3.0) + (extendedStats.scoreLaunches * 6.0),
    
    # GLOBAL DEFENSIVE ADJUSTMENTS: Maintained the great buffs for backmen
    cat_defensive_grit = (tackles * 3.0) + (tacklesInside50 * 5.0) + 
      (extendedStats.defHalfPressureActs * 1.0) + (extendedStats.pressureActs * 0.5) + 
      (onePercenters * 2.0) + 
      (extendedStats.spoils * 6.0) +          
      (intercepts * 7.0) +                    
      (extendedStats.interceptMarks * 8.0),   
    
    # TWEAK: Shaved Hitouts to Advantage (5.0 -> 4.0) to stop pure volume duplication
    cat_ruck = ((hitouts * 0.1) * (extendedStats.hitoutToAdvantageRate / 100)) + 
      (extendedStats.hitoutsToAdvantage * 4.0),
    
    PIR_Positive = (cat_disposal + cat_contest_clearance + cat_damaging_impact + cat_defensive_grit + cat_ruck),
    
    # TWEAK: Added Hitouts to Advantage into total_actions.
    # If a ruck drops a clanger or gives away a free, it should be judged against total volume including ruck contests.
    total_actions = pmax((kicks + handballs + onePercenters + extendedStats.spoils + intercepts + extendedStats.hitoutsToAdvantage), 1.0),
    
    raw_mistake_points = (clangers * 5.0) + (turnovers * 3.0) + 
      (freesAgainst * 4.0) + (extendedStats.contestDefLosses * 4.0),
    
    mistake_rate = raw_mistake_points / total_actions,
    k = 1.0,
    PIR_Negative = raw_mistake_points * (mistake_rate / (mistake_rate + k)),
    
    TOG_Floor = pmax(timeOnGroundPercentage, 15.0),
    TOG_Modifier = ifelse(timeOnGroundPercentage >= 80.0, 1.0, 1.0 + ((80.0 - TOG_Floor) / 100) * 0.7),
    
    # Match-level Final PIR
    PIR = (PIR_Positive * TOG_Modifier) - PIR_Negative,
    
    # Normalize breakdowns
    norm_disposal = cat_disposal * TOG_Modifier,
    norm_contest = cat_contest_clearance * TOG_Modifier,
    norm_damage = cat_damaging_impact * TOG_Modifier,
    norm_grit = cat_defensive_grit * TOG_Modifier,
    # TWEAK: Scale norm_ruck to reflect the adjustment
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
    # Fetch mode/most common classifications across matching entries
    playerPosition = names(sort(table(position_name), decreasing = TRUE))[1],
    playerGroup    = names(sort(table(position_group), decreasing = TRUE))[1],
    playerLine     = names(sort(table(position_line), decreasing = TRUE))[1],
    
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
    
    # PIR Core Metrics
    Season_Avg_PIR = mean(PIR, na.rm = TRUE),
    Latest_Round_PIR = sum(ifelse(round.roundNumber == latest_round, PIR, 0), na.rm = TRUE),
    
    # High/Low PIR season scores
    Max_PIR          = max(PIR, na.rm = TRUE),
    Min_PIR          = min(PIR, na.rm = TRUE),
    
    # True balanced component averages
    Avg_cat_disposal = mean(norm_disposal, na.rm = TRUE),
    Avg_cat_contest_clearance = mean(norm_contest, na.rm = TRUE),
    Avg_cat_damaging_impact = mean(norm_damage, na.rm = TRUE),
    Avg_cat_defensive_grit = mean(norm_grit, na.rm = TRUE),
    Avg_cat_ruck = mean(norm_ruck, na.rm = TRUE),
    Avg_PIR_Negative = mean(PIR_Negative, na.rm = TRUE),
    .groups = 'drop'
  )

# ==============================================================================
# Dynamic Category Baseline & Top 2 "Above Average" Strengths Selector
# ==============================================================================
league_category_means <- players_season %>%
  summarise(
    mean_disposal = mean(Avg_cat_disposal, na.rm = TRUE),
    mean_contest  = mean(Avg_cat_contest_clearance, na.rm = TRUE),
    mean_damage   = mean(Avg_cat_damaging_impact, na.rm = TRUE),
    mean_grit     = mean(Avg_cat_defensive_grit, na.rm = TRUE),
    mean_ruck     = mean(Avg_cat_ruck, na.rm = TRUE)
  )

player_relative_strengths <- players_season %>%
  select(player.playerId, Avg_cat_disposal, Avg_cat_contest_clearance, Avg_cat_damaging_impact, Avg_cat_defensive_grit, Avg_cat_ruck) %>%
  pivot_longer(
    cols = starts_with("Avg_cat_"),
    names_to = "category",
    values_to = "player_score"
  ) %>%
  mutate(
    league_mean = case_when(
      category == "Avg_cat_disposal"          ~ league_category_means$mean_disposal,
      category == "Avg_cat_contest_clearance" ~ league_category_means$mean_contest,
      category == "Avg_cat_damaging_impact"   ~ league_category_means$mean_damage,
      category == "Avg_cat_defensive_grit"    ~ league_category_means$mean_grit,
      category == "Avg_cat_ruck"              ~ league_category_means$mean_ruck
    ),
    above_average = player_score - league_mean,
    display_name = case_when(
      category == "Avg_cat_disposal"          ~ "Disposal",
      category == "Avg_cat_contest_clearance" ~ "Contest/Clearance",
      category == "Avg_cat_damaging_impact"   ~ "Damaging Impact",
      category == "Avg_cat_defensive_grit"    ~ "Defensive Grit",
      category == "Avg_cat_ruck"              ~ "Ruck"
    )
  ) %>%
  filter(above_average > 0) %>%
  group_by(player.playerId) %>%
  slice_max(order_by = above_average, n = 2, with_ties = FALSE) %>%
  summarise(
    Significant_Strengths = list(data.frame(
      category = display_name,
      value = round(above_average, 1)  # Changed from player_score to above_average
    )),
    .groups = 'drop'
  )

# Merge season-level with their true history array and new strengths logic
final_processed_stats <- left_join(players_season, round_pir_series, by = 'player.playerId') %>%
  left_join(player_relative_strengths, by = 'player.playerId') %>%
  mutate(
    # 1. Store the raw numeric change in rank positions
    Rank_Delta = map_dbl(PIR_History, ~ {
      history <- .x
      valid_history <- history %>% filter(rank != 9999)
      
      if (nrow(valid_history) < 2) return(0)
      
      latest_rank <- valid_history$rank[nrow(valid_history)]
      prev_rank   <- valid_history$rank[nrow(valid_history) - 1]
      
      # Any move counts: prev_rank minus latest_rank matches climbing behavior
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

# Export to JSON
write_json(final_processed_stats, 'data/processed/players_pir.json', pretty = TRUE)

# ==============================================================================
# CATEGORY KINGS FEATURE (Fixed 3+ Games Filter)
# ==============================================================================

# 1. Establish absolute ground-truth eligibility straight from match rows
eligible_player_ids <- processed_rounds %>%
  group_by(player.playerId) %>%
  summarise(actual_games = n_distinct(round.roundNumber), .groups = 'drop') %>%
  filter(actual_games >= 3) %>%
  pull(player.playerId)

# 2. Filter your season averages using the verified ID vector
eligible_season_data <- players_season %>% 
  filter(player.playerId %in% eligible_player_ids)

# 3. Export the Top 5 Arrays
category_kings_data <- list(
  Avg_cat_disposal = eligible_season_data %>% 
    arrange(desc(Avg_cat_disposal)) %>% head(5) %>% 
    select(name = player.surname, team = team.name, photoURL, score = Avg_cat_disposal),
  
  Avg_cat_contest_clearance = eligible_season_data %>% 
    arrange(desc(Avg_cat_contest_clearance)) %>% head(5) %>% 
    select(name = player.surname, team = team.name, photoURL, score = Avg_cat_contest_clearance),
  
  Avg_cat_damaging_impact = eligible_season_data %>% 
    arrange(desc(Avg_cat_damaging_impact)) %>% head(5) %>% 
    select(name = player.surname, team = team.name, photoURL, score = Avg_cat_damaging_impact),
  
  Avg_cat_defensive_grit = eligible_season_data %>% 
    arrange(desc(Avg_cat_defensive_grit)) %>% head(5) %>% 
    select(name = player.surname, team = team.name, photoURL, score = Avg_cat_defensive_grit),
  
  Avg_cat_ruck = eligible_season_data %>% 
    filter(playerGroup == "Ruck") %>% # Essential so mids don't hijack ruck stats!
    arrange(desc(Avg_cat_ruck)) %>% head(5) %>% 
    select(name = player.surname, team = team.name, photoURL, score = Avg_cat_ruck)
)

write_json(category_kings_data, 'data/processed/category_kings.json', pretty = TRUE)

# ==============================================================================
# TOP 50 GAMES OF THE SEASON FEATURE
# ==============================================================================
top_games_data <- processed_rounds %>%
  mutate(
    raw_opponent = ifelse(teamStatus == "home", away.team.name, home.team.name),
    match.opponentName = sapply(raw_opponent, normalize_team_name)
  ) %>%
  arrange(desc(PIR)) %>%
  slice(1:50) %>%
  mutate(
    game_title = paste0("Round ", round.roundNumber, " vs ", match.opponentName)
  ) %>%
  select(
    playerId = player.playerId,
    givenName = player.givenName,
    surname = player.surname,
    team = team.name,
    jumperNumber,
    photoURL = player.photoURL,
    round = round.roundNumber,
    opponent = match.opponentName,
    PIR,
    disposal = norm_disposal,
    contest = norm_contest,
    damage = norm_damage,
    grit = norm_grit,
    ruck = norm_ruck,
    game_title
  )

write_json(top_games_data, "data/processed/top_games_pir.json", pretty = TRUE)