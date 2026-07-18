ALTER TABLE "namespace" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$
DECLARE
  ns RECORD;
  new_tag_id INT;
BEGIN
  FOR ns IN SELECT * FROM "namespace" LOOP
    INSERT INTO "tag" ("namespace_id", "parent_tag_id", "name", "slug") 
    VALUES (ns.id, NULL, ns.name, 'ns-' || ns.id)
    RETURNING id INTO new_tag_id;
    
    UPDATE "tag" 
    SET parent_tag_id = new_tag_id 
    WHERE namespace_id = ns.id AND parent_tag_id IS NULL AND id != new_tag_id;
  END LOOP;
END $$;
--> statement-breakpoint
TRUNCATE TABLE "tag_closure";--> statement-breakpoint
WITH RECURSIVE tc AS (
  SELECT id AS ancestor_id, id AS descendant_id, 0 AS depth
  FROM "tag"
  UNION ALL
  SELECT tc.ancestor_id, t.id, tc.depth + 1
  FROM "tag" t
  JOIN tc ON t.parent_tag_id = tc.descendant_id
)
INSERT INTO "tag_closure" (ancestor_id, descendant_id, depth)
SELECT ancestor_id, descendant_id, depth FROM tc;
--> statement-breakpoint
DROP TABLE "namespace" CASCADE;--> statement-breakpoint
ALTER TABLE "tag" DROP CONSTRAINT "tag_ns_parent_name_uq";--> statement-breakpoint

--> statement-breakpoint
ALTER TABLE "tag" DROP COLUMN "namespace_id";--> statement-breakpoint
ALTER TABLE "tag" ADD CONSTRAINT "tag_parent_name_uq" UNIQUE NULLS NOT DISTINCT("parent_tag_id","name");