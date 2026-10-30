CREATE TYPE "public"."letterhead" AS ENUM('white', 'blackBar');--> statement-breakpoint
ALTER TABLE "workshop" ADD COLUMN "letterhead" "letterhead" DEFAULT 'white' NOT NULL;