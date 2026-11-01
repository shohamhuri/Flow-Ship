
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
        IF EXISTS (
            SELECT 1
            FROM information_schema.schemata
            WHERE schema_name = tenant_schema
        ) THEN
            EXECUTE format(
                'ALTER TABLE %I.source_delivery_integrations
                 ADD COLUMN IF NOT EXISTS webhook_id uuid
                 DEFAULT gen_random_uuid()',
                tenant_schema
            );

            EXECUTE format(
                'CREATE UNIQUE INDEX IF NOT EXISTS
                 source_delivery_integrations_webhook_id_uidx
                 ON %I.source_delivery_integrations (webhook_id)',
                tenant_schema
            );
        END IF;
    END LOOP;
END $$;
