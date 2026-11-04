DO $$
DECLARE
    tenant_schema text;
BEGIN
    FOR tenant_schema IN
        SELECT schema_name
        FROM public.flowship_tenants
    LOOP
        IF to_regclass(
            format('%I.shipment_monitoring_anomalies', tenant_schema)
        ) IS NULL THEN
            RAISE NOTICE 'Skipping schema without monitoring table: %', tenant_schema;
            CONTINUE;
        END IF;

        EXECUTE format(
            'ALTER TABLE %I.shipment_monitoring_anomalies
             ADD COLUMN IF NOT EXISTS event_key text',
            tenant_schema
        );

        EXECUTE format(
            'CREATE UNIQUE INDEX IF NOT EXISTS shipment_monitoring_event_key_unique_idx
             ON %I.shipment_monitoring_anomalies (event_key)
             WHERE event_key IS NOT NULL',
            tenant_schema
        );

        RAISE NOTICE 'Added monitoring event key to schema: %', tenant_schema;
    END LOOP;
END $$;
