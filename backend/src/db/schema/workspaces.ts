import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth.js";
import { relations } from "drizzle-orm";

export const workspaces = pgTable("workspaces", {
  id: uuid("id").defaultRandom().primaryKey(),

  name: text("name").notNull(),

  ownerId: text("owner_id")
    .notNull()
    .references(() => user.id, {
      onDelete: "cascade",
    }),

  createdAt: timestamp("created_at")
    .defaultNow()
    .notNull(),

  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const workspaceRelations = relations(workspaces, ({ one }) => ({
  owner: one(user, {
    fields: [workspaces.ownerId],
    references: [user.id],
  }),
}));