import { relations } from "drizzle-orm";
import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { canvases } from "./canvases.js";

/**
 * Online status for a canvas, kept fresh by periodic HTTP heartbeats so the
 * collaborator avatar stack works even when the realtime (Ably) channel is
 * unreachable. One row per (canvas, user); rows older than a few missed
 * heartbeats are treated as offline and pruned on read.
 */
export const canvasPresence = pgTable(
  "canvas_presence",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    canvasId: uuid("canvas_id")
      .notNull()
      .references(() => canvases.id, {
        onDelete: "cascade",
      }),

    userId: text("user_id").notNull(),
    name: text("name").notNull(),

    color: jsonb("color").notNull(),

    lastSeen: timestamp("last_seen").defaultNow().notNull(),
  },
  (table) => ({
    canvasUserIdx: uniqueIndex("canvas_presence_canvas_user_idx").on(
      table.canvasId,
      table.userId
    ),
    canvasLastSeenIdx: index("canvas_presence_canvas_seen_idx").on(
      table.canvasId,
      table.lastSeen
    ),
  })
);

export const canvasPresenceRelations = relations(canvasPresence, ({ one }) => ({
  canvas: one(canvases, {
    fields: [canvasPresence.canvasId],
    references: [canvases.id],
  }),
}));