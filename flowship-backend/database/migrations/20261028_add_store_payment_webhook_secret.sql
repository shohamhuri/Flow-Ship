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
        IF to_regclass(
            format('%I.stores', tenant_schema)
        ) IS NOT NULL THEN
            EXECUTE format(
                'ALTER TABLE %I.stores
                 ADD COLUMN IF NOT EXISTS
                 payment_webhook_secret text',
                tenant_schema
            );
        END IF;
    END LOOP;
END $$;