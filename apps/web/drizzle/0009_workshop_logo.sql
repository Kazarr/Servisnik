CREATE TABLE "workshop_logo" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"content_type" text NOT NULL,
	"data" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workshop_logo_single_row_check" CHECK ("workshop_logo"."id" = 1),
	CONSTRAINT "workshop_logo_content_type_check" CHECK ("workshop_logo"."content_type" in ('image/png', 'image/jpeg')),
	CONSTRAINT "workshop_logo_size_check" CHECK (octet_length("workshop_logo"."data") between 1 and 1048576)
);
