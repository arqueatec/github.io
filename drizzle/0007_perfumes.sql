CREATE TYPE "public"."perfume_movement" AS ENUM('venda', 'compra', 'ajuste');--> statement-breakpoint
CREATE TYPE "public"."user_area" AS ENUM('rebanho', 'perfumes');--> statement-breakpoint
CREATE TABLE "perfume_movements" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_ref" uuid,
	"perfume_id" integer NOT NULL,
	"kind" "perfume_movement" NOT NULL,
	"qty" integer NOT NULL,
	"unit_cents" integer DEFAULT 0 NOT NULL,
	"unit_cost_cents" integer,
	"total_cents" integer DEFAULT 0 NOT NULL,
	"date" date NOT NULL,
	"sold_by_user_id" integer,
	"notes" text,
	"created_by" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "perfume_movements_client_ref_unique" UNIQUE("client_ref")
);
--> statement-breakpoint
CREATE TABLE "perfumes" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"cost_cents" integer DEFAULT 1300 NOT NULL,
	"price_cents" integer DEFAULT 3000 NOT NULL,
	"stock" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "perfumes_stock_pos" CHECK ("perfumes"."stock" >= 0)
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "area" "user_area" DEFAULT 'rebanho' NOT NULL;--> statement-breakpoint
ALTER TABLE "perfume_movements" ADD CONSTRAINT "perfume_movements_perfume_id_perfumes_id_fk" FOREIGN KEY ("perfume_id") REFERENCES "public"."perfumes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "perfume_movements" ADD CONSTRAINT "perfume_movements_sold_by_user_id_users_id_fk" FOREIGN KEY ("sold_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "perfume_movements" ADD CONSTRAINT "perfume_movements_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "perfumes" ADD CONSTRAINT "perfumes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "perfume_mov_perfume_idx" ON "perfume_movements" USING btree ("perfume_id");--> statement-breakpoint
CREATE INDEX "perfume_mov_date_idx" ON "perfume_movements" USING btree ("date");--> statement-breakpoint
CREATE UNIQUE INDEX "perfumes_name_uq" ON "perfumes" USING btree (lower("name"));