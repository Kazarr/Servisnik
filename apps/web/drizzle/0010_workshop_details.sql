CREATE TYPE "public"."vat_payer_type" AS ENUM('payer', 'nonPayer', 'section7');--> statement-breakpoint
ALTER TABLE "workshop" ADD COLUMN "name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "workshop" ADD COLUMN "street" text;--> statement-breakpoint
ALTER TABLE "workshop" ADD COLUMN "city" text;--> statement-breakpoint
ALTER TABLE "workshop" ADD COLUMN "postal_code" text;--> statement-breakpoint
ALTER TABLE "workshop" ADD COLUMN "ico" text;--> statement-breakpoint
ALTER TABLE "workshop" ADD COLUMN "dic" text;--> statement-breakpoint
ALTER TABLE "workshop" ADD COLUMN "ic_dph" text;--> statement-breakpoint
ALTER TABLE "workshop" ADD COLUMN "vat_payer_type" "vat_payer_type" DEFAULT 'payer' NOT NULL;--> statement-breakpoint
ALTER TABLE "workshop" ADD COLUMN "iban" text;--> statement-breakpoint
ALTER TABLE "workshop" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "workshop" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "workshop" ADD COLUMN "commercial_register" text;