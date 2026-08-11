##########################################################
# Module: Configuration
# Purpose: Centralised configuration from config.json
##########################################################
library(jsonlite)
library(dplyr)

# Load central configuration
config <- fromJSON('config.json')
# config.json stores this as a quoted string (e.g. "2026"); coerced to
# integer here, once, so every downstream usage - including fitzRoy's
# fetch_player_stats()/fetch_player_details()/fetch_team_stats()/
# fetch_results() calls in update_data.R, which require a numeric season -
# gets a consistent type without needing to coerce at each call site.
CURRENT_SEASON <- as.integer(config$CURRENT_SEASON)

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

# ==========================================================================
# PIR Algorithm Weights
# ==========================================================================
# Every point-per-stat coefficient used by calculate_player_metrics() in
# 10_player_metrics.R, centralised here so the algorithm can be reviewed and
# retuned without touching calculation logic. Pure unit conversions (e.g.
# dividing a percentage stat by 100) are left as literals in the calculation
# file - only genuinely tunable weights live here.

# -- Disposal --
PIR_W_KICK                   <- 2.0    # Points per kick
PIR_W_HANDBALL                <- 1.0    # Points per handball
PIR_W_METRES_GAINED           <- 0.05   # Points per metre gained
PIR_W_BOUNCE                  <- 1.5    # Points per bounce
PIR_W_KICKIN                  <- 0.5    # Points per kick-in
PIR_W_KICKIN_PLAYON           <- 1.0    # Points per kick-in played on

# -- Contest / Clearance --
PIR_W_CONTESTED_POSSESSION    <- 4.0    # Points per contested possession
PIR_W_UNCONTESTED_POSSESSION  <- 0.5    # Points per uncontested possession
PIR_W_CENTRE_CLEARANCE        <- 6.0    # Points per centre clearance
PIR_W_STOPPAGE_CLEARANCE      <- 4.0    # Points per stoppage clearance
PIR_W_CONTESTED_MARK          <- 6.0    # Points per contested mark
PIR_W_MARK                    <- 1.0    # Points per mark
PIR_W_MARK_INSIDE_50          <- 4.0    # Points per mark inside 50
PIR_W_MARK_ON_LEAD            <- 2.5    # Points per mark on lead
PIR_W_GROUND_BALL_GET         <- 2.0    # Points per ground ball get
PIR_W_F50_GROUND_BALL_GET     <- 4.0    # Points per forward-50 ground ball get

# -- Damaging Impact --
PIR_W_GOAL                    <- 15.0   # Points per goal
PIR_W_BEHIND                  <- 2.0    # Points per behind
PIR_W_GOAL_ASSIST             <- 8.0    # Points per goal assist
PIR_W_SCORE_INVOLVEMENT       <- 3.0    # Points per score involvement
PIR_W_SCORE_LAUNCH            <- 6.0    # Points per score launch

# -- Defensive Grit --
PIR_W_TACKLE                  <- 3.0    # Points per tackle
PIR_W_TACKLE_INSIDE_50        <- 5.0    # Points per tackle inside 50
PIR_W_DEF_HALF_PRESSURE_ACT   <- 1.0    # Points per defensive-half pressure act
PIR_W_PRESSURE_ACT            <- 0.5    # Points per pressure act
PIR_W_ONE_PERCENTER           <- 2.0    # Points per one-percenter
PIR_W_SPOIL                   <- 6.0    # Points per spoil
PIR_W_INTERCEPT                <- 7.0    # Points per intercept
PIR_W_INTERCEPT_MARK          <- 8.0    # Points per intercept mark

# -- Ruck --
# hitoutsToAdvantage carries the bulk of the ruck credit; the small raw
# hitouts term contributes a little more on top (see 10_player_metrics.R for
# the exact formula shape). PIR_W_HITOUT_TO_ADVANTAGE trimmed 4.0 -> 2.0 in
# Round 18 to reduce how much this ruck-exclusive category on its own
# separates rucks from other high-contest positions - contest_clearance and
# defensive_grit are untouched by this change, so it only pulls back the
# part of the ruck advantage that isn't shared with any other position.
PIR_W_HITOUT_RAW               <- 0.1    # Points per raw hitout (further scaled by hitout-to-advantage rate)
PIR_W_HITOUT_TO_ADVANTAGE     <- 2.0    # Points per hitout to advantage

