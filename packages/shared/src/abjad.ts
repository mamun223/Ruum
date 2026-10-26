/**
 * Abjad letter values for Arabic numerology
 */
export const ABJAD_VALUES: Record<string, number> = {
  ا: 1,
  ب: 2,
  ج: 3,
  د: 4,
  ه: 5,
  و: 6,
  ز: 7,
  ح: 8,
  ط: 9,
  ي: 10,
  ك: 20,
  ل: 30,
  م: 40,
  ن: 50,
  س: 60,
  ع: 70,
  ف: 80,
  ص: 90,
  ق: 100,
  ر: 200,
  ش: 300,
  ت: 400,
  ث: 500,
  خ: 600,
  ذ: 700,
  ض: 800,
  ظ: 900,
  غ: 1000,
  أ: 1,
  إ: 1,
  آ: 1,
  ة: 400,
  ى: 10,
};

/**
 * Calculate Abjad value for Arabic text
 * @param arabicText - Arabic string
 * @returns Sum of Abjad values
 */
export function calculateAbjadValue(arabicText: string): number {
  let total = 0;
  for (const char of arabicText) {
    total += ABJAD_VALUES[char] || 0;
  }
  return total;
}

/**
 * Calculate remainder from Abjad value
 * @param abjadValue - Abjad numeric value
 * @returns Remainder (1-9); an exact multiple of 9 counts as 9
 */
export function calculateRemainder(abjadValue: number): number {
  const remainder = abjadValue % 9;
  return remainder === 0 ? 9 : remainder;
}
