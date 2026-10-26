# Tennis Prediction Formula Specification

## Overview

This specification defines the mathematical formula for tennis match predictions based on player name analysis, historical evidence, and environmental factors.

## Formula Version: 1.0
## Engine Version: 1.0

---

## Step 1: Name Resolution

### Input
- Player 1 name (string)
- Player 2 name (string)

### Process
1. Look up player name in approved NameMapping database
2. Retrieve Arabic meaning for each player
3. Calculate Abjad value for each Arabic meaning

### Abjad Calculation
- Assign numeric values to Arabic letters:
  - ا = 1, ب = 2, ج = 3, د = 4, ه = 5, و = 6, ز = 7, ح = 8, ط = 9
  - ي = 10, ك = 20, ل = 30, م = 40, ن = 50, س = 60, ع = 70, ف = 80, ص = 90
  - ق = 100, ر = 200, ش = 300, ت = 400, ث = 500, خ = 600, ذ = 700, ض = 800, ظ = 900, غ = 1000

- Sum all letter values to get total Abjad value

### Output
- Player 1 Abjad value (integer)
- Player 2 Abjad value (integer)

---

## Step 2: Remainder Calculation

### Input
- Player 1 Abjad value
- Player 2 Abjad value

### Process
1. Calculate remainder for each player: `AbjadValue % 7`
2. Valid remainders: 0, 1, 2, 3, 4, 5, 6
3. If remainder is 0, treat as 7

### Output
- Player 1 remainder (1-7)
- Player 2 remainder (1-7)
- Remainder pair: e.g., (3, 5)

---

## Step 3: Structural Classification

### Input
- Remainder pair (r1, r2)

### Process

#### Odd/Even Classification
- Player 1 odd: `r1 % 2 !== 0`
- Player 2 odd: `r2 % 2 !== 0`

#### Bigger/Smaller Classification
- If `r1 > r2`: bigger = player1
- If `r2 > r1`: bigger = player2
- If `r1 === r2`: bigger = equal

### Output
- Structural class object:
  ```json
  {
    "player1Odd": boolean,
    "player2Odd": boolean,
    "biggerRemainder": "player1" | "player2" | "equal"
  }
  ```

---

## Step 4: Historical Evidence Search

### Input
- Remainder pair (r1, r2)
- Structural class
- Match environment (city, weekday, Hijri month/date, time)

### Process

#### Exact Pair Search
1. Query HistoricalEvidence for matches with same remainder pair (r1, r2)
2. Filter by environmental similarity:
   - Same city: 100% weight
   - Same weekday: 80% weight
   - Same Hijri month: 60% weight
   - Time distance ≤ 4 hours: 90% weight

#### Structural Class Search
1. Query HistoricalEvidence for matches with same structural class
2. Apply same environmental filters

#### Similarity Score Calculation
For each historical match:
```
similarityScore = (
  (cityMatch ? 1.0 : 0.0) * 1.0 +
  (weekdayMatch ? 1.0 : 0.0) * 0.8 +
  (hijriMonthMatch ? 1.0 : 0.0) * 0.6 +
  (timeDistance ≤ 4h ? 1.0 : 0.0) * 0.9
) / 4
```

### Output
- Array of historical evidence with similarity scores
- Sample size (number of matching matches)

---

## Step 5: Prediction Generation

### Input
- Historical evidence array
- Sample size
- Similarity scores

### Process

#### Evidence Aggregation
1. Group evidence by winner (player1 or player2)
2. Calculate weighted win rate:
   ```
   player1Weight = sum(evidence where winner=player1, similarityScore)
   player2Weight = sum(evidence where winner=player2, similarityScore)
   totalWeight = player1Weight + player2Weight
   ```

#### Prediction Strength Calculation
- **Strong**: sample size ≥ 10 AND agreement ≥ 80%
- **Moderate**: sample size ≥ 5 AND agreement ≥ 60%
- **Weak**: sample size ≥ 3 AND agreement ≥ 55%
- **No Prediction**: sample size < 3 OR agreement < 55%

#### Agreement Calculation
```
agreement = max(player1Weight, player2Weight) / totalWeight * 100
```

### Output
- Predicted winner: player with higher weighted score
- Strength: STRONG | MODERATE | WEAK | NO_PREDICTION
- Evidence array with similarity scores

---

## Step 6: Prediction Freezing

### Input
- Prediction object
- Current time

### Process
1. Set `frozenAt` timestamp
2. Lock prediction - no further modifications allowed
3. Store in database

### Output
- Frozen prediction record

---

## Step 7: Result Verification

### Input
- Match ID
- Actual winner

### Process
1. Update match status to COMPLETED
2. Record actual winner
3. Compare with predicted winner
4. Calculate prediction accuracy
5. Add completed match to HistoricalEvidence database

### Output
- Updated match record
- New historical evidence entry
- Accuracy metrics

---

## Environmental Factors

### City
- Full city name (e.g., "Melbourne", "London")
- Used for exact matching

### Weekday
- Integer 0-6 (Sunday=0, Monday=1, ..., Saturday=6)
- Used for similarity scoring

### Hijri Month
- Integer 1-12
- Optional factor for Islamic calendar correlation

### Hijri Date
- Integer 1-30
- Optional factor for Islamic calendar correlation

### Time Distance
- Hours difference between match times
- Threshold: ≤ 4 hours for high similarity

---

## Version Control

### Formula Version
- Increment when mathematical rules change
- Example: 1.0 → 1.1 (if remainder calculation changes)

### Engine Version
- Increment when implementation changes
- Example: 1.0 → 1.1 (if search algorithm improves)

### Name Dictionary Version
- Increment when name mappings are updated
- Example: 4 → 5 (when new players are added)

---

## Edge Cases

### Unknown Player Names
- If player not in NameMapping: return NO_PREDICTION
- Log missing name for manual review

### Equal Remainders
- If r1 === r2: use structural class only
- If structural class also equal: return NO_PREDICTION

### Insufficient Historical Data
- If sample size < 3: return NO_PREDICTION
- Continue collecting data until threshold met

### Conflicting Evidence
- If evidence shows contradictory patterns: reduce strength
- Apply contradiction penalty to similarity scores

---

## Performance Metrics

### Accuracy Tracking
- Track prediction accuracy by:
  - Formula version
  - Prediction strength
  - Environmental factors
  - Time period

### Calibration
- Regularly review accuracy metrics
- Adjust weight factors based on statistical evidence
- Update formula version when rules change

---

## Implementation Notes

### Calculation Order
1. Name resolution → Abjad values
2. Remainder calculation
3. Structural classification
4. Historical search
5. Evidence aggregation
6. Prediction generation
7. Prediction freezing

### Database Queries
- Use indexed fields for efficient searches
- Batch queries for multiple matches
- Cache frequently accessed name mappings

### Error Handling
- Validate all inputs before calculation
- Log calculation steps for debugging
- Return NO_PREDICTION on any error
