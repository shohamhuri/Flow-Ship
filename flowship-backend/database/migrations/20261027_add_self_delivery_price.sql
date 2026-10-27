-- Add configurable self-delivery price per store and source.
-- Applies to all registered tenant schemas.

DO $$
DECLARE
    tenant_schema text;
BEGIN
    FOR tenant_schema IN
        SELECT DISTINCT schema_name
        FROM public.flowship_tenants
        WHERE schema_name IS NOT NULL
    LOOP
        IF NOT EXISTS (
            SELECT 1
            FROM information_schema.schemata
            WHERE schema_name = tenant_schema
        ) THEN
            RAISE NOTICE 'Skipping missing tenant schema: %',
                tenant_schema;
            CONTINUE;
        END IF;

        IF to_regclass(format('%I.source_delivery_permissions', tenant_schema)) IS NULL THEN
            RAISE NOTICE 'Skipping missing permissions table: %',
                tenant_schema;
            CONTINUE;
        END IF;

        EXECUTE format(
            'ALTER TABLE %I.source_delivery_permissions
             ADD COLUMN IF NOT EXISTS self_delivery_price numeric(10,2)',
            tenant_schema
        );

        EXECUTE format(
            'ALTER TABLE %I.source_delivery_permissions
             DROP CONSTRAINT IF EXISTS source_delivery_price_nonnegative',
            tenant_schema
        );

        EXECUTE format(
            'ALTER TABLE %I.source_delivery_permissions
             ADD CONSTRAINT source_delivery_price_nonnegative
             CHECK (self_delivery_price >= 0)',
            tenant_schema
        );

        RAISE NOTICE 'Added self-delivery price for schema: %',
            tenant_schema;
    END LOOP;
END $$;
