import {
    Logger,
} from '@nestjs/common';

import {
    AuditLogsService,
} from './audit-logs.service';

import {
    DbService,
} from '../../infrastructure/database/db.service';

describe('AuditLogsService', () => {
    let service: AuditLogsService;

    let queryMock: jest.Mock;
    let loggerMock: jest.SpyInstance;

    beforeEach(() => {
        queryMock = jest.fn()
            .mockResolvedValue(undefined);

        const dbMock = {
            query: queryMock,
        } as unknown as DbService;

        service =
            new AuditLogsService(
                dbMock,
            );

        loggerMock =
            jest.spyOn(
                Logger.prototype,
                'log',
            )
                .mockImplementation(
                    () => undefined,
                );

        jest.clearAllMocks();
    });

    afterEach(() => {
        loggerMock.mockRestore();

        jest.useRealTimers();
    });

    it('should use a safely quoted schema name in the insert query', async () => {
        await service.createLog({
            schemaName: 'queen',
            action: 'shipment_created',
            entityType: 'shipment',
            status: 'success',
        });

        expect(
            queryMock,
        ).toHaveBeenCalledTimes(1);

        const sql =
            queryMock.mock.calls[0][0];

        expect(sql).toContain(
            'insert into "queen".audit_logs',
        );
    });

    it('should reject an invalid schema name before querying the database', async () => {
        await expect(
            service.createLog({
                schemaName:
                    'queen; drop table users',
                action:
                    'shipment_created',
                entityType:
                    'shipment',
                status:
                    'success',
            }),
        ).rejects.toThrow(
            'Invalid schema name: queen; drop table users',
        );

        expect(
            queryMock,
        ).not.toHaveBeenCalled();
    });

    it('should use default actor values when actor type and actor id are not provided', async () => {
        await service.createLog({
            schemaName: 'queen',
            action:
                'shipment_created',
            entityType:
                'shipment',
            status:
                'success',
        });

        const params =
            queryMock.mock.calls[0][1];

        expect(
            params[0],
        ).toBe(
            'system',
        );

        expect(
            params[1],
        ).toBe(
            'flowship',
        );
    });

    it('should preserve provided actor type and actor id', async () => {
        await service.createLog({
            schemaName: 'queen',
            action:
                'shipment_updated',
            entityType:
                'shipment',
            entityId:
                'shipment-1',
            status:
                'success',
            actorType:
                'admin',
            actorId:
                'user-123',
        });

        const params =
            queryMock.mock.calls[0][1];

        expect(
            params[0],
        ).toBe(
            'admin',
        );

        expect(
            params[1],
        ).toBe(
            'user-123',
        );
    });

    it('should use null when entity id is not provided', async () => {
        await service.createLog({
            schemaName: 'queen',
            action:
                'checkout_started',
            entityType:
                'checkout',
            status:
                'success',
        });

        const params =
            queryMock.mock.calls[0][1];

        expect(
            params[4],
        ).toBeNull();
    });

    it('should store empty metadata as an empty JSON object', async () => {
        await service.createLog({
            schemaName: 'queen',
            action:
                'shipment_created',
            entityType:
                'shipment',
            status:
                'success',
        });

        const params =
            queryMock.mock.calls[0][1];

        expect(
            params[6],
        ).toBe(
            '{}',
        );
    });

    it('should serialize metadata before sending it to the database', async () => {
        const metadata = {
            provider:
                'mock-yango',
            price:
                35,
            nested: {
                city:
                    'Tel Aviv',
            },
        };

        await service.createLog({
            schemaName:
                'queen',
            action:
                'quote_selected',
            entityType:
                'quote',
            entityId:
                'quote-1',
            status:
                'success',
            metadata,
        });

        const params =
            queryMock.mock.calls[0][1];

        expect(
            params[6],
        ).toBe(
            JSON.stringify(
                metadata,
            ),
        );
    });

    it('should use the same ISO timestamp in the database and application log', async () => {
        const now =
            new Date(
                '2026-09-07T12:34:56.789Z',
            );

        jest.useFakeTimers();

        jest.setSystemTime(
            now,
        );

        await service.createLog({
            schemaName:
                'queen',
            action:
                'shipment_created',
            entityType:
                'shipment',
            entityId:
                'shipment-1',
            status:
                'warning',
            metadata: {
                reason:
                    'test',
            },
        });

        const params =
            queryMock.mock.calls[0][1];

        expect(
            params[7],
        ).toBe(
            '2026-09-07T12:34:56.789Z',
        );

        expect(
            loggerMock,
        ).toHaveBeenCalledTimes(1);

        const loggedPayload =
            JSON.parse(
                loggerMock.mock.calls[0][0] as string,
            );

        expect(
            loggedPayload.createdAt,
        ).toBe(
            '2026-09-07T12:34:56.789Z',
        );

        expect(
            loggedPayload,
        ).toEqual({
            action:
                'shipment_created',
            entityType:
                'shipment',
            entityId:
                'shipment-1',
            status:
                'warning',
            metadata: {
                reason:
                    'test',
            },
            actorType:
                undefined,
            actorId:
                undefined,
            schemaName:
                'queen',
            createdAt:
                '2026-09-07T12:34:56.789Z',
        });
    });
});