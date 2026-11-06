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
        IF to_regclass(format('%I.shipments', tenant_schema)) IS NULL THEN
            RAISE NOTICE 'Skipping tenant schema without shipments table: %', tenant_schema;
            CONTINUE;
        END IF;

        EXECUTE format(
            'ALTER TABLE %I.shipments
             ADD COLUMN IF NOT EXISTS ready_at timestamptz',
            tenant_schema
        );
    END LOOP;
END $$;
