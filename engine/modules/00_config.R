##########################################################
# Module: Configuration
# Purpose: Centralised configuration, paths, constants, and dynamic environment lookups
##########################################################

# Directory Paths
DATA_RAW_DIR <- "data/raw"
DATA_PROCESSED_DIR <- "data/processed"
JSON_OUTPUT_DIR <- "json"

# ==============================================================================
# DYNAMIC ENVIRONMENT CALCULATIONS
# ==============================================================================

# Dynamic Season Calculation Engine
get_current_season <- function(fallback_season = 2026) {
  # 1. Grab current calendar year as initial baseline
  system_year <- as.numeric(format(Sys.Date(), "%Y"))
  
  # 2. Safety Check: If it's early Jan/Feb before a season starts, or we are debugging historical files,
  # cross-reference against the highest season directory present in your data logs if available.
  # For now, system year is a solid automation standard.
  if (!is.na(system_year) && system_year >= 2025) {
    return(system_year)
  }
  
  return(fallback_season)
}

# Dynamic Round Calculation Engine
get_current_round <- function(fallback_round = 17) {
  # 1. Look inside your actual processed data folder
  if (dir.exists(DATA_PROCESSED_DIR)) {
    tryCatch({
      # List all files matching your format: "2026_round_XX_pir.rds"
      pattern_string <- paste0("^", CURRENT_SEASON, "_round_\\d+_pir\\.rds$")
      files <- list.files(path = DATA_PROCESSED_DIR, pattern = pattern_string)
      
      if (length(files) > 0) {
        # Extract the numeric digits after "_round_"
        round_numbers <- as.numeric(gsub(".*_round_(\\d+)_.*", "\\1", files))
        
        # Your latest processed backup is Round 16, meaning you are prepping for Round 17 tonight!
        latest_processed_round <- max(round_numbers, na.rm = TRUE)
        return(latest_processed_round)
      }
    }, error = function(e) {
      warning("Could not dynamically parse processed folder filenames. Using fallback.")
    })
  }
  
  return(fallback_round)
}

# Automatically resolve environmental targets upon engine execution
CURRENT_SEASON <- get_current_season(fallback_season = 2026)
CURRENT_ROUND  <- get_current_round(fallback_round = 17) # Updated fallback to 17

message("=========================================================")
message(paste(">>> Engine Initialization Success"))
message(paste(">>> Target Context: Season", CURRENT_SEASON, "|| Round", CURRENT_ROUND))
message("=========================================================")

# ==============================================================================
# MODEL CONFIGURATIONS & COEFFICIENTS
# ==============================================================================

# Scoring Coefficients (Examples)
SCORING_WEIGHT <- 0.73
MIDFIELD_WEIGHT <- 0.60

# Team Normalization Mapping
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
    team %in% c("North Melbourne", "North")           ~ "Nth Melbourne Kangaroos",
    team %in% c("Port Adelaide", "Port")              ~ "Port Adelaide Power",
    team == "Richmond"                                ~ "Richmond Tigers",
    team == "St Kilda"                                ~ "St Kilda Saints",
    team %in% c("Sydney", "Sydney Swans")             ~ "Sydney Swans",
    team %in% c("West Coast", "West Coast Eagles")    ~ "West Coast Eagles",
    team %in% c("Western Bulldogs", "Western")        ~ "Western Bulldogs",
    TRUE                                              ~ team
  )
}

# Positional Reference Table
POS_REFERENCE <- tribble(
  ~pos_code, ~position_name,       ~position_group,    ~position_line,
  "FB",      "Full Back",          "Key Backs",        "Backs",
  "CHB",     "Centre Half Back",   "Key Backs",        "Backs",
  "BPL",     "Back Pocket",        "General Backs",    "Backs",
  "BPR",     "Back Pocket",        "General Backs",    "Backs",
  "HBFL",    "Half Back Flank",    "General Backs",    "Backs",
  "HBFR",    "Half Back Flank",    "General Backs",    "Backs",
  "C",       "Inside/Outside Mid", "Midfield",         "Midfield",
  "R",       "Inside Mid",         "Midfield",         "Midfield",
  "RR",      "Inside Mid",         "Midfield",         "Midfield",
  "WL",      "Wing",               "Midfield",         "Midfield",
  "WR",      "Wing",               "Midfield",         "Midfield",
  "RK",      "Ruckman",            "Ruck",             "Ruck",
  "CHF",     "Centre Half Forward","Key Forwards",     "Forwards",
  "FF",      "Full Forward",       "Key Forwards",     "Forwards",
  "FPL",     "Forward Pocket",     "General Forwards", "Forwards",
  "FPR",     "Forward Pocket",     "General Forwards", "Forwards",
  "HFFL",    "Half Forward Flank", "General Forwards", "Forwards",
  "HFFR",    "Half Forward Flank", "General Forwards", "Forwards",
  "INT",     "Utility",            "Interchange",      "Interchange"
)