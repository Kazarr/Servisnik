CREATE TYPE "public"."customer_type" AS ENUM('person', 'company');--> statement-breakpoint
CREATE TABLE "customer" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "customer_type" NOT NULL,
	"name" text NOT NULL,
	"ico" text,
	"dic" text,
	"ic_dph" text,
	"street" text,
	"city" text,
	"postal_code" text,
	"email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vehicle" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vin" text NOT NULL,
	"owner_id" uuid NOT NULL,
	"license_plate" text,
	"make" text NOT NULL,
	"model" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "vehicle" ADD CONSTRAINT "vehicle_owner_id_customer_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."customer"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "vehicle_vin_idx" ON "vehicle" USING btree ("vin");--> statement-breakpoint
CREATE INDEX "vehicle_owner_id_idx" ON "vehicle" USING btree ("owner_id");