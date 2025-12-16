-- Allow a single customer to have multiple rikshaws (multiple sales)
-- This migration removes any UNIQUE constraints/indexes that enforce
-- a one-to-one relationship via the `customer_id` on sales-related tables.

-- 1) Drop UNIQUE constraint/index on `installment_plans.customer_id` if present
--    This prevents limiting a customer to a single installment plan.
ALTER TABLE public.installment_plans
  DROP CONSTRAINT IF EXISTS installment_plans_customer_id_key;

DROP INDEX IF EXISTS public.installment_plans_customer_id_key;

-- Ensure a non-unique index exists for query performance
CREATE INDEX IF NOT EXISTS idx_installment_plans_customer_id
  ON public.installment_plans (customer_id);

-- 2) Drop UNIQUE constraint/index on `rikshaws.customer_id` if present
--    Some schemas attach a customer directly to a rikshaw. If this was set to unique,
--    it would prevent multiple rikshaws per customer.
ALTER TABLE public.rikshaws
  DROP CONSTRAINT IF EXISTS rikshaws_customer_id_key;

DROP INDEX IF EXISTS public.rikshaws_customer_id_key;

-- Ensure a non-unique index exists for query performance (only if column exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'rikshaws'
      AND column_name = 'customer_id'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_rikshaws_customer_id
      ON public.rikshaws (customer_id);
  END IF;
END $$;

-- 3) Dynamically drop any UNIQUE constraints involving only `customer_id`
--    on targeted tables, regardless of custom naming.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT conname, c.relname AS table_name
    FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND con.contype = 'u' -- UNIQUE constraints
      AND c.relname IN ('installment_plans', 'rikshaws')
      AND (
        SELECT array_agg(att.attname::text ORDER BY att.attname)
        FROM unnest(con.conkey) AS pk
        JOIN pg_attribute att
          ON att.attrelid = con.conrelid AND att.attnum = pk
      ) = ARRAY['customer_id']::text[]
  LOOP
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', r.table_name, r.conname);
  END LOOP;
END $$;

-- Note: Foreign keys like `installment_plans_customer_id_fkey` and `rikshaws_customer_id_fkey`
-- remain intact and continue to enforce referential integrity without enforcing uniqueness.