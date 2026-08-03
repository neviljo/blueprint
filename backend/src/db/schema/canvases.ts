import { relations } from "drizzle-orm";
import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { workspaces } from "./workspaces.js";

export const canvases = pgTable("canvases", {
  id: uuid("id").defaultRandom().primaryKey(),

  name: text("name").notNull(),

  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, {
      onDelete: "cascade",
    }),

  content: text("content").default("[]").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),

  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const canvasRelations = relations(canvases, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [canvases.workspaceId],
    references: [workspaces.id],
  }),
}));