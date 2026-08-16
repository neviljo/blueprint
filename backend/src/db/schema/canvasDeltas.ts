import { relations } from "drizzle-orm";
import {
  bigserial,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { canvases } from "./canvases.js";

/**
 * Append-only log of scene changes for a canvas. Clients POST their deltas
 * here (the reliable, HTTP path used as the source of truth for scene sync)
 * and poll for newer deltas with ?after=<seq>. `seq` is globally monotonic so
 * "everything after N" is a simple range query per canvas.
 */
export const canvasDeltas = pgTable(
  "canvas_deltas",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    canvasId: uuid("canvas_id")
      .notNull()
      .references(() => canvases.id, {
        onDelete: "cascade",
      }),

    seq: bigserial("seq", { mode: "number" }).notNull(),

    clientId: text("client_id").notNull(),

    payload: jsonb("payload").notNull(),

    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    canvasSeqIdx: index("canvas_deltas_canvas_seq_idx").on(
      table.canvasId,
      table.seq
    ),
  })
);

export const canvasDeltaRelations = relations(canvasDeltas, ({ one }) => ({
  canvas: one(canvases, {
    fields: [canvasDeltas.canvasId],
    references: [canvases.id],
  }),
}));