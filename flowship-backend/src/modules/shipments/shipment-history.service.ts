import {
    Injectable,
} from '@nestjs/common';

import {
    CurrentTenant,
} from '../tenants/tenants.service';

import {
    ShipmentHistoryItem,
    ShipmentHistoryRepository,
} from './shipment-history.repository';

import {
    ShipmentHistoryQueryDto,
} from './dto/shipment-history-query.dto';

@Injectable()
export class ShipmentHistoryService {
    constructor(
        private readonly shipmentHistoryRepository:
            ShipmentHistoryRepository,
    ) { }

    async getShipmentHistory(
        tenant: CurrentTenant,
        query: ShipmentHistoryQueryDto,
    ): Promise<ShipmentHistoryItem[]> {
        return this.shipmentHistoryRepository
            .findFinalOrders(
                tenant,
                {
                    resultStatus:
                        query.resultStatus,

                    carrierName:
                        query.carrierName,

                    search:
                        query.search,

                    fromDate:
                        query.fromDate,

                    toDate:
                        query.toDate,

                    sortBy:
                        query.sortBy,

                    sortDirection:
                        query.sortDirection,
                },
            );
    }
}