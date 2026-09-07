import {
    UnauthorizedException,
} from '@nestjs/common';

import {
    TenantsService,
} from './tenants.service';

import {
    DbService,
} from '../../infrastructure/database/db.service';

describe('TenantsService', () => {
    let service: TenantsService;

    let queryOneMock: jest.Mock;

    beforeEach(() => {
        queryOneMock = jest.fn();

        const dbMock = {
            queryOne:
                queryOneMock,
        } as unknown as DbService;

        service =
            new TenantsService(
                dbMock,
            );

        jest.clearAllMocks();
    });

    it('should throw UnauthorizedException when api key is missing', async () => {
        await expect(
            service.findByApiKey(
                undefined,
            ),
        ).rejects.toThrow(
            'Missing x-api-key header',
        );

        await expect(
            service.findByApiKey(
                undefined,
            ),
        ).rejects.toBeInstanceOf(
            UnauthorizedException,
        );
    });

    it('should reject an empty api key without querying the database', async () => {
        await expect(
            service.findByApiKey(''),
        ).rejects.toThrow(
            'Missing x-api-key header',
        );

        expect(
            queryOneMock,
        ).not.toHaveBeenCalled();
    });

    it('should query the database using the provided api key', async () => {
        queryOneMock
            .mockResolvedValue({
                id: 'tenant-1',
                name: 'QUEEN',
                schema_name: 'queen',
                status: 'active',
            });

        await service.findByApiKey(
            'api-key-123',
        );

        expect(
            queryOneMock,
        ).toHaveBeenCalledWith(
            expect.any(String),
            [
                'api-key-123',
            ],
        );
    });

    it('should throw UnauthorizedException when no active tenant is found', async () => {
        queryOneMock
            .mockResolvedValue(null);

        await expect(
            service.findByApiKey(
                'invalid-key',
            ),
        ).rejects.toThrow(
            'Invalid API key',
        );

        await expect(
            service.findByApiKey(
                'invalid-key',
            ),
        ).rejects.toBeInstanceOf(
            UnauthorizedException,
        );
    });

    it('should map schema_name to schemaName', async () => {
        queryOneMock
            .mockResolvedValue({
                id: 'tenant-1',
                name: 'QUEEN',
                schema_name:
                    'queen_schema',
                status: 'active',
            });

        const result =
            await service.findByApiKey(
                'valid-key',
            );

        expect(
            result.schemaName,
        ).toBe(
            'queen_schema',
        );

        expect(
            (result as any)
                .schema_name,
        ).toBeUndefined();
    });

    it('should return the mapped tenant data', async () => {
        queryOneMock
            .mockResolvedValue({
                id: 'tenant-1',
                name: 'QUEEN',
                schema_name:
                    'queen',
                status: 'active',
            });

        const result =
            await service.findByApiKey(
                'valid-key',
            );

        expect(result).toEqual({
            id: 'tenant-1',
            name: 'QUEEN',
            schemaName: 'queen',
            status: 'active',
        });
    });

    it('should query only active tenants', async () => {
        queryOneMock
            .mockResolvedValue({
                id: 'tenant-1',
                name: 'QUEEN',
                schema_name: 'queen',
                status: 'active',
            });

        await service.findByApiKey(
            'valid-key',
        );

        const sql =
            queryOneMock
                .mock.calls[0][0];

        expect(sql).toContain(
            "status = 'active'",
        );

        expect(sql).toContain(
            'from public.flowship_tenants',
        );

        expect(sql).toContain(
            'where api_key = $1',
        );
    });
});