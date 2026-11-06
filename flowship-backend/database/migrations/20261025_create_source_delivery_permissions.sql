
-- Store FlowShip admin permissions for source self-delivery.
-- Supplier self-delivery capabilities remain supplier-owned.
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

        EXECUTE format(
            'CREATE TABLE IF NOT EXISTS %I.source_delivery_permissions (
                id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                store_id text NOT NULL,
                source_id text NOT NULL,
                self_delivery_allowed boolean NOT NULL DEFAULT false,
                created_at timestamptz NOT NULL DEFAULT now(),
                updated_at timestamptz NOT NULL DEFAULT now(),
                CONSTRAINT source_delivery_permissions_store_source_key
                    UNIQUE (store_id, source_id)
            )',
            tenant_schema
        );

        RAISE NOTICE 'Checked source delivery permissions for schema: %',
            tenant_schema;
    END LOOP;
END $$;
