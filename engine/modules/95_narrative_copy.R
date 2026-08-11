##########################################################
# Module
#
# Name:
#
# Narrative Copy & Chart Data
#
# Purpose:
#
# Turn story_hooks (90_narratives.R) into publish-ready article content:
# journalist-style prose paragraphs plus chart specs, one row per team,
# fully assembled at build time so the Next.js frontend does zero
# client-side calculation - it just maps over `blocks`.
#
# This is a deterministic, rule-based writer - a stand-in for the
# eventual downstream LLM the pipeline is ultimately meant to feed.
# Every sentence is a direct read of a number already sitting in a
# hook's supporting_stats, and every chart spec plots real values from
# the same source - nothing here is invented or inferred beyond what
# story_hooks already contains.
#
# Inputs:
#
# story_hooks   - Output of generate_narrative_summaries()$story_hooks
#                 (90_narratives.R): tibble of {team, angle, priority,
#                 supporting_stats}.
# max_blocks    - Cap on theme-blocks (paragraph + chart pairs) per team.
#                 Keeps the write-up tight rather than a stat dump.
#
# Outputs:
#
# tibble of:
#   team          - character
#   lead_priority - double, the team's highest-priority hook value
#   lead_tone     - character, 'brass' | 'oxblood' | 'fern' | 'slate'
#   stamps        - list-column, list(list(label=, tone=), ...)
#   blocks        - list-column, ordered list of
#                   list(type = "paragraph", text = ...) and
#                   list(type = "chart", chart = list(type = ..., ...))
#
# Dependencies:
#
# 00_config.R, 01_helpers.R
#
##########################################################
library(dplyr)
library(tibble)
library(purrr)

##########################################################
# Internal Helper: %||%
##########################################################
`%||%` <- function(a, b) if (is.null(a) || (length(a) == 1 && is.na(a))) b else a

# Theme grouping - same convention as 90_narratives.R's hook angles. Only
# the highest-priority hook per theme survives per team; this is what
# stops e.g. "overplaced" and "riding_the_breaks" (both real, both about
# the same team) from producing two paragraphs that repeat one number.
NARRATIVE_THEME_OF <- c(
    robbery_beneficiary      = "robbery",
    robbery_victim           = "robbery",
    comeback_win             = "momentum",
    surrendered_lead         = "momentum",
    snakebitten              = "luck",
    riding_the_breaks        = "luck",
    form_vs_luck_divergence  = "form",
    buried_by_others_luck    = "ladder_luck",
    overplaced               = "ladder_luck",
    justice_rank_climb       = "movement",
    justice_rank_fall        = "movement",
    home_road_split          = "split",
    hot_streak               = "streak",
    cold_streak              = "streak"
)

# Paragraph order - leads with this week's news, then season-long
# identity, then supporting colour.
NARRATIVE_THEME_ORDER <- c("robbery", "momentum", "luck", "form", "ladder_luck", "movement", "split", "streak")

##########################################################
# Internal Helper: ordinal_r / signed_r / possessive_r
##########################################################
ordinal_r <- function(n) {
    n <- round(n)
    v <- n %% 100
    suffix <- if (v %in% 11:13) "th" else switch(as.character(n %% 10), "1" = "st", "2" = "nd", "3" = "rd", "th")
    paste0(n, suffix)
}

signed_r <- function(n, decimals = 1) {
    v <- round(n, decimals)
    if (v > 0) paste0("+", v) else as.character(v)
}

# Most AFL club names are already plural (Swans, Giants, Bulldogs, Eagles...)
# so a bare "'s" reads as a typo ("Swans's"). Trailing-s names just get
# the apostrophe.
possessive_r <- function(team) {
    if (grepl("s$", team)) paste0(team, "'") else paste0(team, "'s")
}

##########################################################
# Internal Helper: stamp_for
##########################################################
stamp_for <- function(angle, s) {
    switch(angle,
        robbery_beneficiary     = list(label = "Robbed the Result", tone = "brass"),
        robbery_victim          = list(label = "Robbed Blind", tone = "oxblood"),
        snakebitten              = list(label = "Snakebitten", tone = "oxblood"),
        riding_the_breaks        = list(label = "Riding the Breaks", tone = "brass"),
        buried_by_others_luck     = list(label = "Buried by Others' Luck", tone = "oxblood"),
        overplaced                 = list(label = "Overplaced", tone = "oxblood"),
        form_vs_luck_divergence     = if (identical(s$direction, "outperforming_ladder")) {
            list(label = "Outperforming the Ladder", tone = "fern")
        } else {
            list(label = "Underperforming the Ladder", tone = "oxblood")
        },
        home_road_split               = list(label = "Home/Road Split", tone = "slate"),
        hot_streak                     = list(label = "Hot Streak", tone = "fern"),
        cold_streak                     = list(label = "Cold Streak", tone = "oxblood"),
        justice_rank_climb               = list(label = "Climbing the Ladder", tone = "fern"),
        justice_rank_fall                 = list(label = "Falling Fast", tone = "oxblood"),
        comeback_win                        = list(label = "Comeback Win", tone = "fern"),
        surrendered_lead                     = list(label = "Surrendered the Lead", tone = "oxblood"),
        list(label = angle, tone = "slate")
    )
}

