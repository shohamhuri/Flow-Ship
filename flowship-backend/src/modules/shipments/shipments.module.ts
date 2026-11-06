import { Module } from '@nestjs/common';

import { ShipmentsRepository } from './shipments.repository';
import { ShipmentCreationService } from './shipment-creation.service';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { ShipmentStatusService } from './shipment-status.service';
import { ShipmentsController } from './shipments.controller';
import { TenantsModule } from '../tenants/tenants.module';
import { SourcingModule } from '../sourcing/sourcing.module';
import { ShipmentMonitoringController }
    from './shipment-monitoring.controller';
import { ShipmentMonitoringScheduler }
    from './shipment-monitoring.scheduler';
import { SourceDeliveryWebhookController }
    from './source-delivery-webhook.controller';
import { SourceDeliveryWebhookResolverService }
    from './source-delivery-webhook-resolver.service';
import { SelfDeliveryFulfillmentService }
    from './self-delivery-fulfillment.service';
import { SourceDeliveryIntegrationsService }
    from './source-delivery-integrations.service';
import { SelfDeliveryFulfillmentRepository }
    from './self-delivery-fulfillment.repository';
import { SourceDeliveryWebhookSignatureService }
    from './source-delivery-webhook-signature.service';
import { ShipmentMonitoringRepository }
    from './shipment-monitoring.repository';

import { ShipmentMonitoringService }
    from './shipment-monitoring.service';
import {
    ShipmentHistoryController,
} from './shipment-history.controller';
import { SelfDeliveryPollingService }
    from './self-delivery-polling.service';
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
        SourceDeliveryIntegrationsService,
        SourceDeliveryWebhookSignatureService,
        SourceDeliveryWebhookResolverService,
        SelfDeliveryPollingService,
        ShipmentMonitoringRepository,
        ShipmentMonitoringService,
        ShipmentMonitoringScheduler,
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
        ShipmentHistoryController,
        SourceDeliveryWebhookController,
        ShipmentMonitoringController,

    ]
})
export class ShipmentsModule { }