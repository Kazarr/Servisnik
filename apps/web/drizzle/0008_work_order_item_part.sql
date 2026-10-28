ALTER TABLE "work_order_item" ADD COLUMN "code" text;--> statement-breakpoint
ALTER TABLE "work_order_item" ADD COLUMN "purchase_price_cents" integer;--> statement-breakpoint
ALTER TABLE "work_order_item" ADD CONSTRAINT "work_order_item_purchase_price_check" CHECK ("work_order_item"."purchase_price_cents" >= 0);--> statement-breakpoint
ALTER TABLE "work_order_item" ADD CONSTRAINT "work_order_item_purchase_price_kind_check" CHECK ("work_order_item"."purchase_price_cents" is null or "work_order_item"."kind" = 'part');