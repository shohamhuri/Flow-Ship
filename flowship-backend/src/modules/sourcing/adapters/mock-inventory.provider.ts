import { Injectable } from '@nestjs/common';
import { InventoryProvider } from '../interfaces/inventory-provider.interface';
import { SourceInventory } from '../interfaces/source-inventory.interface';
import { SupplySource } from '../interfaces/supply-source.interface';

@Injectable()
export class MockInventoryProvider implements InventoryProvider {
    private readonly sources: SupplySource[] = [
        {
            id: 'WAREHOUSE-SOUTH',
            name: 'South Warehouse',
            type: 'warehouse',
            isActive: true,
            priority: 0.9,
            location: {
                country: 'Israel',
                city: 'Netivot',
                street: 'Industrial Area',
                houseNumber: '1',
            },
            selfDeliveryEnabled: true,
        },
        {
            id: 'WAREHOUSE-CENTER',
            name: 'Center Warehouse',
            type: 'warehouse',
            isActive: true,
            priority: 0.8,
            location: {
                country: 'Israel',
                city: 'Rishon LeZion',
                street: 'Moshe Dayan',
                houseNumber: '10',
            },
            selfDeliveryEnabled: false,

        },
        {
            id: 'BRANCH-BEER-SHEVA',
            name: 'Beer Sheva Branch',
            type: 'branch',
            isActive: true,
            priority: 0.7,
            location: {
                country: 'Israel',
                city: 'Beer Sheva',
                street: 'HaAtzmaut',
                houseNumber: '25',
            },
            selfDeliveryEnabled: true,

        },
        {
            id: 'BRANCH-TEL-AVIV',
            name: 'Tel Aviv Branch',
            type: 'branch',
            isActive: false,
            priority: 0.95,
            location: {
                country: 'Israel',
                city: 'Tel Aviv',
                street: 'Ibn Gabirol',
                houseNumber: '50',
            },
            selfDeliveryEnabled: false,

        },

    ];

    private readonly inventory: SourceInventory[] = [
        {
            sourceId: 'WAREHOUSE-SOUTH',
            sku: 'SHIRT-BLACK-M',
            availableQuantity: 15,
        },
        {
            sourceId: 'WAREHOUSE-CENTER',
            sku: 'SHIRT-BLACK-M',
            availableQuantity: 30,
        },
        {
            sourceId: 'BRANCH-BEER-SHEVA',
            sku: 'SHIRT-BLACK-M',
            availableQuantity: 1,
        },
        {
            sourceId: 'BRANCH-BEER-SHEVA',
            sku: 'SHIRT-WHITE-L',
            availableQuantity: 10,
        },
        {
            sourceId: 'WAREHOUSE-SOUTH',
            sku: 'SHIRT-WHITE-L',
            availableQuantity: 20,
        },
        {
            sourceId: 'BRANCH-BEER-SHEVA',
            sku: 'ICE-CREAM-VANILLA',
            availableQuantity: 10,
        },
        {
            sourceId: 'WAREHOUSE-SOUTH',
            sku: 'ICE-CREAM-VANILLA',
            availableQuantity: 20,
        },
        {
            sourceId: 'BRANCH-TEL-AVIV',
            sku: 'SHIRT-BLACK-M',
            availableQuantity: 50,
        },
        {
            sourceId: 'WAREHOUSE-SOUTH',
            sku: 'SHOES-42',
            availableQuantity: 0,
        },
        {
            sourceId: 'WAREHOUSE-CENTER',
            sku: 'SHOES-42',
            availableQuantity: 8,
        },
        {
            sourceId: 'BRANCH-BEER-SHEVA',
            sku: 'SHOES-42',
            availableQuantity: 3,
        },
    ];

    async getSources(
        storeId: string,
    ): Promise<SupplySource[]> {
        const sourceIdsByStore: Record<string, string[]> = {
            'store-1': [
                'WAREHOUSE-SOUTH',
                'WAREHOUSE-CENTER',
                'BRANCH-BEER-SHEVA',
                'BRANCH-TEL-AVIV',
            ],
            'store-2': [
                'WAREHOUSE-CENTER',
                'BRANCH-TEL-AVIV',
            ],
            'local-self-delivery-test': [
                'WAREHOUSE-SOUTH',
                'WAREHOUSE-CENTER',
                'BRANCH-BEER-SHEVA',
            ],
        };
        const allowedSourceIds = sourceIdsByStore[storeId] ?? [];

        return this.sources.filter((source) =>
            allowedSourceIds.includes(source.id),
        );
    }

    async getInventory(
        storeId: string,
        skus: string[],
    ): Promise<SourceInventory[]> {
        const sources = await this.getSources(storeId);

        const allowedSourceIds = new Set(
            sources.map((source) => source.id),
        );

        return this.inventory.filter(
            (record) =>
                skus.includes(record.sku) &&
                allowedSourceIds.has(record.sourceId),
        );
    }
}