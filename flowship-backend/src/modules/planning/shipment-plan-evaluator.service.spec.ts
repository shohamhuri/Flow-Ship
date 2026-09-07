import { ShipmentPlanEvaluatorService } from './shipment-plan-evaluator.service';

describe('ShipmentPlanEvaluatorService', () => {
    let service: ShipmentPlanEvaluatorService;

    beforeEach(() => {
        service = new ShipmentPlanEvaluatorService();
    });

    const createPlan = ({
        id,
        status = 'grouped',
        totalGroups = 1,
        sourceScores = [0.8],
        withGrouping = true,
    }: {
        id: string;
        status?: string;
        totalGroups?: number;
        sourceScores?: number[];
        withGrouping?: boolean;
    }) =>
        ({
            id,
            status,
            assignments: sourceScores.map((score, index) => ({
                itemIndex: index,
                sku: `SKU-${index + 1}`,
                requestedQuantity: 1,
                selectedSource: {
                    totalScore: score,
                },
            })),
            ...(withGrouping
                ? {
                    grouping: {
                        totalGroups,
                    },
                }
                : {}),
        }) as any;

    it('should evaluate grouped plans', () => {
        const plan = createPlan({
            id: 'plan-1',
            totalGroups: 2,
            sourceScores: [0.8, 0.6],
        });

        const result = service.evaluateAndSelect([plan]);

        expect(result).toHaveLength(1);
        expect(result[0].status).toBe('evaluated');
    });

    it('should calculate shipment count from grouping totalGroups', () => {
        const plan = createPlan({
            id: 'plan-1',
            totalGroups: 3,
        });

        const result = service.evaluateAndSelect([plan]);

        expect(result[0].metrics?.shipmentCount).toBe(3);
    });

    it('should calculate total and average source scores', () => {
        const plan = createPlan({
            id: 'plan-1',
            sourceScores: [0.9, 0.7, 0.5],
        });

        const result = service.evaluateAndSelect([plan]);

        expect(result[0].metrics?.totalSourceScore).toBe(2.1);
        expect(result[0].metrics?.averageSourceScore).toBe(0.7);
    });

    it('should round source score metrics to three decimal places', () => {
        const plan = createPlan({
            id: 'plan-1',
            sourceScores: [0.7777, 0.6666],
        });

        const result = service.evaluateAndSelect([plan]);

        expect(result[0].metrics?.totalSourceScore).toBe(1.444);
        expect(result[0].metrics?.averageSourceScore).toBe(0.722);
    });

    it('should ignore plans that are not grouped', () => {
        const groupedPlan = createPlan({
            id: 'grouped',
        });

        const generatedPlan = createPlan({
            id: 'generated',
            status: 'generated',
        });

        const result = service.evaluateAndSelect([
            generatedPlan,
            groupedPlan,
        ]);

        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('grouped');
    });

    it('should ignore grouped plans without grouping data', () => {
        const plan = createPlan({
            id: 'plan-1',
            status: 'grouped',
            withGrouping: false,
        });

        const result = service.evaluateAndSelect([plan]);

        expect(result).toEqual([]);
    });

    it('should prefer plans with fewer shipments', () => {
        const threeShipments = createPlan({
            id: 'plan-3',
            totalGroups: 3,
            sourceScores: [1],
        });

        const oneShipment = createPlan({
            id: 'plan-1',
            totalGroups: 1,
            sourceScores: [0.1],
        });

        const twoShipments = createPlan({
            id: 'plan-2',
            totalGroups: 2,
            sourceScores: [0.9],
        });

        const result = service.evaluateAndSelect([
            threeShipments,
            oneShipment,
            twoShipments,
        ]);

        expect(result.map((plan) => plan.id)).toEqual([
            'plan-1',
            'plan-2',
            'plan-3',
        ]);
    });

    it('should prefer higher average source score when shipment counts are equal', () => {
        const lowerScore = createPlan({
            id: 'lower',
            totalGroups: 2,
            sourceScores: [0.5, 0.5],
        });

        const higherScore = createPlan({
            id: 'higher',
            totalGroups: 2,
            sourceScores: [0.9, 0.8],
        });

        const result = service.evaluateAndSelect([
            lowerScore,
            higherScore,
        ]);

        expect(result.map((plan) => plan.id)).toEqual([
            'higher',
            'lower',
        ]);
    });

    it('should treat a plan with no assignments as having zero source score', () => {
        const plan = createPlan({
            id: 'empty',
            totalGroups: 1,
            sourceScores: [],
        });

        const result = service.evaluateAndSelect([plan]);

        expect(result[0].metrics?.totalSourceScore).toBe(0);
        expect(result[0].metrics?.averageSourceScore).toBe(0);
    });

    it('should return at most 30 evaluated plans', () => {
        const plans = Array.from(
            { length: 40 },
            (_, index) =>
                createPlan({
                    id: `plan-${index + 1}`,
                    totalGroups: 1,
                    sourceScores: [index / 100],
                }),
        );

        const result = service.evaluateAndSelect(plans);

        expect(result).toHaveLength(30);
    });

    it('should keep the best 30 plans after sorting', () => {
        const plans = Array.from(
            { length: 40 },
            (_, index) =>
                createPlan({
                    id: `plan-${index + 1}`,
                    totalGroups: 1,
                    sourceScores: [index / 100],
                }),
        );

        const result = service.evaluateAndSelect(plans);

        expect(result[0].id).toBe('plan-40');
        expect(result[29].id).toBe('plan-11');
    });
});