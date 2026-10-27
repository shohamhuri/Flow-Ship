import {
    INestApplication,
    UnauthorizedException,
    ValidationPipe,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import type { InventoryProvider } from '../src/modules/sourcing/interfaces/inventory-provider.interface';
import { INVENTORY_PROVIDER } from
    '../src/modules/sourcing/sourcing.tokens';
import { AppModule } from '../src/app.module';
import { DbService } from '../src/infrastructure/database/db.service';
import { AuthService } from '../src/modules/auth/auth.service';
import type { FlowShipAuthContext } from '../src/modules/auth/auth.types';
import {
    CurrentTenant,
    TenantsService,
} from '../src/modules/tenants/tenants.service';

describe('Admin Source Delivery Permissions E2E', () => {
    let app: INestApplication;
    let moduleRef: TestingModule;
    let db: DbService;
    let tenantA: CurrentTenant;
    let tenantB: CurrentTenant;

    const TOKEN_A = 'e2e-source-delivery-token-a';
    const TOKEN_B = 'e2e-source-delivery-token-b';

    const storeId = `e2e-store-${randomUUID()}`;

    function createAuthContext(
        tenant: CurrentTenant,
        suffix: string,
    ): FlowShipAuthContext {
        return {
            user: {
                id: `e2e-source-delivery-user-${suffix}`,
                email: `e2e-source-delivery-${suffix}@flowship.test`,
                displayName: `E2E Admin ${suffix}`,
                role: 'admin',
            },
            tenant,
        };
    }

    beforeAll(async () => {
        moduleRef = await Test.createTestingModule({
            imports: [AppModule],
        }).compile();

        app = moduleRef.createNestApplication();

        app.useGlobalPipes(
            new ValidationPipe({
                whitelist: true,
                transform: true,
                forbidNonWhitelisted: true,
            }),
        );

        await app.init();

        db = moduleRef.get(DbService);
        const inventoryProvider = moduleRef.get<InventoryProvider>(
            INVENTORY_PROVIDER,
        );
        const originalGetSources =
            inventoryProvider.getSources.bind(inventoryProvider);

        jest.spyOn(inventoryProvider, 'getSources')
            .mockImplementation(async (requestedStoreId: string) => {
                if (requestedStoreId === storeId) {
                    return originalGetSources('store-1');
                }

                return originalGetSources(requestedStoreId);
            });
        const dbInfo = await db.query<{
            database_name: string;
            server_address: string | null;
            table_exists: string | null;
        }>(`
    SELECT
        current_database() AS database_name,
        inet_server_addr()::text AS server_address,
        to_regclass(
            'flow_ship_test_a.source_delivery_permissions'
        )::text AS table_exists
`);

        const config = moduleRef.get(ConfigService);
        const authService = moduleRef.get(AuthService);
        const tenantsService = moduleRef.get(TenantsService);

        const apiKeyA = config.get<string>(
            'TEST_FLOW_SHIP_A_API_KEY',
        );
        const apiKeyB = config.get<string>(
            'TEST_FLOW_SHIP_B_API_KEY',
        );

        if (!apiKeyA || !apiKeyB) {
            throw new Error('Missing E2E tenant API keys');
        }

        tenantA = await tenantsService.findByApiKey(apiKeyA);
        tenantB = await tenantsService.findByApiKey(apiKeyB);

        expect(tenantA.schemaName).toBe('flow_ship_test_a');
        expect(tenantB.schemaName).toBe('flow_ship_test_b');

        jest.spyOn(
            authService,
            'authenticateAccessToken',
        ).mockImplementation(async (token) => {
            if (token === TOKEN_A) {
                return createAuthContext(tenantA, 'a');
            }

            if (token === TOKEN_B) {
                return createAuthContext(tenantB, 'b');
            }

            throw new UnauthorizedException(
                'Invalid or expired access token',
            );
        });
        for (const schema of [
            'flow_ship_test_a',
            'flow_ship_test_b',
        ]) {
            await db.query(
                `
        INSERT INTO ${schema}.stores (
            name,
            platform,
            external_store_id,
            is_active
        )
        VALUES ($1, $2, $3, $4)
        `,
                [
                    'E2E Source Delivery Store',
                    'manual',
                    storeId,
                    true,
                ],
            );
        }
    });
    it('should isolate source delivery permissions between tenants', async () => {
        const sourceId = 'WAREHOUSE-SOUTH';

        // Enable self-delivery permission in Tenant A
        const updateResponse = await request(app.getHttpServer())
            .patch(`/admin/source-delivery-permissions/${sourceId}`)
            .set('Authorization', `Bearer ${TOKEN_A}`)
            .send({
                storeId,
                selfDeliveryAllowed: true,
            });


        expect(updateResponse.status).toBe(200);

        expect(updateResponse.body).toMatchObject({
            ok: true,
            permission: {
                storeId,
                sourceId,
                selfDeliveryAllowed: true,
            },
        });

        // Read permissions from Tenant A
        const responseA = await request(app.getHttpServer())
            .get('/admin/source-delivery-permissions')
            .set('Authorization', `Bearer ${TOKEN_A}`)
            .query({ storeId })
            .expect(200);

        expect(responseA.body.permissions).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    sourceId,
                    selfDeliveryAllowed: true,
                }),
            ]),
        );

        // Read permissions from Tenant B
        const responseB = await request(app.getHttpServer())
            .get('/admin/source-delivery-permissions')
            .set('Authorization', `Bearer ${TOKEN_B}`)
            .query({ storeId })
            .expect(200);

        expect(responseB.body.permissions).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    sourceId,
                    selfDeliveryAllowed: false,
                }),
            ]),
        );
    });
    it('should verify E2E database connection', async () => {
        const rows = await db.query<{
            database_name: string;
            table_exists: string | null;
        }>(`
        SELECT
            current_database() AS database_name,
            to_regclass(
                'flow_ship_test_a.source_delivery_permissions'
            )::text AS table_exists
    `);


        expect(rows).toHaveLength(1);
    });
    afterAll(async () => {
        if (db) {
            for (const schema of [
                'flow_ship_test_a',
                'flow_ship_test_b',
            ]) {
                await db.query(
                    `
            DELETE FROM ${schema}.source_delivery_permissions
            WHERE store_id = $1
            `,
                    [storeId],
                );

                await db.query(
                    `
            DELETE FROM ${schema}.stores
            WHERE external_store_id = $1
              AND platform = 'manual'
            `,
                    [storeId],
                );
            }
        }
        jest.restoreAllMocks();

        if (app) {
            await app.close();
        }
    });
});