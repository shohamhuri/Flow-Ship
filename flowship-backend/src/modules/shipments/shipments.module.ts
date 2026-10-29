import { Module } from '@nestjs/common';

import { ShipmentsRepository } from './shipments.repository';
import { ShipmentCreationService } from './shipment-creation.service';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { ShipmentStatusService } from './shipment-status.service';
import { ShipmentsController } from './shipments.controller';
import { TenantsModule } from '../tenants/tenants.module';
import { SourcingModule } from '../sourcing/sourcing.module';
import { SelfDeliveryFulfillmentService }
    from './self-delivery-fulfillment.service';
import { SelfDeliveryFulfillmentRepository }
    from './self-delivery-fulfillment.repository';
import {
    ShipmentHistoryController,
} from './shipment-history.controller';

import {
    ShipmentHistoryRepository,
} from './shipment-history.repository';

import {
    ShipmentHistoryService,
} from './shipment-history.service';
@Module({
    imports: [
        DatabaseModule,
        TenantsModule,
        SourcingModule,

    ],
    providers: [
        ShipmentsRepository,
        ShipmentCreationService,
        ShipmentStatusService,
        ShipmentHistoryRepository,
        ShipmentHistoryService,
        SelfDeliveryFulfillmentRepository,
        SelfDeliveryFulfillmentService,
    ],
    exports: [
        ShipmentsRepository,
        ShipmentCreationService,
        ShipmentHistoryService,
        SelfDeliveryFulfillmentRepository,
        SelfDeliveryFulfillmentService,

    ],
    controllers: [
        ShipmentsController,
        ShipmentHistoryController
    ]
})
export class ShipmentsModule { }