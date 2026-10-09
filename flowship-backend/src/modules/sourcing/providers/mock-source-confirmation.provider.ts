
import { Injectable } from '@nestjs/common';

import {
    SourceConfirmationProvider,
    SourceConfirmationRequest,
    SourceConfirmationResponse,
} from '../interfaces/source-confirmation-provider.interface';

import { MockInventoryProvider }
    from '../adapters/mock-inventory.provider';
@Injectable()
export class MockSourceConfirmationProvider
    implements SourceConfirmationProvider {

    constructor(
        private readonly inventoryProvider: MockInventoryProvider,
    ) { }

    async confirmSource(
        request: SourceConfirmationRequest,
    ): Promise<SourceConfirmationResponse> {

        const [sources, inventory] = await Promise.all([
            this.inventoryProvider.getSources(request.storeId),
            this.inventoryProvider.getInventory(
                request.storeId,
                request.items.map(item => item.sku),
            ),
        ]);

        const source = sources.find(
            source => source.id === request.sourceId,
        );

        const items = request.items.map(item => {
            const record = inventory.find(
                record =>
                    record.sourceId === request.sourceId &&
                    record.sku === item.sku,
            );

            return {
                sku: item.sku,
                requestedQuantity: item.quantity,
                availableQuantity:
                    record?.availableQuantity ?? 0,
            };
        });

        const available =
            Boolean(source?.isActive) &&
            items.every(
                item =>
                    item.availableQuantity >=
                    item.requestedQuantity,
            );

        return {
            sourceId: request.sourceId,
            available,
            preparationMinutes: available ? 25 : null,
            items,
        };
    }
}
