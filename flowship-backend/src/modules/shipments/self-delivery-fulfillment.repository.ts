
import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';

import { DbService } from '../../infrastructure/database/db.service';
import { CurrentTenant } from '../tenants/tenants.service';
import { SelfDeliveryCreateRequest } from '../sourcing/interfaces/self-delivery-provider.interface';

export interface SelfDeliveryFulfillmentRow {
    id: string;
    shipment_id: string;
    source_id: string;
    request_id: string;
    status: 'pending' | 'processing' | 'confirmed' | 'failed';
    source_order_id: string | null;
    error_message: string | null;
    request_payload: SelfDeliveryCreateRequest;
}
function stableSerialize(value: unknown): string {
    if (Array.isArray(value)) {
        return `[${value.map(stableSerialize).join(',')}]`;
    }

    if (value !== null && typeof value === 'object') {
        const object = value as Record<string, unknown>;

        return `{${Object.keys(object)
            .filter((key) => object[key] !== undefined)
            .sort()
            .map(
                (key) =>
                    `${JSON.stringify(key)}:${stableSerialize(object[key])}`,
            )
            .join(',')}}`;
    }

    return JSON.stringify(value) ?? 'null';
}
@Injectable()
export class SelfDeliveryFulfillmentRepository {
    constructor(private readonly db: DbService) { }

    private safeSchemaName(schemaName: string): string {
        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schemaName)) {
            throw new Error('Invalid tenant schema name');
        }
        return schemaName;
    }

    async createPending(
        tenant: CurrentTenant,
        shipmentId: string,
        request: Omit<SelfDeliveryCreateRequest, 'requestId'>,
    ): Promise<SelfDeliveryFulfillmentRow> {
        const schema = this.safeSchemaName(tenant.schemaName);
        const requestId = randomUUID();

        const payload: SelfDeliveryCreateRequest = {
            ...request,
            requestId,
        };

        const row = await this.db.queryOne<SelfDeliveryFulfillmentRow>(
            `
            INSERT INTO "${schema}".self_delivery_fulfillments
                (shipment_id, source_id, request_id, request_payload)
            VALUES ($1, $2, $3, $4::jsonb)
            ON CONFLICT (shipment_id) DO NOTHING
            RETURNING *
            `,
            [
                shipmentId,
                request.sourceId,
                requestId,
                JSON.stringify(payload),
            ],
        );

        if (row) return row;

        const existing = await this.findByShipmentId(tenant, shipmentId);

        if (!existing) {
            throw new Error('Fulfillment record not found after conflict');
        }

        if (
            existing.source_id !== request.sourceId ||
            stableSerialize({
                ...existing.request_payload,
                requestId: undefined,
            }) !== stableSerialize(request)
        ) {
            throw new Error(
                'Fulfillment already exists with different request content',
            );
        }

        return existing;
    }

    async findByShipmentId(
        tenant: CurrentTenant,
        shipmentId: string,
    ): Promise<SelfDeliveryFulfillmentRow | null> {
        const schema = this.safeSchemaName(tenant.schemaName);

        return this.db.queryOne<SelfDeliveryFulfillmentRow>(
            `SELECT * FROM "${schema}".self_delivery_fulfillments
             WHERE shipment_id = $1`,
            [shipmentId],
        );
    }

    async claimPending(
        tenant: CurrentTenant,
        shipmentId: string,
    ): Promise<SelfDeliveryFulfillmentRow | null> {
        const schema = this.safeSchemaName(tenant.schemaName);

        return this.db.queryOne<SelfDeliveryFulfillmentRow>(
            `
            UPDATE "${schema}".self_delivery_fulfillments
            SET status = 'processing', updated_at = now()
            WHERE shipment_id = $1 AND status = 'pending'
            RETURNING *
            `,
            [shipmentId],
        );
    }

    async markConfirmed(
        tenant: CurrentTenant,
        shipmentId: string,
        sourceOrderId: string,
    ): Promise<void> {
        const schema = this.safeSchemaName(tenant.schemaName);
        const externalId = sourceOrderId.trim();

        if (!externalId) {
            throw new Error('External shipment ID cannot be empty');
        }

        await this.db.transaction(async (tx) => {
            const rows = await tx.query<{ id: string }>(
                `
            UPDATE "${schema}".self_delivery_fulfillments
            SET status = 'confirmed',
                source_order_id = $2,
                error_message = NULL,
                updated_at = now()
            WHERE shipment_id = $1
              AND status = 'processing'
              AND (
                  source_order_id IS NULL
                  OR source_order_id = $2
              )
            RETURNING id
            `,
                [shipmentId, externalId],
            );

            if (rows.length !== 1) {
                throw new Error(
                    'Fulfillment confirmation update failed',
                );
            }

            const shipmentRows = await tx.query<{ id: string }>(
                `
            UPDATE "${schema}".shipments
            SET external_shipment_id = $2,
                updated_at = now()
            WHERE id = $1
              AND (
                  external_shipment_id IS NULL
                  OR external_shipment_id = $2
              )
            RETURNING id
            `,
                [shipmentId, externalId],
            );

            if (shipmentRows.length !== 1) {
                throw new Error(
                    'Shipment external ID update failed',
                );
            }
        });
    }

    async markFailed(
        tenant: CurrentTenant,
        shipmentId: string,
        errorMessage: string,
    ): Promise<void> {
        const schema = this.safeSchemaName(tenant.schemaName);

        const rows = await this.db.query(
            `
            UPDATE "${schema}".self_delivery_fulfillments
            SET status = 'failed',
                error_message = $2,
                updated_at = now()
            WHERE shipment_id = $1 AND status = 'processing'
            RETURNING id
            `,
            [shipmentId, errorMessage],
        );

        if (rows.length !== 1) {
            throw new Error('Fulfillment failure update failed');
        }
    }
    async reclaimStaleProcessing(
        tenant: CurrentTenant,
        shipmentId: string,
        staleAfterMinutes = 5,
    ): Promise<SelfDeliveryFulfillmentRow | null> {
        const schema = this.safeSchemaName(tenant.schemaName);

        return this.db.queryOne<SelfDeliveryFulfillmentRow>(
            `
SELECT *
FROM "${schema}".self_delivery_fulfillments
WHERE shipment_id = $1
  AND status = 'processing'
  AND updated_at < now() - ($2 * interval '1 minute')
LIMIT 1
`,
            [shipmentId, staleAfterMinutes],
        );
    }
}
