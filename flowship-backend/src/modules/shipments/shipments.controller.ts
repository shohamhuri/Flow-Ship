import {
    Body,
    Controller,
    Headers,
    Post,
} from '@nestjs/common';

import {
    CurrentTenant,
    TenantsService,
} from '../tenants/tenants.service';

import {
    ShipmentEventDto,
} from './dto/shipment-event.dto';

import {
    ShipmentStatusService,
} from './shipment-status.service';

@Controller('shipments')
export class ShipmentsController {
    constructor(
        private readonly shipmentStatusService:
            ShipmentStatusService,

        private readonly tenantsService:
            TenantsService,
    ) { }

    @Post('events')
    async receiveShipmentEvent(
        @Body()
        dto: ShipmentEventDto,

        @Headers('x-api-key')
        apiKey: string | undefined,
    ) {
        const tenant: CurrentTenant =
            await this.tenantsService
                .findByApiKey(apiKey);

        await this.shipmentStatusService
            .handleEvent(
                tenant,
                dto,
            );

        return {
            ok: true,
            shipmentId: dto.shipmentId,
            event: dto.event,
        };
    }
}