-- Ensure each supplier order maps to one shipment per tenant.

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
        EXECUTE format(
            'CREATE UNIQUE INDEX IF NOT EXISTS
                self_delivery_source_order_unique_idx
             ON %I.self_delivery_fulfillments
                (source_id, source_order_id)
             WHERE source_order_id IS NOT NULL',
            tenant_schema
        );
    END LOOP;
END $$;