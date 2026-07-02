# AFL Narrative Engine
# JSON Schema Specification
Version: 2.0

---

# Purpose

This document defines every JSON file produced by the AFL Narrative Engine.

The JSON Schema is the contract between:

- R Backend
- Next.js Frontend
- Gemini AI
- Future APIs
- Future Mobile Apps

Every JSON export MUST conform to this document.

No frontend calculations should be required.

---

# JSON Design Principles

## Static

All JSON files are generated offline.

The frontend never performs calculations.

---

## Deterministic

The same inputs must always generate the same JSON.

---

## Human Readable

Use descriptive field names.

Good

expected_score

Bad

expScr

---

## snake_case

Every field uses

snake_case

Never camelCase.

---

## Numbers

Use numeric values.

Do not export formatted strings.

Correct

112.37

Wrong

"112.37"

---

## Dates

ISO 8601

Example

2026-06-21

---

## Percentages

Store as decimal values.

Correct

0.742

Display

74.2%

---

## Null Values

Use

null

Never empty strings.

---

## Arrays

Maintain consistent ordering.

Never rely on random ordering.

---

# JSON Version

Every file begins with

{
    "schema_version": "2.0",
    "generated_at": "...",
    "season": 2026,
    "round": 18
}

---

# Directory Structure

json/

    league/

    teams/

    players/

    matches/

    awards/

    narratives/

---

# league_summary.json

Purpose

Overall league statistics.

Structure

{
    "schema_version": "",

    "generated_at": "",

    "season": 2026,

    "round": 18,

    "league_average_pir": 102.3,

    "league_average_score": 84.6,

    "league_average_damage_per_disposal": 0.74,

    "league_average_conversion": 0.51,

    "highest_team_rating": {},

    "lowest_team_rating": {}
}

---

# justice_ladder.json

Purpose

Expected ladder.

Structure

{
    "teams":[
        {
            "rank":1,

            "team":"Carlton",

            "expected_wins":14.2,

            "actual_wins":12,

            "luck_index":-2.2,

            "expected_percentage":128.7,

            "power_score":118.3
        }
    ]
}

---

# power_rankings.json

{
    "teams":[
        {

            "rank":1,

            "team":"Brisbane",

            "power_score":119.2,

            "trend":"up",

            "confidence":92

        }
    ]
}

---

# weekly_awards.json

{
    "team_of_the_week":{

    },

    "player_of_the_week":{

    },

    "engine_room_of_the_week":{

    },

    "biggest_robbery":{

    },

    "statement_win":{

    },

    "most_efficient_team":{

    },

    "collapse_of_the_week":{

    }

}

---

# Team JSON

teams/carlton.json

Purpose

Everything required for the Carlton page.

Structure

{

    "team":"Carlton",

    "season":2026,

    "round":18,

    "ratings":{

        "overall":112.4,

        "attack":118.1,

        "defence":103.4,

        "midfield":110.2,

        "pressure":107.9,

        "transition":114.8

    },

    "efficiency":{

        "damage_per_disposal":0.82,

        "conversion":0.56,

        "inside_50_efficiency":0.63

    },

    "trend":{

        "last_5":114,

        "season":108,

        "direction":"up"

    },

    "luck":{

        "expected_wins":13.8,

        "actual_wins":11,

        "luck_index":-2.8

    },

    "identity":{

        "primary":"Fast Transition",

        "secondary":"Elite Pressure"

    }

}

---

# Player JSON

players/player_12345.json

{

    "player_id":12345,

    "player_name":"",

    "team":"",

    "season":2026,

    "ratings":{

        "pir":112,

        "rolling_pir":109,

        "pressure":108,

        "efficiency":103,

        "consistency":94

    },

    "expected_score_contribution":8.3,

    "games":17

}

---

# Match JSON

matches/2026_R18_CAR_SYD.json

{

    "match_id":"",

    "date":"",

    "venue":"",

    "round":18,

    "home_team":"",

    "away_team":"",

    "actual_score":{

        "home":91,

        "away":82

    },

    "expected_score":{

        "home":103,

        "away":79

    },

    "winner":"",

    "expected_winner":"",

    "robbery_index":21.8,

    "match_rating":118.2

}

---

# Unit Battles

Every match contains

{

    "engine_room":{

        "home":113,

        "away":102

    },

    "defence":{

        "home":108,

        "away":111

    },

    "forward_line":{

        "home":118,

        "away":95

    },

    "bench":{

        "home":92,

        "away":89

    }

}

---

# Narrative JSON

Purpose

AI Input.

{

    "headline":"",

    "summary":"",

    "tags":[

        "Dominated Midfield",

        "Poor Conversion",

        "Elite Pressure"

    ],

    "confidence":92

}

---

# Team Identity

Allowed values

Fast Transition

Pressure Team

Defensive Wall

Contest Specialists

Possession Team

Elite Conversion

Counter Attack

Balanced

Developing

Rebuilding

---

# Trend

Allowed values

up

down

steady

---

# Confidence

Range

0-100

Represents confidence in generated narratives.

---

# Data Types

Integer

Goals

Behinds

Games

Round

Season

Floating Point

Ratings

PIR

Expected Scores

Luck Index

Power Score

Damage Per Disposal

String

Team

Venue

Player Name

Trend

Identity

Boolean

is_home

is_final

is_top_four

---

# File Naming

League

league_summary.json

Justice Ladder

justice_ladder.json

Power Rankings

power_rankings.json

Awards

weekly_awards.json

Team

team_carlton.json

Player

player_12345.json

Match

match_2026_R18_CAR_SYD.json

---

# Schema Evolution

Rules

Never remove fields.

Only add new fields.

Deprecated fields remain for one season.

Always increase

schema_version

---

# Validation Rules

Every export must validate

✓ Required fields exist

✓ Correct data types

✓ No duplicate keys

✓ Valid UTF-8

✓ Valid JSON

✓ Sorted arrays

✓ No missing team names

✓ No missing player IDs

✓ Schema version included

---

# Future JSON

Reserved

draft_tracker.json

brownlow_tracker.json

injury_report.json

coach_rankings.json

premiership_index.json

historical_snapshots.json

quarter_ratings.json

momentum_analysis.json

player_similarity.json

expected_ladder_history.json

prediction_models.json