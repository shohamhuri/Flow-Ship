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
            RAISE NOTICE 'Skipping schema without shipments: %', tenant_schema;
            CONTINUE;
        END IF;

        EXECUTE format(
            'CREATE TABLE IF NOT EXISTS %I.shipment_monitoring_anomalies (
                id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                shipment_id uuid NOT NULL
                    REFERENCES %I.shipments(id) ON DELETE CASCADE,
                anomaly_type text NOT NULL
                    CHECK (anomaly_type IN (
                        ''late_preparation'',
                        ''late_delivery'',
                        ''missing_status_update''
                    )),
                status text NOT NULL DEFAULT ''open''
                    CHECK (status IN (
                        ''open'', ''acknowledged'', ''resolved''
                    )),
                detected_at timestamptz NOT NULL DEFAULT now(),
                acknowledged_at timestamptz,
                resolved_at timestamptz,
                last_checked_at timestamptz NOT NULL DEFAULT now(),
                details jsonb NOT NULL DEFAULT ''{}''::jsonb,
                CHECK (
                    (status = ''resolved'') = (resolved_at IS NOT NULL)
                )
            )',
            tenant_schema,
            tenant_schema
        );

        EXECUTE format(
            'CREATE UNIQUE INDEX IF NOT EXISTS
                shipment_monitoring_active_unique_idx
             ON %I.shipment_monitoring_anomalies
                (shipment_id, anomaly_type)
             WHERE status IN (''open'', ''acknowledged'')',
            tenant_schema
        );

        EXECUTE format(
            'CREATE INDEX IF NOT EXISTS
                shipment_monitoring_status_detected_idx
             ON %I.shipment_monitoring_anomalies
                (status, detected_at DESC)',
            tenant_schema
        );
    END LOOP;
END $$;
