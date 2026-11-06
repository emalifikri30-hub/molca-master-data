-- UX-SIT-6 (PO, 2026-10-19), F-02 §9.1 / F-03 §9.1: enterprise shifts and fiscal
-- years belong to one enterprise. Existing rows were tenant-wide; they go to the
-- tenant's oldest enterprise. A tenant with rows but no enterprise stops the
-- migration at SET NOT NULL rather than guessing.
ALTER TABLE "master_data"."enterprise_shift" ADD COLUMN "enterprise_id" text;--> statement-breakpoint
ALTER TABLE "master_data"."fiscal_year" ADD COLUMN "enterprise_id" text;--> statement-breakpoint
UPDATE "master_data"."enterprise_shift" AS s SET "enterprise_id" = (
	SELECT e."id" FROM "master_data"."enterprise" AS e
	WHERE e."tenant_id" = s."tenant_id"
	ORDER BY e."created_at", e."id" LIMIT 1
);--> statement-breakpoint
UPDATE "master_data"."fiscal_year" AS f SET "enterprise_id" = (
	SELECT e."id" FROM "master_data"."enterprise" AS e
	WHERE e."tenant_id" = f."tenant_id"
	ORDER BY e."created_at", e."id" LIMIT 1
);--> statement-breakpoint
ALTER TABLE "master_data"."enterprise_shift" ALTER COLUMN "enterprise_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "master_data"."fiscal_year" ALTER COLUMN "enterprise_id" SET NOT NULL;
