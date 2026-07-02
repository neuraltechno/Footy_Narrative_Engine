library(dplyr)
library(jsonlite)
library(purrr)
library(tidyr)
library(stringr)

# ==============================================================================
# 1. READ PIPELINE GENERATED INPUTS
# ==============================================================================

# Automatically detect the latest player rds file produced by process_stats.R
player_rds_files <- list.files('data/processed', pattern = "_pir.rds$", full.names = TRUE)
if(length(player_rds_files) == 0) {
  stop("Error: No pre-processed player PIR files found. Run process_stats.R first.")
}
latest_player_file <- max(player_rds_files)
player_season_data <- readRDS(latest_player_file)

# Load the raw team datasets fetched by update_data.R
team_stats <- readRDS("data/raw/afl_team_stats_2026.rds")
results    <- readRDS("data/raw/afl_results_2026.rds")

# Dynamically parse current round sequence from player history arrays
latest_round <- max(map_dbl(player_season_data$PIR_History, ~ max(.x$round, na.rm = TRUE)))
print(paste("Team Narrative Engine initializing for Round:", latest_round))

# Helper to normalize team names locally
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

# ==============================================================================
# 2. MATCH-BY-MATCH EXPECTED SCORE (xScore) CONVERSION ENGINE
# ==============================================================================

# Extract historical rounds array data to extract match action totals
player_game_rows <- player_season_data %>%
  select(player.playerId, team = team.name, playerLine, Season_Avg_PIR, PIR_History) %>%
  unnest(PIR_History) %>%
  filter(pir > 0)

# Build shot adjustments based on individual player season form baseline tiers
player_shot_modifiers <- player_season_data %>%
  select(player.playerId, Season_Avg_PIR) %>%
  mutate(
    shot_modifier = case_when(
      Season_Avg_PIR >= 90 ~ 1.15,
      Season_Avg_PIR <= 45 ~ 0.85,
      TRUE                 ~ 1.00
    )
  )

# Calculate match pairings and map structural results from results dataset
# TARGETS: Exact columns matching homeTeamScore.matchScore.totalScore style keys
match_pairings <- results %>%
  filter(round.roundNumber <= latest_round & status == "CONCLUDED") %>%
  select(
    round = round.roundNumber,
    home_team = match.homeTeam.name,
    away_team = match.awayTeam.name,
    home_score = homeTeamScore.matchScore.totalScore,
    away_score = awayTeamScore.matchScore.totalScore,
    home_goals = homeTeamScore.matchScore.goals,
    home_behinds = homeTeamScore.matchScore.behinds,
    away_goals = awayTeamScore.matchScore.goals,
    away_behinds = awayTeamScore.matchScore.behinds
  ) %>%
  mutate(
    home_team = sapply(home_team, normalize_team_name),
    away_team = sapply(away_team, normalize_team_name)
  )

# Calculate expected scores using individual match results baselines
match_xscores <- match_pairings %>%
  mutate(
    home_raw_xscore = round(((home_goals * 0.55 + home_behinds * 0.35) * 6) + 
                              ((home_goals * 0.30 + home_behinds * 0.50) * 1), 1),
    
    away_raw_xscore = round(((away_goals * 0.55 + away_behinds * 0.35) * 6) + 
                              ((away_goals * 0.30 + away_behinds * 0.50) * 1), 1)
  )

# ==============================================================================
# 3. STRUCTURAL TEAM LINE & SYSTEM VELOCITY SNAPSHOTS
# ==============================================================================

# Pull season-average disposal metrics per team from team_stats data mapping (DI_for)
team_disposal_baselines <- team_stats %>%
  mutate(Team = sapply(Team, normalize_team_name)) %>%
  select(team = Team, DI_for)

team_line_snapshots <- player_game_rows %>%
  group_by(round, team) %>%
  summarise(
    engine_room_pir   = round(sum(pir[playerLine %in% c("Midfield", "Ruck")], na.rm = TRUE), 1),
    iron_curtain_pir  = round(sum(pir[playerLine == "Backs"], na.rm = TRUE), 1),
    the_arsenal_pir   = round(sum(pir[playerLine == "Forwards"], na.rm = TRUE), 1),
    total_player_pir  = sum(pir, na.rm = TRUE),
    .groups = 'drop'
  ) %>%
  mutate(team = sapply(team, normalize_team_name)) %>%
  left_join(team_disposal_baselines, by = "team") %>%
  mutate(
    # System Velocity uses cumulative disposal baseline as a volume weight asset index
    approx_round_disposals = coalesce(DI_for, 350) / latest_round,
    system_velocity = round(total_player_pir / approx_round_disposals, 2)
  )

