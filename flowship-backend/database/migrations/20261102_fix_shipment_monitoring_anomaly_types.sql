DO $$
DECLARE
    tenant_schema text;
    constraint_name text;
BEGIN
    FOREACH tenant_schema IN ARRAY ARRAY[
        'flow_ship_test',
        'flow_ship_test_a',
        'flow_ship_test_b',
        'queen'
    ]
    LOOP
        IF to_regclass(format('%I.shipment_monitoring_anomalies', tenant_schema)) IS NULL THEN
            CONTINUE;
        END IF;

        FOR constraint_name IN
            SELECT c.conname
            FROM pg_constraint c
            JOIN pg_class t ON t.oid = c.conrelid
            JOIN pg_namespace n ON n.oid = t.relnamespace
            WHERE n.nspname = tenant_schema
              AND t.relname = 'shipment_monitoring_anomalies'
              AND c.contype = 'c'
              AND pg_get_constraintdef(c.oid) LIKE '%anomaly_type%'
        LOOP
            EXECUTE format(
                'ALTER TABLE %I.shipment_monitoring_anomalies
                 DROP CONSTRAINT %I',
                tenant_schema,
                constraint_name
            );
        END LOOP;

        EXECUTE format(
            'UPDATE %I.shipment_monitoring_anomalies
             SET anomaly_type = CASE anomaly_type
                 WHEN ''late_preparation'' THEN ''preparation_delay''
                 WHEN ''late_delivery'' THEN ''delivery_delay''
                 ELSE anomaly_type
             END
             WHERE anomaly_type IN (
                 ''late_preparation'', ''late_delivery''
             )',
            tenant_schema
        );

        EXECUTE format(
            'DROP INDEX IF EXISTS %I.shipment_monitoring_delay_unique_idx',
            tenant_schema
        );

        EXECUTE format(
            'ALTER TABLE %I.shipment_monitoring_anomalies
             ADD CONSTRAINT shipment_monitoring_anomaly_type_check
             CHECK (anomaly_type IN (
                 ''preparation_delay'',
                 ''delivery_delay'',
                 ''missing_status_update''
             ))',
            tenant_schema
        );
    END LOOP;
END $$;
