CREATE TYPE "public"."work_order_item_kind" AS ENUM('labour', 'part');--> statement-breakpoint
CREATE TYPE "public"."work_order_status" AS ENUM('received', 'done', 'invoiced');--> statement-breakpoint
CREATE TABLE "work_order" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text NOT NULL,
	"customer_id" uuid NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"mileage_km" integer NOT NULL,
	"customer_request" text NOT NULL,
	"status" "work_order_status" DEFAULT 'received' NOT NULL,
	"completed_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "work_order_mileage_km_check" CHECK ("work_order"."mileage_km" >= 0)
);
--> statement-breakpoint
CREATE TABLE "work_order_counter" (
	"year" integer PRIMARY KEY NOT NULL,
	"last_sequence" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_order_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"work_order_id" uuid NOT NULL,
	"kind" "work_order_item_kind" NOT NULL,
	"name" text NOT NULL,
	"quantity_hundredths" integer NOT NULL,
	"unit" text NOT NULL,
	"unit_price_cents" integer NOT NULL,
	"vat_rate" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "work_order_item_quantity_check" CHECK ("work_order_item"."quantity_hundredths" > 0),
	CONSTRAINT "work_order_item_unit_price_check" CHECK ("work_order_item"."unit_price_cents" >= 0),
	CONSTRAINT "work_order_item_vat_rate_check" CHECK ("work_order_item"."vat_rate" between 0 and 100)
);
--> statement-breakpoint
ALTER TABLE "work_order" ADD CONSTRAINT "work_order_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_order" ADD CONSTRAINT "work_order_vehicle_id_vehicle_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicle"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_order_item" ADD CONSTRAINT "work_order_item_work_order_id_work_order_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_order"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "work_order_number_idx" ON "work_order" USING btree ("number");--> statement-breakpoint
CREATE INDEX "work_order_customer_id_idx" ON "work_order" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "work_order_vehicle_id_idx" ON "work_order" USING btree ("vehicle_id");--> statement-breakpoint
CREATE INDEX "work_order_item_work_order_id_idx" ON "work_order_item" USING btree ("work_order_id");