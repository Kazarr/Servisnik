ALTER TABLE "user" DROP CONSTRAINT "user_email_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "user_email_lower_idx" ON "user" USING btree (lower("email"));