```markdown
# AFL Narrative Engine
# Backend Architecture V2
Version: 2.1
Status: Active Implementation
Author: Jarred
Target: Kilo Code Implementation

---

# Vision

The purpose of the backend is no longer simply to process AFL statistics[cite: 6].

Its purpose is to generate a complete football intelligence layer that powers every page of the website[cite: 6].

Instead of asking:

> What happened?[cite: 6]

The engine should answer:

- Why did it happen?[cite: 6]
- Who deserved to win?[cite: 6]
- Which team is actually improving?[cite: 6]
- Which clubs are lucky?[cite: 6]
- Which clubs are underperforming?[cite: 6]
- What are the biggest stories from each round?[cite: 6]

The backend should generate all calculations overnight after every completed AFL round and export static JSON files[cite: 6].

The Next.js frontend should perform **zero calculations**[cite: 6].

All pages should load instantly[cite: 6].

---

# Design Goals

## Primary Goals

- Modular architecture[cite: 6]
- Easy to maintain[cite: 6]
- Easy to extend[cite: 6]
- AI-ready[cite: 6]
- Fast generation[cite: 6]
- Static JSON output[cite: 6]
- No duplicated calculations[cite: 6]
- Human-readable code[cite: 6]

---

# Overall Data Flow

update_data.R[cite: 6]

↓

Raw AFL Statistics[cite: 6]

↓

process_stats.R (Master Controller)[cite: 6]

↓

Player Intelligence Layer[cite: 6]

↓

Narrative Engine[cite: 6]

↓

JSON Files (Structured Client Directories)[cite: 6]

↓

Next.js Website (Static Generation via getStaticProps)[cite: 6]

↓

Gemini AI Narrative Generation[cite: 6]

---

# Folder Structure

```text
footy-narrative-engine/
├── engine/
│   ├── update_data.R
│   ├── process_stats.R (Main Orchestrator)
│   └── modules/
│       ├── 00_config.R
│       ├── 01_helpers.R
│       ├── 10_player_metrics.R
│       ├── 15_player_advanced_metrics.R
│       ├── 20_season_aggregation.R
│       ├── 30_team_metrics.R
│       ├── 40_match_metrics.R
│       ├── 50_justice_ladder.R
│       ├── 60_power_rankings.R
│       ├── 90_narratives.R
│       └── 99_export_json.R
├── data/
│   ├── raw/
│   └── processed/ (Contains structured temporal backups e.g., 2026_round_16_pir.rds)
└── json/
    ├── league/ (Contains breakout_watch.json, category_kings.json, etc.)
    ├── teams/
    ├── matches/ (Contains top_games_pir.json, etc.)
    └── players/ (Contains players_pir.json, etc.)

```

---

# Module Responsibilities

## update_data.R

Responsible ONLY for downloading data.

Responsibilities:

* Download AFL statistics


* Validate download


* Save raw files


* Log update time



No calculations.

---

## process_stats.R

Master controller executing within the root environment.

Responsibilities:

* Load every script under `engine/modules/` dynamically.
* Run each core analytics engine sequentially.


* Enforce strict ordering to satisfy dependent metrics.


* Export clean JSON distributions.



No calculations should exist directly inside this file.

```R
# Sourcing Logic Block
message("Initializing Engine Modules...")
module_files <- list.files(path = "engine/modules", pattern = "\\.[Rr]$", full.names = TRUE)

if (length(module_files) == 0) {
  stop("Core Exception: No R modules discovered in 'engine/modules/'. Check directory paths.")
}

sapply(module_files, function(file) {
  message(paste(" -> Loading module:", basename(file)))
  source(file)
})

# Sequential Execution Pipeline
# calculate_player_metrics()
# calculate_advanced_player_metrics()
# ...
# export_everything()

