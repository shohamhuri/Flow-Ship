-- CI test database additions for Self-Delivery.
-- Production migrations remain unchanged.

DO $$
DECLARE
    tenant_schema text;
BEGIN
    FOREACH tenant_schema IN ARRAY ARRAY['flow_ship_test_a', 'flow_ship_test_b']
    LOOP
        EXECUTE format(
            'CREATE TABLE IF NOT EXISTS %I.source_delivery_permissions (
                id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                store_id text NOT NULL,
                source_id text NOT NULL,
                self_delivery_allowed boolean NOT NULL DEFAULT false,
                created_at timestamptz NOT NULL DEFAULT now(),
                updated_at timestamptz NOT NULL DEFAULT now(),
                CONSTRAINT source_delivery_permissions_store_source_key UNIQUE (store_id, source_id),
                self_delivery_price numeric(10,2),
                CONSTRAINT source_delivery_price_nonnegative CHECK (self_delivery_price >= 0)
            )',
            tenant_schema
        );
    END LOOP;
END $$;

-- Status update timeout settings for CI tenants.
DO $$
DECLARE
    tenant_schema text;
BEGIN
    FOREACH tenant_schema IN ARRAY ARRAY[
        'flow_ship_test',
        'flow_ship_test_a',
        'flow_ship_test_b'
    ]
    LOOP
        IF to_regclass(format('%I.delivery_settings', tenant_schema)) IS NOT NULL THEN
            EXECUTE format(
                'ALTER TABLE %I.delivery_settings
                 ADD COLUMN IF NOT EXISTS status_update_timeout_minutes
                 integer NOT NULL DEFAULT 60',
                tenant_schema
            );

            EXECUTE format(
                'ALTER TABLE %I.delivery_settings
                 DROP CONSTRAINT IF EXISTS delivery_settings_status_update_timeout_check',
                tenant_schema
            );

            EXECUTE format(
                'ALTER TABLE %I.delivery_settings
                 ADD CONSTRAINT delivery_settings_status_update_timeout_check
                 CHECK (status_update_timeout_minutes > 0)',
                tenant_schema
            );
        END IF;
    END LOOP;
END $$;

-- Self-delivery fulfillment records for CI tenants.
DO $$
DECLARE
    tenant_schema text;
BEGIN
    FOREACH tenant_schema IN ARRAY ARRAY[
        'flow_ship_test_a',
        'flow_ship_test_b'
    ]
    LOOP
        EXECUTE format(
            'CREATE TABLE IF NOT EXISTS %I.self_delivery_fulfillments (
                id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                shipment_id uuid NOT NULL UNIQUE
                    REFERENCES %I.shipments(id),
                source_id text NOT NULL,
                request_id uuid NOT NULL UNIQUE,
                status text NOT NULL DEFAULT ''pending'',
                source_order_id text,
                error_message text,
                request_payload jsonb NOT NULL,
                created_at timestamptz NOT NULL DEFAULT now(),
                updated_at timestamptz NOT NULL DEFAULT now(),
                CONSTRAINT self_delivery_fulfillments_status_check
                    CHECK (status IN (
                        ''pending'', ''processing'', ''confirmed'', ''failed''
                    )),
                CONSTRAINT self_delivery_fulfillments_confirmed_check
                    CHECK (
                        status <> ''confirmed''
                        OR (
                            source_order_id IS NOT NULL
                            AND length(trim(source_order_id)) > 0
                        )
                    )
            )',
            tenant_schema,
            tenant_schema
        );

        EXECUTE format(
            'CREATE UNIQUE INDEX IF NOT EXISTS
                self_delivery_source_order_unique_idx
             ON %I.self_delivery_fulfillments (source_id, source_order_id)
             WHERE source_order_id IS NOT NULL',
            tenant_schema
        );
    END LOOP;
END $$;

-- Supplier self-delivery integration settings for CI tenants.
DO $$
DECLARE
    tenant_schema text;
BEGIN
    FOREACH tenant_schema IN ARRAY ARRAY[
        'flow_ship_test',
        'flow_ship_test_a',
        'flow_ship_test_b'
    ]
    LOOP
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
                webhook_id uuid DEFAULT gen_random_uuid(),
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

        EXECUTE format(
            'ALTER TABLE %I.source_delivery_integrations
             ADD COLUMN IF NOT EXISTS webhook_id uuid DEFAULT gen_random_uuid()',
            tenant_schema
        );

        EXECUTE format(
            'CREATE UNIQUE INDEX IF NOT EXISTS
                source_delivery_integrations_webhook_id_uidx
             ON %I.source_delivery_integrations (webhook_id)',
            tenant_schema
        );
    END LOOP;
