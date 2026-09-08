import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'crypto';

import { DbService } from '../src/infrastructure/database/db.service';

import {
    CurrentTenant,
    TenantsService,
} from '../src/modules/tenants/tenants.service';

import { AuditLogsService } from '../src/modules/audit-logs/audit-logs.service';

describe('AuditLogsService Integration', () => {
    let db: DbService;

    let tenantsService: TenantsService;

    let auditLogsService: AuditLogsService;

    let config: ConfigService;

    let tenantA: CurrentTenant;
    let tenantB: CurrentTenant;

    let entityAId: string;
    let entityBId: string;
    let defaultActorEntityId: string;

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
                    AuditLogsService,
                ],
            }).compile();

        db =
            moduleRef.get(DbService);

        tenantsService =
            moduleRef.get(TenantsService);

        auditLogsService =
            moduleRef.get(AuditLogsService);

        config =
            moduleRef.get(ConfigService);

        const tenantAApiKey =
            config.get<string>(
                'TEST_FLOW_SHIP_A_API_KEY',
            );

        const tenantBApiKey =
            config.get<string>(
                'TEST_FLOW_SHIP_B_API_KEY',
            );

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

        tenantA =
            await tenantsService.findByApiKey(
                tenantAApiKey,
            );

        tenantB =
            await tenantsService.findByApiKey(
                tenantBApiKey,
            );

        entityAId =
            randomUUID();

        entityBId =
            randomUUID();

        defaultActorEntityId =
            randomUUID();

        await auditLogsService.createLog({
            schemaName:
                tenantA.schemaName,

            action:
                'integration.audit.a',

            entityType:
                'integration_entity',

            entityId:
                entityAId,

            status:
                'success',

            actorType:
                'user',

            actorId:
                'integration-user-a',

            metadata: {
                source:
                    'integration-test',

                tenant:
                    'A',

                nested: {
                    value:
                        123,
                },
            },
        });

        await auditLogsService.createLog({
            schemaName:
                tenantB.schemaName,

            action:
                'integration.audit.b',

            entityType:
                'integration_entity',

            entityId:
                entityBId,

            status:
                'failed',

            actorType:
                'admin',

            actorId:
                'integration-admin-b',

            metadata: {
                source:
                    'integration-test',

                tenant:
                    'B',

                reason:
                    'test failure',
            },
        });

        await auditLogsService.createLog({
            schemaName:
                tenantA.schemaName,

            action:
                'integration.audit.default-actor',

            entityType:
                'integration_entity',

            entityId:
                defaultActorEntityId,

            status:
                'warning',

            metadata: {
                defaultActorTest:
                    true,
            },
        });
    }, 30000);

    afterAll(async () => {
        await db.query(
            `
            delete from flow_ship_test_a.audit_logs
            where entity_id = any($1::text[])
            `,
            [[
                entityAId,
                defaultActorEntityId,
            ]],
        );

        await db.query(
            `
            delete from flow_ship_test_b.audit_logs
            where entity_id = $1
            `,
            [entityBId],
        );

        await db.onModuleDestroy();
    }, 30000);

    it('should create an audit log for Tenant A', async () => {
        const rows =
            await db.query<{
                action: string;
                entity_type: string;
                entity_id: string;
                status: string;
            }>(
                `
                select
                    action,
                    entity_type,
                    entity_id,
                    status
                from flow_ship_test_a.audit_logs
                where entity_id = $1
                `,
                [entityAId],
            );

        expect(rows).toHaveLength(1);

        expect(rows[0]).toMatchObject({
            action:
                'integration.audit.a',

            entity_type:
                'integration_entity',

            entity_id:
                entityAId,

            status:
                'success',
        });
    });

    it('should create an audit log for Tenant B', async () => {
        const rows =
            await db.query<{
                action: string;
                entity_type: string;
                entity_id: string;
                status: string;
            }>(
                `
                select
                    action,
                    entity_type,
                    entity_id,
                    status
                from flow_ship_test_b.audit_logs
                where entity_id = $1
                `,
                [entityBId],
            );

        expect(rows).toHaveLength(1);

        expect(rows[0]).toMatchObject({
            action:
                'integration.audit.b',

            entity_type:
                'integration_entity',

            entity_id:
                entityBId,

            status:
                'failed',
        });
    });

    it('should persist actor and audit fields correctly', async () => {
        const rows =
            await db.query<{
                actor_type: string;
                actor_id: string;
                action: string;
                entity_type: string;
                entity_id: string;
                status: string;
                created_at: Date;
            }>(
                `
                select
                    actor_type,
                    actor_id,
                    action,
                    entity_type,
                    entity_id,
                    status,
                    created_at
                from flow_ship_test_a.audit_logs
                where entity_id = $1
                `,
                [entityAId],
            );

        expect(rows).toHaveLength(1);

        expect(rows[0]).toMatchObject({
            actor_type:
                'user',

            actor_id:
                'integration-user-a',

            action:
                'integration.audit.a',

            entity_type:
                'integration_entity',

            entity_id:
                entityAId,

            status:
                'success',
        });

        expect(
            rows[0].created_at,
        ).toBeDefined();
    });

    it('should persist metadata as JSON', async () => {
        const rows =
            await db.query<{
                metadata: {
                    source: string;
                    tenant: string;
                    nested: {
                        value: number;
                    };
                };
            }>(
                `
                select metadata
                from flow_ship_test_a.audit_logs
                where entity_id = $1
                `,
                [entityAId],
            );

        expect(rows).toHaveLength(1);

        expect(
            rows[0].metadata,
        ).toEqual({
            source:
                'integration-test',

            tenant:
                'A',

            nested: {
                value:
                    123,
            },
        });
    });

    it('should use default actor values when actor is not provided', async () => {
        const rows =
            await db.query<{
                actor_type: string;
                actor_id: string;
                status: string;
            }>(
                `
                select
                    actor_type,
                    actor_id,
                    status
                from flow_ship_test_a.audit_logs
                where entity_id = $1
                `,
                [defaultActorEntityId],
            );

        expect(rows).toHaveLength(1);

        expect(rows[0]).toMatchObject({
            actor_type:
                'system',

            actor_id:
                'flowship',

            status:
                'warning',
        });
    });

    it('should keep audit logs isolated between tenants', async () => {
        const aInB =
            await db.query(
                `
                select id
                from flow_ship_test_b.audit_logs
                where entity_id = $1
                `,
                [entityAId],
            );

        const bInA =
            await db.query(
                `
                select id
                from flow_ship_test_a.audit_logs
                where entity_id = $1
                `,
                [entityBId],
            );

        expect(
            aInB,
        ).toHaveLength(0);

        expect(
            bInA,
        ).toHaveLength(0);
    });

    it('should reject an invalid schema name', async () => {
        await expect(
            auditLogsService.createLog({
                schemaName:
                    'flow_ship_test_a; drop schema public;',

                action:
                    'integration.invalid-schema',

                entityType:
                    'integration_entity',

                status:
                    'failed',
            }),
        ).rejects.toThrow(
            'Invalid schema name',
        );
    });
});