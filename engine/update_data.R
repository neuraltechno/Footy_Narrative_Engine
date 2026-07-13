library(fitzRoy)
library(dplyr)
library(tidyr)
library(stringr)

# Define a standard naming convention
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

source("engine/modules/00_config.R")

# 1. Fetch data
stats <- fitzRoy::fetch_player_stats(season = CURRENT_SEASON, source = "AFL")
player_details_afl <- fitzRoy::fetch_player_details(season = CURRENT_SEASON, source = "AFL")

# Fetch full career history from afltables
player_details_afltables_all <- fitzRoy::fetch_player_details(season = CURRENT_SEASON, source = "afltables")

# Fetch Team and Match related stats)
team_stats_raw <- fitzRoy::fetch_team_stats(season = CURRENT_SEASON)
results_raw <- fitzRoy::fetch_results(season = CURRENT_SEASON)


# 2. Process Team-related Datasets
# Normalize team names for team stats
team_stats <- team_stats_raw %>%
  mutate(Team = normalize_team_name(Team))

# Normalize home and away team names for results
results <- results_raw %>%
  mutate(
    match.homeTeam.name = normalize_team_name(match.homeTeam.name),
    match.awayTeam.name = normalize_team_name(match.awayTeam.name)
  )


# 3. Process Player-related Datasets
# Aggregate career stats globally per player to get correct career totals
player_career_stats <- player_details_afltables_all %>%
  separate(Player, into = c("givenName", "surname"), sep = " ", extra = "merge") %>%
  mutate(Team = normalize_team_name(Team)) %>%
  group_by(givenName, surname) %>%
  summarise(
    careerGames = sum(as.numeric(Games), na.rm = TRUE),
    careerWins = sum(as.numeric(Wins), na.rm = TRUE),
    careerDraws = sum(as.numeric(Draws), na.rm = TRUE),
    careerLosses = sum(as.numeric(Losses), na.rm = TRUE),
    .groups = 'drop'
  )

# Keep the original joined details for current season for other metadata
# Filter to current season to ensure unique mapping per player-team combination
player_details_afltables_current <- player_details_afltables_all %>%
  separate(Player, into = c("givenName", "surname"), sep = " ", extra = "merge") %>%
  mutate(Team = normalize_team_name(Team)) %>%
  filter(str_detect(Seasons, as.character(CURRENT_SEASON)))


# 4. Join: Combine stats with player details
# Join on stats: player.player.player.playerId and player_details_afl: providerId
stats_with_details <- stats %>%
  left_join(player_details_afl, by = c("player.player.player.playerId" = "providerId")) %>%
  mutate(team.name = normalize_team_name(team.name))


# 5. Join 2: Combine with AFLTables
# Join current season details for metadata, then join aggregated career stats
final_player_data <- stats_with_details %>%
  left_join(player_details_afltables_current, 
            by = c("player.player.player.givenName" = "givenName",
                   "player.player.player.surname" = "surname",
                   "team.name" = "Team")) %>%
  left_join(player_career_stats, 
            by = c("player.player.player.givenName" = "givenName",
                   "player.player.player.surname" = "surname"))


# 6. Save data
if (!dir.exists(DATA_RAW_DIR)) {
  dir.create(DATA_RAW_DIR, recursive = TRUE)
}

saveRDS(final_player_data, file.path(DATA_RAW_DIR, paste0("afl_combined_data_", CURRENT_SEASON, ".rds")))
saveRDS(team_stats, file.path(DATA_RAW_DIR, paste0("afl_team_stats_", CURRENT_SEASON, ".rds")))
saveRDS(results, file.path(DATA_RAW_DIR, paste0("afl_results_", CURRENT_SEASON, ".rds")))