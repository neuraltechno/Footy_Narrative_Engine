# AFL Narrative Engine
# Backend Architecture V2
Version: 2.0
Status: Planning
Author: Jarred
Target: Kilo Code Implementation

---

# Vision

The purpose of the backend is no longer simply to process AFL statistics.

Its purpose is to generate a complete football intelligence layer that powers every page of the website.

Instead of asking:

> What happened?

The engine should answer:

- Why did it happen?
- Who deserved to win?
- Which team is actually improving?
- Which clubs are lucky?
- Which clubs are underperforming?
- What are the biggest stories from each round?

The backend should generate all calculations overnight after every completed AFL round and export static JSON files.

The Next.js frontend should perform **zero calculations**.

All pages should load instantly.

---

# Design Goals

## Primary Goals

- Modular architecture
- Easy to maintain
- Easy to extend
- AI-ready
- Fast generation
- Static JSON output
- No duplicated calculations
- Human-readable code

---

# Overall Data Flow

update_data.R

↓

Raw AFL Statistics

↓

process_stats.R

↓

Player Intelligence Layer

↓

process_team_stats.R

↓

Narrative Engine

↓

JSON Files

↓

Next.js Website

↓

Gemini AI Narrative Generation

---

# Folder Structure

R/

    update_data.R
    process_stats.R
    process_team_stats.R

modules/

    00_config.R
    01_helpers.R

    10_player_metrics.R
    20_expected_score.R
    30_team_metrics.R
    40_match_metrics.R
    50_justice_ladder.R
    60_power_rankings.R
    70_team_profiles.R
    80_weekly_awards.R
    90_narratives.R
    99_export_json.R

data/

    raw/
    processed/

json/

    league/
    teams/
    matches/
    players/

---

# Module Responsibilities

## update_data.R

Responsible ONLY for downloading data.

Responsibilities

- Download AFL statistics
- Validate download
- Save raw files
- Log update time

No calculations.

---

## process_stats.R

Responsible ONLY for player-level calculations.

Outputs

Player PIR

Expected Score Contribution

Rolling Ratings

Season Ratings

Role Ratings

Pressure Ratings

Efficiency Ratings

Player JSON

Nothing team related.

---

## process_team_stats.R

Master controller.

Responsibilities

Load every module.

Run each module in order.

Export JSON.

No calculations should exist directly inside this file.

Pseudo Code

source()

source()

source()

calculate_expected_scores()

calculate_team_metrics()

calculate_match_metrics()

calculate_power_rankings()

calculate_weekly_awards()

export_everything()

---

# Module 00

Configuration

Contains

Directory paths

Current season

Current round

Weightings

Constants

Scoring coefficients

Nothing else.

---

# Module 01

Helpers

Generic helper functions.

Examples

safe_divide()

rolling_average()

normalize()

rank_percentile()

save_json()

load_data()

No football logic.

---

# Module 10

Player Metrics Engine

Purpose

Calculate all player metrics.

Outputs

PIR

Rolling PIR

Expected Score Contribution

Pressure Rating

Possession Rating

Efficiency Rating

Role Rating

Consistency Rating

Season Rating

---

# Module 20

Expected Score Engine

Purpose

Estimate how many points every team should have scored.

Outputs

Expected Score

Expected Winner

Expected Margin

Conversion %

Scoring Efficiency

Shot Quality

Variance

This module powers the Justice Ladder.

---

# Module 30

Team Metrics Engine

Purpose

Aggregate player ratings into team ratings.

Outputs

Overall Rating

Attack Rating

Midfield Rating

Defence Rating

Forward Rating

Bench Rating

Pressure Rating

Ball Movement Rating

Inside 50 Rating

Contest Rating

Clearance Rating

Transition Rating

Marks Rating

Disposal Efficiency

Damage Per Disposal

Consistency

Home Rating

Away Rating

Last 5 Rating

Last 10 Rating

---

# Damage Per Disposal

One of the signature statistics.

Formula

Total Team PIR

divided by

Total Disposals

Purpose

Measure how much value every disposal created.

Interpretation

High

Fast attacking football

Low

Possession without impact

---

# Module 40

Match Engine

Purpose

Generate complete match summaries.

Outputs

Winner

Expected Winner

Expected Margin

Robbery Index

Match Rating

Team Ratings

Unit Battles