##########################################################
# Internal Helper: paragraph_for
#
# Writes one paragraph for a hook. by_angle is every OTHER hook for the
# same team, keyed by angle, so the robbery/comeback paragraphs can pull
# in the team's own season-long number when the pattern compounds,
# instead of asserting a pattern with no figure behind it.
##########################################################
paragraph_for <- function(angle, s, team, by_angle) {
    switch(angle,
        robbery_beneficiary = {
            is_home <- identical(s$home_team, team)
            own_score <- if (is_home) s$home_score else s$away_score
            opp_score <- if (is_home) s$away_score else s$home_score
            own_x <- if (is_home) s$home_xscore else s$away_xscore
            opp_x <- if (is_home) s$away_xscore else s$home_xscore
            margin <- round(opp_x - own_x, 1)
            season <- by_angle[["riding_the_breaks"]]
            season_note <- if (isTRUE(s$compounds_with_season_pattern) && !is.null(season)) {
                sprintf(
                    " It's part of a pattern - %s are running at %s for the season, one of the friendlier bounces of the ball in the competition.",
                    team, signed_r(season$Luck_Rating)
                )
            } else {
                ""
            }
            sprintf(
                "Round %s was daylight robbery. %s beat %s %s-%s despite trailing the expected-score model by %s points.%s",
                s$round, team, s$opponent, own_score, opp_score, margin, season_note
            )
        },
        robbery_victim = {
            is_home <- identical(s$home_team, team)
            own_score <- if (is_home) s$home_score else s$away_score
            opp_score <- if (is_home) s$away_score else s$home_score
            own_x <- if (is_home) s$home_xscore else s$away_xscore
            opp_x <- if (is_home) s$away_xscore else s$home_xscore
            margin <- round(own_x - opp_x, 1)
            season <- by_angle[["snakebitten"]]
            season_note <- if (isTRUE(s$compounds_with_season_pattern) && !is.null(season)) {
                sprintf(
                    " It's the season in miniature - %s sit at %s for the year, one of the least fortunate ledgers in the league.",
                    team, signed_r(season$Luck_Rating)
                )
            } else {
                ""
            }
            sprintf(
                "Round %s went the other way. %s lost to %s %s-%s after the model had them up by %s points on expected score.%s",
                s$round, team, s$opponent, opp_score, own_score, margin, season_note
            )
        },
        snakebitten = sprintf(
            "%s have been one of the competition's unluckiest sides this season - %s points on the board against a model-expected %s, a shortfall of %s (%s a game).",
            team, s$Actual_Points, s$Expected_Points, abs(s$Luck_Rating), signed_r(s$Luck_Rating_Per_Game)
        ),
        riding_the_breaks = sprintf(
            "%s have had the rub of the green all year - %s actual points against a model-expected %s, a cushion of %s (%s a game).",
            team, s$Actual_Points, s$Expected_Points, signed_r(s$Luck_Rating), signed_r(s$Luck_Rating_Per_Game)
        ),
        buried_by_others_luck = sprintf(
            "By the Justice Ladder's reckoning %s should sit %s - %s spots better than their actual %s, buried by results elsewhere going against them.",
            team, ordinal_r(s$Justice_Rank), abs(s$Rank_Delta), ordinal_r(s$Actual_Rank)
        ),
        overplaced = sprintf(
            "%s %s spot on the real ladder flatters them - strip the luck out and the model has them %s, %s places lower.",
            possessive_r(team), ordinal_r(s$Actual_Rank), ordinal_r(s$Justice_Rank), abs(s$Rank_Delta)
        ),
        form_vs_luck_divergence = if (identical(s$direction, "outperforming_ladder")) {
            sprintf(
                "The performances say more than the ladder does: %s rank %s in the league on underlying output, well clear of their %s-placed ladder spot, and the trend is %s.",
                team, ordinal_r(s$power_rank), ordinal_r(s$ladder_position), tolower(s$power_trend)
            )
        } else {
            sprintf(
                "%s sit %s on the ladder, but their underlying output only ranks %s - the form hasn't caught up to the results, and the trend is %s.",
                team, ordinal_r(s$ladder_position), ordinal_r(s$power_rank), tolower(s$power_trend)
            )
        },
        home_road_split = sprintf(
            "There's a real venue split in %s season - a luck index of %s at home against %s on the road.",
            possessive_r(team), signed_r(s$Home_Luck_Rating), signed_r(s$Away_Luck_Rating)
        ),
        hot_streak = sprintf(
            "%s have turned it on lately - their luck index over the last %s games is running at %s, well above their season rate of %s a game.",
            team, s$Rolling_Games, signed_r(s$Rolling_Luck_Rating), signed_r(s$Season_Luck_Rating_Per_Game)
        ),
        cold_streak = sprintf(
            "%s form has cooled - their luck index over the last %s games sits at %s, well below their season rate of %s a game.",
            possessive_r(team), s$Rolling_Games, signed_r(s$Rolling_Luck_Rating), signed_r(s$Season_Luck_Rating_Per_Game)
        ),
        justice_rank_climb = sprintf(
            "%s climbed %s spots on the Justice Ladder this week, up to %s from %s.",
            team, abs(s$Justice_Rank_Movement), ordinal_r(s$Justice_Rank), ordinal_r(s$Justice_Rank_Prev)
        ),
        justice_rank_fall = sprintf(
            "%s slid %s spots on the Justice Ladder this week, down to %s from %s.",
            team, abs(s$Justice_Rank_Movement), ordinal_r(s$Justice_Rank), ordinal_r(s$Justice_Rank_Prev)
        ),
        comeback_win = sprintf(
            "%s came from %s points down to beat %s %s-%s in Round %s.",
            team, s$biggest_deficit_overcome, s$opponent, s$home_score, s$away_score, s$round
        ),
        surrendered_lead = sprintf(
            "%s led %s by %s points in Round %s and still finished up losing %s-%s.",
            team, s$opponent, s$lead_surrendered, s$round, s$home_score, s$away_score
        ),
        ""
    )
}

