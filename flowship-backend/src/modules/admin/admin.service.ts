import { Injectable } from '@nestjs/common';
import { DbService } from '../../infrastructure/database/db.service';
import { UpdateDecisionCriterionDto } from './dto/update-decision-criterion.dto';
import { CreateDecisionPriorityCardDto } from './dto/create-decision-priority-card.dto';
import { UpdateDecisionPriorityCardDto } from './dto/update-decision-priority-card.dto';
import { ReorderDecisionPriorityCardsDto } from './dto/reorder-decision-priority-cards.dto';
import { ConflictException } from '@nestjs/common';
type TenantContext = {
    id: string;
    name: string;
    schemaName: string;
    status: string;
};

type ProviderRow = {
    id: string;
    code: string;
    name: string;
    adapter_key: string;
    is_mock: boolean;
    is_active: boolean;
    priority_score: string | number;
    created_at: Date;
    updated_at: Date;
};
type DecisionSettingsRow = {
    id: string;
    price_weight: string | number;
    speed_weight: string | number;
    provider_priority_weight: string | number;
    is_active: boolean;
    created_at: Date;
    updated_at: Date;
};
type ProviderCallLogRow = {
    id: string;
    provider_id: string | null;
    provider_code: string | null;
    provider_name: string | null;
    action: string;
    request: unknown;
    response: unknown;
    status: string;
    response_time_ms: number | null;
    error_message: string | null;
    created_at: Date;
};

type ProviderCallLogsCountRow = {
    total: string | number;
};
@Injectable()
export class AdminService {
    constructor(private readonly db: DbService) { }

    async getProviders(tenant: TenantContext) {
        const schemaName = this.safeSchemaName(tenant.schemaName);

        const providers = await this.db.query<ProviderRow>(
            `
      select
        id,
        code,
        name,
        adapter_key,
        is_mock,
        is_active,
        priority_score,
        created_at,
        updated_at
      from ${schemaName}.providers
      order by created_at asc
      `,
        );

        return providers.map((provider) => ({
            id: provider.id,
            code: provider.code,
            name: provider.name,
            adapterKey: provider.adapter_key,
            isMock: provider.is_mock,
            isActive: provider.is_active,
            priorityScore: Number(provider.priority_score),
            createdAt: provider.created_at,
            updatedAt: provider.updated_at,
        }));
    }
    async updateProvider(
        tenant: TenantContext,
        providerId: string,
        dto: {
            isActive?: boolean;
            priorityScore?: number;
        },
    ) {
        const schemaName = this.safeSchemaName(tenant.schemaName);

        const rows = await this.db.query<ProviderRow>(
            `
    update ${schemaName}.providers
    set
      is_active = coalesce($1, is_active),
      priority_score = coalesce($2, priority_score),
      updated_at = now()
    where id = $3
    returning
      id,
      code,
      name,
      adapter_key,
      is_mock,
      is_active,
      priority_score,
      created_at,
      updated_at
    `,
            [
                dto.isActive ?? null,
                dto.priorityScore ?? null,
                providerId,
            ],
        );

        const provider = rows[0];

        if (!provider) {
            return null;
        }

        return {
            id: provider.id,
            code: provider.code,
            name: provider.name,
            adapterKey: provider.adapter_key,
            isMock: provider.is_mock,
            isActive: provider.is_active,
            priorityScore: Number(provider.priority_score),
            createdAt: provider.created_at,
            updatedAt: provider.updated_at,
        };
    }
    async getDecisionSettings(tenant: TenantContext) {
        const schemaName = this.safeSchemaName(tenant.schemaName);

        const rows = await this.db.query<DecisionSettingsRow>(
            `
    select
      id,
      price_weight,
      speed_weight,
      provider_priority_weight,
      is_active,
      created_at,
      updated_at
    from ${schemaName}.decision_settings
    where is_active = true
    order by created_at desc
    limit 1
    `,
        );

        const settings = rows[0];

        if (!settings) {
            return null;
        }

        return {
            id: settings.id,
            priceWeight: Number(settings.price_weight),
            speedWeight: Number(settings.speed_weight),
            providerPriorityWeight: Number(settings.provider_priority_weight),
            isActive: settings.is_active,
            createdAt: settings.created_at,
            updatedAt: settings.updated_at,
        };
    }

