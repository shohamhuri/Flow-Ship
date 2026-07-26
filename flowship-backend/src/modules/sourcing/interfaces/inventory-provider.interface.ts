import { SourceInventory } from './source-inventory.interface';
import { SupplySource } from './supply-source.interface';

export interface InventoryProvider {
    getSources(storeId: string): Promise<SupplySource[]>;

    getInventory(
        storeId: string,
        skus: string[],
    ): Promise<SourceInventory[]>;
}