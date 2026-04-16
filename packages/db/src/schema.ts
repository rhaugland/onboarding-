import {
  type AnyPgColumn,
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  jsonb,
  boolean,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const integrationStatusEnum = pgEnum("integration_status", [
  "pending",
  "completed",
  "rolled_back",
]);

export const optionStatusEnum = pgEnum("option_status", [
  "storyboard",
  "customizing",
  "ready",
  "built",
]);

export const projects = pgTable("projects", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  folderPath: text("folder_path").notNull(),
  appProfile: jsonb("app_profile"),
  stackInfo: jsonb("stack_info"),
  authMockup: jsonb("auth_mockup"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const onboardingOptions = pgTable(
  "onboarding_options",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .references(() => projects.id)
      .notNull(),
    name: text("name").notNull(),
    rationale: text("rationale").notNull(),
    flowStructure: jsonb("flow_structure").notNull(),
    mockupCode: jsonb("mockup_code"),
    componentCode: jsonb("component_code"),
    authCode: jsonb("auth_code"),
    status: optionStatusEnum("status").default("storyboard").notNull(),
    selected: boolean("selected").default(false).notNull(),
    baseOptionId: uuid("base_option_id").references(
      (): AnyPgColumn => onboardingOptions.id,
      { onDelete: "set null" },
    ),
    skippedSteps: text("skipped_steps").array().notNull().default([]),
    customizeHistory: jsonb("customize_history").notNull().default([]),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    projectBaseCustomizingIdx: index(
      "onboarding_options_project_base_customizing_idx",
    )
      .on(table.projectId, table.baseOptionId)
      .where(sql`${table.status} = 'customizing'`),
  }),
);

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
