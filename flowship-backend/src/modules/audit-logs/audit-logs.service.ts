import { Injectable, Logger } from '@nestjs/common';
import { DbService } from '../../infrastructure/database/db.service';

export interface CreateAuditLogInput {
    schemaName: string;
    action: string;
    entityType: string;
    entityId?: string;
    status: 'success' | 'warning' | 'failed';
    metadata?: Record<string, unknown>;
    actorType?: string;
    actorId?: string;
}

@Injectable()
export class AuditLogsService {
    private readonly logger = new Logger(AuditLogsService.name);

    constructor(
        private readonly dbService: DbService,
    ) { }

    async createLog(input: CreateAuditLogInput): Promise<void> {
        const schemaName = this.safeSchemaName(input.schemaName);
        const createdAt = new Date().toISOString();

        const logPayload = {
            action: input.action,
            entityType: input.entityType,
            entityId: input.entityId,
            status: input.status,
            metadata: input.metadata,
            actorType: input.actorType,
            actorId: input.actorId,
            schemaName: input.schemaName,
            createdAt,
        };

        this.logger.log(JSON.stringify(logPayload));

        await this.dbService.query(
            `
            insert into ${schemaName}.audit_logs (
                actor_type,
                actor_id,
                action,
                entity_type,
                entity_id,
                status,
                metadata,
                created_at
            )
            values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
            `,
            [
                input.actorType ?? 'system',
                input.actorId ?? 'flowship',
                input.action,
                input.entityType,
                input.entityId ?? null,
                input.status,
                JSON.stringify(input.metadata ?? {}),
                createdAt,
            ],
        );
    }

    private safeSchemaName(schemaName: string): string {
        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schemaName)) {
            throw new Error(`Invalid schema name: ${schemaName}`);
        }

        return `"${schemaName}"`;
    }
}