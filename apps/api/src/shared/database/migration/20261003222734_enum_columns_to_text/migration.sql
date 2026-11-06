-- Fixed value lists are plain `text` (schema/value-lists.ts). Only a database that ran
-- the earlier Postgres-enum versions of 20261003070553_enums / 20261003072556 has
-- master_data enum types; there, this converts every enum column back to text and
-- drops the types. Anywhere else (the shared dev DB, a fresh database) it does nothing.
DO $mig$
DECLARE
  item record;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'master_data' AND t.typtype = 'e'
  ) THEN
    RETURN;
  END IF;

  -- 1. Views that read the enum columns, directly or through other views (any schema).
  --    Saved with their definitions (enum casts rewritten to ::text) and dropped;
  --    recreated in the same order after.
  CREATE TEMP TABLE _mig_views ON COMMIT DROP AS
  WITH RECURSIVE enum_tables AS (
    SELECT DISTINCT c.attrelid AS oid
    FROM pg_attribute c
    JOIN pg_type t ON t.oid = c.atttypid
    JOIN pg_namespace tn ON tn.oid = t.typnamespace
    JOIN pg_class rel ON rel.oid = c.attrelid AND rel.relkind = 'r'
    WHERE tn.nspname = 'master_data' AND t.typtype = 'e' AND NOT c.attisdropped
  ),
  deps AS (
    SELECT DISTINCT r.ev_class AS oid, 1 AS depth
    FROM pg_depend d JOIN pg_rewrite r ON r.oid = d.objid
    WHERE d.refobjid IN (SELECT oid FROM enum_tables) AND r.ev_class <> d.refobjid
    UNION
    SELECT DISTINCT r.ev_class, deps.depth + 1
    FROM deps
    JOIN pg_depend d ON d.refobjid = deps.oid
    JOIN pg_rewrite r ON r.oid = d.objid
    WHERE r.ev_class <> d.refobjid AND deps.depth < 20
  )
  SELECT n.nspname AS schema_name, c.relname AS view_name, c.relkind,
         regexp_replace(pg_get_viewdef(c.oid, true), '::master_data\.\w+', '::text', 'g') AS definition,
         max(deps.depth) AS depth
  FROM deps
  JOIN pg_class c ON c.oid = deps.oid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relkind IN ('v', 'm')
  GROUP BY n.nspname, c.relname, c.relkind, c.oid;

  FOR item IN SELECT * FROM _mig_views ORDER BY depth DESC LOOP
    EXECUTE format('DROP %s IF EXISTS %I.%I CASCADE',
      CASE item.relkind WHEN 'm' THEN 'MATERIALIZED VIEW' ELSE 'VIEW' END,
      item.schema_name, item.view_name);
  END LOOP;

  -- 2. Constraints and indexes on master_data tables whose definition casts to an
  --    enum type (the partial no-overlap rules). Saved, dropped, recreated on text.
  CREATE TEMP TABLE _mig_constraints ON COMMIT DROP AS
  SELECT n.nspname AS schema_name, cl.relname AS table_name, co.conname,
         regexp_replace(pg_get_constraintdef(co.oid), '::master_data\.\w+', '::text', 'g') AS definition
  FROM pg_constraint co
  JOIN pg_class cl ON cl.oid = co.conrelid
  JOIN pg_namespace n ON n.oid = cl.relnamespace
  WHERE n.nspname = 'master_data' AND pg_get_constraintdef(co.oid) ~ '::master_data\.\w+';

  CREATE TEMP TABLE _mig_indexes ON COMMIT DROP AS
  SELECT i.schemaname, i.indexname,
         regexp_replace(i.indexdef, '::master_data\.\w+', '::text', 'g') AS definition
  FROM pg_indexes i
  WHERE i.schemaname = 'master_data' AND i.indexdef ~ '::master_data\.\w+'
    AND NOT EXISTS (
      SELECT 1 FROM pg_constraint co
      JOIN pg_class ic ON ic.oid = co.conindid
      WHERE ic.relname = i.indexname
    );

  FOR item IN SELECT * FROM _mig_constraints LOOP
    EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', item.schema_name, item.table_name, item.conname);
  END LOOP;
  FOR item IN SELECT * FROM _mig_indexes LOOP
    EXECUTE format('DROP INDEX %I.%I', item.schemaname, item.indexname);
  END LOOP;

  -- 3. Every enum-typed column in master_data becomes text.
  FOR item IN
    SELECT n.nspname AS schema_name, cl.relname AS table_name, a.attname AS column_name
    FROM pg_attribute a
    JOIN pg_class cl ON cl.oid = a.attrelid AND cl.relkind = 'r'
    JOIN pg_namespace n ON n.oid = cl.relnamespace
    JOIN pg_type t ON t.oid = a.atttypid
    JOIN pg_namespace tn ON tn.oid = t.typnamespace
    WHERE n.nspname = 'master_data' AND tn.nspname = 'master_data' AND t.typtype = 'e'
      AND NOT a.attisdropped
  LOOP
    EXECUTE format('ALTER TABLE %I.%I ALTER COLUMN %I SET DATA TYPE text USING %I::text',
      item.schema_name, item.table_name, item.column_name, item.column_name);
  END LOOP;

  -- 4. Constraints, indexes and views back, now on text.
  FOR item IN SELECT * FROM _mig_constraints LOOP
    EXECUTE format('ALTER TABLE %I.%I ADD CONSTRAINT %I %s',
      item.schema_name, item.table_name, item.conname, item.definition);
  END LOOP;
  FOR item IN SELECT * FROM _mig_indexes LOOP
    EXECUTE item.definition;
  END LOOP;
  FOR item IN SELECT * FROM _mig_views ORDER BY depth LOOP
    EXECUTE format('CREATE %s %I.%I AS %s',
      CASE item.relkind WHEN 'm' THEN 'MATERIALIZED VIEW' ELSE 'VIEW' END,
      item.schema_name, item.view_name, item.definition);
  END LOOP;

  -- 5. The enum types are no longer used.
  FOR item IN
    SELECT t.typname FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'master_data' AND t.typtype = 'e'
  LOOP
    EXECUTE format('DROP TYPE master_data.%I', item.typname);
  END LOOP;
END $mig$;
