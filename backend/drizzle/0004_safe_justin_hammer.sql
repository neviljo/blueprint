CREATE TABLE "canvas_deltas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"canvas_id" uuid NOT NULL,
	"seq" bigserial NOT NULL,
	"client_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "canvases" ADD COLUMN "content_seq" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "canvas_deltas" ADD CONSTRAINT "canvas_deltas_canvas_id_canvases_id_fk" FOREIGN KEY ("canvas_id") REFERENCES "public"."canvases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "canvas_deltas_canvas_seq_idx" ON "canvas_deltas" USING btree ("canvas_id","seq");