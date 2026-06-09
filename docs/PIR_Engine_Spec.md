# Player Impact Rating (PIR) - Engine Specification

This document details the data mapping, weights, and processing logic required to compute the uncapped **Player Impact Rating (PIR)**. 

The formula is designed to scale organically without an artificial ceiling. A standard contribution maps to roughly **50–99 points**, an excellent performance reaches **120–150 points**, and a once-in-a-decade masterclass targets a ceiling of **200–250+ points**.

---

## 1. Core Mathematical Principle

To protect injured players or late-game substitutes from being unfairly penalized for errors they didn't have time to make, the calculations must be cleanly separated into positive and negative components. **The Time on Ground (TOG) modifier must only ever be applied to positive impacts.**

$$PIR_{Final} = (PIR_{Positive} \times TOG_{Modifier}) - PIR_{Negative}$$

---

## 2. Statistical Weights & Mapping Table

This table maps every available performance variable from the `fitzRoy` / `afl.com.au` dataset. 

> ⚠️ **Implementation Guardrails for Kilocode:**
> * **Clearances:** Do not add `clearances.totalClearances` if you are already adding `centreClearances` and `stoppageClearances` separately. Choose one approach to avoid double-counting.
> * **Pressure:** `extendedStats.defHalfPressureActs` represents a high-value subset of total pressure. Both can be safely added using the separate weights below.
> * **Volume Ignored:** Pure sample size or environment variables (e.g., `interchangeCounts`, `totalPossessions`, `gamesPlayed`, `extendedStats.ruckContests`) carry a weight of **0.0** and are excluded from the mathematical calculation.

| Category | API Variable Field | PIR Weight | Engine Logic / Subgroup |
| :--- | :--- | :--- | :--- |
| **Territory & Disposal** | `kicks` | **+2.0** | Positive Base (Disposal Subgroup) |
| | `handballs` | **+1.0** | Positive Base (Disposal Subgroup) |
| | `metresGained` | **+0.05** | Positive Base (100m = 5.0 pts) |
| | `bounces` | **+1.5** | Positive Base |
| | `extendedStats.kickins` | **+0.5** | Positive Base |
| | `extendedStats.kickinsPlayon` | **+1.0** | Positive Base (Extra credit for run-and-gun) |
| **Contest & Clearance** | `contestedPossessions` | **+4.0** | Positive Base (The Engine Room Engine) |
| | `uncontestedPossessions` | **+0.5** | Positive Base |
| | `clearances.centreClearances` | **+6.0** | Positive Base (Highest clearance value) |
| | `clearances.stoppageClearances` | **+4.5** | Positive Base |
| | `contestedMarks` | **+8.0** | Positive Base (High momentum spike) |
| | `marks` | **+1.0** | Positive Base |
| | `marksInside50` | **+4.0** | Positive Base |
| | `extendedStats.marksOnLead` | **+2.5** | Positive Base (Forward work rate) |
| | `extendedStats.groundBallGets` | **+2.0** | Positive Base |
| | `extendedStats.f50GroundBallGets` | **+4.0** | Positive Base (Elite small forward reward) |
| **Damaging Impact** | `goals` | **+15.0** | Positive Base (Scoreboard Ultimate) |
| | `behinds` | **+2.0** | Positive Base |
| | `goalAssists` | **+8.0** | Positive Base (Unselfish playmaking) |
| | `scoreInvolvements` | **+3.0** | Positive Base |
| | `extendedStats.scoreLaunches` | **+6.0** | Positive Base (Originating the chain) |
| **Defensive Grit** | `tackles` | **+3.0** | Positive Base |
| | `tacklesInside50` | **+5.0** | Positive Base |
| | `extendedStats.defHalfPressureActs` | **+1.0** | Positive Base |
| | `extendedStats.pressureActs` | **+0.5** | Positive Base |
| | `onePercenters` | **+2.0** | Positive Base |
| | `extendedStats.spoils` | **+3.0** | Positive Base (Key Defender Lifeline) |
| | `intercepts` | **+5.0** | Positive Base |
| | `extendedStats.interceptMarks` | **+4.0** | Positive Base |
| **Ruck Work**| `hitouts` | **+0.2** | Positive Base (Ruck Subgroup) |
| | `extendedStats.hitoutsToAdvantage` | **+5.0** | Positive Base (Elite silver service) |
| **Negative Drag** | `clangers` | **-5.0** | Negative Drag (**Do Not Scale**) |
| | `turnovers` | **-3.0** | Negative Drag (**Do Not Scale**) |
| | `freesAgainst` | **-4.0** | Negative Drag (**Do Not Scale**) |
| | `extendedStats.contestDefLosses` | **-4.0** | Negative Drag (**Do Not Scale**) |

---

## 3. Advanced Integration Rules & Variable Modifiers

### Rule A: The Time On Ground (TOG) Variable Logic
* **API Variable:** `timeOnGroundPercentage`
* **Target Benchmark:** **80% TOG**. Any player who records a `timeOnGroundPercentage` of 80.0% or higher receives a fixed modifier of **1.0** (no adjustment).
* **The Cameo Floor:** To prevent early injuries (e.g., 2% TOG) from creating massive, system-breaking multipliers, the mathematical floor value inside the equation is strictly capped at **15%**.
* **The Scaling Curve Multiplier (Under 80% TOG):**
  $$\text{TOG Modifier} = 1.0 + \left(\frac{80.0 - \max(\text{timeOnGroundPercentage}, 15.0)}{100}\right) \times 0.7$$
  *(Note: The `0.7` is a dampening coefficient. It accounts for fatigue, meaning we don't assume a short-burst cameo outputs statistics perfectly linearly over a full match).*

### Rule B: Dynamic Efficiency Modifiers (Precision Scale)
To stop high-volume "stat-stuffing" from inflating scores without real-world match impact, Kilocode should route the raw disposal and ruck outputs through these efficiency scales:

1. **Disposal Precision Scaling:** Take the raw score generated from the Disposal Subgroup (`kicks` + `handballs`), and scale it dynamically by the player's overall efficiency.
   $$\text{Disposal Score} = \left((\text{kicks} \times 2.0) + (\text{handballs} \times 1.0)\right) \times \left(\frac{\text{disposalEfficiency}}{100}\right)$$
2. **Ruck Efficiency Scaling:** Take the raw volume score generated by hitting the ball out, and scale it by how effective those taps actually were.
   $$\text{Hitout Score} = (\text{hitouts} \times 0.2) \times \left(\frac{\text{extendedStats.hitoutToAdvantageRate}}{100}\right)$$

---

## 4. Live Engine Tiers
For the user-facing UI, chat rooms, and application feeds, the calculated PIR value should map straight to these descriptive narrative tiers:

* **PIR < 50:** Quiet / Staggered / Inefficient day out.
* **PIR 50 – 99:** Standard, reliable contribution.
* **PIR 100 – 149:** Game Changer. High-impact performance.
* **PIR 150 – 199:** Match Winner. Clear Best On Ground (BOG) favorite.
* **PIR 200+:** The Immortal Zone. Once-in-a-decade historic masterclass.