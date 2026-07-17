##########################################################
# Module: Configuration
# Purpose: Centralised configuration from config.json
##########################################################
library(jsonlite)
library(dplyr)

# Load central configuration
config <- fromJSON('config.json')
CURRENT_SEASON <- config$CURRENT_SEASON

# Directory Paths
DATA_RAW_DIR <- file.path('data/raw', CURRENT_SEASON)
DATA_PROCESSED_DIR <- file.path('data/processed', CURRENT_SEASON)
JSON_OUTPUT_DIR <- 'json'

# Dynamic Round Calculation Engine
get_current_round <- function(fallback_round = 17) {
  if (dir.exists(DATA_PROCESSED_DIR)) {
    tryCatch({
      pattern_string <- paste0('^', CURRENT_SEASON, '_round_\\d+_pir\\.rds$')
      files <- list.files(path = DATA_PROCESSED_DIR, pattern = pattern_string)
      
      if (length(files) > 0) {
        round_numbers <- as.numeric(gsub('.*_round_(\\d+)_.*', '\\1', files))
        return(max(round_numbers, na.rm = TRUE))
      }
    }, error = function(e) {
      warning('Could not dynamically parse processed folder filenames. Using fallback.')
    })
  }
  return(fallback_round)
}

CURRENT_ROUND <- get_current_round(fallback_round = 17)

message('=========================================================')
message(paste('>>> Engine Initialization Success'))
message(paste('>>> Target Context: Season', CURRENT_SEASON, '|| Round', CURRENT_ROUND))
message('=========================================================')

# Team Normalization Mapping
normalize_team_name <- function(team) {
  case_when(
    team %in% c('Adelaide', 'Adelaide Crows')         ~ 'Adelaide Crows',
    team %in% c('Brisbane', 'Brisbane Lions')         ~ 'Brisbane Lions',
    team %in% c('Carlton', 'Carlton Blues')           ~ 'Carlton Blues',
    team == 'Collingwood'                             ~ 'Collingwood Magpies',
    team == 'Essendon'                                ~ 'Essendon Bombers',
    team == 'Fremantle'                               ~ 'Fremantle Dockers',
    team %in% c('Geelong', 'Geelong Cats')            ~ 'Geelong Cats',
    team %in% c('Gold Coast', 'Gold Coast SUNS')      ~ 'Gold Coast Suns',
    team %in% c('GWS', 'Greater Western Sydney', 'GWS GIANTS') ~ 'GWS Giants',
    team == 'Hawthorn'                                ~ 'Hawthorn Hawks',
    team == 'Melbourne'                               ~ 'Melbourne Demons',
    team %in% c('North Melbourne', 'North')           ~ 'Nth Melbourne Kangaroos',
    team %in% c('Port Adelaide', 'Port')              ~ 'Port Adelaide Power',
    team == 'Richmond'                                ~ 'Richmond Tigers',
    team == 'St Kilda'                                ~ 'St Kilda Saints',
    team %in% c('Sydney', 'Sydney Swans')             ~ 'Sydney Swans',
    team %in% c('West Coast', 'West Coast Eagles')    ~ 'West Coast Eagles',
    team %in% c('Western Bulldogs', 'Western')        ~ 'Western Bulldogs',
    TRUE                                              ~ team
  )
}

# Positional Reference Table
POS_REFERENCE <- tribble(
  ~pos_code, ~position_name,       ~position_group,    ~position_line,
  'FB',      'Full Back',          'Key Backs',        'Backs',
  'CHB',     'Centre Half Back',   'Key Backs',        'Backs',
  'BPL',     'Back Pocket',        'General Backs',    'Backs',
  'BPR',     'Back Pocket',        'General Backs',    'Backs',
  'HBFL',    'Half Back Flank',    'General Backs',    'Backs',
  'HBFR',    'Half Back Flank',    'General Backs',    'Backs',
  'C',       'Inside/Outside Mid', 'Midfield',         'Midfield',
  'R',       'Inside Mid',         'Midfield',         'Midfield',
  'RR',      'Inside Mid',         'Midfield',         'Midfield',
  'WL',      'Wing',               'Midfield',         'Midfield',
  'WR',      'Wing',               'Midfield',         'Midfield',
  'RK',      'Ruckman',            'Ruck',             'Ruck',
  'CHF',     'Centre Half Forward','Key Forwards',     'Forwards',
  'FF',      'Full Forward',       'Key Forwards',     'Forwards',
  'FPL',     'Forward Pocket',     'General Forwards', 'Forwards',
  'FPR',     'Forward Pocket',     'General Forwards', 'Forwards',
  'HFFL',    'Half Forward Flank', 'General Forwards', 'Forwards',
  'HFFR',    'Half Forward Flank', 'General Forwards', 'Forwards',
  'INT',     'Utility',            'Interchange',      'Interchange'
)

