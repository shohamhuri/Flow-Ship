
import { ShipmentGroup } from
    '../../grouping/interfaces/shipment-group.interface';

export interface SourceShipmentGroup {
    sourceId: string;
    source: ShipmentGroup['sources'][number];
    items: ShipmentGroup['items'];
    totalWeight: number;
}

export function splitShipmentGroupBySource(
    group: ShipmentGroup,
): SourceShipmentGroup[] {
    const itemsBySource = new Map<
        string,
        ShipmentGroup['items']
    >();

    for (const item of group.items) {
        if (!item.sourceId) {
            throw new Error(
                `Item ${item.sku} has no sourceId`,
            );
        }

        const items = itemsBySource.get(item.sourceId) ?? [];
        items.push(item);
        itemsBySource.set(item.sourceId, items);
    }

    const sourcesById = new Map(
        group.sources.map((source) => [source.id, source]),
    );

    return [...itemsBySource.entries()].map(
        ([sourceId, items]) => {
            const source = sourcesById.get(sourceId);

            if (!source) {
                throw new Error(
                    `Source ${sourceId} not found in group ${group.groupId}`,
                );
            }

            return {
                sourceId,
                source,
                items,
                totalWeight: items.reduce(
                    (sum, item) =>
                        sum + item.quantity * item.unitWeight,
                    0,
                ),
            };
        },
    );
}
