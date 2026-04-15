import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  jsonb,
  boolean,
} from "drizzle-orm/pg-core";

export const integrationStatusEnum = pgEnum("integration_status", [
  "pending",
  "completed",
  "rolled_back",
]);

export const projects = pgTable("projects", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  folderPath: text("folder_path").notNull(),
  appProfile: jsonb("app_profile"),
  stackInfo: jsonb("stack_info"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const onboardingOptions = pgTable("onboarding_options", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id")
    .references(() => projects.id)
    .notNull(),
  name: text("name").notNull(),
  rationale: text("rationale").notNull(),
  flowStructure: jsonb("flow_structure").notNull(),
  componentCode: jsonb("component_code").notNull(),
  authCode: jsonb("auth_code").notNull(),
  selected: boolean("selected").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const integrations = pgTable("integrations", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id")
    .references(() => projects.id)
    .notNull(),
  optionId: uuid("option_id")
    .references(() => onboardingOptions.id)
    .notNull(),
  changeset: jsonb("changeset").notNull(),
  status: integrationStatusEnum("status").default("pending").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
