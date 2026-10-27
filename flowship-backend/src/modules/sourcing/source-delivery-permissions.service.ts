
import { Injectable } from '@nestjs/common';
import { DbService } from '../../infrastructure/database/db.service';
import type { CurrentTenant } from '../tenants/tenants.service';

type PermissionTenant = Pick<CurrentTenant, 'schemaName'>;

export interface SourceDeliverySettings {
    selfDeliveryAllowed: boolean;
    selfDeliveryPrice: number | null;
}

@Injectable()
export class SourceDeliveryPermissionsService {
    constructor(
        private readonly db: DbService,
    ) { }

    private getSchemaName(tenant: PermissionTenant): string {
        const schemaName = tenant.schemaName;

        if (!/^[a-zA-Z0-9_]+$/.test(schemaName)) {
            throw new Error('Invalid tenant schema name');
        }

        return schemaName;
    }

    async isSelfDeliveryAllowed(
        tenant: PermissionTenant,
        storeId: string,
        sourceId: string,
    ): Promise<boolean> {
        const schemaName = this.getSchemaName(tenant);

        const row = await this.db.queryOne<{
            self_delivery_allowed: boolean;
        }>(
            `
            SELECT self_delivery_allowed
            FROM "${schemaName}".source_delivery_permissions
            WHERE store_id = $1
              AND source_id = $2
            LIMIT 1
            `,
            [storeId, sourceId],
        );

        return row?.self_delivery_allowed === true;
    }

    async getSettingsForStore(
        tenant: PermissionTenant,
        storeId: string,
    ): Promise<Map<string, SourceDeliverySettings>> {
        const schemaName = this.getSchemaName(tenant);

        const rows = await this.db.query<{
            source_id: string;
            self_delivery_allowed: boolean;
            self_delivery_price: string | null;
        }>(
            `
            SELECT
                source_id,
                self_delivery_allowed,
                self_delivery_price
            FROM "${schemaName}".source_delivery_permissions
            WHERE store_id = $1
            `,
            [storeId],
        );

        return new Map(
            rows.map((row) => [
                row.source_id,
                {
                    selfDeliveryAllowed:
                        row.self_delivery_allowed === true,
                    selfDeliveryPrice:
                        row.self_delivery_price === null
                            ? null
                            : Number(row.self_delivery_price),
                },
            ]),
        );
    }

    async getPermissionsForStore(
        tenant: PermissionTenant,
        storeId: string,
    ): Promise<Map<string, boolean>> {
        const settings = await this.getSettingsForStore(
            tenant,
            storeId,
        );

        return new Map(
            [...settings].map(([sourceId, value]) => [
                sourceId,
                value.selfDeliveryAllowed,
            ]),
        );
    }
}
