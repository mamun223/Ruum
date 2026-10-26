/**
 * Seed script to add sample players with Arabic meanings
 */

import { PrismaClient } from "@prisma/client";
import { calculateAbjadValue, normalizeName } from "@tennis-prediction/shared";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding players...");

  // Sample players with Arabic meanings
  const players = [
    {
      name: "Astra",
      arabicMeaning: "نجم",
      abjadValue: calculateAbjadValue("نجم"), // ن=50, ج=3, م=40 = 93
    },
    {
      name: "Lea",
      arabicMeaning: "أسد",
      abjadValue: calculateAbjadValue("أسد"), // أ=1, س=60, د=4 = 65
    },
  ];

  for (const player of players) {
    await prisma.player.upsert({
      where: { name: player.name },
      update: {},
      create: { name: player.name },
    });

    const playerName = normalizeName(player.name);
    const meaning = {
      arabicMeaning: player.arabicMeaning,
      abjadValue: player.abjadValue,
      source: "SEED",
      approved: true,
    };
    await prisma.nameMapping.upsert({
      where: { playerName },
      update: meaning,
      create: { playerName, ...meaning },
    });

    console.log(
      `✅ Added/updated player: ${player.name} -> ${player.arabicMeaning} (${player.abjadValue})`,
    );
  }

  console.log("Seed complete!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
