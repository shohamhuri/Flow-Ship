BEGIN;

CREATE SCHEMA IF NOT EXISTS flow_ship_test;

INSERT INTO public.flowship_tenants
    (name, schema_name, api_key, status, timezone)
VALUES
    ('FLOW_SHIP_TEST', 'flow_ship_test', 'local-test-key', 'active', 'Asia/Jerusalem')
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS flow_ship_test.delivery_settings (
    id integer PRIMARY KEY,
    express_max_minutes integer NOT NULL,
    same_day_max_minutes integer NOT NULL,
    express_cutoff_time time,
    express_after_cutoff_mode text NOT NULL,
    express_after_cutoff_max_minutes integer,
    updated_at timestamptz DEFAULT now()
);
ALTER TABLE flow_ship_test.delivery_settings
ADD COLUMN IF NOT EXISTS pickup_lead_time_minutes
INTEGER NOT NULL DEFAULT 0
CHECK (pickup_lead_time_minutes >= 0);
INSERT INTO flow_ship_test.delivery_settings (
    id,
    express_max_minutes,
    same_day_max_minutes,
    express_cutoff_time,
    express_after_cutoff_mode,
    express_after_cutoff_max_minutes
)
VALUES (
    1, 120, 1440, '12:00:00', 'extended', 300
)
ON CONFLICT (id) DO UPDATE SET
    express_max_minutes = EXCLUDED.express_max_minutes,
    same_day_max_minutes = EXCLUDED.same_day_max_minutes,
    express_cutoff_time = EXCLUDED.express_cutoff_time,
    express_after_cutoff_mode = EXCLUDED.express_after_cutoff_mode,
    express_after_cutoff_max_minutes = EXCLUDED.express_after_cutoff_max_minutes;

COMMIT;
