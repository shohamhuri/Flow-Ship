
import { Injectable } from '@nestjs/common';

import { DbService } from '../../infrastructure/database/db.service';
import type { CurrentTenant } from '../tenants/tenants.service';

@Injectable()
export class CheckoutPaymentWebhookRepository {
    constructor(
        private readonly databaseService: DbService,
    ) { }

    async registerEvent(
        tenant: CurrentTenant,
        storeId: string,
        checkoutId: string,
        paymentReference: string,
        payload: unknown,
    ): Promise<boolean> {
        const schemaName = tenant.schemaName;

        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schemaName)) {
            throw new Error('Invalid tenant schema name');
        }

        const rows = await this.databaseService.query<{ id: string }>(
            `
            INSERT INTO "${schemaName}".webhook_logs (
                source,
                event_type,
                idempotency_key,
                payload,
                status
            )
            VALUES ($1, $2, $3, $4::jsonb, 'received')
            ON CONFLICT (source, idempotency_key)
            DO NOTHING
            RETURNING id
            `,
            [
                `checkout_payment:${storeId}`,
                'payment_confirmed',
                checkoutId,
                JSON.stringify({
                    paymentReference,
                    payload,
                }),
            ],
        );

        return rows.length > 0;
    }
    async findEvent(
        tenant: CurrentTenant,
        storeId: string,
        checkoutId: string,
    ): Promise<{
        id: string;
        status: string;
        paymentReference: string | null;
        payload: unknown;
    } | null> {
        const schemaName = tenant.schemaName;

        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schemaName)) {
            throw new Error('Invalid tenant schema name');
        }

        const rows = await this.databaseService.query<{
            id: string;
            status: string;
            payload: {
                paymentReference?: string;
                payload?: unknown;
            };
        }>(
            `
        SELECT id, status, payload
        FROM "${schemaName}".webhook_logs
        WHERE source = $1
          AND idempotency_key = $2
        LIMIT 1
        `,
            [
                `checkout_payment:${storeId}`,
                checkoutId,
            ],
        );

        const event = rows[0];

        if (!event) {
            return null;
        }

        return {
            id: event.id,
            status: event.status,
            paymentReference:
                event.payload?.paymentReference ?? null,
            payload: event.payload?.payload ?? null,
        };
    }
    async claimEvent(
        tenant: CurrentTenant,
        eventId: string,
    ): Promise<boolean> {
        const schemaName = tenant.schemaName;

        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schemaName)) {
            throw new Error('Invalid tenant schema name');
        }

        const rows = await this.databaseService.query<{ id: string }>(
            `
        UPDATE "${schemaName}".webhook_logs
        SET
            status = 'processing',
            processing_started_at = NOW()
        WHERE id = $1
          AND status = 'received'
        RETURNING id
        `,
            [eventId],
        );

        return rows.length === 1;
    }
    async markProcessed(
        tenant: CurrentTenant,
        eventId: string,
    ): Promise<boolean> {
        const schemaName = tenant.schemaName;

        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schemaName)) {
            throw new Error('Invalid tenant schema name');
        }

        const rows = await this.databaseService.query<{ id: string }>(
            `
        UPDATE "${schemaName}".webhook_logs
        SET
            status = 'processed',
            processed_at = NOW(),
            error_message = NULL,
            processing_started_at = NULL
        WHERE id = $1
          AND status = 'processing'
        RETURNING id
        `,
            [eventId],
        );

        return rows.length === 1;
    }
    async markFailed(
        tenant: CurrentTenant,
        eventId: string,
        errorMessage: string,
    ): Promise<boolean> {
        const schemaName = tenant.schemaName;

        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schemaName)) {
            throw new Error('Invalid tenant schema name');
        }

        const rows = await this.databaseService.query<{ id: string }>(
            `
        UPDATE "${schemaName}".webhook_logs
        SET
            status = 'failed',
            error_message = $2,
            processing_started_at = NULL
        WHERE id = $1
          AND status = 'processing'
        RETURNING id
        `,
            [eventId, errorMessage],
        );

        return rows.length === 1;
    }
    async retryFailedEvent(
        tenant: CurrentTenant,
        eventId: string,
    ): Promise<boolean> {
        const schemaName = tenant.schemaName;

        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schemaName)) {
            throw new Error('Invalid tenant schema name');
        }

        const rows = await this.databaseService.query<{ id: string }>(
            `
        UPDATE "${schemaName}".webhook_logs
        SET
            status = 'received',
            error_message = NULL,
            processing_started_at = NULL
        WHERE id = $1
          AND status = 'failed'
        RETURNING id
        `,
            [eventId],
        );

        return rows.length === 1;
    }
}