Game Story Metrics

---

# Unit Battles

Every match should include

Engine Room

Backline

Forward Line

Bench

Each contains

Combined PIR

Average Rating

Season Comparison

Win/Loss

---

# Module 50

Justice Ladder

Purpose

Rank teams by football performance instead of scoreboard luck.

Metrics

Expected Wins

Expected Losses

Expected Draws

Expected Percentage

Luck Index

Variance

Justice Ladder Position

---

# Luck Index

Measures

Actual Wins

vs

Expected Wins

Positive

Lucky

Negative

Unlucky

---

# Module 60

Power Rankings

Purpose

Identify the strongest teams today.

Based on

Rolling 5 Games

Strength of Opposition

Away Performance

Recent Trend

Overall Rating

Output

Power Ranking

Power Score

Trend

Confidence Rating

---

# Module 70

Team Profiles

Every team receives a profile.

Example

Carlton

Attack

118

Defence

103

Midfield

111

Pressure

Elite

Transition

Excellent

Identity

Fast Attacking

Consistency

High

Trend

Improving

---

# Team Identity

Every club receives descriptive labels.

Examples

Fast Transition

Pressure Team

Defensive Wall

Contest Specialists

High Possession

Counter Attack

Elite Conversion

Poor Conversion

---

# Module 80

Weekly Awards

Generated automatically.

Includes

Team of the Week

Player of the Week

Engine Room of the Week

Forward Line of the Week

Defence of the Week

Coach Masterclass

Most Efficient Team

Empty Possession Award

Biggest Robbery

Biggest Statement Win

Biggest Collapse

Heat Check

Upset of the Week

Most Improved Team

Most Unlucky Team

---

# Module 90

Narrative Engine

Purpose

Prepare structured information for Gemini AI.

This module DOES NOT generate text.

Instead it generates AI-ready summaries.

Example

Carlton

Overall Rating

112

Trend

Up

Attack

Elite

Expected Margin

+27

Luck

Neutral

Narrative Tags

Dominated Midfield

Elite Transition

Poor Goal Accuracy

Strong Defence

These tags become prompts for AI.

---

# Module 99

JSON Export

Exports

justice_ladder.json

power_rankings.json

weekly_awards.json

league_summary.json

team_profiles.json

Every Match

match_xxxxx.json

Every Team

team_xxxxx.json

Every Player

player_xxxxx.json

---

# Monday Morning Homepage

The homepage should feel like opening a football newspaper.

Sections

Story of the Round

Justice Ladder

Power Rankings

Biggest Robbery

Statement Win

Team of the Week

Most Efficient Team

Heat Check

Collapse Meter

Trending Teams

Premiership Index

Upcoming Blockbusters

Everything generated automatically.

---

# Future Metrics

The architecture must support adding new metrics without modifying existing modules.

Potential future additions

Expected Ladder History

Premiership Probability

Finals Probability

Brownlow Tracker

Coach Rating

Strength of Schedule

Injury Impact

Age Profile

Clutch Rating

Quarter Ratings

Momentum Swings

Game Control Index

Pressure Differential

Kick Quality

Turnover Punishment

Territory Dominance

Expected Inside 50 Value

Player Chemistry

Replacement Value

---

# Development Roadmap

## Phase 1

Backend Architecture

- Create folders
- Configuration
- Helpers
- Master controller
- JSON exporter

## Phase 2

Player Engine

- PIR
- Player Ratings
- Expected Score Contribution

## Phase 3

Team Engine

- Team Ratings
- Damage Per Disposal
- Unit Battles

## Phase 4

Match Engine

- Expected Scores
- Robbery Index
- Match Ratings

## Phase 5

League Engine

- Justice Ladder
- Power Rankings
- Luck Index

## Phase 6

Narrative Engine

- Team Identity
- Weekly Awards
- AI Tags

## Phase 7

Frontend Integration

- JSON validation
- Homepage
- Team pages
- Match Centre
- Player pages

---

# Success Criteria

The backend is considered complete when:

✓ Every page can be rendered from static JSON.

✓ The frontend performs no calculations.

✓ Every statistic exists in one location only.

✓ New metrics can be added by creating a new module.

✓ Weekly updates run with a single command.

✓ JSON output is AI-ready.

✓ Every Monday morning the site automatically produces new football stories instead of simply displaying statistics.