# De-duplicated lookup for joining on full position name rather than pos_code.
# POS_REFERENCE has multiple pos_codes sharing the same position_name (e.g.
# BPL/BPR are both "Back Pocket", WL/WR are both "Wing"), so joining against
# the raw table fans matching rows out many-to-many. position_group and
# position_line are identical across those duplicates, so keeping the first
# match per position_name is safe.
POS_NAME_LOOKUP <- POS_REFERENCE %>%
    distinct(position_name, .keep_all = TRUE) %>%
    select(position_name, position_group, position_line)

# ==========================================================================
# Breakout Watch Tuning Parameters
# ==========================================================================
BREAKOUT_MAX_AGE                <- 23     # Age-based eligibility ceiling
BREAKOUT_MAX_CAREER_GAMES       <- 30     # Alternate eligibility path: emerging talent by career games instead of age
BREAKOUT_ROLLING_WINDOW         <- 3      # Trailing rounds considered "recent form"
BREAKOUT_MIN_RECENT_GAMES       <- 2      # Minimum games played within the rolling window
BREAKOUT_DELTA_PERCENTILE       <- 0.85   # Required percentile of positive form-delta, calculated within each position group
BREAKOUT_QUALITY_PERCENTILE     <- 0.40   # Minimum season-quality (Season_Avg_PIR) percentile required
BREAKOUT_BASELINE_WEIGHT        <- 0.2    # Weight applied to season average PIR in the final score
BREAKOUT_LIST_SIZE              <- 15     # Number of players surfaced in the final list
BREAKOUT_AGE_WEIGHT_YOUNG       <- 1.5    # Max age-weight multiplier (age <= BREAKOUT_AGE_TAPER_START)
BREAKOUT_AGE_WEIGHT_FLOOR       <- 1.0    # Min age-weight multiplier (age >= BREAKOUT_AGE_TAPER_END)
BREAKOUT_AGE_TAPER_START        <- 21     # Age at which the weight begins tapering down
BREAKOUT_AGE_TAPER_END          <- 25     # Age at which the weight reaches its floor
BREAKOUT_AGE_TAPER_SLOPE        <- (BREAKOUT_AGE_WEIGHT_YOUNG - BREAKOUT_AGE_WEIGHT_FLOOR) /
                                    (BREAKOUT_AGE_TAPER_END - BREAKOUT_AGE_TAPER_START)
BREAKOUT_SAMPLE_CONF_MIN_GAMES  <- 0.9    # Score confidence multiplier when only the minimum games are played
BREAKOUT_SAMPLE_CONF_FULL_GAMES <- 1.0    # Score confidence multiplier at a full rolling-window sample
BREAKOUT_CV_THRESHOLD           <- 0.3    # Coefficient-of-variation cutoff distinguishing "sustained" vs "accelerating" trend labels

# ==========================================================================
# Category Kings Tuning Parameters
# ==========================================================================
CATEGORY_KINGS_MIN_GAMES    <- 3      # Minimum games played to be eligible for any category leaderboard
CATEGORY_KINGS_LIST_SIZE    <- 5      # Number of players surfaced per category leaderboard

# Round-by-round leaderboard snapshots, used to compute rank movement and
# "reigning king" streaks without recomputing history each run. Pipeline
# state only - not part of the public JSON output. Kept outside the
# per-season processed-data tree so it survives independently of any
# data/processed cleanup/rebuild.
CATEGORY_KINGS_SNAPSHOT_DIR <- file.path('data/category_kings_snapshots', CURRENT_SEASON)

# Category definitions table. Adding a new category leaderboard (e.g. a new
# stat next season) is a one-row addition here - the pipeline code loops
# over this table rather than having a hand-written block per category.
# filter_group restricts the eligible pool to a playerGroup (e.g. Ruck);
# use NA for categories open to all positions.
CATEGORY_KINGS_DEFS <- tribble(
  ~key,                 ~column,                     ~label,             ~stat_description,                                      ~filter_group,
  'disposal',           'Avg_cat_disposal',          'Disposal Kings',   'Average disposal-category score per game',             NA_character_,
  'contest_clearance',  'Avg_cat_contest_clearance', 'Clearance Kings',  'Average contested-clearance-category score per game',   NA_character_,
  'damaging_impact',    'Avg_cat_damaging_impact',   'Damage Kings',     'Average damaging-impact-category score per game',       NA_character_,
  'defensive_grit',     'Avg_cat_defensive_grit',    'Grit Kings',       'Average defensive-grit-category score per game',        NA_character_,
  'ruck',               'Avg_cat_ruck',              'Ruck Kings',       'Average ruck-category score per game',                  'Ruck'
)