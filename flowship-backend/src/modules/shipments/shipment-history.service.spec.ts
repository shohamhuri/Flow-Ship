import {
    ShipmentHistoryService,
} from './shipment-history.service';

import {
    ShipmentHistoryRepository,
} from './shipment-history.repository';

describe('ShipmentHistoryService', () => {
    let service: ShipmentHistoryService;

    let findFinalOrdersMock: jest.Mock;

    const tenant = {
        id: 'tenant-1',
        name: 'QUEEN',
        schemaName: 'queen',
        status: 'active',
    } as any;

    beforeEach(() => {
        findFinalOrdersMock = jest.fn();

        const repositoryMock = {
            findFinalOrders:
                findFinalOrdersMock,
        } as unknown as ShipmentHistoryRepository;

        service =
            new ShipmentHistoryService(
                repositoryMock,
            );

        jest.clearAllMocks();
    });

    it('should pass the tenant to the shipment history repository', async () => {
        findFinalOrdersMock
            .mockResolvedValue([]);

        const query = {} as any;

        await service.getShipmentHistory(
            tenant,
            query,
        );

        expect(
            findFinalOrdersMock,
        ).toHaveBeenCalledWith(
            tenant,
            expect.any(Object),
        );
    });

    it('should pass all history filters to the repository', async () => {
        findFinalOrdersMock
            .mockResolvedValue([]);

        const query = {
            resultStatus:
                'delivered',

            carrierName:
                'Mock Express',

            search:
                'ORDER-100',

            fromDate:
                '2026-09-01',

            toDate:
                '2026-09-07',

            sortBy:
                'createdAt',

            sortDirection:
                'desc',
        } as any;

        await service.getShipmentHistory(
            tenant,
            query,
        );

        expect(
            findFinalOrdersMock,
        ).toHaveBeenCalledWith(
            tenant,
            {
                resultStatus:
                    'delivered',

                carrierName:
                    'Mock Express',

                search:
                    'ORDER-100',

                fromDate:
                    '2026-09-01',

                toDate:
                    '2026-09-07',

                sortBy:
                    'createdAt',

                sortDirection:
                    'desc',
            },
        );
    });

    it('should return exactly the shipment history returned by the repository', async () => {
        const history = [
            {
                orderId:
                    'ORDER-100',

                shipmentId:
                    'shipment-1',

                carrierName:
                    'Mock Express',

                resultStatus:
                    'delivered',
            },

            {
                orderId:
                    'ORDER-200',

                shipmentId:
                    'shipment-2',

                carrierName:
                    'Yango',

                resultStatus:
                    'failed',
            },
        ] as any;

        findFinalOrdersMock
            .mockResolvedValue(history);

        const result =
            await service.getShipmentHistory(
                tenant,
                {} as any,
            );

        expect(result)
            .toBe(history);
    });

    it('should pass undefined filters when they are not provided', async () => {
        findFinalOrdersMock
            .mockResolvedValue([]);

        const query = {
            resultStatus:
                undefined,

            carrierName:
                undefined,

            search:
                undefined,

            fromDate:
                undefined,

            toDate:
                undefined,

            sortBy:
                undefined,

            sortDirection:
                undefined,
        } as any;

        await service.getShipmentHistory(
            tenant,
            query,
        );

        expect(
            findFinalOrdersMock,
        ).toHaveBeenCalledWith(
            tenant,
            {
                resultStatus:
                    undefined,

                carrierName:
                    undefined,

                search:
                    undefined,

                fromDate:
                    undefined,

                toDate:
                    undefined,

                sortBy:
                    undefined,

                sortDirection:
                    undefined,
            },
        );
    });

    it('should preserve sort values without modifying them', async () => {
        findFinalOrdersMock
            .mockResolvedValue([]);

        const query = {
            sortBy:
                'updatedAt',

            sortDirection:
                'asc',
        } as any;

        await service.getShipmentHistory(
            tenant,
            query,
        );

        const filters =
            findFinalOrdersMock
                .mock.calls[0][1];

        expect(
            filters.sortBy,
        ).toBe(
            'updatedAt',
        );

        expect(
            filters.sortDirection,
        ).toBe(
            'asc',
        );
    });

    it('should call findFinalOrders exactly once', async () => {
        findFinalOrdersMock
            .mockResolvedValue([]);

        await service.getShipmentHistory(
            tenant,
            {
                search:
                    'ORDER-123',
            } as any,
        );

        expect(
            findFinalOrdersMock,
        ).toHaveBeenCalledTimes(1);
    });
});