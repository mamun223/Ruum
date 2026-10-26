/**
 * Prediction strength calculation
 */

export type PredictionStrength = 'STRONG' | 'MODERATE' | 'WEAK' | 'NO_PREDICTION'

export interface Evidence {
  winner: string
  similarityScore: number
}

/**
 * Calculate prediction strength based on evidence
 * @param evidence - Array of historical evidence
 * @returns Prediction strength
 */
export function calculatePredictionStrength(evidence: Evidence[]): PredictionStrength {
  const sampleSize = evidence.length

  if (sampleSize < 3) {
    return 'NO_PREDICTION'
  }

  // Calculate weighted agreement
  const player1Weight = evidence
    .filter(e => e.winner === 'player1')
    .reduce((sum, e) => sum + e.similarityScore, 0)

  const player2Weight = evidence
    .filter(e => e.winner === 'player2')
    .reduce((sum, e) => sum + e.similarityScore, 0)

  const totalWeight = player1Weight + player2Weight

  if (totalWeight === 0) {
    return 'NO_PREDICTION'
  }

  const agreement = Math.max(player1Weight, player2Weight) / totalWeight * 100

  // Strength thresholds
  if (sampleSize >= 10 && agreement >= 80) {
    return 'STRONG'
  }

  if (sampleSize >= 5 && agreement >= 60) {
    return 'MODERATE'
  }

  if (sampleSize >= 3 && agreement >= 55) {
    return 'WEAK'
  }

  return 'NO_PREDICTION'
}

/**
 * Determine predicted winner from evidence
 * @param evidence - Array of historical evidence
 * @returns Predicted winner ('player1' or 'player2') or null
 */
export function determinePredictedWinner(evidence: Evidence[]): 'player1' | 'player2' | null {
  const player1Weight = evidence
    .filter(e => e.winner === 'player1')
    .reduce((sum, e) => sum + e.similarityScore, 0)

  const player2Weight = evidence
    .filter(e => e.winner === 'player2')
    .reduce((sum, e) => sum + e.similarityScore, 0)

  if (player1Weight > player2Weight) {
    return 'player1'
  }

  if (player2Weight > player1Weight) {
    return 'player2'
  }

  return null // Tie
}

/**
 * Calculate agreement percentage
 * @param evidence - Array of historical evidence
 * @returns Agreement percentage (0-100)
 */
export function calculateAgreement(evidence: Evidence[]): number {
  const player1Weight = evidence
    .filter(e => e.winner === 'player1')
    .reduce((sum, e) => sum + e.similarityScore, 0)

  const player2Weight = evidence
    .filter(e => e.winner === 'player2')
    .reduce((sum, e) => sum + e.similarityScore, 0)

  const totalWeight = player1Weight + player2Weight

  if (totalWeight === 0) {
    return 0
  }

  return Math.max(player1Weight, player2Weight) / totalWeight * 100
}
