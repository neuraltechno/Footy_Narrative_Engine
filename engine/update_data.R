library(fitzRoy)
library(dplyr)

# Fetch data for 2026
stats <- fitzRoy::fetch_player_stats(season = 2026, source = "AFL")

# Use relative path which is cleaner and works when R is run from project root
# Ensure the directory exists first
if (!dir.exists("data/raw")) {
  dir.create("data/raw", recursive = TRUE)
}

saveRDS(stats, "data/raw/afl_stats_2026.rds")