# -- Mistakes --
# Feeds raw_mistake_points, which is then dampened by usage before being
# subtracted as PIR_Negative - see 10_player_metrics.R. turnovers is
# deliberately NOT weighted separately here: Champion Data's clangers stat
# already includes turnovers as a subset, so a separate turnovers term would
# double-count the same errors.
PIR_W_CLANGER                 <- 5.0    # Points per clanger
PIR_W_FREE_AGAINST            <- 4.0    # Points per free kick conceded
PIR_W_CONTEST_DEF_LOSS        <- 4.0    # Points per lost defensive one-on-one contest

# -- Time-on-Ground Modifier --
# Below PIR_TOG_FULL_GAME_THRESHOLD, PIR_Positive is scaled UP slightly to
# give partial credit for a partial game rather than penalising it. This is
# a gentle nudge, not a full per-minute rate normalisation - see
# 10_player_metrics.R for the exact shape and known limitations.
PIR_TOG_FULL_GAME_THRESHOLD   <- 80.0   # TOG% at/above which no modifier is applied
PIR_TOG_FLOOR                  <- 15.0   # Minimum TOG% used in the modifier calc, preventing a near-zero-minute cameo from producing an extreme boost
PIR_TOG_BOOST_SLOPE           <- 0.7    # Maximum modifier boost (as a fraction) applied at PIR_TOG_FLOOR

# ==========================================================================
# Team Metrics Tuning Parameters (30_team_metrics.R)
# ==========================================================================
# Fallback used only when a team is entirely missing from the raw
# team_stats extract (e.g. early-season data gaps). This is already a
# single-round estimate (a typical AFL team's total disposals in ONE
# match), so it is used as-is and is NOT divided by rounds played - unlike
# DI_for below, which is a season-to-date cumulative figure and does need
# to be divided by rounds elapsed to become a per-round estimate.
TEAM_METRICS_DEFAULT_ROUND_DISPOSALS <- 350

# ==========================================================================
# Match Engine - Expected Score Weights (40_match_metrics.R)
# ==========================================================================
# "Expected" score reweights a team's own goal/behind counts into a scoring
# baseline used as the reference point for luck_delta / robbery detection.
# NOTE: these are the historical/legacy coefficients carried over from the
# original engine. Expanding the formula, a goal is worth
# (XSCORE_W_GOAL_AS_GOAL * 6 + XSCORE_W_GOAL_AS_BEHIND * 1) = 3.6 points
# here (vs 6 actual), and a behind is worth
# (XSCORE_W_BEHIND_AS_GOAL * 6 + XSCORE_W_BEHIND_AS_BEHIND * 1) = 2.6 points
# here (vs 1 actual) - i.e. goals are discounted and behinds are inflated
# relative to the real scoreboard. This is not a league-average-conversion
# model (the coefficients don't sum to 1), so treat it as a deliberately
# smoothed baseline rather than a calibrated "true expected score". Revisit
# if a probability-based model (e.g. league-average shot conversion rate
# applied to total scoring shots) is wanted instead.
XSCORE_W_GOAL_AS_GOAL     <- 0.55   # Weight of goal count in the "goal-value" term
XSCORE_W_BEHIND_AS_GOAL   <- 0.35   # Weight of behind count in the "goal-value" term
XSCORE_W_GOAL_AS_BEHIND   <- 0.30   # Weight of goal count in the "behind-value" term
XSCORE_W_BEHIND_AS_BEHIND <- 0.50   # Weight of behind count in the "behind-value" term

