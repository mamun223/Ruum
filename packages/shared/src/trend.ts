/**
 * Same-day trend detection.
 *
 * Each piece of evidence is a completed match from today (same country /
 * same tournament) that matches the target's remainder pattern. Its outcome
 * says whether the player with the BIGGER or SMALLER remainder won.
 *
 * Rule: the first result sets the trend. The trend holds until
 * TREND_SWITCH_THRESHOLD consecutive results go the other way, at which point
 * the trend switches to that direction.
 */

export type TrendOutcome = 'BIGGER' | 'SMALLER'

export const TREND_SWITCH_THRESHOLD = 3

export interface TrendEvidence {
  outcome: TrendOutcome
  weight: number
}

export interface TrendAnalysis<T extends TrendEvidence = TrendEvidence> {
  /** Current trend direction, null when there is no evidence */
  direction: TrendOutcome | null
  /** Number of times the trend has switched today */
  switches: number
  /** Consecutive latest results against the current trend (switch at threshold) */
  pendingOpposite: number
  /** Evidence since the current trend started (chronological) */
  segment: T[]
  /** Weighted % of the current segment agreeing with the trend (0-100) */
  support: number
}

/**
 * Analyze chronologically ordered evidence (oldest first)
 */
export function analyzeTrend<T extends TrendEvidence>(evidence: T[]): TrendAnalysis<T> {
  let direction: TrendOutcome | null = null
  let switches = 0
  let segment: T[] = []
  let opposite: T[] = []

  for (const item of evidence) {
    if (direction === null) {
      direction = item.outcome
      segment = [item]
      continue
    }

    if (item.outcome === direction) {
      opposite = []
      segment.push(item)
      continue
    }

    opposite.push(item)
    segment.push(item)

    if (opposite.length >= TREND_SWITCH_THRESHOLD) {
      direction = item.outcome
      switches++
      segment = opposite
      opposite = []
    }
  }

  const total = segment.reduce((sum, e) => sum + e.weight, 0)
  const agreeing = segment
    .filter(e => e.outcome === direction)
    .reduce((sum, e) => sum + e.weight, 0)

  return {
    direction,
    switches,
    pendingOpposite: opposite.length,
    segment,
    support: total === 0 ? 0 : (agreeing / total) * 100,
  }
}