```

---

# Module 00

Configuration

Contains:

* Centralized Directory paths (`DATA_RAW_DIR`, `DATA_PROCESSED_DIR`, `JSON_OUTPUT_DIR`)


* Automated environment boundary calculations (Season & Round)
* Global Scoring coefficients & weights


* Global dictionary tables (Team mappings & Positional frameworks)



### Automated Environment Discovery

To prevent manual upkeep and compilation failures, the module calculates boundaries dynamically:

* **`CURRENT_SEASON`**: Automatically binds to the current system calendar year (`Sys.Date()`), while allowing for an `OVERRIDE_SEASON` hook for targeted multi-season backfilling.
* **`CURRENT_ROUND`**: Programmatically inspects the actual `data/processed/` folder via regex (`^[Season]_round_\\d+_pir\\.rds$`), identifies the maximum completed checkpoint, and explicitly sets the system focus context to that round. This guarantees front-end data integrity by checking against what data is currently available in the chamber.

Nothing else.

---

# Module 01

Helpers

Generic helper functions.

Examples:

* `safe_divide()`

* `rolling_average()`

* `normalize()`

* `rank_percentile()`

* `save_json()`

* `load_data()`


No football logic.

---

# Module 10

Player Metrics Engine

Purpose:
Calculate all player metrics.

Outputs:

* PIR


* Rolling PIR


* Expected Score Contribution


* Pressure Rating


* Possession Rating


* Efficiency Rating


* Role Rating


* Consistency Rating


* Season Rating



---

# Module 15

15: Player Advanced Metrics Engine

Purpose:
Calculate advanced player metrics that depend on base PIR.

Outputs:

* Advanced Efficiency


* Impact per Possession


* Under Pressure Rating


* Clutch Factor



---

# Module 20

20: Season Aggregation Engine

Purpose:
Aggregate player and match data into seasonal context.

Outputs:

* Season Averages


* Trend Analysis


* Position Group Aggregates


* Consistency Profiles



---

# Module 30

Team Metrics Engine

Purpose:
Aggregate player ratings into team ratings.

Outputs:
Overall Rating | Attack Rating | Midfield Rating | Defence Rating
Forward Rating | Bench Rating | Pressure Rating | Ball Movement Rating
Inside 50 Rating | Contest Rating | Clearance Rating | Transition Rating
Marks Rating | Disposal Efficiency | Damage Per Disposal | Consistency
Home Rating | Away Rating | Last 5 Rating | Last 10 Rating

---

# Damage Per Disposal

One of the signature statistics.

Formula:
Total Team PIR divided by Total Disposals

Purpose:
Measure how much value every disposal created.

Interpretation:
High: Fast attacking football
Low: Possession without impact

---

# Module 40

Match Engine

Purpose:
Generate complete match summaries.

Outputs:
Winner | Expected Winner | Expected Margin | Robbery Index
Match Rating | Team Ratings | Unit Battles | Game Story Metrics

---

# Unit Battles

Every match should include:
Engine Room | Backline | Forward Line | Bench

Each contains:
Combined PIR | Average Rating | Season Comparison | Win/Loss

---

# Module 50

Justice Ladder

Purpose:
Rank teams by football performance instead of scoreboard luck.

Metrics:
Expected Wins | Expected Losses | Expected Draws | Expected Percentage
Luck Index | Variance | Justice Ladder Position

---

# Luck Index

Measures:
Actual Wins vs Expected Wins

Positive: Lucky
Negative: Unlucky

---

# Module 60

Power Rankings

Purpose:
Identify the strongest teams today.

Based on:
Rolling 5 Games | Strength of Opposition | Away Performance | Recent Trend | Overall Rating

Output:
Power Ranking | Power Score | Trend | Confidence Rating

---

# Module 70

Team Profiles

Every team receives a profile.

Example: Carlton
Attack: 118 | Defence: 103 | Midfield: 111 | Pressure: Elite
Transition: Excellent | Identity: Fast Attacking | Consistency: High | Trend: Improving

---

# Team Identity

Every club receives descriptive labels.

Examples:
Fast Transition | Pressure Team | Defensive Wall | Contest Specialists
High Possession | Counter Attack | Elite Conversion | Poor Conversion

---

# Module 80

Weekly Awards

Generated automatically.

Includes:
Team of the Week | Player of the Week | Engine Room of the Week
Forward Line of the Week | Defence of the Week | Coach Masterclass
Most Efficient Team | Empty Possession Award | Biggest Robbery
Biggest Statement Win | Biggest Collapse | Heat Check
Upset of the Week | Most Improved Team | Most Unlucky Team

---

# Module 90

Narrative Engine

Purpose:
Prepare structured information for Gemini AI.

This module DOES NOT generate text.

Instead it generates AI-ready summaries.

Example: Carlton
Overall Rating: 112 | Trend: Up | Attack: Elite | Expected Margin: +27 | Luck: Neutral
Narrative Tags: Dominated Midfield, Elite Transition, Poor Goal Accuracy, Strong Defence

These tags become prompts for AI.

---

# Module 99

JSON Export

Targeting structured client subdirectories relative to the root `json/` path:

* `json/league/`: `justice_ladder.json`, `power_rankings.json`, `weekly_awards.json`, `league_summary.json`, 

* `json/teams/`: Individual `team_xxxxx.json` profiles


* `json/matches/`: Individual `match_xxxxx.json` records, `top_games_pir.json`

* `json/players/`: `players_pir.json`,`breakout_watch.json`, `category_kings.json`, `top_games_pir.json`


---

# Monday Morning Homepage

The homepage should feel like opening a football newspaper.

Sections:
Story of the Round | Justice Ladder | Power Rankings | Biggest Robbery
Statement Win | Team of the Week | Most Efficient Team | Heat Check
Collapse Meter | Trending Teams | Premiership Index | Upcoming Blockbusters

Everything generated automatically.

---

# Future Metrics

The architecture must support adding new metrics without modifying existing modules.

Potential future additions:
Expected Ladder History | Premiership Probability | Finals Probability | Brownlow Tracker
Coach Rating | Strength of Schedule | Injury Impact | Age Profile
Clutch Rating | Quarter Ratings | Momentum Swings | Game Control Index
Pressure Differential | Kick Quality | Turnover Punishment | Territory Dominance
Expected Inside 50 Value | Player Chemistry | Replacement Value

---

# Development Roadmap

## Phase 1

Backend Architecture & Directory Refactoring

* Establish correct folder hierarchies (`engine/modules/`, `data/`, `json/`)


* Implement Dynamic Season and Round calculators in Configuration


* Configure Master controller and unified JSON structural export mechanics



## Phase 2

Player Engine

* PIR


* Player Ratings


* Expected Score Contribution



## Phase 3

Team Engine

* Team Ratings


* Damage Per Disposal


* Unit Battles



## Phase 4

Match Engine

* Expected Scores


* Robbery Index


* Match Ratings



## Phase 5

League Engine

* Justice Ladder


* Power Rankings


* Luck Index



## Phase 6

Narrative Engine

* Team Identity


* Weekly Awards


* AI Tags



## Phase 7

Frontend Integration

* Convert client pages (`breakout-watch.tsx`, index landing pages) to compile-time Static Generation via `getStaticProps`
* Bind to filesystem reads using native `fs` and `path` routines, bypassing client network overhead or dependency flashes
* Homepage, Team pages, Match Centre, Player pages deployment



---

# Success Criteria

The backend is considered complete when:

✓ Every page can be rendered from static JSON via build-time or revalidated parameters.

✓ The frontend performs no calculation or data sorting routines.

✓ Every statistic exists in one location only.

✓ New metrics can be added by creating a new module flat file within `engine/modules/`.

✓ Weekly updates run with a single pipeline orchestration command.

✓ JSON output is AI-ready.

✓ Every Monday morning the site automatically produces new football stories instead of simply displaying statistics.

```

```