
import {
    BadRequestException,
    Injectable,
    InternalServerErrorException,
} from '@nestjs/common';

import { DbService } from
    '../../infrastructure/database/db.service';

import { CurrentTenant } from
    '../tenants/tenants.service';

export type ExpressAfterCutoffMode =
    'extended' | 'disabled';

export interface DeliverySettings {
    expressMaxMinutes: number;
    sameDayMaxMinutes: number;
    expressCutoffTime: string | null;
    expressAfterCutoffMode: ExpressAfterCutoffMode;
    expressAfterCutoffMaxMinutes: number | null;
}

export interface UpdateDeliverySettingsInput {
    expressMaxMinutes: number;
    sameDayMaxMinutes?: number;
    expressCutoffTime?: string | null;
    expressAfterCutoffMode?: ExpressAfterCutoffMode;
    expressAfterCutoffMaxMinutes?: number | null;
}

interface DeliverySettingsRow {
    express_max_minutes: number;
    same_day_max_minutes: number;
    express_cutoff_time: string | null;
    express_after_cutoff_mode: string;
    express_after_cutoff_max_minutes: number | null;
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

        const row = await this.db.queryOne<DeliverySettingsRow>(
            `SELECT
                express_max_minutes,
                same_day_max_minutes,
                express_cutoff_time::text AS express_cutoff_time,
                express_after_cutoff_mode,
                express_after_cutoff_max_minutes
             FROM "${schema}".delivery_settings
             WHERE id = $1`,
            [1],
        );

        return this.mapSettings(row);
    }

    async updateSettings(
        tenant: CurrentTenant,
        input: UpdateDeliverySettingsInput,
    ): Promise<DeliverySettings> {
        const current = await this.getSettings(tenant);

        const updated: DeliverySettings = {
            expressMaxMinutes: input.expressMaxMinutes,
            sameDayMaxMinutes:
                input.sameDayMaxMinutes ?? current.sameDayMaxMinutes,
            expressCutoffTime:
                input.expressCutoffTime === undefined
                    ? current.expressCutoffTime
                    : input.expressCutoffTime,
            expressAfterCutoffMode:
                input.expressAfterCutoffMode ??
                current.expressAfterCutoffMode,
            expressAfterCutoffMaxMinutes:
                input.expressAfterCutoffMaxMinutes === undefined
                    ? current.expressAfterCutoffMaxMinutes
                    : input.expressAfterCutoffMaxMinutes,
        };

        this.validateSettings(updated);

        const schema = this.getValidatedSchema(tenant);

        const row = await this.db.queryOne<DeliverySettingsRow>(
            `UPDATE "${schema}".delivery_settings
             SET express_max_minutes = $1,
                 same_day_max_minutes = $2,
                 express_cutoff_time = $3::time,
                 express_after_cutoff_mode = $4,
                 express_after_cutoff_max_minutes = $5,
                 updated_at = NOW()
             WHERE id = $6
             RETURNING
                 express_max_minutes,
                 same_day_max_minutes,
                 express_cutoff_time::text AS express_cutoff_time,
                 express_after_cutoff_mode,
                 express_after_cutoff_max_minutes`,
            [
                updated.expressMaxMinutes,
                updated.sameDayMaxMinutes,
                updated.expressCutoffTime,
                updated.expressAfterCutoffMode,
                updated.expressAfterCutoffMaxMinutes,
                1,
            ],
        );

        return this.mapSettings(row);
    }

    private validateSettings(
        settings: DeliverySettings,
    ): void {
        if (!this.isValidMinutes(settings.expressMaxMinutes)) {
            throw new BadRequestException(
                'expressMaxMinutes must be a positive integer',
            );
        }

        if (!this.isValidMinutes(settings.sameDayMaxMinutes)) {
            throw new BadRequestException(
                'sameDayMaxMinutes must be a positive integer',
            );
        }

        if (
            settings.expressCutoffTime !== null &&
            !/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(
                settings.expressCutoffTime,
            )
        ) {
            throw new BadRequestException(
                'expressCutoffTime must be HH:mm or null',
            );
        }

        if (
            !['extended', 'disabled'].includes(
                settings.expressAfterCutoffMode,
            )
        ) {
            throw new BadRequestException(
                'Invalid expressAfterCutoffMode',
            );
        }

        if (
            settings.expressAfterCutoffMaxMinutes !== null &&
            !this.isValidMinutes(
                settings.expressAfterCutoffMaxMinutes,
            )
        ) {
            throw new BadRequestException(
                'expressAfterCutoffMaxMinutes must be positive',
            );
        }

        if (
            settings.expressCutoffTime !== null &&
            settings.expressAfterCutoffMode === 'extended' &&
            settings.expressAfterCutoffMaxMinutes === null
        ) {
            throw new BadRequestException(
                'Extended express time is required after cutoff',
            );
        }
    }

    private mapSettings(
        row: DeliverySettingsRow | null,
    ): DeliverySettings {
        if (
            !row ||
            !this.isValidMinutes(row.express_max_minutes) ||
            !this.isValidMinutes(row.same_day_max_minutes) ||
            (row.express_cutoff_time !== null &&
                !/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(
                    row.express_cutoff_time,
                )) ||
            !['extended', 'disabled'].includes(
                row.express_after_cutoff_mode,
            ) ||
            (row.express_after_cutoff_max_minutes !== null &&
                !this.isValidMinutes(
                    row.express_after_cutoff_max_minutes,
                )) ||
            (row.express_cutoff_time !== null &&
                row.express_after_cutoff_mode === 'extended' &&
                row.express_after_cutoff_max_minutes === null)
        ) {
            throw new InternalServerErrorException(
                'Tenant delivery settings are missing or invalid',
            );
        }

        return {
            expressMaxMinutes: row.express_max_minutes,
            sameDayMaxMinutes: row.same_day_max_minutes,
            expressCutoffTime: row.express_cutoff_time,
            expressAfterCutoffMode:
                row.express_after_cutoff_mode as ExpressAfterCutoffMode,
            expressAfterCutoffMaxMinutes:
                row.express_after_cutoff_max_minutes,
        };
    }

    private isValidMinutes(value: number): boolean {
        return Number.isSafeInteger(value) && value > 0;
    }

    private getValidatedSchema(
        tenant: CurrentTenant,
    ): string {
        const schema = tenant.schemaName;

        if (!/^[a-z_][a-z0-9_]*$/.test(schema)) {
            throw new Error('Invalid tenant schema name');
        }

        return schema;
    }
}
