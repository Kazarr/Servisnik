ALTER TYPE "public"."work_order_status" ADD VALUE 'inProgress' BEFORE 'done';--> statement-breakpoint
ALTER TYPE "public"."work_order_status" ADD VALUE 'waitingForParts' BEFORE 'done';--> statement-breakpoint
ALTER TYPE "public"."work_order_status" ADD VALUE 'cancelled';