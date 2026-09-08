import { ShipmentPlanBuilderService } from './shipment-plan-builder.service';
import { GroupingService } from '../grouping/grouping.service';

describe('ShipmentPlanBuilderService', () => {
    let service: ShipmentPlanBuilderService;

    const groupingServiceMock = {
        groupShipmentPlan: jest.fn(),
    };

    const checkout = {
        id: 'checkout-1',
        destinationCity: 'Tel Aviv',
    } as any;

    const createPlan = (
        id: string,
        assignments: any[] = [],
    ) =>
        ({
            id,
            assignments,
            status: 'generated',
        }) as any;

    beforeEach(() => {
        jest.clearAllMocks();

        service = new ShipmentPlanBuilderService(
            groupingServiceMock as unknown as GroupingService,
        );
    });

    it('should call GroupingService with checkout, assignments and strategies', () => {
        const assignments = [
            {
                itemIndex: 0,
                sku: 'SKU-1',
                requestedQuantity: 2,
                selectedSource: {
                    source: {
                        id: 'source-1',
                    },
                },
            },
        ];

        const plan = createPlan(
            'plan-1',
            assignments,
        );

        const strategies = [
            {
                strategyKey: 'same-source',
                enabled: true,
            },
        ] as any;

        groupingServiceMock.groupShipmentPlan.mockReturnValue({
            groups: [],
            hasUngroupedItems: false,
        });

        service.buildPlans(
            checkout,
            [plan],
            strategies,
        );

        expect(
            groupingServiceMock.groupShipmentPlan,
        ).toHaveBeenCalledWith(
            checkout,
            assignments,
            strategies,
        );
    });

    it('should mark a valid plan as grouped', () => {
        const plan = createPlan('plan-1');

        const grouping = {
            groups: [
                {
                    id: 'group-1',
                },
            ],
            totalGroups: 1,
            hasUngroupedItems: false,
        };

        groupingServiceMock.groupShipmentPlan.mockReturnValue(
            grouping,
        );

        const result = service.buildPlans(
            checkout,
            [plan],
        );

        expect(result[0].status).toBe('grouped');
        expect(result[0].grouping).toBe(grouping);
    });

    it('should reject a plan when grouping has ungrouped items', () => {
        const plan = createPlan('plan-1');

        const grouping = {
            groups: [],
            totalGroups: 0,
            hasUngroupedItems: true,
        };

        groupingServiceMock.groupShipmentPlan.mockReturnValue(
            grouping,
        );

        const result = service.buildPlans(
            checkout,
            [plan],
        );

        expect(result[0].status).toBe('rejected');
        expect(result[0].grouping).toBe(grouping);
    });

    it('should preserve the original plan data', () => {
        const assignments = [
            {
                itemIndex: 0,
                sku: 'SKU-ABC',
                requestedQuantity: 5,
            },
        ];

        const plan = {
            id: 'plan-123',
            assignments,
            status: 'generated',
            customField: 'keep-me',
        } as any;

        groupingServiceMock.groupShipmentPlan.mockReturnValue({
            groups: [],
            totalGroups: 0,
            hasUngroupedItems: false,
        });

        const result = service.buildPlans(
            checkout,
            [plan],
        );

        expect(result[0].id).toBe('plan-123');
        expect(result[0].assignments).toBe(assignments);
        expect((result[0] as any).customField).toBe(
            'keep-me',
        );
    });

    it('should process every plan independently', () => {
        const plan1 = createPlan('plan-1', [
            {
                itemIndex: 0,
                sku: 'SKU-1',
            },
        ]);

        const plan2 = createPlan('plan-2', [
            {
                itemIndex: 0,
                sku: 'SKU-2',
            },
        ]);

        groupingServiceMock.groupShipmentPlan
            .mockReturnValueOnce({
                groups: [],
                totalGroups: 1,
                hasUngroupedItems: false,
            })
            .mockReturnValueOnce({
                groups: [],
                totalGroups: 0,
                hasUngroupedItems: true,
            });

        const result = service.buildPlans(
            checkout,
            [plan1, plan2],
        );

        expect(result).toHaveLength(2);

        expect(result[0].id).toBe('plan-1');
        expect(result[0].status).toBe('grouped');

        expect(result[1].id).toBe('plan-2');
        expect(result[1].status).toBe('rejected');

        expect(
            groupingServiceMock.groupShipmentPlan,
        ).toHaveBeenCalledTimes(2);
    });

    it('should use empty strategies by default', () => {
        const plan = createPlan('plan-1');

        groupingServiceMock.groupShipmentPlan.mockReturnValue({
            groups: [],
            totalGroups: 0,
            hasUngroupedItems: false,
        });

        service.buildPlans(
            checkout,
            [plan],
        );

        expect(
            groupingServiceMock.groupShipmentPlan,
        ).toHaveBeenCalledWith(
            checkout,
            plan.assignments,
            [],
        );
    });

    it('should return an empty array when there are no plans', () => {
        const result = service.buildPlans(
            checkout,
            [],
        );

        expect(result).toEqual([]);

        expect(
            groupingServiceMock.groupShipmentPlan,
        ).not.toHaveBeenCalled();
    });

    it('should attach the exact grouping result returned by GroupingService', () => {
        const plan = createPlan('plan-1');

        const grouping = {
            groups: [
                {
                    id: 'group-1',
                    sourceId: 'source-1',
                },
            ],
            totalGroups: 1,
            hasUngroupedItems: false,
            metadata: {
                strategy: 'same-source',
            },
        };

        groupingServiceMock.groupShipmentPlan.mockReturnValue(
            grouping,
        );

        const result = service.buildPlans(
            checkout,
            [plan],
        );

        expect(result[0].grouping).toBe(grouping);
    });
});