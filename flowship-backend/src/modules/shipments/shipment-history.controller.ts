import {
    Controller,
    Get,
    UseGuards,
    Query,
} from '@nestjs/common';
import {
    ShipmentHistoryQueryDto,
} from './dto/shipment-history-query.dto';
import {
    CurrentFlowShipAuth,
} from '../auth/current-auth.decorator';

import type {
    FlowShipAuthContext,
} from '../auth/auth.types';

import {
    SupabaseAuthGuard,
} from '../auth/supabase-auth.guard';

import {
    ShipmentHistoryService,
} from './shipment-history.service';

@Controller('admin/shipment-history')
@UseGuards(SupabaseAuthGuard)
export class ShipmentHistoryController {
    constructor(
        private readonly shipmentHistoryService:
            ShipmentHistoryService,
    ) { }

    @Get()
    async getShipmentHistory(
        @CurrentFlowShipAuth()
        auth: FlowShipAuthContext,

        @Query()
        query: ShipmentHistoryQueryDto,
    ) {
        const items =
            await this.shipmentHistoryService
                .getShipmentHistory(
                    auth.tenant,
                    query,
                );

        return {
            ok: true,

            tenant: {
                id: auth.tenant.id,
                name: auth.tenant.name,
                schemaName:
                    auth.tenant.schemaName,
            },

            filters: {
                resultStatus:
                    query.resultStatus ?? null,

                carrierName:
                    query.carrierName ?? null,

                search:
                    query.search ?? null,

                fromDate:
                    query.fromDate ?? null,

                toDate:
                    query.toDate ?? null,

                sortBy:
                    query.sortBy,

                sortDirection:
                    query.sortDirection,
            },

            count: items.length,
            items,
        };
    }
}