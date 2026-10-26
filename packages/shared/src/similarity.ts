/**
 * Environmental similarity scoring
 */

export interface EnvironmentalFactors {
  city: string
  weekday: number
  hijriMonth?: number
  hijriDate?: number
  timeDistance?: number // hours
}

/**
 * Calculate similarity score between two environmental contexts
 * @param factors1 - First environmental factors
 * @param factors2 - Second environmental factors
 * @returns Similarity score (0.0 - 1.0)
 */
export function calculateSimilarityScore(
  factors1: EnvironmentalFactors,
  factors2: EnvironmentalFactors
): number {
  let score = 0
  let maxScore = 0

  // City match (weight: 1.0)
  maxScore += 1.0
  if (factors1.city === factors2.city) {
    score += 1.0
  }

  // Weekday match (weight: 0.8)
  maxScore += 0.8
  if (factors1.weekday === factors2.weekday) {
    score += 0.8
  }

  // Hijri month match (weight: 0.6)
  if (factors1.hijriMonth !== undefined && factors2.hijriMonth !== undefined) {
    maxScore += 0.6
    if (factors1.hijriMonth === factors2.hijriMonth) {
      score += 0.6
    }
  }

  // Time distance ≤ 4 hours (weight: 0.9)
  if (factors1.timeDistance !== undefined && factors2.timeDistance !== undefined) {
    maxScore += 0.9
    if (Math.abs(factors1.timeDistance - factors2.timeDistance) <= 4) {
      score += 0.9
    }
  }

  return maxScore > 0 ? score / maxScore : 0
}

/**
 * Calculate time distance in hours between two dates
 * @param date1 - First date
 * @param date2 - Second date
 * @returns Time distance in hours
 */
export function calculateTimeDistance(date1: Date, date2: Date): number {
  const diffMs = Math.abs(date1.getTime() - date2.getTime())
  return diffMs / (1000 * 60 * 60) // Convert to hours
}

/**
 * Get weekday from date (0 = Sunday, 6 = Saturday)
 * @param date - Date object
 * @returns Weekday number
 */
export function getWeekday(date: Date): number {
  return date.getDay()
}
