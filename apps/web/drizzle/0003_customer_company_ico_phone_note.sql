ALTER TABLE "customer" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "customer" ADD COLUMN "note" text;--> statement-breakpoint
CREATE UNIQUE INDEX "customer_ico_idx" ON "customer" USING btree ("ico");