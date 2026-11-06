CREATE TABLE "master_data"."downtime_action" (
	"id" text PRIMARY KEY,
	"region" varchar(16) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"deleted_at" text
);
--> statement-breakpoint
CREATE TABLE "master_data"."downtime_reason_asset" (
	"id" text PRIMARY KEY,
	"region" varchar(16) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"kind" text NOT NULL,
	"reason_id" text NOT NULL,
	"asset_id" text NOT NULL,
	"deleted_at" text
);
--> statement-breakpoint
CREATE TABLE "master_data"."reject_reason_asset" (
	"id" text PRIMARY KEY,
	"region" varchar(16) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"kind" text NOT NULL,
	"reason_id" text NOT NULL,
	"asset_id" text NOT NULL,
	"deleted_at" text
);
--> statement-breakpoint
DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "master_data"."reason_asset"
		WHERE "kind" NOT IN ('downtime', 'reject')
	) THEN
		RAISE EXCEPTION 'reason_asset contains an unsupported kind';
	END IF;
END $$;
--> statement-breakpoint
INSERT INTO "master_data"."downtime_reason_asset" (
	"id", "region", "created_at", "updated_at", "kind", "reason_id", "asset_id", "deleted_at"
)
SELECT
	"id", "region", "created_at", "updated_at", "kind", "reason_id", "asset_id", "deleted_at"
FROM "master_data"."reason_asset"
WHERE "kind" = 'downtime';
--> statement-breakpoint
INSERT INTO "master_data"."reject_reason_asset" (
	"id", "region", "created_at", "updated_at", "kind", "reason_id", "asset_id", "deleted_at"
)
SELECT
	"id", "region", "created_at", "updated_at", "kind", "reason_id", "asset_id", "deleted_at"
FROM "master_data"."reason_asset"
WHERE "kind" = 'reject';
--> statement-breakpoint
DROP TABLE "master_data"."reason_asset";--> statement-breakpoint
CREATE INDEX "downtime_action_region_idx" ON "master_data"."downtime_action" ("region");--> statement-breakpoint
CREATE INDEX "downtime_reason_asset_region_idx" ON "master_data"."downtime_reason_asset" ("region");--> statement-breakpoint
CREATE INDEX "reject_reason_asset_region_idx" ON "master_data"."reject_reason_asset" ("region");