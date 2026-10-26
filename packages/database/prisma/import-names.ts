/**
 * Import the name dictionary (data/name-meanings.json) into NameMapping.
 * Keys are normalized names; aliases get their own rows pointing to the same meaning.
 */

import { readFileSync } from "fs";
import { join } from "path";
import { PrismaClient } from "@prisma/client";
import { calculateAbjadValue, firstNameKey } from "@tennis-prediction/shared";

interface NameEntry {
  name: string;
  aliases: string[];
  arabicMeaning: string;
  meaning: string;
  note?: string;
  approved?: boolean;
}

const prisma = new PrismaClient();

async function main() {
  const file = join(__dirname, "..", "data", "name-meanings.json");
  const entries: NameEntry[] = JSON.parse(readFileSync(file, "utf8"));

  const legacy = await prisma.nameMapping.deleteMany({
    where: { playerName: { contains: " " } },
  });
  if (legacy.count)
    console.log(`Removed ${legacy.count} legacy multi-word keys`);

  let count = 0;
  for (const entry of entries) {
    const data = {
      arabicMeaning: entry.arabicMeaning,
      abjadValue: calculateAbjadValue(entry.arabicMeaning),
      meaning: entry.meaning,
      note: entry.note ?? null,
      source: "IMPORT",
      approved: entry.approved ?? true,
    };
    for (const name of [entry.name, ...entry.aliases]) {
      const playerName = firstNameKey(name);
      if (!playerName) {
        console.log(`Skipped (not a single first name): ${name}`);
        continue;
      }
      await prisma.nameMapping.upsert({
        where: { playerName },
        update: data,
        create: { playerName, ...data },
      });
      count++;
    }
  }

  console.log(`Imported ${count} name mappings from ${entries.length} entries`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
