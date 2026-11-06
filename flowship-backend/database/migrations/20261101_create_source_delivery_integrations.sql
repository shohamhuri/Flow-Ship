
-- Supplier self-delivery integration settings.
-- Separate from business permissions and payment webhook secrets.

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
            RAISE EXCEPTION
                'Tenant schema % does not exist',
                tenant_schema;
        END IF;

        EXECUTE format(
            'CREATE TABLE IF NOT EXISTS %I.source_delivery_integrations (
                id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                store_id text NOT NULL,
                source_id text NOT NULL,
                webhook_secret text,
                webhook_enabled boolean NOT NULL DEFAULT false,
                polling_enabled boolean NOT NULL DEFAULT false,
                created_at timestamptz NOT NULL DEFAULT now(),
                updated_at timestamptz NOT NULL DEFAULT now(),

                CONSTRAINT source_delivery_integrations_store_source_key
                    UNIQUE (store_id, source_id),

                CONSTRAINT source_delivery_integrations_webhook_secret_check
                    CHECK (
                        webhook_enabled = false
                        OR (
                            webhook_secret IS NOT NULL
                            AND length(trim(webhook_secret)) >= 32
                        )
                    )
            )',
            tenant_schema
        );

        RAISE NOTICE
            'Source delivery integrations ready for schema: %',
            tenant_schema;
    END LOOP;
END $$;
