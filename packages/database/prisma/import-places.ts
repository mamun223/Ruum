/**
 * Import Arabic country names (approved) and city suggestions (unapproved)
 * from data/places.json. Existing rows are never overwritten, so corrections stay.
 */

import { readFileSync } from "fs";
import { join } from "path";
import { PrismaClient } from "@prisma/client";
import { calculateAbjadValue, placeKey } from "@tennis-prediction/shared";

interface PlacesFile {
  countries: Record<string, string>;
  citySuggestions: Record<string, string>;
}

const prisma = new PrismaClient();

async function main() {
  const file = join(__dirname, "..", "data", "places.json");
  const data: PlacesFile = JSON.parse(readFileSync(file, "utf8"));

  const rows = [
    ...Object.entries(data.countries).map(([code, arabicName]) => ({
      kind: "COUNTRY",
      key: code.toUpperCase(),
      name: code.toUpperCase(),
      arabicName,
      approved: true,
    })),
    ...Object.entries(data.citySuggestions).map(([name, arabicName]) => ({
      kind: "CITY",
      key: placeKey(name),
      name,
      arabicName,
      approved: false,
    })),
  ];

  let created = 0;
  for (const row of rows) {
    const existing = await prisma.placeMapping.findUnique({
      where: { kind_key: { kind: row.kind, key: row.key } },
    });
    if (existing) continue;
    await prisma.placeMapping.create({
      data: { ...row, abjadValue: calculateAbjadValue(row.arabicName), source: "IMPORT" },
    });
    created++;
  }

  console.log(`Places: ${created} created, ${rows.length - created} already present`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
