-- Per-meal feed code support
ALTER TABLE "FeedingMeal" ADD COLUMN "feedProductId" TEXT;

ALTER TABLE "FeedingMeal" ADD CONSTRAINT "FeedingMeal_feedProductId_fkey"
  FOREIGN KEY ("feedProductId") REFERENCES "FeedProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill meal feed codes from parent entry
UPDATE "FeedingMeal" m
SET "feedProductId" = e."feedProductId"
FROM "FeedingEntry" e
WHERE m."feedingEntryId" = e."id" AND m."feedProductId" IS NULL;
