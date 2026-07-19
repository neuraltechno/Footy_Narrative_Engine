library(fitzRoy)
library(dplyr)
library(tidyr)
library(stringr)

# Define a standard naming convention
normalize_team_name <- function(team) {
  # Squish first: an irregularly-spaced input (e.g. "North   Melbourne", two
  # extra spaces from an upstream scrape) would otherwise match none of the
  # cases below and silently fall through to the TRUE branch unnormalized.
  team <- str_squish(team)
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

# Used ONLY to build join keys for matching a player across the AFL feed and
# the afltables scrape below - never used for display. Two independently
# sourced feeds routinely disagree on formatting even when they mean the
# same player: afltables sometimes drops apostrophes/hyphens entirely rather
# than just using a different character for them (e.g. "O'Brien" ->
# "OBrien", confirmed against real data - canonicalizing apostrophe glyphs
# to a single character isn't enough here, since one side has no apostrophe
# character at all to canonicalize), accidental double spaces from HTML
# scraping (which also breaks the givenName/surname split below, e.g.
# "Connor  O'Sullivan" -> surname " O'Sullivan" with a leading space), and
# casing. None of that should be allowed to sink a match on a name that is
# otherwise identical once you strip the punctuation both sides may or may
# not agree on.
normalize_name_key <- function(x) {
  x %>%
    str_squish() %>%
    str_replace_all("[\u2018\u2019\u02BC\u00B4\u0060'\\-]", "") %>%
    str_to_lower()
}

source("engine/modules/00_config.R")

# 1. Fetch data
stats <- fitzRoy::fetch_player_stats(season = CURRENT_SEASON, source = "AFL")
player_details_afl <- fitzRoy::fetch_player_details(season = CURRENT_SEASON, source = "AFL")

# Fetch full career history from afltables
player_details_afltables_all <- fitzRoy::fetch_player_details(season = CURRENT_SEASON, source = "afltables") %>%
  mutate(Player = str_squish(Player))

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
  mutate(
    Team = normalize_team_name(Team),
    join_given = normalize_name_key(givenName),
    join_surname = normalize_name_key(surname)
  ) %>%
  group_by(join_given, join_surname) %>%
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
  mutate(
    Team = normalize_team_name(Team),
    join_given = normalize_name_key(givenName),
    join_surname = normalize_name_key(surname)
  ) %>%
  filter(str_detect(Seasons, as.character(CURRENT_SEASON)))


# 4. Join: Combine stats with player details
# Join on stats: player.player.player.playerId and player_details_afl: providerId (ID-based, unaffected by the name-matching issue below)
stats_with_details <- stats %>%
  left_join(player_details_afl, by = c("player.player.player.playerId" = "providerId")) %>%
  mutate(
    team.name = normalize_team_name(team.name),
    join_given = normalize_name_key(player.player.player.givenName),
    join_surname = normalize_name_key(player.player.player.surname)
  )


# 5. Join 2: Combine with AFLTables
# Join current season details for metadata, then join aggregated career stats.
# Both joins use the normalized join_given/join_surname keys built above, not
# the raw name fields directly - see normalize_name_key() for why.
final_player_data <- stats_with_details %>%
  left_join(player_details_afltables_current, 
            by = c("join_given", "join_surname", "team.name" = "Team")) %>%
  left_join(player_career_stats, 
            by = c("join_given", "join_surname")) %>%
  select(-join_given, -join_surname)


# 6. Save data
if (!dir.exists(DATA_RAW_DIR)) {
  created <- dir.create(DATA_RAW_DIR, recursive = TRUE)
  if (!created || !dir.exists(DATA_RAW_DIR)) {
    stop(sprintf(
      "Could not create DATA_RAW_DIR ('%s', resolved from working directory '%s'). Check that a component of this path doesn't already exist as a file, and that this process has write permission here.",
      DATA_RAW_DIR, getwd()
    ))
  }
}

# Small, defensive wrapper around saveRDS(): removes any pre-existing file at
# the target path first (a stale/locked leftover from an interrupted prior
# run - common on synced/network drives - is a frequent cause of "cannot
# open the connection" errors that otherwise give no clue what's wrong), and
# fails with the resolved absolute path plus the underlying error rather
# than a bare gzfile message if the write still doesn't succeed.
save_rds_safely <- function(object, path) {
  if (file.exists(path)) {
    removed <- file.remove(path)
    if (!removed) {
      stop(sprintf("Found an existing file at '%s' but could not remove it - check for a permissions issue or another process holding it open.", normalizePath(path, mustWork = FALSE)))
    }
  }
  tryCatch({
    saveRDS(object, path)
  }, error = function(e) {
    stop(sprintf("Failed to save '%s' (resolved: '%s'): %s", path, normalizePath(path, mustWork = FALSE), conditionMessage(e)))
  })
}

save_rds_safely(final_player_data, file.path(DATA_RAW_DIR, paste0("afl_combined_data_", CURRENT_SEASON, ".rds")))
save_rds_safely(team_stats, file.path(DATA_RAW_DIR, paste0("afl_team_stats_", CURRENT_SEASON, ".rds")))
save_rds_safely(results, file.path(DATA_RAW_DIR, paste0("afl_results_", CURRENT_SEASON, ".rds")))