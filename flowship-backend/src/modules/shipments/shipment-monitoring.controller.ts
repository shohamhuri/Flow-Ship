
import {
    BadRequestException,
    Controller,
    Get,
    NotFoundException,
    Param,
    Patch,
    Query,
    UseGuards,
} from '@nestjs/common';

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
    ShipmentMonitoringRepository,
} from './shipment-monitoring.repository';

type AnomalyStatus =
    | 'open'
    | 'acknowledged'
    | 'resolved';

@Controller('shipments/monitoring')
@UseGuards(SupabaseAuthGuard)
export class ShipmentMonitoringController {
    constructor(
        private readonly repository:
            ShipmentMonitoringRepository,
    ) { }
    @Get('active')
    async getActiveShipments(
        @CurrentFlowShipAuth()
        auth: FlowShipAuthContext,
    ) {
        return this.repository.findActiveShipments(
            auth.tenant,
        );
    }
    @Get('anomalies')
    async getAnomalies(
        @CurrentFlowShipAuth()
        auth: FlowShipAuthContext,

        @Query('status')
        status?: string,
    ) {
        const allowedStatuses: AnomalyStatus[] = [
            'open',
            'acknowledged',
            'resolved',
        ];

        if (
            status !== undefined &&
            !allowedStatuses.includes(
                status as AnomalyStatus,
            )
        ) {
            throw new BadRequestException(
                'Invalid anomaly status',
            );
        }

        return this.repository.findAnomalies(
            auth.tenant,
            status as AnomalyStatus | undefined,
        );
    }

    @Patch('anomalies/:id/acknowledge')
    async acknowledgeAnomaly(
        @CurrentFlowShipAuth()
        auth: FlowShipAuthContext,

        @Param('id')
        anomalyId: string,
    ) {
        const updated =
            await this.repository.acknowledgeAnomaly(
                auth.tenant,
                anomalyId,
            );

        if (!updated) {
            throw new NotFoundException(
                'Open monitoring anomaly not found',
            );
        }

        return {
            ok: true,
            anomalyId,
        };
    }
}
