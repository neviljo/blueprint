CREATE TABLE "canvas_presence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"canvas_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"color" jsonb NOT NULL,
	"last_seen" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "canvas_presence" ADD CONSTRAINT "canvas_presence_canvas_id_canvases_id_fk" FOREIGN KEY ("canvas_id") REFERENCES "public"."canvases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "canvas_presence_canvas_user_idx" ON "canvas_presence" USING btree ("canvas_id","user_id");--> statement-breakpoint
CREATE INDEX "canvas_presence_canvas_seen_idx" ON "canvas_presence" USING btree ("canvas_id","last_seen");