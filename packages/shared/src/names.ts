/**
 * Player name normalization and dictionary lookup keys
 */

/**
 * Normalize a name for dictionary lookup: lowercase, strip accents,
 * collapse punctuation/hyphens/whitespace to single spaces.
 */
export function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Dictionary key for a player's first name only (surnames are never used).
 * Returns null for compound first names joined together, e.g. "Jan-Lennard".
 */
export function firstNameKey(fullName: string): string | null {
  if (fullName.includes("/")) return null;
  const first = fullName.trim().split(/\s+/)[0] ?? "";
  if (!first || /[-‐‑–]/.test(first)) return null;
  const key = normalizeName(first);
  return key && !key.includes(" ") ? key : null;
}

/**
 * Resolve an Arabic meaning by first name from a dictionary keyed by normalized first names
 */
export function lookupArabicMeaning(
  fullName: string,
  dictionary: Map<string, string>,
): { key: string; arabicMeaning: string } | null {
  const key = firstNameKey(fullName);
  if (!key) return null;
  const arabicMeaning = dictionary.get(key);
  return arabicMeaning ? { key, arabicMeaning } : null;
}
