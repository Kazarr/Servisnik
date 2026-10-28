CREATE TYPE "public"."vehicle_fuel" AS ENUM('petrol', 'diesel', 'hybrid', 'electric', 'lpg', 'cng', 'other');--> statement-breakpoint
ALTER TABLE "vehicle" ADD COLUMN "year" integer;--> statement-breakpoint
ALTER TABLE "vehicle" ADD COLUMN "fuel" "vehicle_fuel";--> statement-breakpoint
ALTER TABLE "vehicle" ADD COLUMN "mileage_km" integer;--> statement-breakpoint
ALTER TABLE "vehicle" ADD COLUMN "note" text;--> statement-breakpoint
-- The ŠPZ of the vehicles that exist already, the way the domain stores it (parseLicensePlate in packages/domain/src/vehicle):
-- in capitals, without hyphens and without white space of any kind (a non-breaking space too); a plate with nothing left is none.
UPDATE "vehicle" SET "license_plate" = nullif(upper(regexp_replace("license_plate", '[-\s\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+', '', 'g')), '') WHERE "license_plate" IS NOT NULL;