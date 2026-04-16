ALTER TYPE "public"."option_status" ADD VALUE IF NOT EXISTS 'customizing';--> statement-breakpoint
ALTER TYPE "public"."option_status" ADD VALUE IF NOT EXISTS 'ready';--> statement-breakpoint
ALTER TABLE "onboarding_options" ADD COLUMN "base_option_id" uuid;--> statement-breakpoint
ALTER TABLE "onboarding_options" ADD COLUMN "skipped_steps" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "onboarding_options" ADD COLUMN "customize_history" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "onboarding_options" ADD CONSTRAINT "onboarding_options_base_option_id_fk" FOREIGN KEY ("base_option_id") REFERENCES "public"."onboarding_options"("id") ON DELETE SET NULL ON UPDATE NO ACTION;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "onboarding_options_project_base_customizing_idx" ON "onboarding_options" ("project_id", "base_option_id") WHERE "status" = 'customizing';
