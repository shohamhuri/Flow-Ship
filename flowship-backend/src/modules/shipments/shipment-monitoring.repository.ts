
import { Injectable } from '@nestjs/common';
import { DbService } from '../../infrastructure/database/db.service';
import type { CurrentTenant } from '../tenants/tenants.service';

export type MonitoringAnomalyType =
    | 'preparation_delay'
    | 'delivery_delay'
    | 'missing_status_update';

export type MonitoringAnomalyStatus =
    | 'open'
    | 'acknowledged'
    | 'resolved';

@Injectable()
export class ShipmentMonitoringRepository {
    constructor(private readonly db: DbService) { }

    private schema(tenant: CurrentTenant): string {
        const name = tenant.schemaName;
        if (!/^[a-zA-Z0-9_]+$/.test(name)) {
            throw new Error('Invalid tenant schema');
        }
        return name;
    }

    async upsertAnomaly(
        tenant: CurrentTenant,
        shipmentId: string,
        anomalyType: MonitoringAnomalyType,
        details: Record<string, unknown>,
    ): Promise<void> {
        const schema = this.schema(tenant);

        await this.db.query(
            `
            INSERT INTO "${schema}".shipment_monitoring_anomalies
                (shipment_id, anomaly_type, status, details)
            VALUES ($1, $2, 'open', $3::jsonb)
            ON CONFLICT (shipment_id, anomaly_type)
                WHERE status IN ('open', 'acknowledged')
            DO UPDATE SET
                last_checked_at = now(),
                details = EXCLUDED.details
            `,
            [shipmentId, anomalyType, JSON.stringify(details)],
        );
    }

    async resolveAnomaly(
        tenant: CurrentTenant,
        shipmentId: string,
        anomalyType: MonitoringAnomalyType,
    ): Promise<void> {
        const schema = this.schema(tenant);

        await this.db.query(
            `
            UPDATE "${schema}".shipment_monitoring_anomalies
            SET status = 'resolved',
                resolved_at = now(),
                last_checked_at = now()
            WHERE shipment_id = $1
              AND anomaly_type = $2
              AND status IN ('open', 'acknowledged')
            `,
            [shipmentId, anomalyType],
        );
    }

    async acknowledgeAnomaly(
        tenant: CurrentTenant,
        anomalyId: string,
    ): Promise<boolean> {
        const schema = this.schema(tenant);

        const result = await this.db.query(
            `
        UPDATE "${schema}".shipment_monitoring_anomalies
        SET status = 'acknowledged',
            acknowledged_at = now()
        WHERE id = $1
          AND status = 'open'
        RETURNING id
        `,
            [anomalyId],
        );

        return result.length > 0;
    }
    async findAnomalies(
        tenant: CurrentTenant,
        status?: MonitoringAnomalyStatus,
    ) {
        const schema = this.schema(tenant);

        return this.db.query(
            `
            SELECT *
            FROM "${schema}".shipment_monitoring_anomalies
            WHERE ($1::text IS NULL OR status = $1)
            ORDER BY detected_at DESC
            `,
            [status ?? null],
        );
    }

