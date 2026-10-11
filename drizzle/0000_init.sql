CREATE TYPE "public"."animal_category" AS ENUM('matriz', 'reprodutor', 'cordeiro', 'borrego', 'descarte');--> statement-breakpoint
CREATE TYPE "public"."animal_origin" AS ENUM('inventario', 'nascimento', 'compra', 'importacao');--> statement-breakpoint
CREATE TYPE "public"."animal_status" AS ENUM('ativo', 'vendido', 'morto', 'abatido', 'consumo_proprio');--> statement-breakpoint
CREATE TYPE "public"."category_kind" AS ENUM('despesa', 'receita');--> statement-breakpoint
CREATE TYPE "public"."exit_type" AS ENUM('venda', 'morte', 'abate', 'consumo_proprio');--> statement-breakpoint
CREATE TYPE "public"."health_type" AS ENUM('vacina', 'vermifugacao', 'tratamento', 'outro');--> statement-breakpoint
CREATE TYPE "public"."party" AS ENUM('A', 'B');--> statement-breakpoint
CREATE TYPE "public"."pregnancy_result" AS ENUM('prenhe', 'vazia', 'duvidosa');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'socio');--> statement-breakpoint
CREATE TYPE "public"."sex" AS ENUM('M', 'F');--> statement-breakpoint
CREATE TABLE "animal_category_changes" (
	"id" serial PRIMARY KEY NOT NULL,
	"animal_id" integer NOT NULL,
	"date" date NOT NULL,
	"from_category" "animal_category",
	"to_category" "animal_category" NOT NULL,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "animal_exits" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_ref" uuid,
	"animal_id" integer NOT NULL,
	"type" "exit_type" NOT NULL,
	"date" date NOT NULL,
	"cause" text,
	"buyer" text,
	"weight_g" integer,
	"price_mode" text,
	"unit_price_cents" integer,
	"total_cents" integer,
	"revenue_id" integer,
	"previous_category" "animal_category",
	"notes" text,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "animal_exits_client_ref_unique" UNIQUE("client_ref"),
	CONSTRAINT "animal_exits_animal_id_unique" UNIQUE("animal_id")
);
--> statement-breakpoint
CREATE TABLE "animals" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_ref" uuid,
	"tag" text NOT NULL,
	"sex" "sex" NOT NULL,
	"breed" text,
	"birth_date" date,
	"birth_date_estimated" boolean DEFAULT false NOT NULL,
	"mother_id" integer,
	"father_id" integer,
	"birth_id" integer,
	"category" "animal_category" NOT NULL,
	"status" "animal_status" DEFAULT 'ativo' NOT NULL,
	"lot_id" integer,
	"origin" "animal_origin" DEFAULT 'inventario' NOT NULL,
	"entry_date" date NOT NULL,
	"exit_date" date,
	"photo_id" integer,
	"notes" text,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "animals_client_ref_unique" UNIQUE("client_ref"),
	CONSTRAINT "animals_tag_unique" UNIQUE("tag")
);
--> statement-breakpoint
CREATE TABLE "attachments" (
	"id" serial PRIMARY KEY NOT NULL,
	"mime" text NOT NULL,
	"size" integer NOT NULL,
	"data" "bytea" NOT NULL,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" integer,
	"entity" text NOT NULL,
	"entity_id" integer,
	"action" text NOT NULL,
	"before" jsonb,
	"after" jsonb
);
--> statement-breakpoint
CREATE TABLE "births" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_ref" uuid,
	"ewe_id" integer NOT NULL,
	"ram_id" integer,
	"date" date NOT NULL,
	"born_alive" integer DEFAULT 0 NOT NULL,
	"born_dead" integer DEFAULT 0 NOT NULL,
	"birth_type" text DEFAULT 'normal' NOT NULL,
	"notes" text,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "births_client_ref_unique" UNIQUE("client_ref"),
	CONSTRAINT "births_counts" CHECK ("births"."born_alive" >= 0 AND "births"."born_dead" >= 0 AND "births"."born_alive" + "births"."born_dead" > 0)
);
--> statement-breakpoint
CREATE TABLE "breedings" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_ref" uuid,
	"ewe_id" integer NOT NULL,
	"ram_id" integer,
	"date" date NOT NULL,
	"end_date" date,
	"method" text DEFAULT 'monta_natural' NOT NULL,
	"season_name" text,
	"notes" text,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "breedings_client_ref_unique" UNIQUE("client_ref")
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" "category_kind" NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_ref" uuid,
	"date" date NOT NULL,
	"amount_cents" integer NOT NULL,
	"category_id" integer NOT NULL,
	"description" text,
	"paid_by_user_id" integer NOT NULL,
	"party" "party" NOT NULL,
	"animal_id" integer,
	"lot_id" integer,
	"receipt_id" integer,
	"created_by" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "expenses_client_ref_unique" UNIQUE("client_ref"),
	CONSTRAINT "expenses_amount_pos" CHECK ("expenses"."amount_cents" > 0)
);
--> statement-breakpoint
CREATE TABLE "health_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_ref" uuid,
	"batch_id" uuid,
	"animal_id" integer NOT NULL,
	"type" "health_type" NOT NULL,
	"date" date NOT NULL,
	"product" text,
	"dose" text,
	"famacha" integer,
	"withdrawal_days" integer,
	"withdrawal_until" date,
	"next_dose_date" date,
	"notes" text,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "health_events_client_ref_unique" UNIQUE("client_ref")
);
--> statement-breakpoint
CREATE TABLE "inventory_count_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"count_id" integer NOT NULL,
	"tag" text NOT NULL,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_counts" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"lot_id" integer,
	"status" text DEFAULT 'aberta' NOT NULL,
	"notes" text,
	"result" jsonb,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "login_attempts" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"success" boolean NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lot_changes" (
	"id" serial PRIMARY KEY NOT NULL,
	"animal_id" integer NOT NULL,
	"date" date NOT NULL,
	"from_lot_id" integer,
	"to_lot_id" integer,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lots" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "lots_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "period_locks" (
	"id" serial PRIMARY KEY NOT NULL,
	"locked_until" date NOT NULL,
	"balance_cents" integer NOT NULL,
	"notes" text,
	"created_by" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reopened_at" timestamp with time zone,
	"reopened_by" integer,
	"reopen_reason" text
);
--> statement-breakpoint
CREATE TABLE "pregnancy_checks" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_ref" uuid,
	"ewe_id" integer NOT NULL,
	"date" date NOT NULL,
	"result" "pregnancy_result" NOT NULL,
	"method" text,
	"fetus_count" integer,
	"notes" text,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pregnancy_checks_client_ref_unique" UNIQUE("client_ref")
);
--> statement-breakpoint
CREATE TABLE "reimbursements" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_ref" uuid,
	"date" date NOT NULL,
	"amount_cents" integer NOT NULL,
	"from_party" "party" NOT NULL,
	"paid_by_user_id" integer NOT NULL,
	"method" text NOT NULL,
	"notes" text,
	"created_by" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "reimbursements_client_ref_unique" UNIQUE("client_ref"),
	CONSTRAINT "reimb_amount_pos" CHECK ("reimbursements"."amount_cents" > 0)
);
--> statement-breakpoint
CREATE TABLE "revenues" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_ref" uuid,
	"date" date NOT NULL,
	"amount_cents" integer NOT NULL,
	"category_id" integer NOT NULL,
	"description" text,
	"received_by_user_id" integer NOT NULL,
	"party" "party" NOT NULL,
	"lot_id" integer,
	"receipt_id" integer,
	"created_by" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "revenues_client_ref_unique" UNIQUE("client_ref"),
	CONSTRAINT "revenues_amount_pos" CHECK ("revenues"."amount_cents" > 0)
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "share_configs" (
	"id" serial PRIMARY KEY NOT NULL,
	"valid_from" date NOT NULL,
	"share_a_num" integer NOT NULL,
	"share_den" integer NOT NULL,
	"notes" text,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "share_configs_valid_from_unique" UNIQUE("valid_from"),
	CONSTRAINT "share_valid" CHECK ("share_configs"."share_den" > 0 AND "share_configs"."share_a_num" >= 0 AND "share_configs"."share_a_num" <= "share_configs"."share_den")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "user_role" DEFAULT 'socio' NOT NULL,
	"party" "party" NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "weanings" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_ref" uuid,
	"animal_id" integer NOT NULL,
	"date" date NOT NULL,
	"weight_g" integer,
	"notes" text,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "weanings_client_ref_unique" UNIQUE("client_ref"),
	CONSTRAINT "weanings_animal_id_unique" UNIQUE("animal_id")
);
--> statement-breakpoint
CREATE TABLE "weighings" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_ref" uuid,
	"animal_id" integer NOT NULL,
	"date" date NOT NULL,
	"weight_g" integer,
	"body_score" real,
	"notes" text,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "weighings_client_ref_unique" UNIQUE("client_ref")
);
--> statement-breakpoint
ALTER TABLE "animal_category_changes" ADD CONSTRAINT "animal_category_changes_animal_id_animals_id_fk" FOREIGN KEY ("animal_id") REFERENCES "public"."animals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "animal_category_changes" ADD CONSTRAINT "animal_category_changes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "animal_exits" ADD CONSTRAINT "animal_exits_animal_id_animals_id_fk" FOREIGN KEY ("animal_id") REFERENCES "public"."animals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "animal_exits" ADD CONSTRAINT "animal_exits_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "animals" ADD CONSTRAINT "animals_mother_id_animals_id_fk" FOREIGN KEY ("mother_id") REFERENCES "public"."animals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "animals" ADD CONSTRAINT "animals_father_id_animals_id_fk" FOREIGN KEY ("father_id") REFERENCES "public"."animals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "animals" ADD CONSTRAINT "animals_lot_id_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."lots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "animals" ADD CONSTRAINT "animals_photo_id_attachments_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."attachments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "animals" ADD CONSTRAINT "animals_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "births" ADD CONSTRAINT "births_ewe_id_animals_id_fk" FOREIGN KEY ("ewe_id") REFERENCES "public"."animals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "births" ADD CONSTRAINT "births_ram_id_animals_id_fk" FOREIGN KEY ("ram_id") REFERENCES "public"."animals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "births" ADD CONSTRAINT "births_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "breedings" ADD CONSTRAINT "breedings_ewe_id_animals_id_fk" FOREIGN KEY ("ewe_id") REFERENCES "public"."animals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "breedings" ADD CONSTRAINT "breedings_ram_id_animals_id_fk" FOREIGN KEY ("ram_id") REFERENCES "public"."animals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "breedings" ADD CONSTRAINT "breedings_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_paid_by_user_id_users_id_fk" FOREIGN KEY ("paid_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_animal_id_animals_id_fk" FOREIGN KEY ("animal_id") REFERENCES "public"."animals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_lot_id_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."lots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_receipt_id_attachments_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."attachments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_events" ADD CONSTRAINT "health_events_animal_id_animals_id_fk" FOREIGN KEY ("animal_id") REFERENCES "public"."animals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_events" ADD CONSTRAINT "health_events_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_count_items" ADD CONSTRAINT "inventory_count_items_count_id_inventory_counts_id_fk" FOREIGN KEY ("count_id") REFERENCES "public"."inventory_counts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_count_items" ADD CONSTRAINT "inventory_count_items_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_counts" ADD CONSTRAINT "inventory_counts_lot_id_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."lots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_counts" ADD CONSTRAINT "inventory_counts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lot_changes" ADD CONSTRAINT "lot_changes_animal_id_animals_id_fk" FOREIGN KEY ("animal_id") REFERENCES "public"."animals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lot_changes" ADD CONSTRAINT "lot_changes_from_lot_id_lots_id_fk" FOREIGN KEY ("from_lot_id") REFERENCES "public"."lots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lot_changes" ADD CONSTRAINT "lot_changes_to_lot_id_lots_id_fk" FOREIGN KEY ("to_lot_id") REFERENCES "public"."lots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lot_changes" ADD CONSTRAINT "lot_changes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "period_locks" ADD CONSTRAINT "period_locks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "period_locks" ADD CONSTRAINT "period_locks_reopened_by_users_id_fk" FOREIGN KEY ("reopened_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pregnancy_checks" ADD CONSTRAINT "pregnancy_checks_ewe_id_animals_id_fk" FOREIGN KEY ("ewe_id") REFERENCES "public"."animals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pregnancy_checks" ADD CONSTRAINT "pregnancy_checks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reimbursements" ADD CONSTRAINT "reimbursements_paid_by_user_id_users_id_fk" FOREIGN KEY ("paid_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reimbursements" ADD CONSTRAINT "reimbursements_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revenues" ADD CONSTRAINT "revenues_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revenues" ADD CONSTRAINT "revenues_received_by_user_id_users_id_fk" FOREIGN KEY ("received_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revenues" ADD CONSTRAINT "revenues_lot_id_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."lots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revenues" ADD CONSTRAINT "revenues_receipt_id_attachments_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."attachments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revenues" ADD CONSTRAINT "revenues_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_configs" ADD CONSTRAINT "share_configs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weanings" ADD CONSTRAINT "weanings_animal_id_animals_id_fk" FOREIGN KEY ("animal_id") REFERENCES "public"."animals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weanings" ADD CONSTRAINT "weanings_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weighings" ADD CONSTRAINT "weighings_animal_id_animals_id_fk" FOREIGN KEY ("animal_id") REFERENCES "public"."animals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weighings" ADD CONSTRAINT "weighings_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "acc_animal_idx" ON "animal_category_changes" USING btree ("animal_id","date");--> statement-breakpoint
CREATE INDEX "animals_mother_idx" ON "animals" USING btree ("mother_id");--> statement-breakpoint
CREATE INDEX "animals_status_idx" ON "animals" USING btree ("status");--> statement-breakpoint
CREATE INDEX "animals_lot_idx" ON "animals" USING btree ("lot_id");--> statement-breakpoint
CREATE INDEX "audit_entity_idx" ON "audit_log" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE INDEX "births_ewe_idx" ON "births" USING btree ("ewe_id","date");--> statement-breakpoint
CREATE INDEX "breedings_ewe_idx" ON "breedings" USING btree ("ewe_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "categories_kind_name_uq" ON "categories" USING btree ("kind","name");--> statement-breakpoint
CREATE INDEX "expenses_date_idx" ON "expenses" USING btree ("date");--> statement-breakpoint
CREATE INDEX "health_animal_idx" ON "health_events" USING btree ("animal_id","date");--> statement-breakpoint
CREATE INDEX "health_next_idx" ON "health_events" USING btree ("next_dose_date");--> statement-breakpoint
CREATE UNIQUE INDEX "count_items_uq" ON "inventory_count_items" USING btree ("count_id","tag");--> statement-breakpoint
CREATE INDEX "login_attempts_email_at_idx" ON "login_attempts" USING btree ("email","at");--> statement-breakpoint
CREATE INDEX "revenues_date_idx" ON "revenues" USING btree ("date");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "weighings_animal_idx" ON "weighings" USING btree ("animal_id","date");