# ==========================================================================
# Justice Ladder Tuning Parameters (50_justice_ladder.R)
# ==========================================================================
JUSTICE_SIGMA                          <- 37     # Std-dev of the win-probability normal-CDF model
JUSTICE_DRAW_SCALE                     <- 0.025  # Gaussian draw-bump scale, centred on an even contest
JUSTICE_PYTHAGOREAN_EXPONENT           <- 2      # Exponent used in the Pythagorean win-pct cross-check
JUSTICE_ROLLING_WINDOW                 <- 5      # Trailing games considered "recent form" for Rolling_Luck_Rating
JUSTICE_MIN_SAMPLE_GAMES               <- 4      # Games played below which Low_Sample_Warning is raised
JUSTICE_CURSED_THRESHOLD_PER_GAME      <- -0.3   # Luck_Rating_Per_Game at/below which Luck_Status = "Snakebitten"
JUSTICE_LUCKY_THRESHOLD_PER_GAME       <- 0.3    # Luck_Rating_Per_Game at/above which Luck_Status = "Riding the breaks"
JUSTICE_BURIED_THRESHOLD               <- 3      # |Rank_Delta| at/above which Ladder_Luck_Status = "Buried"/"Overplaced"
JUSTICE_UNDERSOLD_THRESHOLD            <- 1      # |Rank_Delta| at/above which Ladder_Luck_Status = "Undersold"/"Flattered"
JUSTICE_MODEL_SCOREBOARD_GAP_THRESHOLD <- 4      # |Luck_Rating - Pythagorean_Luck| that counts as model/scoreboard disagreement

# ==========================================================================
# Narrative Story Hooks Tuning Parameters (90_narratives.R)
# ==========================================================================
# NOTE: the snakebitten / riding_the_breaks / buried_by_others_luck /
# overplaced / model_scoreboard_split hooks deliberately do NOT get their
# own separately-declared threshold constants here. They are narrative
# wrappers around Luck_Status / Ladder_Luck_Status / Model_Scoreboard_
# Disagreement, which are themselves already built from the JUSTICE_*
# constants above in 50_justice_ladder.R - 90_narratives.R reads those
# columns directly rather than re-deriving them, so re-declaring separate
# NARRATIVE_* numbers for the same conditions would reintroduce the exact
# threshold-drift risk this centralisation is meant to remove. Only
# genuinely narrative-only thresholds (no equivalent column already on the
# ladder) get their own constants below.
NARRATIVE_HOME_ROAD_SPLIT_THRESHOLD    <- 8      # |Home_Luck_Rating - Away_Luck_Rating| to trigger a home_road_split hook
NARRATIVE_RANK_MOVEMENT_THRESHOLD      <- 2      # |Justice_Rank_Movement| to trigger a justice_rank_climb/fall hook
NARRATIVE_FORM_DIVERGENCE_THRESHOLD    <- 3      # |ladder_position - power_rank| to trigger a form_vs_luck_divergence hook
NARRATIVE_COMEBACK_MIN_DEFICIT         <- 20     # Points overcome/surrendered at/above which a comeback_win / surrendered_lead hook fires

# ==========================================================================
# Power Rankings Tuning Parameters (60_power_rankings.R)
# ==========================================================================
POWER_RANKINGS_ROLLING_WINDOW   <- 3     # Trailing rounds averaged into the power score ("current form" window)
POWER_SCORE_WEIGHT_RATING       <- 0.7   # Weight applied to rolling overall_rating
POWER_SCORE_WEIGHT_VELOCITY     <- 30    # Weight applied to rolling system_velocity

# --- Trend (ladder movement) thresholds ---
# Trend compares a team's power_rank this round to their power_rank the
# PREVIOUS round (not a rolling window - ladder movement is understood
# round-to-round, not in POWER_RANKINGS_ROLLING_WINDOW-round chunks). It
# previously compared power_score across two non-overlapping rolling
# windows ("Surging"/"Faltering"), which read as confusing on the page - a
# team could be labelled "Faltering" while still sitting #1 on the ladder,
# and the score-delta magnitude behind the label wasn't shown anywhere. See
# 60_power_rankings.R for the full history of this metric (it went through
# a fixed-threshold-on-system_velocity version before that too).
#
# These are starting placeholders and should be revisited once a real
# season's worth of round-on-round rank movement is available.
POWER_TREND_RISING_RANK_SPOTS   <- 2     # Ladder spots moved up vs prior round at/above which a team is labelled "Rising"
POWER_TREND_FALLING_RANK_SPOTS  <- 2     # Ladder spots moved down vs prior round at/above which a team is labelled "Falling" (compared against rank_movement's negative, so no minus sign here)