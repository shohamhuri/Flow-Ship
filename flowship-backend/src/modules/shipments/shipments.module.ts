import { Module } from '@nestjs/common';

import { ShipmentsRepository } from './shipments.repository';
import { ShipmentCreationService } from './shipment-creation.service';
import { DatabaseModule } from '../../infrastructure/database/database.module';

@Module({
    imports: [
        DatabaseModule,
    ],
    providers: [
        ShipmentsRepository,
        ShipmentCreationService,
    ],
    exports: [
        ShipmentsRepository,
        ShipmentCreationService,
    ],
})
export class ShipmentsModule { }