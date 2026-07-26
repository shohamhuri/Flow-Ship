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
                city: 'Netivot',
            },
        },
        {
            id: 'WAREHOUSE-CENTER',
            name: 'Center Warehouse',
            type: 'warehouse',
            isActive: true,
            priority: 0.8,
            location: {
                city: 'Rishon LeZion',
            },
        },
        {
            id: 'BRANCH-BEER-SHEVA',
            name: 'Beer Sheva Branch',
            type: 'branch',
            isActive: true,
            priority: 0.7,
            location: {
                city: 'Beer Sheva',
            },
        },
        {
            id: 'BRANCH-TEL-AVIV',
            name: 'Tel Aviv Branch',
            type: 'branch',
            isActive: false,
            priority: 0.95,
            location: {
                city: 'Tel Aviv',
            },
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
        _storeId: string,
    ): Promise<SupplySource[]> {
        return this.sources;
    }

    async getInventory(
        _storeId: string,
        skus: string[],
    ): Promise<SourceInventory[]> {
        return this.inventory.filter((record) =>
            skus.includes(record.sku),
        );
    }
}