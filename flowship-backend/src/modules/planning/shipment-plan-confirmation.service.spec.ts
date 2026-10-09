
import { ShipmentPlanConfirmationService } from './shipment-plan-confirmation.service';
import { ShipmentPlanCandidate } from './interfaces/shipment-plan.interface';
import { SourceConfirmationProvider } from '../sourcing/interfaces/source-confirmation-provider.interface';

describe('ShipmentPlanConfirmationService', () => {
    let service: ShipmentPlanConfirmationService;

    const confirmSource = jest.fn();

    const createPlan = (
        assignments: Array<{
            sourceId: string;
            sku: string;
            quantity: number;
        }>,
    ): ShipmentPlanCandidate => ({
        id: 'plan-1',
        status: 'grouped',
        assignments: assignments.map((item, itemIndex) => ({
            itemIndex,
            sku: item.sku,
            requestedQuantity: item.quantity,
            selectedSource: {
                source: { id: item.sourceId },
            } as any,
        })),
    });

    beforeEach(() => {
        jest.resetAllMocks();

        service = new ShipmentPlanConfirmationService({
            confirmSource,
        } as SourceConfirmationProvider);
    });

    it('should aggregate duplicate SKUs per source', async () => {
        confirmSource.mockResolvedValue({
            sourceId: 'warehouse-1',
            available: true,
            preparationMinutes: 25,
            items: [{
                sku: 'SKU-1',
                requestedQuantity: 5,
                availableQuantity: 10,
            }],
        });

        const plan = createPlan([
            { sourceId: 'warehouse-1', sku: 'SKU-1', quantity: 2 },
            { sourceId: 'warehouse-1', sku: 'SKU-1', quantity: 3 },
        ]);

        const result = await service.confirmPlan(plan, 'store-1');

        expect(confirmSource).toHaveBeenCalledWith({
            storeId: 'store-1',
            sourceId: 'warehouse-1',
            items: [{ sku: 'SKU-1', quantity: 5 }],
        });

        expect(result.confirmed).toBe(true);
    });

    it('should reject the plan if one source refuses', async () => {
        confirmSource.mockImplementation(async ({ sourceId }) => ({
            sourceId,
            available: sourceId !== 'warehouse-2',
            preparationMinutes:
                sourceId === 'warehouse-2' ? null : 25,
            items: [{
                sku: 'SKU-1',
                requestedQuantity: 1,
                availableQuantity: 10,
            }],
        }));

        const plan = createPlan([
            { sourceId: 'warehouse-1', sku: 'SKU-1', quantity: 1 },
            { sourceId: 'warehouse-2', sku: 'SKU-1', quantity: 1 },
        ]);

        const result = await service.confirmPlan(plan, 'store-1');

        expect(result.confirmed).toBe(false);
        expect(result.failure).toEqual({
            sourceId: 'warehouse-2',
            reason: 'SOURCE_NOT_AVAILABLE',
        });
        expect(confirmSource).toHaveBeenCalledTimes(2);
    });

    it('should reject invalid preparation time', async () => {
        confirmSource.mockResolvedValue({
            sourceId: 'warehouse-1',
            available: true,
            preparationMinutes: null,
            items: [{
                sku: 'SKU-1',
                requestedQuantity: 1,
                availableQuantity: 10,
            }],
        });

        const plan = createPlan([
            { sourceId: 'warehouse-1', sku: 'SKU-1', quantity: 1 },
        ]);

        const result = await service.confirmPlan(plan, 'store-1');

        expect(result.confirmed).toBe(false);
        expect(result.failure).toEqual({
            sourceId: 'warehouse-1',
            reason: 'INVALID_PREPARATION_TIME',
        });
    });

    it('should reject the plan when confirmation fails', async () => {
        confirmSource.mockRejectedValue(
            new Error('Source unavailable'),
        );

        const plan = createPlan([
            { sourceId: 'warehouse-1', sku: 'SKU-1', quantity: 1 },
        ]);

        const result = await service.confirmPlan(plan, 'store-1');

        expect(result.confirmed).toBe(false);
        expect(result.failure).toEqual({
            sourceId: 'warehouse-1',
            reason: 'CONFIRMATION_PROVIDER_ERROR',
        });
    });
    it('should reject the plan when available quantity is insufficient', async () => {
        confirmSource.mockResolvedValue({
            sourceId: 'warehouse-1',
            available: true,
            preparationMinutes: 25,
            items: [{
                sku: 'SKU-1',
                requestedQuantity: 5,
                availableQuantity: 3,
            }],
        });

        const plan = createPlan([
            {
                sourceId: 'warehouse-1',
                sku: 'SKU-1',
                quantity: 5,
            },
        ]);

        const result =
            await service.confirmPlan(
                plan,
                'store-1',
            );

        expect(result.confirmed).toBe(false);

        expect(result.failure).toEqual({
            sourceId: 'warehouse-1',
            reason: 'INSUFFICIENT_QUANTITY',
        });
    });
    it('should reject the plan when source response does not match requested source', async () => {
        confirmSource.mockResolvedValue({
            sourceId: 'warehouse-wrong',
            available: true,
            preparationMinutes: 25,
            items: [{
                sku: 'SKU-1',
                requestedQuantity: 1,
                availableQuantity: 10,
            }],
        });

        const plan = createPlan([
            {
                sourceId: 'warehouse-1',
                sku: 'SKU-1',
                quantity: 1,
            },
        ]);

        const result =
            await service.confirmPlan(
                plan,
                'store-1',
            );

        expect(result.confirmed).toBe(false);

        expect(result.failure).toEqual({
            sourceId: 'warehouse-1',
            reason: 'INVALID_SOURCE_RESPONSE',
        });
    });
});
