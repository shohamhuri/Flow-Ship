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
            format('%I.delivery_settings', tenant_schema)
        ) IS NULL THEN
            RAISE NOTICE 'Skipping schema: %', tenant_schema;
            CONTINUE;
        END IF;

        EXECUTE format(
            'ALTER TABLE %I.delivery_settings
             ADD COLUMN IF NOT EXISTS
                 status_update_timeout_minutes integer
                 NOT NULL DEFAULT 60',
            tenant_schema
        );

        EXECUTE format(
            'ALTER TABLE %I.delivery_settings
             DROP CONSTRAINT IF EXISTS
                 delivery_settings_status_update_timeout_check',
            tenant_schema
        );

        EXECUTE format(
            'ALTER TABLE %I.delivery_settings
             ADD CONSTRAINT
                 delivery_settings_status_update_timeout_check
             CHECK (status_update_timeout_minutes > 0)',
            tenant_schema
        );
    END LOOP;
END $$;
