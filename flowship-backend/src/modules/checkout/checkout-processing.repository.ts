import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';

import {
    DbService, DbTransaction,
} from '../../infrastructure/database/db.service';
import { CurrentTenant } from '../tenants/tenants.service';
import type { CheckoutProcessingResult } from './checkout.service';
@Injectable()
export class CheckoutProcessingRepository {
    constructor(
        private readonly databaseService: DbService,
    ) { }

    async create(
        tenant: CurrentTenant,
        checkoutId: string,
    ): Promise<string> {
        const processingId = randomUUID();

        await this.databaseService.query(
            `
            insert into "${this.safeSchemaName(tenant.schemaName)}".checkout_processing (
                id,
                checkout_id,
                status,
                current_step
            )
            values ($1, $2, $3, $4)
            `,
            [
                processingId,
                checkoutId,
                'processing',
                'checkout_received',
            ],
        );

        return processingId;
    }

    async markSourcingCompleted(
        tenant: CurrentTenant,
        checkoutId: string,
    ): Promise<void> {
        await this.databaseService.query(
            `
            update "${this.safeSchemaName(tenant.schemaName)}".checkout_processing
            set
                sourcing_completed = true,
                current_step = 'grouping',
                updated_at = now()
            where checkout_id = $1
            `,
            [checkoutId],
        );
    }

    async markGroupingCompleted(
        tenant: CurrentTenant,
        checkoutId: string,
    ): Promise<void> {
        await this.databaseService.query(
            `
        update "${this.safeSchemaName(tenant.schemaName)}".checkout_processing
        set
            grouping_completed = true,
            status = 'processing',
            current_step = 'awaiting_quotes',
            updated_at = now()
        where checkout_id = $1
        `,
            [checkoutId],
        );
    }
    async markCompleted(
        tenant: CurrentTenant,
        checkoutId: string,
        response: CheckoutProcessingResult,
        tx?: DbTransaction,

    ): Promise<void> {
        await (tx ?? this.databaseService).query(`
        update "${this.safeSchemaName(tenant.schemaName)}".checkout_processing
        set
            status = 'completed',
            current_step = 'completed',
            sourcing_completed = true,
            grouping_completed = true,
            quotes_completed = true,
            carrier_selected = true,
            shipment_created = true,
            response_payload = $2::jsonb,
            completed_at = now(),
            updated_at = now()
        where checkout_id = $1
        `,
            [
                checkoutId,
                JSON.stringify(response),
            ],
        );
    }
    async getProcessingResult(
        tenant: CurrentTenant,
        checkoutId: string,
    ): Promise<{
        status: string;
        response: CheckoutProcessingResult | null;
    } | null> {
        const rows = await this.databaseService.query<{
            status: string;
            response_payload: CheckoutProcessingResult | null;
        }>(
            `
        select
            status,
            response_payload
        from "${this.safeSchemaName(tenant.schemaName)}".checkout_processing
        where checkout_id = $1
        order by created_at desc
        limit 1
        `,
            [checkoutId],
        );

        const row = rows[0];

        if (!row) {
            return null;
        }

        return {
            status: row.status,
            response: row.response_payload,
        };
    }
    async markFailed(
        tenant: CurrentTenant,
        checkoutId: string,
        failureStage: string,
        errorMessage: string,
    ): Promise<void> {
        await this.databaseService.query(
            `
        update "${this.safeSchemaName(tenant.schemaName)}".checkout_processing
        set
            status = 'failed',
            current_step = $2,
            error_message = $3,
            completed_at = now(),
            updated_at = now()
        where checkout_id = $1
        `,
            [
                checkoutId,
                failureStage,
                errorMessage,
            ],
        );
    }
    private safeSchemaName(schemaName: string): string {
        if (!/^[a-zA-Z0-9_]+$/.test(schemaName)) {
            throw new Error('Invalid tenant schema name');
        }

        return schemaName;
    }
}