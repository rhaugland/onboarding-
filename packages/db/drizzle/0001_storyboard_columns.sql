CREATE TYPE "public"."integration_status" AS ENUM('pending', 'completed', 'rolled_back');--> statement-breakpoint
CREATE TYPE "public"."option_status" AS ENUM('storyboard', 'built');--> statement-breakpoint
CREATE TABLE "integrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"option_id" uuid NOT NULL,
	"changeset" jsonb NOT NULL,
	"status" "integration_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "onboarding_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"rationale" text NOT NULL,
	"flow_structure" jsonb NOT NULL,
	"mockup_code" jsonb,
	"component_code" jsonb,
	"auth_code" jsonb,
	"status" "option_status" DEFAULT 'storyboard' NOT NULL,
	"selected" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"folder_path" text NOT NULL,
	"app_profile" jsonb,
	"stack_info" jsonb,
	"auth_mockup" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_option_id_onboarding_options_id_fk" FOREIGN KEY ("option_id") REFERENCES "public"."onboarding_options"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_options" ADD CONSTRAINT "onboarding_options_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;