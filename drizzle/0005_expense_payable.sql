CREATE TYPE "public"."expense_status" AS ENUM('pago', 'a_pagar');--> statement-breakpoint
ALTER TABLE "expenses" ALTER COLUMN "paid_by_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "expenses" ALTER COLUMN "party" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "status" "expense_status" DEFAULT 'pago' NOT NULL;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "due_date" date;