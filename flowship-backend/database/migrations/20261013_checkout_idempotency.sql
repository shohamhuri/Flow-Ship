-- Checkout idempotency migration
-- Apply to existing tenant schemas.
-- Does not delete or overwrite existing checkout data.

DO $$
DECLARE
    tenant_schema text;
BEGIN
    FOREACH tenant_schema IN ARRAY ARRAY[
        'flow_ship_test',
        'flow_ship_test_a',
        'flow_ship_test_b',
        'queen'
    ]
    LOOP
        IF NOT EXISTS (
            SELECT 1
            FROM information_schema.schemata
            WHERE schema_name = tenant_schema
        ) THEN
            RAISE EXCEPTION 'Tenant schema % does not exist', tenant_schema;
        END IF;

        EXECUTE format(
            'ALTER TABLE %I.checkouts ALTER COLUMN store_id TYPE text USING store_id::text',
            tenant_schema
        );

        EXECUTE format(
            'ALTER TABLE %I.checkouts ADD COLUMN IF NOT EXISTS request_fingerprint text',
            tenant_schema
        );

        EXECUTE format(
            'ALTER TABLE %I.checkout_processing ADD COLUMN IF NOT EXISTS response_payload jsonb',
            tenant_schema
        );

        EXECUTE format(
            'CREATE UNIQUE INDEX IF NOT EXISTS checkouts_platform_store_external_checkout_unique
             ON %I.checkouts (platform, store_id, external_checkout_id)
             WHERE external_checkout_id IS NOT NULL',
            tenant_schema
        );

        EXECUTE format(
            'CREATE UNIQUE INDEX IF NOT EXISTS checkouts_platform_store_external_order_unique
             ON %I.checkouts (platform, store_id, external_order_id)
             WHERE external_order_id IS NOT NULL',
            tenant_schema
        );
    END LOOP;
END $$;