END $$;

-- Create shipment events tables for CI tenants.
DO $$
DECLARE
    tenant_schema text;
BEGIN
    FOREACH tenant_schema IN ARRAY ARRAY[
        'flow_ship_test_a',
        'flow_ship_test_b'
    ]
    LOOP
        EXECUTE format(
            'CREATE TABLE IF NOT EXISTS %I.shipment_events (
                id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                shipment_id uuid NOT NULL REFERENCES %I.shipments(id),
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
    END LOOP;
END $$;

-- Shipment tracking columns for CI tenants.
DO $$
DECLARE
    tenant_schema text;
BEGIN
    FOREACH tenant_schema IN ARRAY ARRAY[
        'flow_ship_test_a',
        'flow_ship_test_b'
    ]
    LOOP
        EXECUTE format(
            'ALTER TABLE %I.shipments
             ADD COLUMN IF NOT EXISTS preparation_time_minutes integer',
            tenant_schema
        );

        EXECUTE format(
            'ALTER TABLE %I.shipments
             ADD COLUMN IF NOT EXISTS ready_at timestamptz',
            tenant_schema
        );

        EXECUTE format(
            'ALTER TABLE %I.shipments
             ADD COLUMN IF NOT EXISTS estimated_delivery_at timestamptz',
            tenant_schema
        );

        EXECUTE format(
            'ALTER TABLE %I.shipment_events
             ADD COLUMN IF NOT EXISTS recorded_at timestamptz DEFAULT now()',
            tenant_schema
        );

        EXECUTE format(
            'ALTER TABLE %I.shipment_events
             ADD COLUMN IF NOT EXISTS external_event_id text',
            tenant_schema
        );
    END LOOP;
END $$;

-- Shipment monitoring anomalies for CI tenants.
DO $$
DECLARE
    tenant_schema text;
BEGIN
    FOREACH tenant_schema IN ARRAY ARRAY[
        'flow_ship_test_a',
        'flow_ship_test_b'
    ]
    LOOP
        EXECUTE format(
            'CREATE TABLE IF NOT EXISTS %I.shipment_monitoring_anomalies (
                id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                shipment_id uuid NOT NULL
                    REFERENCES %I.shipments(id) ON DELETE CASCADE,
                anomaly_type text NOT NULL
                    CHECK (anomaly_type IN (
                        ''preparation_delay'',
                        ''delivery_delay'',
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
                event_key text,
                CHECK (
                    (status = ''resolved'') = (resolved_at IS NOT NULL)
                )
            )',
            tenant_schema,
            tenant_schema
        );

        EXECUTE format(
            'CREATE UNIQUE INDEX IF NOT EXISTS shipment_monitoring_active_unique_idx
             ON %I.shipment_monitoring_anomalies (shipment_id, anomaly_type)
             WHERE status IN (''open'', ''acknowledged'')',
            tenant_schema
        );

        EXECUTE format(
            'CREATE INDEX IF NOT EXISTS shipment_monitoring_status_detected_idx
             ON %I.shipment_monitoring_anomalies (status, detected_at DESC)',
            tenant_schema
        );

        EXECUTE format(
            'CREATE UNIQUE INDEX IF NOT EXISTS shipment_monitoring_event_key_unique_idx
             ON %I.shipment_monitoring_anomalies (event_key)
             WHERE event_key IS NOT NULL',
            tenant_schema
        );
    END LOOP;
END $$;

-- Shipment event indexes for CI tenants.
DO $$
DECLARE
    tenant_schema text;
BEGIN
    FOREACH tenant_schema IN ARRAY ARRAY[
        'flow_ship_test_a',
        'flow_ship_test_b'
    ]
    LOOP
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

-- Payment webhook columns for CI tenants.
DO $$
DECLARE
    tenant_schema text;
BEGIN
    FOREACH tenant_schema IN ARRAY ARRAY[
        'flow_ship_test_a',
        'flow_ship_test_b'
    ]
    LOOP
        EXECUTE format(
            'ALTER TABLE %I.stores ADD COLUMN IF NOT EXISTS payment_webhook_secret text',
            tenant_schema
        );

        EXECUTE format(
            'ALTER TABLE %I.webhook_logs ADD COLUMN IF NOT EXISTS processing_started_at timestamptz',
            tenant_schema
        );
    END LOOP;
END $$;
