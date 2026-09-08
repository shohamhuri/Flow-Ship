import { Module } from '@nestjs/common';

import { ShipmentsRepository } from './shipments.repository';
import { ShipmentCreationService } from './shipment-creation.service';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { ShipmentStatusService } from './shipment-status.service';
import { ShipmentsController } from './shipments.controller';
import { TenantsModule } from '../tenants/tenants.module';
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
    ],
    providers: [
        ShipmentsRepository,
        ShipmentCreationService,
        ShipmentStatusService,
        ShipmentHistoryRepository,
        ShipmentHistoryService,
    ],
    exports: [
        ShipmentsRepository,
        ShipmentCreationService,
        ShipmentHistoryService
    ],
    controllers: [
        ShipmentsController,
        ShipmentHistoryController
    ]
})
export class ShipmentsModule { }