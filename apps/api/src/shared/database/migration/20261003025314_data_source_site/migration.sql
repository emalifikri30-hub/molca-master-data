ALTER TABLE "master_data"."data_source" ADD COLUMN "site_id" text;--> statement-breakpoint
-- Rows from before site_id: a region with exactly one site gets that site.
-- Anything else stays empty until a person sets it (F-13 §9.1).
UPDATE "master_data"."data_source" AS "ds"
SET "site_id" = "one"."site_id"
FROM (
  SELECT "region", min("id") AS "site_id"
  FROM "master_data"."site"
  GROUP BY "region"
  HAVING count(*) = 1
) AS "one"
WHERE "ds"."site_id" IS NULL AND "ds"."region" = "one"."region";
