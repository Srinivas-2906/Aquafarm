import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();

    // Development-only safety net: some local environments run without migrations.
    if (process.env.NODE_ENV !== 'production') {
      await this.$executeRawUnsafe(
        'ALTER TABLE "FeedingMeal" ADD COLUMN IF NOT EXISTS "feedProductId" TEXT;',
      );
      await this.$executeRawUnsafe(`
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'FeedingMeal_feedProductId_fkey'
  ) THEN
    ALTER TABLE "FeedingMeal" ADD CONSTRAINT "FeedingMeal_feedProductId_fkey"
      FOREIGN KEY ("feedProductId") REFERENCES "FeedProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
      `);
      await this.$executeRawUnsafe(`
UPDATE "FeedingMeal" m
SET "feedProductId" = e."feedProductId"
FROM "FeedingEntry" e
WHERE m."feedingEntryId" = e."id" AND m."feedProductId" IS NULL;
      `);
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
