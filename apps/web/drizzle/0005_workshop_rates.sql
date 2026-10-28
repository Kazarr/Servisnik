CREATE TABLE "workshop" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"vat_rates" integer[] NOT NULL,
	"default_vat_rate" integer NOT NULL,
	"hourly_rate_cents" integer,
	"markup_percent" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workshop_single_row_check" CHECK ("workshop"."id" = 1),
	CONSTRAINT "workshop_vat_rates_check" CHECK (0 <= all("workshop"."vat_rates") and 100 >= all("workshop"."vat_rates")),
	CONSTRAINT "workshop_default_vat_rate_check" CHECK ("workshop"."default_vat_rate" = any("workshop"."vat_rates")),
	CONSTRAINT "workshop_hourly_rate_cents_check" CHECK ("workshop"."hourly_rate_cents" >= 0),
	CONSTRAINT "workshop_markup_percent_check" CHECK ("workshop"."markup_percent" >= 0)
);
--> statement-breakpoint
INSERT INTO "workshop" ("id", "vat_rates", "default_vat_rate", "hourly_rate_cents", "markup_percent") VALUES (1, ARRAY[23, 19, 5], 23, NULL, 0);
