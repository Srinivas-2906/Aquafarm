/**
 * One-time / maintenance script: align culture cycle stocking dates and entry DOC
 * with the earliest non-voided feeding date per cycle. Does not modify meals,
 * quantities, or inventory.
 *
 * Usage:
 *   npx tsx apps/api/scripts/fix-doc-from-feeding-dates.ts          # dry run
 *   npx tsx apps/api/scripts/fix-doc-from-feeding-dates.ts --apply    # write changes
 */
import { PrismaClient } from '@prisma/client';
import { calculateDoc } from '../src/common/utils/date.utils';

const prisma = new PrismaClient();
const apply = process.argv.includes('--apply');

async function main() {
  const cycles = await prisma.cultureCycle.findMany({
    where: {
      feedingEntries: { some: { status: { not: 'VOIDED' } } },
    },
    include: {
      pond: { select: { name: true, code: true } },
      feedingEntries: {
        where: { status: { not: 'VOIDED' } },
        select: { id: true, feedingDate: true, doc: true },
        orderBy: { feedingDate: 'asc' },
      },
    },
  });

  let stockingUpdates = 0;
  let docUpdates = 0;

  for (const cycle of cycles) {
    if (!cycle.feedingEntries.length) continue;

    const earliestFeedingDate = cycle.feedingEntries[0].feedingDate;
    let stockingDate = cycle.stockingDate;

    if (earliestFeedingDate < stockingDate) {
      stockingUpdates += 1;
      console.log(
        `[stocking] cycle=${cycle.id} pond=${cycle.pond.name} (#${cycle.pond.code}) ` +
          `${stockingDate.toISOString().slice(0, 10)} -> ${earliestFeedingDate.toISOString().slice(0, 10)}`,
      );
      if (apply) {
        await prisma.cultureCycle.update({
          where: { id: cycle.id },
          data: { stockingDate: earliestFeedingDate },
        });
      }
      stockingDate = earliestFeedingDate;
    }

    for (const entry of cycle.feedingEntries) {
      const nextDoc = calculateDoc(stockingDate, entry.feedingDate);
      if (entry.doc === nextDoc) continue;
      docUpdates += 1;
      console.log(
        `[doc] entry=${entry.id} date=${entry.feedingDate.toISOString().slice(0, 10)} ` +
          `${entry.doc} -> ${nextDoc}`,
      );
      if (apply) {
        await prisma.feedingEntry.update({
          where: { id: entry.id },
          data: { doc: nextDoc },
        });
      }
    }
  }

  console.log(
    `\n${apply ? 'Applied' : 'Dry run'}: ${stockingUpdates} stocking date(s), ${docUpdates} DOC update(s).`,
  );
  if (!apply && (stockingUpdates > 0 || docUpdates > 0)) {
    console.log('Re-run with --apply to persist changes.');
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
