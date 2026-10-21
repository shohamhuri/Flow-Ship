
-- Allow multiple physical shipments per shipment group.
-- Applies to all registered tenant schemas, including inactive tenants.
-- Does not delete or modify existing shipment records.

DO $$
DECLARE
    tenant_schema text;
BEGIN
    FOR tenant_schema IN
        SELECT DISTINCT schema_name
        FROM public.flowship_tenants
        WHERE schema_name IS NOT NULL
    LOOP
        IF to_regclass(format('%I.shipments', tenant_schema)) IS NULL THEN
            RAISE NOTICE 'Skipping tenant schema without shipments table: %',
                tenant_schema;
            CONTINUE;
        END IF;

        EXECUTE format(
            'ALTER TABLE %I.shipments DROP CONSTRAINT IF EXISTS shipments_shipment_group_id_key',
            tenant_schema
        );

        RAISE NOTICE 'Checked shipments constraint for schema: %',
            tenant_schema;
    END LOOP;
END $$;
