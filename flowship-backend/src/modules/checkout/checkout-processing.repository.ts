import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';

import { DbService } from '../../infrastructure/database/db.service';
import { CurrentTenant } from '../tenants/tenants.service';

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
            insert into ${tenant.schemaName}.checkout_processing (
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
            update ${tenant.schemaName}.checkout_processing
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
        update ${tenant.schemaName}.checkout_processing
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
    async markFailed(
        tenant: CurrentTenant,
        checkoutId: string,
        errorMessage: string,
    ): Promise<void> {
        await this.databaseService.query(
            `
            update ${tenant.schemaName}.checkout_processing
            set
                status = 'failed',
                current_step = 'failed',
                error_message = $2,
                completed_at = now(),
                updated_at = now()
            where checkout_id = $1
            `,
            [checkoutId, errorMessage],
        );
    }
}