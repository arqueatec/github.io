CREATE TYPE "public"."finance_species" AS ENUM('ovino', 'bovino', 'ambos');--> statement-breakpoint
CREATE TYPE "public"."species" AS ENUM('ovino', 'bovino');--> statement-breakpoint
ALTER TYPE "public"."animal_category" ADD VALUE 'vaca';--> statement-breakpoint
ALTER TYPE "public"."animal_category" ADD VALUE 'touro';--> statement-breakpoint
ALTER TYPE "public"."animal_category" ADD VALUE 'bezerro';--> statement-breakpoint
ALTER TYPE "public"."animal_category" ADD VALUE 'novilho';--> statement-breakpoint
ALTER TYPE "public"."animal_category" ADD VALUE 'garrote';--> statement-breakpoint
ALTER TYPE "public"."animal_category" ADD VALUE 'boi';--> statement-breakpoint
ALTER TABLE "animals" ADD COLUMN "species" "species" DEFAULT 'ovino' NOT NULL;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "species" "finance_species" DEFAULT 'ambos' NOT NULL;--> statement-breakpoint
ALTER TABLE "revenues" ADD COLUMN "species" "finance_species" DEFAULT 'ambos' NOT NULL;--> statement-breakpoint
CREATE INDEX "animals_species_idx" ON "animals" USING btree ("species");