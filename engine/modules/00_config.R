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