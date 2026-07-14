-- Add mustChangePin to User for first-login PIN change
ALTER TABLE "User" ADD COLUMN "mustChangePin" BOOLEAN NOT NULL DEFAULT false;

