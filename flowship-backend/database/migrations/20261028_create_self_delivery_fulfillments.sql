
-- Self-delivery fulfillment records.
-- One fulfillment request per physical shipment, per tenant.

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
        IF NOT EXISTS (
            SELECT 1
            FROM information_schema.schemata
            WHERE schema_name = tenant_schema
        ) THEN
            RAISE EXCEPTION
                'Tenant schema % does not exist',
                tenant_schema;
        END IF;

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
                        ''pending'',
                        ''processing'',
                        ''confirmed'',
                        ''failed''
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
    END LOOP;
END $$;
