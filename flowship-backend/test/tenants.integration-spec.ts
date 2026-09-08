import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';

import { DbService } from '../src/infrastructure/database/db.service';
import { TenantsService } from '../src/modules/tenants/tenants.service';

describe('Tenants Integration', () => {
    let db: DbService;
    let tenantsService: TenantsService;

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
    });

    afterAll(async () => {
        await db.onModuleDestroy();
    });

    it('should connect to the real database', async () => {
        const result =
            await db.query<{
                value: number;
            }>(
                `
                select 1 as value
                `,
            );

        expect(result).toEqual([
            {
                value: 1,
            },
        ]);
    });

    it('should contain the FLOW_SHIP_TEST tenant', async () => {
        const rows =
            await db.query<{
                id: string;
                name: string;
                schema_name: string;
                status: string;
            }>(
                `
                select
                    id,
                    name,
                    schema_name,
                    status
                from public.flowship_tenants
                where schema_name = $1
                limit 1
                `,
                [
                    'flow_ship_test',
                ],
            );

        expect(rows).toHaveLength(1);

        expect(rows[0]).toMatchObject({
            schema_name:
                'flow_ship_test',

            status:
                'active',
        });
    });

    it('should confirm the test tenant schema exists', async () => {
        const rows =
            await db.query<{
                schema_name: string;
            }>(
                `
                select schema_name
                from information_schema.schemata
                where schema_name = $1
                `,
                [
                    'flow_ship_test',
                ],
            );

        expect(rows).toEqual([
            {
                schema_name:
                    'flow_ship_test',
            },
        ]);
    });
});