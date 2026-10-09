
import {
    BadRequestException,
    Injectable,
    InternalServerErrorException,
} from '@nestjs/common';

import { DbService } from
    '../../infrastructure/database/db.service';

import { CurrentTenant } from
    '../tenants/tenants.service';
import { VehiclePlan, VehiclePlanItem } from '../checkout/capacity-planning.service';

export interface DeliverySettings {
    expressMaxMinutes: number;
    sameDayMaxMinutes: number;
}

@Injectable()
export class DeliverySettingsService {
    constructor(
        private readonly db: DbService,
    ) { }

    async getSettings(
        tenant: CurrentTenant,
    ): Promise<DeliverySettings> {
        const schema = this.getValidatedSchema(tenant);

        const row = await this.db.queryOne<{
            express_max_minutes: number;
            same_day_max_minutes: number;
        }>(
            `SELECT
                express_max_minutes,
                same_day_max_minutes
             FROM "${schema}".delivery_settings
             WHERE id = $1`,
            [1],
        );

        if (
            !row ||
            !this.isValidMinutes(row.express_max_minutes) ||
            !this.isValidMinutes(row.same_day_max_minutes)
        ) {
            throw new InternalServerErrorException(
                'Tenant delivery settings are missing or invalid',
            );
        }

        return {
            expressMaxMinutes: row.express_max_minutes,
            sameDayMaxMinutes: row.same_day_max_minutes,
        };
    }

    async updateSettings(
        tenant: CurrentTenant,
        expressMaxMinutes: number,
        sameDayMaxMinutes?: number,
    ): Promise<DeliverySettings> {
        if (!this.isValidMinutes(expressMaxMinutes)) {
            throw new BadRequestException(
                'expressMaxMinutes must be a positive integer',
            );
        }

        if (
            sameDayMaxMinutes !== undefined &&
            !this.isValidMinutes(sameDayMaxMinutes)
        ) {
            throw new BadRequestException(
                'sameDayMaxMinutes must be a positive integer',
            );
        }

        const schema = this.getValidatedSchema(tenant);

        const row = await this.db.queryOne<{
            express_max_minutes: number;
            same_day_max_minutes: number;
        }>(
            `UPDATE "${schema}".delivery_settings
             SET express_max_minutes = $1,
                 same_day_max_minutes =
                     COALESCE($2, same_day_max_minutes),
                 updated_at = NOW()
             WHERE id = $3
             RETURNING
                 express_max_minutes,
                 same_day_max_minutes`,
            [expressMaxMinutes, sameDayMaxMinutes ?? null, 1],
        );

        if (
            !row ||
            !this.isValidMinutes(row.express_max_minutes) ||
            !this.isValidMinutes(row.same_day_max_minutes)
        ) {
            throw new InternalServerErrorException(
                'Tenant delivery settings are missing or invalid',
            );
        }

        return {
            expressMaxMinutes: row.express_max_minutes,
            sameDayMaxMinutes: row.same_day_max_minutes,
        };
    }

    private isValidMinutes(value: number): boolean {
        return (
            Number.isSafeInteger(value) &&
            value > 0
        );
    }

    private getValidatedSchema(
        tenant: CurrentTenant,
    ): string {
        const schema = tenant.schemaName;

        if (!/^[a-z_][a-z0-9_]*$/.test(schema)) {
            throw new Error(
                'Invalid tenant schema name',
            );
        }

        return schema;
    }

}
