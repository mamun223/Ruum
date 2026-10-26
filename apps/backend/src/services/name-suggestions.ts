/**
 * AI suggestions for the Arabic form of first names: the traditional Arabic
 * equivalent when one exists (Mary -> مريم), otherwise a phonetic Arabic spelling.
 * Suggestions are stored APPROVED so they are used in predictions immediately.
 *
 * Provider is chosen by env: ANTHROPIC_API_KEY or OPENAI_API_KEY
 * (override with AI_PROVIDER=anthropic|openai). Model via AI_MODEL.
 */

import { prisma } from "@tennis-prediction/database";
import { calculateAbjadValue } from "@tennis-prediction/shared";
import { describePlayers, findMissingNames, playerCountries } from "./names";
import {
  callModel,
  isSuggestionEnabled,
  NO_PROVIDER_ERROR,
  parseResults,
} from "./ai-client";

export { isSuggestionEnabled };

const BATCH_SIZE = 20;

interface Suggestion {
  firstName: string;
  arabicName: string | null;
  kind: "EQUIVALENT" | "PHONETIC" | null;
  basis: string | null;
  note: string | null;
}

const SYSTEM_PROMPT = `You write personal first names in ARABIC for an Abjad numerology tool. Do NOT translate the meaning of the name.

Rules:
1. If the name has a traditional Arabic equivalent (the same name/figure as known in Arabic, especially Quranic or Classical forms), use it:
   Mary/Maria/Marie/Mariam -> مريم, Moses/Moshe -> موسى, Joseph/Jose/Giuseppe -> يوسف, Abraham -> ابراهيم, David -> داود, Solomon -> سليمان, Jacob/Yakov -> يعقوب, Jesus -> عيسى, Jonah -> يونس, Elijah -> الياس, Gabriel -> جبريل, Michael/Mikhail -> ميكائيل, Daniel/Daniil -> دانيال, Adam -> ادم, Eve/Eva -> حواء, Sarah -> سارة, Pharaoh -> فرعون, Alexander -> اسكندر, Lucas/Luke -> لوقا.
   Variants and other-language forms of the same name share the same Arabic form. Set "kind" to "EQUIVALENT" and "basis" to the figure/name it corresponds to.
2. Otherwise write the name PHONETICALLY in Arabic letters, as an Arabic speaker would spell it from its pronunciation in the player's language (e.g. Jannik -> يانيك, Coco -> كوكو, Carlos -> كارلوس, Aruzhan -> اروجان). Set "kind" to "PHONETIC" and "basis" to the pronunciation you assumed.
3. Write plain Arabic letters only, WITHOUT diacritics (no harakat, shadda or tanween). One word normally.
4. Use the full player names and each player's NATIONALITY (3-letter IOC/ISO code) to decide the language of the name and how it is pronounced there (e.g. Jan is "Yan" for a Polish/Czech/Dutch player, Joan is "Jo-an" for a Catalan player, Andrea is male for an Italian player). Spell what a speaker of that country would say. Never write surnames. When players with the same first name have different nationalities, use the pronunciation of the first listed player and mention the alternative in "note".
5. If the given first name is only an initial or unreadable, set "arabicName" to null and explain in "note". Use "note" also for real ambiguity (e.g. John -> يحيى vs يوحنا).

Respond with JSON only, in this exact shape:
{"results":[{"firstName":"...","arabicName":"..." or null,"kind":"EQUIVALENT" or "PHONETIC" or null,"basis":"short explanation" or null,"note":"short caveat" or null}]}`;

/**
 * Ask the AI for first names in today's matches that have no mapping row yet.
 * Every result (including "uncertain") is stored so it is not re-asked.
 */
export async function suggestMissingNames() {
  if (!isSuggestionEnabled()) throw new Error(NO_PROVIDER_ERROR);

  const [{ missing }, countries] = await Promise.all([
    findMissingNames(),
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
      const arabicMeaning = r?.arabicName?.trim() ?? "";
      const abjadValue = arabicMeaning ? calculateAbjadValue(arabicMeaning) : 0;
      const usable = abjadValue > 0;

      const kindLabel =
        r?.kind === "EQUIVALENT"
          ? "Arabic equivalent"
          : r?.kind === "PHONETIC"
            ? "Phonetic"
            : null;
      const meaning = [kindLabel, r?.basis].filter(Boolean).join(": ") || null;
      const note = r ? (r.note ?? null) : "No answer returned by AI";

      await prisma.nameMapping.upsert({
        where: { playerName: item.firstName },
        update: {},
        create: {
          playerName: item.firstName,
          arabicMeaning: usable ? arabicMeaning : "",
          abjadValue,
          meaning,
          note,
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
