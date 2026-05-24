CREATE TABLE "agent_profile" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"role" text NOT NULL,
	"character" text NOT NULL,
	"extras" jsonb
);
--> statement-breakpoint
CREATE TABLE "agent_traits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"trait" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mtm_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"segment_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"query" text NOT NULL,
	"response" text NOT NULL,
	"timestamp" timestamp NOT NULL,
	"meta_chain" text,
	"keywords" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mtm_segments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"summary" text NOT NULL,
	"keywords" jsonb NOT NULL,
	"n_visit" integer DEFAULT 0 NOT NULL,
	"l_interaction" integer DEFAULT 0 NOT NULL,
	"last_access_time" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stm_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"query" text NOT NULL,
	"response" text NOT NULL,
	"timestamp" timestamp DEFAULT now() NOT NULL,
	"chain_id" uuid,
	"meta_chain" text
);
--> statement-breakpoint
CREATE TABLE "user_kb" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"fact" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_profile" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"name" varchar(255),
	"gender" varchar(32),
	"birth_year" integer,
	"extras" jsonb
);
--> statement-breakpoint
CREATE TABLE "user_traits" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"traits" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_profile" ADD CONSTRAINT "agent_profile_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_traits" ADD CONSTRAINT "agent_traits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mtm_pages" ADD CONSTRAINT "mtm_pages_segment_id_mtm_segments_id_fk" FOREIGN KEY ("segment_id") REFERENCES "public"."mtm_segments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mtm_pages" ADD CONSTRAINT "mtm_pages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mtm_segments" ADD CONSTRAINT "mtm_segments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stm_pages" ADD CONSTRAINT "stm_pages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_kb" ADD CONSTRAINT "user_kb_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_profile" ADD CONSTRAINT "user_profile_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_traits" ADD CONSTRAINT "user_traits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_traits_user_time_idx" ON "agent_traits" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "mtm_pages_segment_idx" ON "mtm_pages" USING btree ("segment_id");--> statement-breakpoint
CREATE INDEX "mtm_pages_user_idx" ON "mtm_pages" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "mtm_segments_user_idx" ON "mtm_segments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "stm_user_time_idx" ON "stm_pages" USING btree ("user_id","timestamp");--> statement-breakpoint
CREATE INDEX "user_kb_user_time_idx" ON "user_kb" USING btree ("user_id","created_at");