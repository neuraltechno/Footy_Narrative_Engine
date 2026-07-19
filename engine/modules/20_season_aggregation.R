##########################################################
# Module
#
# Name:
#
# Season Aggregation Engine
#
# Purpose:
#
# Aggregates match logs into season profiles, completes 
# the historical round grid, and calculates weekly rank trends.
#
# Dependencies:
#
# 00_config.R
#
##########################################################

library(dplyr)
library(tidyr)
library(purrr)

calculate_season_aggregation <- function(processed_rounds) {
  message("INFO: Starting Season Aggregation & Timeline Grid Completion...")
  
  # Ensure records without jumper numbers are filtered out as in original script
  processed_rounds <- processed_rounds %>% 
    filter(!is.na(jumperNumber) & jumperNumber != '')
  
  latest_round <- max(processed_rounds$round.roundNumber, na.rm = TRUE)
  
  # Extract clean bounds for the sequence to prevent complete() from throwing warnings
  min_rd <- min(processed_rounds$round.roundNumber, na.rm = TRUE)
  max_rd <- max(processed_rounds$round.roundNumber, na.rm = TRUE)
  
  # 1. Timeline Grid Completion & Dynamic Weekly Ranking
  round_pir_series <- processed_rounds %>%
    select(player.playerId, round.roundNumber, PIR) %>%
    complete(player.playerId, round.roundNumber = seq(min_rd, max_rd)) %>%
    arrange(player.playerId, round.roundNumber) %>%
    group_by(player.playerId) %>%
    mutate(
      played_this_round = !is.na(PIR),
      games_played_so_far = cumsum(!is.na(PIR)),
      running_sum_pir = cumsum(coalesce(PIR, 0)),
      running_avg_pir = ifelse(games_played_so_far > 0, running_sum_pir / games_played_so_far, 0)
    ) %>%
    ungroup() %>%
    mutate(
      running_avg_pir = ifelse(games_played_so_far >= 3, running_avg_pir, NA_real_)
    ) %>%
    group_by(round.roundNumber) %>%
    mutate(
      rank = if_else(is.na(running_avg_pir), 9999, rank(-running_avg_pir, ties.method = "min"))
    ) %>%
    ungroup() %>%
    group_by(player.playerId) %>%
    summarise(
      Games_Played_2026 = sum(!is.na(PIR), na.rm = TRUE),
      # How many rounds back was this player's last actual game, as of the
      # latest round in the grid? 0 = played the latest round. Lets the
      # narrative layer tell "moved on the back of his own performance"
      # apart from "moved purely because others played and he didn't".
      Rounds_Since_Last_Game = {
        played_rounds <- round.roundNumber[played_this_round]
        if (length(played_rounds) == 0) NA_integer_ else as.integer(latest_round - max(played_rounds))
      },
      PIR_History = list(data.frame(
        round = round.roundNumber, 
        pir = replace_na(PIR, 0), 
        rank = rank,
        running_avg_pir = replace_na(running_avg_pir, 0),
        played = played_this_round
      )),
      .groups = 'drop'
    ) %>%
    mutate(
      Played_Latest_Round = coalesce(Rounds_Since_Last_Game == 0, FALSE)
    )

  # 2. Season-level Profiles
  # Use the season being processed, not the real-world clock, so ages stay
  # correct if this pipeline is ever rerun/backfilled against a past season.
  current_year <- as.integer(CURRENT_SEASON)
  players_season <- processed_rounds %>%
    group_by(player.playerId, player.givenName, player.surname, team.name) %>%
    summarise(
      playerPosition = names(sort(table(position_name), decreasing = TRUE))[1],
      playerGroup    = names(sort(table(position_group), decreasing = TRUE))[1],
      playerLine     = names(sort(table(position_line), decreasing = TRUE))[1],
      # first() takes literally the first row in group order, NA or not - if
      # the upstream bio-source join fails for even one round (the exact
      # symptom currently being chased down for apostrophe-surname players),
      # a player could show blank bio fields for the whole season even in
      # rounds where the join did succeed. Falling back to the first non-NA
      # value across all their rounds is strictly safer and costs nothing
      # once the upstream join is fixed properly.
      photoURL = first(na.omit(player.photoURL), default = NA_character_),
      playerJumperNumber = first(na.omit(jumperNumber), default = NA_integer_),
      dateOfBirth = first(na.omit(dateOfBirth), default = NA_character_),
      Age = {
        dob <- first(na.omit(dateOfBirth), default = NA_character_)
        if (is.na(dob)) NA_integer_ else current_year - as.integer(substr(dob, 1, 4))
      },
      heightInCm = first(na.omit(HT), default = NA_character_),
      weightInKg = first(na.omit(WT), default = NA_character_),
      careerGames = first(na.omit(careerGames), default = NA_integer_),
      careerWins = first(na.omit(careerWins), default = NA_integer_),
      careerDraws = first(na.omit(careerDraws), default = NA_integer_),
      careerLosses = first(na.omit(careerLosses), default = NA_integer_),
      
      Season_Avg_PIR = mean(PIR, na.rm = TRUE),
      Latest_Round_PIR = sum(ifelse(round.roundNumber == latest_round, PIR, 0), na.rm = TRUE),
      
      # Safely handle Min and Max PIR when all rows are NA for a player
      Max_PIR          = if (all(is.na(PIR))) NA_real_ else max(PIR, na.rm = TRUE),
      Min_PIR          = if (all(is.na(PIR))) NA_real_ else min(PIR, na.rm = TRUE),
      
      Avg_cat_disposal = mean(norm_disposal, na.rm = TRUE),
      Avg_cat_contest_clearance = mean(norm_contest, na.rm = TRUE),
      Avg_cat_damaging_impact = mean(norm_damage, na.rm = TRUE),
      Avg_cat_defensive_grit = mean(norm_grit, na.rm = TRUE),
      Avg_cat_ruck = mean(norm_ruck, na.rm = TRUE),
      Avg_PIR_Negative = mean(PIR_Negative, na.rm = TRUE),
      .groups = 'drop'
    )

  # 3. Dynamic Baselines & Strengths Selection
  # Means are computed PER POSITION GROUP, not as one global blend. A global
  # blend structurally favours Ruck/Key Backs in contest_clearance and
  # defensive_grit (they sit well above the all-position average even at a
  # merely solid game), which meant those two groups almost always cleared
  # the bar while other groups (e.g. General Forwards) rarely did - repetitive
  # strength tags for some positions, thin or empty profiles for others.
  # Comparing each player to his own position group's average instead lets
  # every position surface genuinely distinctive strengths (e.g. a small
  # forward who tackles at an elite rate for his role), without touching the
  # PIR score or Category Kings leaderboards at all.
  league_category_means <- players_season %>%
    group_by(playerGroup) %>%
    summarise(
      mean_disposal = mean(Avg_cat_disposal, na.rm = TRUE),
      mean_contest  = mean(Avg_cat_contest_clearance, na.rm = TRUE),
      mean_damage   = mean(Avg_cat_damaging_impact, na.rm = TRUE),
      mean_grit     = mean(Avg_cat_defensive_grit, na.rm = TRUE),
      mean_ruck     = mean(Avg_cat_ruck, na.rm = TRUE),
      .groups = 'drop'
    )

  player_relative_strengths <- players_season %>%
    select(player.playerId, playerGroup, Avg_cat_disposal, Avg_cat_contest_clearance, Avg_cat_damaging_impact, Avg_cat_defensive_grit, Avg_cat_ruck) %>%
    left_join(league_category_means, by = "playerGroup") %>%
    pivot_longer(
      cols = starts_with("Avg_cat_"),
      names_to = "category",
      values_to = "player_score"
    ) %>%
    mutate(
      league_mean = case_when(
        category == "Avg_cat_disposal"          ~ mean_disposal,
        category == "Avg_cat_contest_clearance" ~ mean_contest,
        category == "Avg_cat_damaging_impact"   ~ mean_damage,
        category == "Avg_cat_defensive_grit"    ~ mean_grit,
        category == "Avg_cat_ruck"              ~ mean_ruck
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
        value = round(above_average, 1)
      )),
      .groups = 'drop'
    )

  # 4. Trends Combination
  final_processed_stats <- left_join(players_season, round_pir_series, by = 'player.playerId') %>%
    left_join(player_relative_strengths, by = 'player.playerId') %>%
    mutate(
      Rank_Delta = map_dbl(PIR_History, ~ {
        history <- .x
        valid_history <- history %>% filter(rank != 9999)
        if (nrow(valid_history) < 2) return(0)
        return(valid_history$rank[nrow(valid_history) - 1] - valid_history$rank[nrow(valid_history)])
      }),
      Trend = case_when(
        Rank_Delta > 0  ~ "up",
        Rank_Delta < 0  ~ "down",
        TRUE            ~ "stable"
      )
    )

  message("INFO: Completed Season Aggregation")
  return(list(
    players_season = players_season, 
    final_processed_stats = final_processed_stats,
    latest_round = latest_round,
    clean_processed_rounds = processed_rounds
  ))
}