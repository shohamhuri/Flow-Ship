import { UnauthorizedException } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';

import { DbService } from '../src/infrastructure/database/db.service';
import { TenantsService } from '../src/modules/tenants/tenants.service';

describe('Multi-Tenant Integration', () => {
    let db: DbService;
    let tenantsService: TenantsService;
    let config: ConfigService;

    let tenantAApiKey: string;
    let tenantBApiKey: string;

    beforeAll(async () => {
        const moduleRef =
            await Test.createTestingModule({
                imports: [
                    ConfigModule.forRoot({
                        isGlobal: true,
                    }),
                ],
                providers: [
                    DbService,
                    TenantsService,
                ],
            }).compile();

        db = moduleRef.get(DbService);

        tenantsService =
            moduleRef.get(TenantsService);

        config =
            moduleRef.get(ConfigService);

        tenantAApiKey =
            config.get<string>(
                'TEST_FLOW_SHIP_A_API_KEY',
            ) ?? '';

        tenantBApiKey =
            config.get<string>(
                'TEST_FLOW_SHIP_B_API_KEY',
            ) ?? '';

        if (!tenantAApiKey) {
            throw new Error(
                'Missing TEST_FLOW_SHIP_A_API_KEY',
            );
        }

        if (!tenantBApiKey) {
            throw new Error(
                'Missing TEST_FLOW_SHIP_B_API_KEY',
            );
        }

        /*
         * טבלה זמנית לצורך בדיקת isolation בלבד.
         * אותו שם טבלה קיים בשני schemas,
         * אבל לכל schema יהיה מידע אחר.
         */

        await db.query(`
            create table if not exists
            flow_ship_test_a.integration_tenant_marker (
                id integer primary key,
                marker text not null
            )
        `);

        await db.query(`
            create table if not exists
            flow_ship_test_b.integration_tenant_marker (
                id integer primary key,
                marker text not null
            )
        `);

        /*
         * מנקים מידע קודם במקרה שטסט קודם נעצר
         * לפני ה-cleanup.
         */

        await db.query(`
            truncate table
            flow_ship_test_a.integration_tenant_marker
        `);

        await db.query(`
            truncate table
            flow_ship_test_b.integration_tenant_marker
        `);

        /*
         * מכניסים מידע שונה לכל Tenant.
         */

        await db.query(
            `
            insert into
            flow_ship_test_a.integration_tenant_marker (
                id,
                marker
            )
            values (
                $1,
                $2
            )
            `,
            [
                1,
                'TENANT_A_ONLY',
            ],
        );

        await db.query(
            `
            insert into
            flow_ship_test_b.integration_tenant_marker (
                id,
                marker
            )
            values (
                $1,
                $2
            )
            `,
            [
                1,
                'TENANT_B_ONLY',
            ],
        );
    });

    afterAll(async () => {
        await db.query(`
            drop table if exists
            flow_ship_test_a.integration_tenant_marker
        `);

        await db.query(`
            drop table if exists
            flow_ship_test_b.integration_tenant_marker
        `);

        await db.onModuleDestroy();
    });

    it('should resolve Tenant A by API key', async () => {
        const tenant =
            await tenantsService.findByApiKey(
                tenantAApiKey,
            );

        expect(tenant).toMatchObject({
            name:
                'FLOW_SHIP_TEST_A',

            status:
                'active',
        });
    });

    it('should resolve Tenant B by API key', async () => {
        const tenant =
            await tenantsService.findByApiKey(
                tenantBApiKey,
            );

        expect(tenant).toMatchObject({
            name:
                'FLOW_SHIP_TEST_B',

            status:
                'active',
        });
    });

    it('should resolve Tenant A to the correct schema', async () => {
        const tenant =
            await tenantsService.findByApiKey(
                tenantAApiKey,
            );

        expect(
            tenant.schemaName,
        ).toBe(
            'flow_ship_test_a',
        );
    });

    it('should resolve Tenant B to the correct schema', async () => {
        const tenant =
            await tenantsService.findByApiKey(
                tenantBApiKey,
            );

        expect(
            tenant.schemaName,
        ).toBe(
            'flow_ship_test_b',
        );
    });

    it('should reject an invalid API key', async () => {
        await expect(
            tenantsService.findByApiKey(
                'invalid-integration-api-key',
            ),
        ).rejects.toBeInstanceOf(
            UnauthorizedException,
        );
    });

    it('should isolate data between Tenant A and Tenant B schemas', async () => {
        const tenantA =
            await tenantsService.findByApiKey(
                tenantAApiKey,
            );

        const tenantB =
            await tenantsService.findByApiKey(
                tenantBApiKey,
            );

        expect(
            tenantA.schemaName,
        ).toBe(
            'flow_ship_test_a',
        );

        expect(
            tenantB.schemaName,
        ).toBe(
            'flow_ship_test_b',
        );

        const tenantAData =
            await db.query<{
                marker: string;
            }>(
                `
                select marker
                from flow_ship_test_a.integration_tenant_marker
                where id = $1
                `,
                [
                    1,
                ],
            );

        const tenantBData =
            await db.query<{
                marker: string;
            }>(
                `
                select marker
                from flow_ship_test_b.integration_tenant_marker
                where id = $1
                `,
                [
                    1,
                ],
            );

        expect(
            tenantAData,
        ).toEqual([
            {
                marker:
                    'TENANT_A_ONLY',
            },
        ]);

        expect(
            tenantBData,
        ).toEqual([
            {
                marker:
                    'TENANT_B_ONLY',
            },
        ]);

        expect(
            tenantAData[0].marker,
        ).not.toBe(
            tenantBData[0].marker,
        );
    });
});