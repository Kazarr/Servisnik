CREATE TABLE "price_list_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "work_order_item_kind" NOT NULL,
	"code" text,
	"name" text NOT NULL,
	"unit" text NOT NULL,
	"purchase_price_cents" integer,
	"unit_price_cents" integer NOT NULL,
	"vat_rate" integer NOT NULL,
	"search_code" text NOT NULL,
	"search_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "price_list_item_purchase_price_check" CHECK ("price_list_item"."purchase_price_cents" >= 0),
	CONSTRAINT "price_list_item_purchase_price_kind_check" CHECK ("price_list_item"."purchase_price_cents" is null or "price_list_item"."kind" = 'part'),
	CONSTRAINT "price_list_item_unit_price_check" CHECK ("price_list_item"."unit_price_cents" >= 0),
	CONSTRAINT "price_list_item_vat_rate_check" CHECK ("price_list_item"."vat_rate" between 0 and 100)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "price_list_item_code_idx" ON "price_list_item" USING btree (lower("code"));