    async updateDecisionSettings(
        tenant: TenantContext,
        dto: {
            priceWeight?: number;
            speedWeight?: number;
            providerPriorityWeight?: number;
        },
    ) {
        const schemaName = this.safeSchemaName(tenant.schemaName);

        const rows = await this.db.query<DecisionSettingsRow>(
            `
    update ${schemaName}.decision_settings
    set
      price_weight = coalesce($1, price_weight),
      speed_weight = coalesce($2, speed_weight),
      provider_priority_weight = coalesce($3, provider_priority_weight),
      updated_at = now()
    where is_active = true
    returning
      id,
      price_weight,
      speed_weight,
      provider_priority_weight,
      is_active,
      created_at,
      updated_at
    `,
            [
                dto.priceWeight ?? null,
                dto.speedWeight ?? null,
                dto.providerPriorityWeight ?? null,
            ],
        );

        const settings = rows[0];

        if (!settings) {
            return null;
        }

        return {
            id: settings.id,
            priceWeight: Number(settings.price_weight),
            speedWeight: Number(settings.speed_weight),
            providerPriorityWeight: Number(settings.provider_priority_weight),
            isActive: settings.is_active,
            createdAt: settings.created_at,
            updatedAt: settings.updated_at,
        };
    }
    private safeSchemaName(schemaName: string): string {
        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schemaName)) {
            throw new Error(`Invalid schema name: ${schemaName}`);
        }

        return `"${schemaName}"`;
    }
    async getProviderCallLogs(
        tenant: TenantContext,
        filters: {
            status?: string;
            providerCode?: string;
            action?: string;
            search?: string;
            fromDate?: string;
            toDate?: string;
            limit?: number;
            offset?: number;
        } = {},
    ) {
        const schemaName = this.safeSchemaName(tenant.schemaName);

        const safeLimit =
            filters.limit && filters.limit > 0 && filters.limit <= 100
                ? filters.limit
                : 10;

        const safeOffset =
            filters.offset && filters.offset >= 0
                ? filters.offset
                : 0;

        const search = filters.search?.trim() || null;

        const queryParams = [
            filters.status ?? null,
            filters.providerCode ?? null,
            filters.action ?? null,
            search,
            filters.fromDate ?? null,
            filters.toDate ?? null,
        ];

        const countRows = await this.db.query<ProviderCallLogsCountRow>(
            `
        select count(*) as total
        from ${schemaName}.provider_call_logs l
        left join ${schemaName}.providers p
            on p.id = l.provider_id
        where
            ($1::text is null or l.status = $1)
            and ($2::text is null or p.code = $2)
            and ($3::text is null or l.action = $3)
            and (
                $4::text is null
                or p.name ilike '%' || $4 || '%'
                or p.code ilike '%' || $4 || '%'
                or l.action ilike '%' || $4 || '%'
                or coalesce(l.error_message, '') ilike '%' || $4 || '%'
                or l.id::text ilike '%' || $4 || '%'
            )
            and (
                $5::timestamptz is null
                or l.created_at >= $5::timestamptz
            )
            and (
                $6::timestamptz is null
                or l.created_at < ($6::date + interval '1 day')
            )
        `,
            queryParams,
        );

        const logs = await this.db.query<ProviderCallLogRow>(
            `
        select
            l.id,
            l.provider_id,
            p.code as provider_code,
            p.name as provider_name,
            l.action,
            l.request,
            l.response,
            l.status,
            l.response_time_ms,
            l.error_message,
            l.created_at
        from ${schemaName}.provider_call_logs l
        left join ${schemaName}.providers p
            on p.id = l.provider_id
        where
            ($1::text is null or l.status = $1)
            and ($2::text is null or p.code = $2)
            and ($3::text is null or l.action = $3)
            and (
                $4::text is null
                or p.name ilike '%' || $4 || '%'
                or p.code ilike '%' || $4 || '%'
                or l.action ilike '%' || $4 || '%'
                or coalesce(l.error_message, '') ilike '%' || $4 || '%'
                or l.id::text ilike '%' || $4 || '%'
            )
            and (
                $5::timestamptz is null
                or l.created_at >= $5::timestamptz
            )
            and (
                $6::timestamptz is null
                or l.created_at < ($6::date + interval '1 day')
            )
        order by l.created_at desc
        limit $7
        offset $8
        `,
            [
                ...queryParams,
                safeLimit,
                safeOffset,
            ],
        );

        return {
            total: Number(countRows[0]?.total ?? 0),
            limit: safeLimit,
            offset: safeOffset,
            logs: logs.map((log) => ({
                id: log.id,
                providerId: log.provider_id,
                providerCode: log.provider_code,
                providerName: log.provider_name,
                action: log.action,
                status: log.status,
                responseTimeMs: log.response_time_ms,
                errorMessage: log.error_message,
                request: log.request,
                response: log.response,
                createdAt: log.created_at,
            })),
        };
    }
    async getDecisionCriteria(tenant: TenantContext) {
        const schemaName = this.safeSchemaName(tenant.schemaName);

        const rows = await this.db.query<any>(
            `
    select
      id,
      key,
      label,
      description,
      weight,
      is_active,
      created_at,
      updated_at
    from ${schemaName}.decision_criteria
    order by created_at asc
    `,
        );

        return rows.map((row) => ({
            id: row.id,
            key: row.key,
            label: row.label,
            description: row.description,
            weight: Number(row.weight),
            isActive: row.is_active,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        }));
    }

    async updateDecisionCriterion(
        tenant: TenantContext,
        criterionId: string,
        dto: UpdateDecisionCriterionDto,
    ) {
        const schemaName = this.safeSchemaName(tenant.schemaName);

        const rows = await this.db.query<any>(
            `
    update ${schemaName}.decision_criteria
    set
      weight = coalesce($1, weight),
      is_active = coalesce($2, is_active),
      updated_at = now()
    where id = $3
    returning
      id,
      key,
      label,
      description,
      weight,
      is_active,
      created_at,
      updated_at
    `,
            [dto.weight, dto.isActive, criterionId],
        );

        const row = rows[0];

        if (!row) {
            return null;
        }

        return {
            id: row.id,
            key: row.key,
            label: row.label,
            description: row.description,
            weight: Number(row.weight),
            isActive: row.is_active,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        };
    }
    async getDecisionPriorityCards(tenant: TenantContext) {
        const schemaName = this.safeSchemaName(tenant.schemaName);

        const rows = await this.db.query<any>(
            `
    select
      card.id,
      card.provider_id,
      card.criterion_key,
      card.title,
      card.priority_rank,
      card.is_active,
      card.config,
      card.created_at,
      card.updated_at,

      provider.name as provider_name,
      provider.code as provider_code,

      criterion.label as criterion_label,
      criterion.description as criterion_description
    from ${schemaName}.decision_priority_cards card
    left join ${schemaName}.providers provider
      on provider.id = card.provider_id
    left join ${schemaName}.decision_criteria criterion
      on criterion.key = card.criterion_key
    order by card.priority_rank asc, card.created_at asc
    `,
        );

        return rows.map((row) => ({
            id: row.id,

            providerId: row.provider_id,
            providerName: row.provider_name ?? 'ALL',
            providerCode: row.provider_code ?? 'ALL',

            criterionKey: row.criterion_key,
            criterionLabel: row.criterion_label,
            criterionDescription: row.criterion_description,

            title:
                row.title ??
                `${row.provider_name ?? 'ALL'} + ${row.criterion_label ?? row.criterion_key}`,

            priorityRank: row.priority_rank,
            isActive: row.is_active,
            config: row.config ?? {},

            createdAt: row.created_at,
            updatedAt: row.updated_at,
        }));
    }
    async createDecisionPriorityCard(
        tenant: TenantContext,
        dto: CreateDecisionPriorityCardDto,
    ) {
        const schemaName = this.safeSchemaName(tenant.schemaName);

        const duplicateRows = await this.db.query<any>(
            `
    select id
    from ${schemaName}.decision_priority_cards
    where
      criterion_key = $1
      and (
        ($2::uuid is null and provider_id is null)
        or
        ($2::uuid is not null and provider_id = $2::uuid)
      )
    limit 1
    `,
            [dto.criterionKey, dto.providerId ?? null],
        );

        if (duplicateRows.length) {
            throw new ConflictException(
                'Decision priority card already exists for this provider and criterion',
            );
        }

        const maxRankRows = await this.db.query<any>(
            `
    select coalesce(max(priority_rank), 0) as max_rank
    from ${schemaName}.decision_priority_cards
    `,
        );

        const nextRank = Number(maxRankRows[0]?.max_rank ?? 0) + 1;

        const rows = await this.db.query<any>(
            `
    insert into ${schemaName}.decision_priority_cards (
      provider_id,
      criterion_key,
      title,
      priority_rank,
      is_active,
      config
    )
    values ($1, $2, $3, $4, coalesce($5, true), coalesce($6, '{}'::jsonb))
    returning
      id,
      provider_id,
      criterion_key,
      title,
      priority_rank,
      is_active,
      config,
      created_at,
      updated_at
    `,
            [
                dto.providerId ?? null,
                dto.criterionKey,
                dto.title ?? null,
                nextRank,
                dto.isActive,
                JSON.stringify(dto.config ?? {}),
            ],
        );

        return rows[0];
    }
    async updateDecisionPriorityCard(
        tenant: TenantContext,
        cardId: string,
        dto: UpdateDecisionPriorityCardDto,
    ) {
        const schemaName = this.safeSchemaName(tenant.schemaName);

        const rows = await this.db.query<any>(
            `
    update ${schemaName}.decision_priority_cards
    set
      provider_id = coalesce($1, provider_id),
      criterion_key = coalesce($2, criterion_key),
      title = coalesce($3, title),
      priority_rank = coalesce($4, priority_rank),
      is_active = coalesce($5, is_active),
      config = coalesce($6, config),
      updated_at = now()
    where id = $7
    returning
      id,
      provider_id,
      criterion_key,
      title,
      priority_rank,
      is_active,
      config,
      created_at,
      updated_at
    `,
            [
                dto.providerId,
                dto.criterionKey,
                dto.title,
                dto.priorityRank,
                dto.isActive,
                dto.config ? JSON.stringify(dto.config) : null,
                cardId,
            ],
        );

        return rows[0] ?? null;
    }
    async reorderDecisionPriorityCards(
        tenant: TenantContext,
        dto: ReorderDecisionPriorityCardsDto,
    ) {
        const schemaName = this.safeSchemaName(tenant.schemaName);

        for (const card of dto.cards) {
            await this.db.query(
                `
      update ${schemaName}.decision_priority_cards
      set
        priority_rank = $1,
        updated_at = now()
      where id = $2
      `,
                [card.priorityRank, card.id],
            );
        }

        return this.getDecisionPriorityCards(tenant);
    }
    async deleteDecisionPriorityCard(
        tenant: TenantContext,
        cardId: string,
    ) {
        const schemaName = this.safeSchemaName(tenant.schemaName);

        const rows = await this.db.query<any>(
            `
    delete from ${schemaName}.decision_priority_cards
    where id = $1
    returning id
    `,
            [cardId],
        );

        return rows[0] ?? null;
    }
}