##########################################################
# Internal Helper: chart_for
#
# Every chart is the same visual grammar - a two-point comparison on a
# shared scale - except momentum, which is a single-number spotlight.
# That consistency is deliberate: the frontend renders every
# "compare_track" chart with ONE reusable component (see CompareTrack in
# teams.tsx), just re-scaled per subtype. brass = the model/deserved/
# baseline number, parchment = the real-world number, matching the
# Expected/Actual convention already used by the Justice Ladder page's
# PointsBar component.
##########################################################
chart_for <- function(angle, s, team) {
    switch(angle,
        robbery_beneficiary = ,
        robbery_victim = {
            is_home <- identical(s$home_team, team)
            own_score <- if (is_home) s$home_score else s$away_score
            opp_score <- if (is_home) s$away_score else s$home_score
            own_x <- if (is_home) s$home_xscore else s$away_xscore
            opp_x <- if (is_home) s$away_xscore else s$home_xscore
            actual_margin <- own_score - opp_score
            expected_margin <- round(own_x - opp_x, 1)
            bound <- round(max(abs(actual_margin), abs(expected_margin), 1) * 1.25, 1)
            list(
                type = "compare_track", subtype = "diverging", min = -bound, max = bound,
                markerA = list(label = "Expected Margin", value = expected_margin, tone = "brass"),
                markerB = list(label = "Actual Margin", value = actual_margin, tone = "parchment"),
                footnote = sprintf("%s vs %s, Round %s", team, s$opponent, s$round)
            )
        },
        snakebitten = ,
        riding_the_breaks = list(
            type = "compare_track", subtype = "points",
            min = 0, max = round(max(s$Expected_Points, s$Actual_Points, 1) * 1.15, 1),
            markerA = list(label = "Model Expected", value = s$Expected_Points, tone = "brass"),
            markerB = list(label = "Actual", value = s$Actual_Points, tone = "parchment")
        ),
        buried_by_others_luck = ,
        overplaced = list(
            type = "compare_track", subtype = "rank", min = 1, max = 18, invert = TRUE,
            markerA = list(label = "Justice Rank", value = s$Justice_Rank, tone = "brass"),
            markerB = list(label = "Actual Rank", value = s$Actual_Rank, tone = "parchment")
        ),
        form_vs_luck_divergence = list(
            type = "compare_track", subtype = "rank", min = 1, max = 18, invert = TRUE,
            markerA = list(label = "Underlying Form Rank", value = s$power_rank, tone = "brass"),
            markerB = list(label = "Ladder Position", value = s$ladder_position, tone = "parchment")
        ),
        justice_rank_climb = ,
        justice_rank_fall = list(
            type = "compare_track", subtype = "rank", min = 1, max = 18, invert = TRUE,
            markerA = list(label = "Previous Rank", value = s$Justice_Rank_Prev, tone = "brass"),
            markerB = list(label = "Current Rank", value = s$Justice_Rank, tone = "parchment")
        ),
        home_road_split = {
            bound <- round(max(abs(s$Home_Luck_Rating), abs(s$Away_Luck_Rating), 1) * 1.25, 1)
            list(
                type = "compare_track", subtype = "diverging", min = -bound, max = bound,
                markerA = list(label = "Home", value = s$Home_Luck_Rating, tone = "brass"),
                markerB = list(label = "Away", value = s$Away_Luck_Rating, tone = "parchment")
            )
        },
        hot_streak = ,
        cold_streak = {
            expected_rolling <- round(s$Season_Luck_Rating_Per_Game * s$Rolling_Games, 1)
            bound <- round(max(abs(expected_rolling), abs(s$Rolling_Luck_Rating), 1) * 1.25, 1)
            list(
                type = "compare_track", subtype = "diverging", min = -bound, max = bound,
                markerA = list(label = "Expected Pace", value = expected_rolling, tone = "brass"),
                markerB = list(label = sprintf("Last %s Games", s$Rolling_Games), value = s$Rolling_Luck_Rating, tone = "parchment")
            )
        },
        comeback_win = list(
            type = "stat_spotlight", value = s$biggest_deficit_overcome, unit = "PTS",
            caption = sprintf("Deficit overcome vs %s, Round %s", s$opponent, s$round)
        ),
        surrendered_lead = list(
            type = "stat_spotlight", value = s$lead_surrendered, unit = "PTS",
            caption = sprintf("Lead surrendered vs %s, Round %s", s$opponent, s$round)
        ),
        NULL
    )
}

