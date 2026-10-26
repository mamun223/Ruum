/**
 * Structural classification for remainder pairs
 */

export interface StructuralClass {
  player1Odd: boolean
  player2Odd: boolean
  biggerRemainder: 'player1' | 'player2' | 'equal'
}

export interface RemainderPair {
  player1Remainder: number
  player2Remainder: number
}

/**
 * Classify remainder pair structurally
 * @param r1 - Player 1 remainder (1-7)
 * @param r2 - Player 2 remainder (1-7)
 * @returns Structural classification
 */
export function classifyStructural(r1: number, r2: number): StructuralClass {
  return {
    player1Odd: r1 % 2 !== 0,
    player2Odd: r2 % 2 !== 0,
    biggerRemainder: r1 > r2 ? 'player1' : r2 > r1 ? 'player2' : 'equal'
  }
}

/**
 * Check if two structural classes match
 * @param class1 - First structural class
 * @param class2 - Second structural class
 * @returns True if classes match
 */
export function structuralClassesMatch(class1: StructuralClass, class2: StructuralClass): boolean {
  return (
    class1.player1Odd === class2.player1Odd &&
    class1.player2Odd === class2.player2Odd &&
    class1.biggerRemainder === class2.biggerRemainder
  )
}

/**
 * Check if two remainder pairs match exactly
 * @param pair1 - First remainder pair
 * @param pair2 - Second remainder pair
 * @returns True if pairs match exactly
 */
export function remainderPairsMatch(pair1: RemainderPair, pair2: RemainderPair): boolean {
  return (
    pair1.player1Remainder === pair2.player1Remainder &&
    pair1.player2Remainder === pair2.player2Remainder
  )
}