# ==============================================================================
# 4. COMBINE SIDE-BY-SIDE MATCH METRICS
# ==============================================================================
match_evaluations <- match_xscores %>%
  left_join(team_line_snapshots, by = c("round" = "round", "home_team" = "team")) %>%
  rename_with(~ paste0("home_", .), .cols = c(engine_room_pir, iron_curtain_pir, the_arsenal_pir, system_velocity)) %>%
  left_join(team_line_snapshots, by = c("round" = "round", "away_team" = "team")) %>%
  rename_with(~ paste0("away_", .), .cols = c(engine_room_pir, iron_curtain_pir, the_arsenal_pir, system_velocity)) %>%
  select(-contains("total_player_pir"), -contains("DI_for"), -contains("approx_round_disposals")) %>%
  mutate(
    expected_winner = if_else(home_raw_xscore > away_raw_xscore, home_team, away_team),
    actual_winner   = if_else(home_score > away_score, home_team, away_team),
    is_robbery      = expected_winner != actual_winner,
    luck_delta      = abs((home_score - away_score) - (home_raw_xscore - away_raw_xscore))
  )

# ==============================================================================
# 5. GENERATING INTEGRATED LADDER & WEEKLY JSON OUTPUTS
# ==============================================================================

home_ladder_contribs <- match_evaluations %>%
  group_by(team = home_team) %>%
  summarise(
    exp_pts = sum(if_else(home_raw_xscore > away_raw_xscore, 4, if_else(home_raw_xscore == away_raw_xscore, 2, 0))),
    act_pts = sum(if_else(home_score > away_score, 4, if_else(home_score == away_score, 2, 0))),
    exp_score_for = sum(home_raw_xscore),
    exp_score_agst = sum(away_raw_xscore)
  )

away_ladder_contribs <- match_evaluations %>%
  group_by(team = away_team) %>%
  summarise(
    exp_pts = sum(if_else(away_raw_xscore > home_raw_xscore, 4, if_else(away_raw_xscore == home_raw_xscore, 2, 0))),
    act_pts = sum(if_else(away_score > home_score, 4, if_else(away_score == home_score, 2, 0))),
    exp_score_for = sum(away_raw_xscore),
    exp_score_agst = sum(home_raw_xscore)
  )

justice_ladder <- bind_rows(home_ladder_contribs, away_ladder_contribs) %>%
  group_by(team) %>%
  summarise(
    Expected_Points = sum(exp_pts),
    Actual_Points   = sum(act_pts),
    Expected_Percent = round((sum(exp_score_for) / sum(exp_score_agst)) * 100, 1),
    Luck_Rating     = Expected_Points - Actual_Points
  ) %>%
  arrange(desc(Expected_Points), desc(Expected_Percent)) %>%
  mutate(
    Justice_Rank = row_number(),
    Luck_Status  = case_when(
      Luck_Rating > 4  ~ "Cursed (Underperforming System)",
      Luck_Rating < -4 ~ "Lucky (Overachieving Outcomes)",
      TRUE             ~ "Balanced"
    )
  )

robbery_of_the_round_match <- match_evaluations %>%
  filter(round == latest_round) %>%
  arrange(desc(luck_delta)) %>%
  slice_head(n = 1)

latest_round_centers <- match_evaluations %>% filter(round == latest_round)

if (!dir.exists('data/processed')) {
  dir.create('data/processed', recursive = TRUE)
}

write_json(justice_ladder, 'data/processed/justice_ladder.json', pretty = TRUE)
write_json(latest_round_centers, 'data/processed/team_match_centers.json', pretty = TRUE)
write_json(robbery_of_the_round_match, 'data/processed/robbery_of_the_round.json', pretty = TRUE)

print("Static JSON layers exported. Monday Morning updates deployed successfully.")