##########################################################
# Generate Narrative Copy
##########################################################
generate_narrative_copy <- function(story_hooks, max_blocks = 3) {
    message("INFO: Starting Narrative Copy & Chart Data...")

    if (nrow(story_hooks) == 0) {
        message("INFO: Completed Narrative Copy & Chart Data - 0 team(s), no hooks available")
        return(tibble(
            team = character(), lead_priority = double(), lead_tone = character(),
            stamps = list(), blocks = list()
        ))
    }

    teams <- unique(story_hooks$team)

    rows <- map(teams, function(tm) {
        team_hooks <- story_hooks |> filter(team == tm) |> arrange(desc(priority))

        # Highest-priority hook per theme survives (see NARRATIVE_THEME_OF).
        by_theme <- list()
        for (i in seq_len(nrow(team_hooks))) {
            angle <- team_hooks$angle[i]
            theme <- NARRATIVE_THEME_OF[[angle]] %||% angle
            candidate <- list(angle = angle, priority = team_hooks$priority[i], stats = team_hooks$supporting_stats[[i]])
            existing <- by_theme[[theme]]
            if (is.null(existing) || candidate$priority > existing$priority) by_theme[[theme]] <- candidate
        }

        # Lookup by angle (not theme) for cross-referencing within a
        # paragraph - e.g. robbery_beneficiary pulling in riding_the_breaks.
        by_angle <- list()
        for (i in seq_len(nrow(team_hooks))) {
            by_angle[[team_hooks$angle[i]]] <- team_hooks$supporting_stats[[i]]
        }

        ordered_themes <- Filter(function(t) !is.null(by_theme[[t]]), NARRATIVE_THEME_ORDER)
        ordered_themes <- head(ordered_themes, max_blocks)

        blocks <- list()
        stamps <- list()
        for (theme in ordered_themes) {
            entry <- by_theme[[theme]]
            s <- entry$stats

            text <- paragraph_for(entry$angle, s, tm, by_angle)
            if (nzchar(text)) blocks[[length(blocks) + 1]] <- list(type = "paragraph", text = text)

            chart <- chart_for(entry$angle, s, tm)
            if (!is.null(chart)) blocks[[length(blocks) + 1]] <- list(type = "chart", chart = chart)

            stamps[[length(stamps) + 1]] <- stamp_for(entry$angle, s)
        }

        lead_row <- team_hooks[1, ]
        lead_stamp <- stamp_for(lead_row$angle, lead_row$supporting_stats[[1]])

        tibble(
            team          = tm,
            lead_priority = lead_row$priority,
            lead_tone     = lead_stamp$tone,
            stamps        = list(stamps),
            blocks        = list(blocks)
        )
    })

    result <- bind_rows(rows) |> arrange(desc(lead_priority))

    message("INFO: Completed Narrative Copy & Chart Data - ", nrow(result), " team(s)")
    result
}