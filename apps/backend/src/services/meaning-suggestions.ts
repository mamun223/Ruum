/**
 * AI suggestions for the MEANING of first names, written as a short Arabic phrase
 * (e.g. Peter -> صخرة, John -> الله رحيم, Victor -> منتصر).
 * Suggestions are stored APPROVED so they are used in the meaning calculation immediately.
 */

import { prisma } from "@tennis-prediction/database";
import { calculateAbjadValue } from "@tennis-prediction/shared";
import { findMissingMeanings } from "./meanings";
import { describePlayers, playerCountries } from "./names";
import {
  callModel,
  isSuggestionEnabled,
  NO_PROVIDER_ERROR,
  parseResults,
} from "./ai-client";

const BATCH_SIZE = 20;

interface Suggestion {
  firstName: string;
  arabicMeaning: string | null;
  englishMeaning: string | null;
  origin: string | null;
  note: string | null;
}

const SYSTEM_PROMPT = `You give the MEANING of personal first names, written in ARABIC, for an Abjad numerology tool. Do NOT transliterate the name; translate what it MEANS.

Rules:
1. Find the established etymological meaning of the first name in its language of origin (Hebrew, Greek, Latin, Germanic, Slavic, Japanese, Chinese, etc.). Use the player's full name and NATIONALITY (3-letter IOC/ISO code) to decide which language/culture the name comes from, since the same spelling can mean different things (e.g. Mai is Japanese "dance" for a JPN player but Vietnamese "apricot blossom" for a VIE player; Ali is Arabic "exalted" but can be a short form elsewhere). When players with the same first name have different nationalities, use the meaning for the first listed player and mention the alternative in "note".
2. Write that meaning as a SHORT Arabic phrase (usually 1-3 words) in natural Modern Standard Arabic, e.g.
   Peter -> صخرة, John/Jannik/Ivan -> الله رحيم, Victor -> منتصر, Grace -> نعمة, Daniel -> الله قاضي, Michael -> من مثل الله, Sophia -> حكمة, Leo -> أسد, Felix -> سعيد, Irina -> سلام, Haruka -> بعيد, Coco -> (use the meaning of the full name it shortens, if known).
3. Variants of the same name share the same meaning (Jan, Johann, Juan, Giovanni -> الله رحيم).
4. Plain Arabic letters only, WITHOUT diacritics (no harakat, shadda or tanween).
5. If the meaning is disputed, use the most widely accepted one and mention the alternative in "note". If the meaning is unknown or the name is only an initial, set "arabicMeaning" to null and explain in "note".

Respond with JSON only, in this exact shape:
{"results":[{"firstName":"...","arabicMeaning":"..." or null,"englishMeaning":"..." or null,"origin":"language of origin" or null,"note":"short caveat" or null}]}`;

/**
 * Ask the AI for first names in today's matches that have no meaning row yet.
 * Every result (including "uncertain") is stored so it is not re-asked.
 */
export async function suggestMissingMeanings() {
  if (!isSuggestionEnabled()) throw new Error(NO_PROVIDER_ERROR);

  const [{ missing }, countries] = await Promise.all([
    findMissingMeanings(),
    playerCountries(),
  ]);
  const todo = missing.filter((m) => !m.pending);

  let suggested = 0;
  let uncertain = 0;

  for (let i = 0; i < todo.length; i += BATCH_SIZE) {
    const batch = todo.slice(i, i + BATCH_SIZE);
    const prompt =
      "First names (with example full player names and nationality for context):\n" +
      batch
        .map(
          (m) => `- ${m.firstName} (e.g. ${describePlayers(m.players, countries)})`,
        )
        .join("\n");

    const results = parseResults<Suggestion>(
      await callModel(SYSTEM_PROMPT, prompt),
    );
    const byName = new Map(results.map((r) => [r.firstName?.toLowerCase(), r]));

    for (const item of batch) {
      const r = byName.get(item.firstName);
      const arabicMeaning = r?.arabicMeaning?.trim() ?? "";
      const abjadValue = arabicMeaning ? calculateAbjadValue(arabicMeaning) : 0;
      const usable = abjadValue > 0;
      const meaning =
        [r?.englishMeaning, r?.origin && `(${r.origin})`]
          .filter(Boolean)
          .join(" ") || null;

      await prisma.nameMeaning.upsert({
        where: { playerName: item.firstName },
        update: {},
        create: {
          playerName: item.firstName,
          arabicMeaning: usable ? arabicMeaning : "",
          abjadValue,
          meaning,
          note: r ? (r.note ?? null) : "No answer returned by AI",
          source: "AI",
          approved: true,
        },
      });

      if (usable) suggested++;
      else uncertain++;
    }
  }

  return { requested: todo.length, suggested, uncertain };
}
