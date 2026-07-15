CREATE TABLE "namespace" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "namespace_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "post_series" (
	"post_id" integer NOT NULL,
	"series_id" integer NOT NULL,
	"order" text NOT NULL,
	CONSTRAINT "post_series_post_id_series_id_pk" PRIMARY KEY("post_id","series_id")
);
--> statement-breakpoint
CREATE TABLE "post_tag" (
	"post_id" integer NOT NULL,
	"tag_id" integer NOT NULL,
	CONSTRAINT "post_tag_post_id_tag_id_pk" PRIMARY KEY("post_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "post" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"slug" text,
	"content_md" text DEFAULT '' NOT NULL,
	"heading_tree" jsonb,
	"parse_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"parsed_at" timestamp with time zone,
	CONSTRAINT "post_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "series" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_completed" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "special_page" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"post_id" integer NOT NULL,
	"label" text,
	CONSTRAINT "special_page_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "tag_closure" (
	"ancestor_id" integer NOT NULL,
	"descendant_id" integer NOT NULL,
	"depth" integer NOT NULL,
	CONSTRAINT "tag_closure_ancestor_id_descendant_id_pk" PRIMARY KEY("ancestor_id","descendant_id")
);
--> statement-breakpoint
CREATE TABLE "tag" (
	"id" serial PRIMARY KEY NOT NULL,
	"namespace_id" integer NOT NULL,
	"parent_tag_id" integer,
	"name" text NOT NULL,
	CONSTRAINT "tag_ns_parent_name_uq" UNIQUE NULLS NOT DISTINCT("namespace_id","parent_tag_id","name")
);
--> statement-breakpoint
ALTER TABLE "post_series" ADD CONSTRAINT "post_series_post_id_post_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."post"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_series" ADD CONSTRAINT "post_series_series_id_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_tag" ADD CONSTRAINT "post_tag_post_id_post_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."post"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_tag" ADD CONSTRAINT "post_tag_tag_id_tag_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tag"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "special_page" ADD CONSTRAINT "special_page_post_id_post_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."post"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tag_closure" ADD CONSTRAINT "tag_closure_ancestor_id_tag_id_fk" FOREIGN KEY ("ancestor_id") REFERENCES "public"."tag"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tag_closure" ADD CONSTRAINT "tag_closure_descendant_id_tag_id_fk" FOREIGN KEY ("descendant_id") REFERENCES "public"."tag"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tag" ADD CONSTRAINT "tag_namespace_id_namespace_id_fk" FOREIGN KEY ("namespace_id") REFERENCES "public"."namespace"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tag" ADD CONSTRAINT "tag_parent_tag_id_tag_id_fk" FOREIGN KEY ("parent_tag_id") REFERENCES "public"."tag"("id") ON DELETE restrict ON UPDATE no action;