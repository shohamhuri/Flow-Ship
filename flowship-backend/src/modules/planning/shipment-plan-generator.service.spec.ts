import { ShipmentPlanGeneratorService } from './shipment-plan-generator.service';
import { ItemSourcingResult } from '../sourcing/interfaces/source-ranking.interface';

describe('ShipmentPlanGeneratorService', () => {
    let service: ShipmentPlanGeneratorService;

    beforeEach(() => {
        service = new ShipmentPlanGeneratorService();
    });

    const createSource = (
        sourceId: string,
        totalScore: number,
    ) =>
        ({
            source: {
                id: sourceId,
            },
            availableQuantity: 10,
            requestedQuantity: 1,
            hasEnoughStock: true,
            priorityScore: totalScore,
            distanceScore: totalScore,
            scoreBreakdown: {
                priority: totalScore,
                distance: totalScore,
            },
            totalScore,
            rejectionReasons: [],
        }) as any;

    const createSourcingResult = (
        sku: string,
        requestedQuantity: number,
        sources: any[],
    ): ItemSourcingResult => ({
        sku,
        requestedQuantity,
        possibleSources: sources,
        rejectedSources: [],
        selectedSource: sources[0] ?? null,
    });

    it('should return no plans when an item has no possible sources', () => {
        const input: ItemSourcingResult[] = [
            createSourcingResult(
                'SKU-1',
                2,
                [createSource('source-1', 0.9)],
            ),
            createSourcingResult(
                'SKU-2',
                3,
                [],
            ),
        ];

        const result = service.generatePlans(input);

        expect(result.plans).toEqual([]);

        expect(result.unresolvedItems).toEqual([
            {
                itemIndex: 1,
                sku: 'SKU-2',
                requestedQuantity: 3,
            },
        ]);

        expect(result.statistics).toEqual({
            inputItemsCount: 2,
            theoreticalCombinations: 0,
            generatedPlansCount: 0,
            generationLimitReached: false,
        });
    });

    it('should generate one plan when every item has exactly one source', () => {
        const input: ItemSourcingResult[] = [
            createSourcingResult(
                'SKU-1',
                2,
                [createSource('source-1', 0.9)],
            ),
            createSourcingResult(
                'SKU-2',
                1,
                [createSource('source-2', 0.8)],
            ),
        ];

        const result = service.generatePlans(input);

        expect(result.plans).toHaveLength(1);
        expect(result.unresolvedItems).toEqual([]);

        expect(result.statistics).toEqual({
            inputItemsCount: 2,
            theoreticalCombinations: 1,
            generatedPlansCount: 1,
            generationLimitReached: false,
        });
    });

    it('should generate all combinations of possible sources', () => {
        const input: ItemSourcingResult[] = [
            createSourcingResult(
                'SKU-1',
                1,
                [
                    createSource('A', 0.9),
                    createSource('B', 0.8),
                ],
            ),
            createSourcingResult(
                'SKU-2',
                1,
                [
                    createSource('C', 0.9),
                    createSource('D', 0.8),
                ],
            ),
        ];

        const result = service.generatePlans(input);

        expect(result.plans).toHaveLength(4);

        expect(
            result.statistics.theoreticalCombinations,
        ).toBe(4);

        expect(
            result.statistics.generatedPlansCount,
        ).toBe(4);

        expect(
            result.statistics.generationLimitReached,
        ).toBe(false);
    });

    it('should generate sequential plan ids and generated status', () => {
        const input: ItemSourcingResult[] = [
            createSourcingResult(
                'SKU-1',
                1,
                [
                    createSource('A', 0.9),
                    createSource('B', 0.8),
                ],
            ),
        ];

        const result = service.generatePlans(input);

        expect(result.plans[0].id).toBe('plan-1');
        expect(result.plans[1].id).toBe('plan-2');

        expect(result.plans[0].status).toBe(
            'generated',
        );

        expect(result.plans[1].status).toBe(
            'generated',
        );
    });

    it('should preserve item data inside each assignment', () => {
        const source = createSource(
            'warehouse-1',
            0.95,
        );

        const input: ItemSourcingResult[] = [
            createSourcingResult(
                'SKU-ABC',
                7,
                [source],
            ),
        ];

        const result = service.generatePlans(input);

        expect(
            result.plans[0].assignments[0],
        ).toEqual({
            itemIndex: 0,
            sku: 'SKU-ABC',
            requestedQuantity: 7,
            selectedSource: source,
        });
    });

    it('should keep different item indexes even when two items have the same SKU', () => {
        const input: ItemSourcingResult[] = [
            createSourcingResult(
                'SAME-SKU',
                1,
                [createSource('source-1', 0.9)],
            ),
            createSourcingResult(
                'SAME-SKU',
                2,
                [createSource('source-2', 0.8)],
            ),
        ];

        const result = service.generatePlans(input);

        expect(
            result.plans[0].assignments[0].itemIndex,
        ).toBe(0);

        expect(
            result.plans[0].assignments[1].itemIndex,
        ).toBe(1);

        expect(
            result.plans[0].assignments[0]
                .requestedQuantity,
        ).toBe(1);

        expect(
            result.plans[0].assignments[1]
                .requestedQuantity,
        ).toBe(2);
    });

    it('should use only the first three possible sources per item', () => {
        const input: ItemSourcingResult[] = [
            createSourcingResult(
                'SKU-1',
                1,
                [
                    createSource('A', 1),
                    createSource('B', 0.9),
                    createSource('C', 0.8),
                    createSource('D', 0.7),
                    createSource('E', 0.6),
                ],
            ),
        ];

        const result = service.generatePlans(input);

        expect(result.plans).toHaveLength(3);

        expect(
            result.statistics.theoreticalCombinations,
        ).toBe(3);

        const usedSources = result.plans.map(
            (plan) =>
                (plan.assignments[0].selectedSource as any)
                    .source.id,
        );

        expect(usedSources).toEqual([
            'A',
            'B',
            'C',
        ]);
    });

    it('should calculate theoretical combinations correctly', () => {
        const input: ItemSourcingResult[] = [
            createSourcingResult(
                'SKU-1',
                1,
                [
                    createSource('A', 1),
                    createSource('B', 0.9),
                    createSource('C', 0.8),
                ],
            ),
            createSourcingResult(
                'SKU-2',
                1,
                [
                    createSource('D', 1),
                    createSource('E', 0.9),
                ],
            ),
            createSourcingResult(
                'SKU-3',
                1,
                [
                    createSource('F', 1),
                    createSource('G', 0.9),
                ],
            ),
        ];

        const result = service.generatePlans(input);

        expect(
            result.statistics.theoreticalCombinations,
        ).toBe(12);

        expect(result.plans).toHaveLength(12);
    });

    it('should never generate more than 100 plans', () => {
        const threeSources = (prefix: string) => [
            createSource(`${prefix}-1`, 1),
            createSource(`${prefix}-2`, 0.9),
            createSource(`${prefix}-3`, 0.8),
        ];

        const input: ItemSourcingResult[] = [
            createSourcingResult(
                'SKU-1',
                1,
                threeSources('A'),
            ),
            createSourcingResult(
                'SKU-2',
                1,
                threeSources('B'),
            ),
            createSourcingResult(
                'SKU-3',
                1,
                threeSources('C'),
            ),
            createSourcingResult(
                'SKU-4',
                1,
                threeSources('D'),
            ),
            createSourcingResult(
                'SKU-5',
                1,
                threeSources('E'),
            ),
        ];

        const result = service.generatePlans(input);

        expect(
            result.statistics.theoreticalCombinations,
        ).toBe(243);

        expect(result.plans).toHaveLength(100);

        expect(
            result.statistics.generatedPlansCount,
        ).toBe(100);

        expect(
            result.statistics.generationLimitReached,
        ).toBe(true);
    });

    it('should report generationLimitReached as false when all theoretical plans were generated', () => {
        const input: ItemSourcingResult[] = [
            createSourcingResult(
                'SKU-1',
                1,
                [
                    createSource('A', 1),
                    createSource('B', 0.9),
                ],
            ),
            createSourcingResult(
                'SKU-2',
                1,
                [
                    createSource('C', 1),
                    createSource('D', 0.9),
                ],
            ),
        ];

        const result = service.generatePlans(input);

        expect(
            result.statistics.theoreticalCombinations,
        ).toBe(4);

        expect(
            result.statistics.generatedPlansCount,
        ).toBe(4);

        expect(
            result.statistics.generationLimitReached,
        ).toBe(false);
    });

    it('should handle an empty input', () => {
        const result = service.generatePlans([]);

        expect(result.unresolvedItems).toEqual([]);

        expect(result.plans).toHaveLength(1);

        expect(result.plans[0]).toEqual({
            id: 'plan-1',
            assignments: [],
            status: 'generated',
        });

        expect(result.statistics).toEqual({
            inputItemsCount: 0,
            theoreticalCombinations: 1,
            generatedPlansCount: 1,
            generationLimitReached: false,
        });
    });
});