/**
 * AI suggestions for the Arabic names of countries and cities in today's matches.
 * Suggestions are stored APPROVED so they are used in the environmental base immediately.
 */

import { prisma } from "@tennis-prediction/database";
import { calculateAbjadValue } from "@tennis-prediction/shared";
import { findMissingPlaces, PlaceKind } from "./places";
import {
  callModel,
  isSuggestionEnabled,
  NO_PROVIDER_ERROR,
  parseResults,
} from "./ai-client";

const BATCH_SIZE = 30;

interface Suggestion {
  id: string;
  arabicName: string | null;
  note: string | null;
}

const SYSTEM_PROMPT = `You write the ARABIC names of countries and cities for an Abjad numerology tool.

Rules:
1. Use the standard Arabic name used in Arabic media and Arabic Wikipedia (e.g. Tokyo -> طوكيو, Sydney -> سيدني, Lisbon -> لشبونة, Florence -> فلورنسا, Brazil -> البرازيل, United States -> الولايات المتحدة, Japan -> اليابان).
2. Include the article "ال" only when the standard Arabic name has it. Keep hamza forms as normally written (أ إ آ).
3. If a city has no established Arabic name, write it PHONETICALLY in Arabic letters from its local pronunciation (e.g. Saguenay -> ساغني, Tamworth -> تامورث).
4. Plain Arabic letters only, WITHOUT diacritics (no harakat, shadda or tanween). Multi-word names keep their spaces.
5. Countries are given as 3-letter sports/IOC or ISO codes; give the country name, not the code.
6. Cities come with their country code and tournament name(s) as context. Name the city itself, not the tournament. If the given "city" is not actually a place (e.g. a sponsor name), set "arabicName" to null and explain in "note".

Respond with JSON only, in this exact shape, echoing each "id" exactly:
{"results":[{"id":"...","arabicName":"..." or null,"note":"short caveat" or null}]}`;

/**
 * Ask the AI for countries/cities in today's matches that have no mapping row yet.
 * Usable answers are stored approved; uncertain ones are reported, not stored.
 */
export async function suggestMissingPlaces() {
  if (!isSuggestionEnabled()) throw new Error(NO_PROVIDER_ERROR);

  const todo = (await findMissingPlaces()).filter((m) => !m.pending);

  let suggested = 0;
  const uncertain: { kind: PlaceKind; name: string; note: string | null }[] = [];

  for (let i = 0; i < todo.length; i += BATCH_SIZE) {
    const batch = todo.slice(i, i + BATCH_SIZE);
    const prompt =
      "Places:\n" +
      batch
        .map((m) =>
          m.kind === "COUNTRY"
            ? `- id=COUNTRY:${m.key} | country code ${m.name}`
            : `- id=CITY:${m.key} | city "${m.name}" | country ${m.country} | tournament(s): ${m.tournaments.slice(0, 2).join("; ")}`,
        )
        .join("\n");

    const results = parseResults<Suggestion>(
      await callModel(SYSTEM_PROMPT, prompt),
    );
    const byId = new Map(results.map((r) => [r.id?.trim(), r]));

    for (const item of batch) {
      const r = byId.get(`${item.kind}:${item.key}`);
      const arabicName = r?.arabicName?.trim() ?? "";
      const abjadValue = arabicName ? calculateAbjadValue(arabicName) : 0;
      if (abjadValue === 0) {
        uncertain.push({
          kind: item.kind,
          name: item.name,
          note: r ? (r.note ?? null) : "No answer returned by AI",
        });
        continue;
      }

      await prisma.placeMapping.upsert({
        where: { kind_key: { kind: item.kind, key: item.key } },
        update: {},
        create: {
          kind: item.kind,
          key: item.key,
          name: item.name,
          arabicName,
          abjadValue,
          source: "AI",
          approved: true,
        },
      });
      suggested++;
    }
  }

  return { requested: todo.length, suggested, uncertain };
}
