ALTER TABLE "work_order_item" ADD COLUMN "added_seq" bigint;--> statement-breakpoint
-- The items that exist keep the order the app showed: by created_at, and by id where two have the same one.
UPDATE "work_order_item" SET "added_seq" = "numbered"."n" FROM (SELECT "id", row_number() OVER (ORDER BY "created_at", "id") AS "n" FROM "work_order_item") AS "numbered" WHERE "work_order_item"."id" = "numbered"."id";--> statement-breakpoint
ALTER TABLE "work_order_item" ALTER COLUMN "added_seq" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "work_order_item" ALTER COLUMN "added_seq" ADD GENERATED ALWAYS AS IDENTITY (sequence name "work_order_item_added_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1);--> statement-breakpoint
-- The next item gets the number after the last one given above (1 when there is none).
SELECT setval(pg_get_serial_sequence('work_order_item', 'added_seq'), coalesce(max("added_seq"), 0) + 1, false) FROM "work_order_item";
