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
            format('%I.webhook_logs', tenant_schema)
        ) IS NULL THEN
            RAISE NOTICE
                'Skipping schema %: webhook_logs table does not exist',
                tenant_schema;
            CONTINUE;
        END IF;

        EXECUTE format(
            'ALTER TABLE %I.webhook_logs
             ADD COLUMN IF NOT EXISTS
             processing_started_at timestamptz',
            tenant_schema
        );

        RAISE NOTICE
            'Updated webhook_logs in schema %',
            tenant_schema;
    END LOOP;
END $$;