# AFL Narrative Engine
# Coding Standards
Version: 2.0

---

# Purpose

This document defines the coding standards for the AFL Narrative Engine backend.

The objective is to ensure:

- Every file follows the same structure
- Every function has one responsibility
- Code is readable
- Code is testable
- Code is modular
- Code is AI-friendly
- Code is easy to extend for future seasons

These standards apply to every R script in the project.

---

# Core Principles

Every piece of code should satisfy the following principles.

## 1. Readability Over Cleverness

Always write code that is easy to understand.

Avoid clever one-liners.

Bad

```r
x <- df %>% group_by(team) %>% summarise(across(everything(), mean))
```

Good

```r
team_summary <- df |>
    group_by(team) |>
    summarise(
        average_score = mean(score)
    )
```

The second example is easier to maintain.

---

## 2. One Responsibility Per Function

Every function should perform one task.

Good

calculate_expected_score()

Bad

calculate_expected_score_and_save_json()

---

## 3. Functions Should Be Predictable

Functions should:

Receive inputs

↓

Perform calculation

↓

Return output

Nothing else.

Avoid hidden side effects.

---

## 4. No Copy-Paste Programming

If code appears twice,

create a helper function.

---

## 5. Football Logic Lives in Modules

Football calculations must never exist inside

process_team_stats.R

The controller only orchestrates modules.

---

# File Naming

All filenames use

snake_case

Examples

update_data.R

process_stats.R

process_team_stats.R

player_metrics.R

expected_score.R

team_metrics.R

---

# Function Naming

Functions use

verb_noun

Examples

calculate_team_rating()

calculate_expected_score()

load_player_data()

save_json_file()

generate_weekly_awards()

Avoid

rating()

calc()

doStuff()

---

# Variable Naming

Always use descriptive names.

Good

expected_score

Bad

exp

Good

team_rating

Bad

tr

Good

rolling_average

Bad

ra

---

# Constants

Never hardcode values.

Wrong

```r
score * 0.73
```

Correct

```r
score * SCORING_WEIGHT
```

Every constant belongs inside

00_config.R

---

# File Header

Every module begins with

##########################################################
# Module
#
# Name:
#
# Purpose:
#
# Inputs:
#
# Outputs:
#
# Dependencies:
#
##########################################################

Example

##########################################################
# Module
#
# Name:
#
# Team Metrics
#
# Purpose:
#
# Calculate all team ratings
#
##########################################################

---

# Function Header

Every function requires documentation.

Example

##########################################################
# Calculate Team Rating
#
# Description:
#
# Calculates weighted team PIR.
#
# Inputs:
#
# player_data
#
# Returns:
#
# Team Rating Data Frame
#
##########################################################

calculate_team_rating <- function(player_data){

}

---

# Function Size

Maximum

50 lines

If larger,

split it.

---

# Nesting

Maximum nesting

3 levels

Bad

if

if

if

if

Good

Return early.

---

# Return Statements

One return per function.

Good

return(team_rating)

Avoid multiple exit points.

---

# Pipe Usage

Use native pipe

|>

Avoid

%>%

unless absolutely required.

---

# Assignment

Always use

<-

Never use

=

for assignment.

---

# Line Length

Maximum

100 characters

Break long expressions.

---

# Blank Lines

Separate logical sections.

Don't create giant blocks of code.

---

# Comments

Explain WHY.

Do not explain WHAT.

Bad

# add one

x <- x + 1

Good

# Normalise to league average

---

# Magic Numbers

Never.

Bad

rating * 0.63

Good

rating * MIDFIELD_WEIGHT

---

# Logging

Every module logs

Start

Finish

Execution Time

Rows Processed

Example

INFO:
Starting Team Metrics...

INFO:
Completed Team Metrics

Execution Time

1.42 seconds

---

# Error Handling

Never allow silent failures.

Use

tryCatch()

Provide meaningful errors.

Example

Unable to calculate expected score.

Missing scoring shot data.

Not

Error in x.

---

# Validation

Every module validates inputs.

Example

Required columns

team

player_id

round

PIR

If missing

Stop immediately.

---

# Data Frames

Always return tidy data.

One row

=

One observation.

---

# Sorting

Always sort output.

Never rely on random ordering.

---

# JSON

Every JSON export

Must be deterministic.

Same input

↓

Same output.

---

# JSON Formatting

Pretty formatting.

UTF-8.

Consistent field order.

---

# Performance

Avoid loops.

Prefer

dplyr

data.table

vectorised calculations.

---

# Dependencies

Only approved packages.

dplyr

tidyr

purrr

readr

jsonlite

lubridate

stringr

Avoid obscure packages.

---

# Module Dependencies

Allowed

Player

↓

Team

↓

League

Not

League

↓

Player

No circular dependencies.

---

# Testing

Every module should include

Input validation

Output validation

NA checks

Duplicate checks

Unexpected values

---

# Code Review Checklist

Before committing

✓ Functions under 50 lines

✓ No duplicated code

✓ No magic numbers

✓ Config values centralised

✓ Logging added

✓ Validation added

✓ JSON tested

✓ Naming conventions followed

✓ Comments explain WHY

✓ Outputs deterministic

---

# Project Philosophy

The AFL Narrative Engine is designed to become a long-term football intelligence platform.

Every module should be easy to understand after six months.

Every metric should have one home.

Every calculation should exist only once.

Every JSON file should be trusted.

Every function should answer one football question.

If code is difficult to understand,

rewrite it.

Readable code wins.