import {
    BadRequestException,
} from '@nestjs/common';

import {
    ShipmentStatusService,
} from './shipment-status.service';

import {
    ShipmentsRepository,
} from './shipments.repository';

import {
    ShipmentEventType,
} from './dto/shipment-event.dto';

describe('ShipmentStatusService', () => {
    let service: ShipmentStatusService;

    let markPickupCompletedMock: jest.Mock;
    let areAllPickupsCompletedMock: jest.Mock;
    let updateStatusMock: jest.Mock;
    let markDropoffCompletedMock: jest.Mock;
    let markDeliveredMock: jest.Mock;
    let markFailedMock: jest.Mock;
    let findCheckoutIdByShipmentIdMock: jest.Mock;
    let getShipmentStatusSummaryMock: jest.Mock;
    let updateCheckoutStatusMock: jest.Mock;

    const tenant = {
        id: 'tenant-1',
        name: 'QUEEN',
        schemaName: 'queen',
        status: 'active',
    } as any;

    beforeEach(() => {
        markPickupCompletedMock = jest.fn()
            .mockResolvedValue(undefined);

        areAllPickupsCompletedMock = jest.fn()
            .mockResolvedValue(false);

        updateStatusMock = jest.fn()
            .mockResolvedValue(undefined);

        markDropoffCompletedMock = jest.fn()
            .mockResolvedValue(undefined);

        markDeliveredMock = jest.fn()
            .mockResolvedValue(undefined);

        markFailedMock = jest.fn()
            .mockResolvedValue(undefined);

        findCheckoutIdByShipmentIdMock = jest.fn()
            .mockResolvedValue('checkout-1');

        getShipmentStatusSummaryMock = jest.fn()
            .mockResolvedValue({
                totalShipments: 1,
                deliveredShipments: 0,
                failedShipments: 0,
            });

        updateCheckoutStatusMock = jest.fn()
            .mockResolvedValue(undefined);

        const repositoryMock = {
            markPickupCompleted:
                markPickupCompletedMock,

            areAllPickupsCompleted:
                areAllPickupsCompletedMock,

            updateStatus:
                updateStatusMock,

            markDropoffCompleted:
                markDropoffCompletedMock,

            markDelivered:
                markDeliveredMock,

            markFailed:
                markFailedMock,

            findCheckoutIdByShipmentId:
                findCheckoutIdByShipmentIdMock,

            getShipmentStatusSummary:
                getShipmentStatusSummaryMock,

            updateCheckoutStatus:
                updateCheckoutStatusMock,
        } as unknown as ShipmentsRepository;

        service =
            new ShipmentStatusService(
                repositoryMock,
            );

        jest.clearAllMocks();
    });

    it('should mark a pickup stop as completed', async () => {
        const occurredAt =
            new Date('2026-09-07T10:00:00Z');

        await service.markPickedUp(
            tenant,
            'shipment-1',
            2,
            occurredAt,
        );

        expect(
            markPickupCompletedMock,
        ).toHaveBeenCalledWith(
            tenant,
            'shipment-1',
            2,
            occurredAt,
        );
    });

    it('should update shipment status to picked_up when all pickups are completed', async () => {
        areAllPickupsCompletedMock
            .mockResolvedValue(true);

        await service.markPickedUp(
            tenant,
            'shipment-1',
            1,
        );

        expect(
            updateStatusMock,
        ).toHaveBeenCalledWith(
            tenant,
            'shipment-1',
            'picked_up',
        );
    });

    it('should not update shipment to picked_up when some pickups are still incomplete', async () => {
        areAllPickupsCompletedMock
            .mockResolvedValue(false);

        await service.markPickedUp(
            tenant,
            'shipment-1',
            1,
        );

        expect(
            updateStatusMock,
        ).not.toHaveBeenCalled();
    });

    it('should synchronize checkout status after pickup processing', async () => {
        await service.markPickedUp(
            tenant,
            'shipment-1',
            1,
        );

        expect(
            findCheckoutIdByShipmentIdMock,
        ).toHaveBeenCalledWith(
            tenant,
            'shipment-1',
        );

        expect(
            getShipmentStatusSummaryMock,
        ).toHaveBeenCalledWith(
            tenant,
            'checkout-1',
        );
    });

    it('should mark shipment as in_transit and synchronize checkout', async () => {
        await service.markInTransit(
            tenant,
            'shipment-1',
        );

        expect(
            updateStatusMock,
        ).toHaveBeenCalledWith(
            tenant,
            'shipment-1',
            'in_transit',
        );

        expect(
            findCheckoutIdByShipmentIdMock,
        ).toHaveBeenCalledWith(
            tenant,
            'shipment-1',
        );
    });

    it('should mark dropoff and shipment as delivered', async () => {
        const occurredAt =
            new Date('2026-09-07T12:00:00Z');

        await service.markDelivered(
            tenant,
            'shipment-1',
            occurredAt,
        );

        expect(
            markDropoffCompletedMock,
        ).toHaveBeenCalledWith(
            tenant,
            'shipment-1',
            occurredAt,
        );

        expect(
            markDeliveredMock,
        ).toHaveBeenCalledWith(
            tenant,
            'shipment-1',
            occurredAt,
        );
    });

    it('should trim the failure reason before saving it', async () => {
        const occurredAt =
            new Date('2026-09-07T13:00:00Z');

        await service.markFailed(
            tenant,
            'shipment-1',
            '  address not found  ',
            occurredAt,
        );

        expect(
            markFailedMock,
        ).toHaveBeenCalledWith(
            tenant,
            'shipment-1',
            'address not found',
            occurredAt,
        );
    });

    it('should reject an empty failure reason', async () => {
        await expect(
            service.markFailed(
                tenant,
                'shipment-1',
                '   ',
            ),
        ).rejects.toThrow(
            BadRequestException,
        );

        expect(
            markFailedMock,
        ).not.toHaveBeenCalled();

        expect(
            findCheckoutIdByShipmentIdMock,
        ).not.toHaveBeenCalled();
    });

    it('should require stopOrder for PICKED_UP events', async () => {
        await expect(
            service.handleEvent(
                tenant,
                {
                    shipmentId:
                        'shipment-1',

                    event:
                        ShipmentEventType.PICKED_UP,
                } as any,
            ),
        ).rejects.toThrow(
            'stopOrder is required for pickup events',
        );

        expect(
            markPickupCompletedMock,
        ).not.toHaveBeenCalled();
    });

    it('should handle a PICKED_UP event with the supplied date and stop order', async () => {
        const occurredAt =
            '2026-09-07T14:00:00.000Z';

        await service.handleEvent(
            tenant,
            {
                shipmentId:
                    'shipment-1',

                event:
                    ShipmentEventType.PICKED_UP,

                stopOrder: 3,

                occurredAt,
            } as any,
        );

        expect(
            markPickupCompletedMock,
        ).toHaveBeenCalledWith(
            tenant,
            'shipment-1',
            3,
            new Date(occurredAt),
        );
    });

    it('should handle an IN_TRANSIT event', async () => {
        await service.handleEvent(
            tenant,
            {
                shipmentId:
                    'shipment-1',

                event:
                    ShipmentEventType.IN_TRANSIT,
            } as any,
        );

        expect(
            updateStatusMock,
        ).toHaveBeenCalledWith(
            tenant,
            'shipment-1',
            'in_transit',
        );
    });

    it('should handle a DELIVERED event', async () => {
        const occurredAt =
            '2026-09-07T15:00:00.000Z';

        await service.handleEvent(
            tenant,
            {
                shipmentId:
                    'shipment-1',

                event:
                    ShipmentEventType.DELIVERED,

                occurredAt,
            } as any,
        );

        expect(
            markDropoffCompletedMock,
        ).toHaveBeenCalledWith(
            tenant,
            'shipment-1',
            new Date(occurredAt),
        );

        expect(
            markDeliveredMock,
        ).toHaveBeenCalledWith(
            tenant,
            'shipment-1',
            new Date(occurredAt),
        );
    });

    it('should require a reason for FAILED events', async () => {
        await expect(
            service.handleEvent(
                tenant,
                {
                    shipmentId:
                        'shipment-1',

                    event:
                        ShipmentEventType.FAILED,

                    reason:
                        '   ',
                } as any,
            ),
        ).rejects.toThrow(
            'Failure reason is required for failed shipment events',
        );

        expect(
            markFailedMock,
        ).not.toHaveBeenCalled();
    });

    it('should reject an invalid occurredAt value', async () => {
        await expect(
            service.handleEvent(
                tenant,
                {
                    shipmentId:
                        'shipment-1',

                    event:
                        ShipmentEventType.DELIVERED,

                    occurredAt:
                        'not-a-date',
                } as any,
            ),
        ).rejects.toThrow(
            'occurredAt must be a valid date',
        );

        expect(
            markDeliveredMock,
        ).not.toHaveBeenCalled();
    });

    it('should reject an unsupported shipment event', async () => {
        await expect(
            service.handleEvent(
                tenant,
                {
                    shipmentId:
                        'shipment-1',

                    event:
                        'UNKNOWN_EVENT',
                } as any,
            ),
        ).rejects.toThrow(
            'Unsupported shipment event',
        );
    });

    it('should throw when checkout cannot be found for the shipment', async () => {
        findCheckoutIdByShipmentIdMock
            .mockResolvedValue(null);

        await expect(
            service.markInTransit(
                tenant,
                'shipment-404',
            ),
        ).rejects.toThrow(
            'Checkout was not found for shipment: shipment-404',
        );

        expect(
            getShipmentStatusSummaryMock,
        ).not.toHaveBeenCalled();

        expect(
            updateCheckoutStatusMock,
        ).not.toHaveBeenCalled();
    });

    it('should not update checkout status when there are no shipments in the summary', async () => {
        getShipmentStatusSummaryMock
            .mockResolvedValue({
                totalShipments: 0,
                deliveredShipments: 0,
                failedShipments: 0,
            });

        await service.markInTransit(
            tenant,
            'shipment-1',
        );

        expect(
            updateCheckoutStatusMock,
        ).not.toHaveBeenCalled();
    });

    it('should set checkout status to delivered when all shipments are delivered', async () => {
        getShipmentStatusSummaryMock
            .mockResolvedValue({
                totalShipments: 3,
                deliveredShipments: 3,
                failedShipments: 0,
            });

        await service.markDelivered(
            tenant,
            'shipment-1',
        );

        expect(
            updateCheckoutStatusMock,
        ).toHaveBeenCalledWith(
            tenant,
            'checkout-1',
            'delivered',
        );
    });

    it('should set checkout status to partially_failed when there are both delivered and failed shipments', async () => {
        getShipmentStatusSummaryMock
            .mockResolvedValue({
                totalShipments: 3,
                deliveredShipments: 1,
                failedShipments: 1,
            });

        await service.markFailed(
            tenant,
            'shipment-1',
            'damaged package',
        );

        expect(
            updateCheckoutStatusMock,
        ).toHaveBeenCalledWith(
            tenant,
            'checkout-1',
            'partially_failed',
        );
    });

    it.each([
        {
            summary: {
                totalShipments: 3,
                deliveredShipments: 0,
                failedShipments: 1,
            },
            expectedStatus:
                'failed',
        },
        {
            summary: {
                totalShipments: 3,
                deliveredShipments: 1,
                failedShipments: 0,
            },
            expectedStatus:
                'partially_delivered',
        },
        {
            summary: {
                totalShipments: 3,
                deliveredShipments: 0,
                failedShipments: 0,
            },
            expectedStatus:
                'processing',
        },
    ])(
        'should synchronize checkout status to $expectedStatus',
        async ({
            summary,
            expectedStatus,
        }) => {
            getShipmentStatusSummaryMock
                .mockResolvedValue(
                    summary,
                );

            await service.markInTransit(
                tenant,
                'shipment-1',
            );

            expect(
                updateCheckoutStatusMock,
            ).toHaveBeenCalledWith(
                tenant,
                'checkout-1',
                expectedStatus,
            );
        },
    );
});