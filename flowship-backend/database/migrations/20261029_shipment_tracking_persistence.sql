
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
    RAISE NOTICE
        'Skipping tenant schema without shipments table: %',
        tenant_schema;
    CONTINUE;
END IF;

        EXECUTE format(
            'ALTER TABLE %I.shipments
             ADD COLUMN IF NOT EXISTS preparation_time_minutes integer,
             ADD COLUMN IF NOT EXISTS estimated_delivery_at timestamptz',
            tenant_schema
        );

        EXECUTE format(
            'CREATE TABLE IF NOT EXISTS %I.shipment_events (
                id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                shipment_id uuid NOT NULL
                    REFERENCES %I.shipments(id),
                event_type text NOT NULL,
                previous_status text,
                new_status text,
                occurred_at timestamptz NOT NULL,
                recorded_at timestamptz NOT NULL DEFAULT now(),
                external_event_id text,
                source_id text,
                error_code text,
                error_message text,
                metadata jsonb NOT NULL DEFAULT ''{}''::jsonb
            )',
            tenant_schema,
            tenant_schema
        );

        EXECUTE format(
            'CREATE INDEX IF NOT EXISTS shipment_events_shipment_time_idx
             ON %I.shipment_events
             (shipment_id, occurred_at, recorded_at)',
            tenant_schema
        );

        EXECUTE format(
            'CREATE UNIQUE INDEX IF NOT EXISTS shipment_events_external_id_idx
             ON %I.shipment_events
             (source_id, external_event_id)
             WHERE source_id IS NOT NULL
               AND external_event_id IS NOT NULL',
            tenant_schema
        );
    END LOOP;
END $$;
