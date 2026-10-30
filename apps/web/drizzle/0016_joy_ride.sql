CREATE TYPE "public"."registration_category" AS ENUM('supersport', 'interesting', 'heavy', 'veteran', 'motorcycle', 'other');--> statement-breakpoint
CREATE TYPE "public"."registration_status" AS ENUM('new', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "joy_ride_edition" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"date" date NOT NULL,
	"place" text NOT NULL,
	"registration_deadline" timestamp NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "joy_ride_registration" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"edition_id" uuid NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"email" text NOT NULL,
	"make" text NOT NULL,
	"model" text NOT NULL,
	"license_plate" text,
	"category" "registration_category" NOT NULL,
	"note" text,
	"status" "registration_status" DEFAULT 'new' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "joy_ride_registration" ADD CONSTRAINT "joy_ride_registration_edition_id_joy_ride_edition_id_fk" FOREIGN KEY ("edition_id") REFERENCES "public"."joy_ride_edition"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "joy_ride_registration_edition_id_idx" ON "joy_ride_registration" USING btree ("edition_id");