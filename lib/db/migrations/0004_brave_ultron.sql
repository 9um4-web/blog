ALTER TABLE "series" ADD COLUMN "slug" text;--> statement-breakpoint
ALTER TABLE "tag" ADD COLUMN "slug" text;--> statement-breakpoint
UPDATE "series" SET "slug" = 'series-' || id;--> statement-breakpoint
UPDATE "tag" SET "slug" = 'tag-' || id;--> statement-breakpoint
ALTER TABLE "series" ALTER COLUMN "slug" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "tag" ALTER COLUMN "slug" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "series" ADD CONSTRAINT "series_slug_unique" UNIQUE("slug");--> statement-breakpoint
ALTER TABLE "tag" ADD CONSTRAINT "tag_slug_unique" UNIQUE("slug");