    async findShipmentsToMonitor(
        tenant: CurrentTenant,
    ) {
        const schema = this.schema(tenant);

        return this.db.query<{
            id: string;
            status: string;
            created_at: Date;
            ready_at: Date | null;
            estimated_delivery_at: Date | null;
            delivered_at: Date | null;
            failed_at: Date | null;
            actual_ready_at: Date | null;
            last_status_update_at: Date | null;
            source_confirmed_at: Date | null;
        }>(
            `
        SELECT
            s.id,
            s.status,
            s.created_at,
            s.ready_at,
            s.estimated_delivery_at,
            s.delivered_at,
            s.failed_at,
              f.updated_at AS source_confirmed_at,

            (
                SELECT MIN(e.occurred_at)
                FROM "${schema}".shipment_events e
                WHERE e.shipment_id = s.id
                  AND e.new_status = 'ready_for_pickup'
            ) AS actual_ready_at,

            (
                SELECT MAX(e.recorded_at)
                FROM "${schema}".shipment_events e
                WHERE e.shipment_id = s.id
                  AND e.source_id IS NOT NULL
            ) AS last_status_update_at

        FROM "${schema}".shipments s
          LEFT JOIN "${schema}".self_delivery_fulfillments f
            ON f.shipment_id = s.id
           AND f.status = 'confirmed'

      
WHERE s.metadata->>'deliveryMethod' = 'self_delivery'
  AND (
      s.status NOT IN ('delivered', 'failed')

      OR s.delivered_at > s.estimated_delivery_at

      OR EXISTS (
          SELECT 1
          FROM "${schema}".shipment_events e
          WHERE e.shipment_id = s.id
            AND e.new_status = 'ready_for_pickup'
            AND e.occurred_at > s.ready_at
      )

      OR EXISTS (
          SELECT 1
          FROM "${schema}".shipment_monitoring_anomalies a
          WHERE a.shipment_id = s.id
            AND a.status IN ('open', 'acknowledged')
      )
  )

        ORDER BY s.created_at DESC
        `,
        );
    }


    async recordResolvedAnomaly(
        tenant: CurrentTenant,
        shipmentId: string,
        anomalyType: MonitoringAnomalyType,
        details: Record<string, unknown>,
    ): Promise<void> {
        const schema = this.schema(tenant);

        const eventTime =
            anomalyType === 'preparation_delay'
                ? details.actualReadyAt
                : details.deliveredAt;

        if (typeof eventTime !== 'string' &&
            !(eventTime instanceof Date)) {
            throw new Error(
                `Missing event time for ${anomalyType}`,
            );
        }

        const eventKey = [
            shipmentId,
            anomalyType,
            new Date(eventTime).toISOString(),
        ].join(':');

        await this.db.query(
            `
   WITH existing_event AS (
    SELECT id
    FROM "${schema}".shipment_monitoring_anomalies
    WHERE event_key = $3
),
resolved_active AS (
    UPDATE "${schema}".shipment_monitoring_anomalies
    SET status = 'resolved',
        resolved_at = now(),
        last_checked_at = now(),
        event_key = CASE
            WHEN EXISTS (SELECT 1 FROM existing_event)
                THEN NULL
            ELSE $3
        END,
        details = details || $4::jsonb
    WHERE shipment_id = $1
      AND anomaly_type = $2
      AND status IN ('open', 'acknowledged')
    RETURNING id
)
INSERT INTO "${schema}".shipment_monitoring_anomalies
    (
        shipment_id,
        anomaly_type,
        event_key,
        status,
        detected_at,
        resolved_at,
        last_checked_at,
        details
    )
SELECT
    $1,
    $2,
    $3,
    'resolved',
    now(),
    now(),
    now(),
    $4::jsonb
WHERE NOT EXISTS (SELECT 1 FROM resolved_active)
  AND NOT EXISTS (SELECT 1 FROM existing_event)
ON CONFLICT (event_key)
    WHERE event_key IS NOT NULL
DO NOTHING
    `,
            [
                shipmentId,
                anomalyType,
                eventKey,
                JSON.stringify(details),
            ],
        );
    }

    async finalizeAnomaly(
        tenant: CurrentTenant,
        shipmentId: string,
        anomalyType: MonitoringAnomalyType,
        details: Record<string, unknown>,
    ): Promise<void> {
        const schema = this.schema(tenant);

        await this.db.query(
            `
        UPDATE "${schema}".shipment_monitoring_anomalies
        SET status = 'resolved',
            resolved_at = COALESCE(resolved_at, now()),
            last_checked_at = now(),
            details = details || $3::jsonb
        WHERE shipment_id = $1
          AND anomaly_type = $2
          AND status IN ('open', 'acknowledged')
        `,
            [
                shipmentId,
                anomalyType,
                JSON.stringify(details),
            ],
        );
    }

}

