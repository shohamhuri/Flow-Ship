import {
    Body,
    Controller,
    Delete,
    Get,
    NotFoundException,
    Param,
    Patch,
    Query,
    Post,
    UseGuards

} from '@nestjs/common';


import {
    CurrentFlowShipAuth,
} from '../auth/current-auth.decorator';

import type {
    FlowShipAuthContext,
} from '../auth/auth.types';

import {
    SupabaseAuthGuard,
} from '../auth/supabase-auth.guard';
import { AdminService } from './admin.service';
import { UpdateProviderDto } from './dto/update-provider.dto';
import { UpdateDecisionSettingsDto } from './dto/update-decision-settings.dto';
import { UpdateDecisionCriterionDto } from './dto/update-decision-criterion.dto';
import { CreateDecisionPriorityCardDto } from './dto/create-decision-priority-card.dto';
import { UpdateDecisionPriorityCardDto } from './dto/update-decision-priority-card.dto';
import { ReorderDecisionPriorityCardsDto } from './dto/reorder-decision-priority-cards.dto';
@Controller('admin')
@UseGuards(SupabaseAuthGuard)
export class AdminController {
    constructor(
        private readonly adminService: AdminService,
    ) { }

    @Get('providers')
    async getProviders(
        @CurrentFlowShipAuth()
        auth: FlowShipAuthContext,
    ) {
        const tenant = auth.tenant;

        const providers =
            await this.adminService.getProviders(tenant);

        return {
            ok: true,
            tenant: {
                id: tenant.id,
                name: tenant.name,
                schemaName: tenant.schemaName,
            },
            providers,
        };
    }
    @Get('decision-settings')
    async getDecisionSettings(
        @CurrentFlowShipAuth()
        auth: FlowShipAuthContext,
    ) {
        const tenant = auth.tenant;

        const settings =
            await this.adminService
                .getDecisionSettings(tenant);

        if (!settings) {
            throw new NotFoundException(
                'Decision settings not found',
            );
        }

        return {
            ok: true,
            tenant: {
                id: tenant.id,
                name: tenant.name,
                schemaName: tenant.schemaName,
            },
            settings,
        };
    }

    @Patch('decision-settings')
    async updateDecisionSettings(
        @CurrentFlowShipAuth()
        auth: FlowShipAuthContext,

        @Body()
        dto: UpdateDecisionSettingsDto,
    ) {
        const tenant = auth.tenant;

        const settings =
            await this.adminService
                .updateDecisionSettings(
                    tenant,
                    dto,
                );

        if (!settings) {
            throw new NotFoundException(
                'Decision settings not found',
            );
        }

        return {
            ok: true,
            tenant: {
                id: tenant.id,
                name: tenant.name,
                schemaName: tenant.schemaName,
            },
            settings,
        };
    }
    @Get('provider-call-logs')
    async getProviderCallLogs(
        @CurrentFlowShipAuth()
        auth: FlowShipAuthContext,

        @Query('status')
        status?: string,

        @Query('providerCode')
        providerCode?: string,

        @Query('action')
        action?: string,

        @Query('search')
        search?: string,

        @Query('fromDate')
        fromDate?: string,

        @Query('toDate')
        toDate?: string,

        @Query('limit')
        limit?: string,

        @Query('offset')
        offset?: string,
    ) {
        const tenant = auth.tenant;

        const result =
            await this.adminService.getProviderCallLogs(
                tenant,
                {
                    status,
                    providerCode,
                    action,
                    search,
                    fromDate,
                    toDate,
                    limit: limit
                        ? Number(limit)
                        : undefined,
                    offset: offset
                        ? Number(offset)
                        : undefined,
                },
            );

        return {
            ok: true,
            tenant: {
                id: tenant.id,
                name: tenant.name,
                schemaName: tenant.schemaName,
            },
            filters: {
                status: status ?? null,
                providerCode:
                    providerCode ?? null,
                action: action ?? null,
                search: search ?? null,
                fromDate: fromDate ?? null,
                toDate: toDate ?? null,
                limit: result.limit,
                offset: result.offset,
            },
            count: result.logs.length,
            total: result.total,
            logs: result.logs,
        };
    }
    @Patch('providers/:id')
    async updateProvider(
        @CurrentFlowShipAuth()
        auth: FlowShipAuthContext,

        @Param('id')
        providerId: string,

        @Body()
        dto: UpdateProviderDto,
    ) {
        const tenant = auth.tenant;

        const provider =
            await this.adminService.updateProvider(
                tenant,
                providerId,
                dto,
            );

        if (!provider) {
            throw new NotFoundException(
                'Provider not found',
            );
        }

        return {
            ok: true,
            tenant: {
                id: tenant.id,
                name: tenant.name,
                schemaName: tenant.schemaName,
            },
            provider,
        };
    }
    @Get('decision-criteria')
    async getDecisionCriteria(
        @CurrentFlowShipAuth()
        auth: FlowShipAuthContext,
    ) {
        const tenant = auth.tenant;

        const criteria =
            await this.adminService
                .getDecisionCriteria(tenant);

        return {
            ok: true,
            tenant: {
                id: tenant.id,
                name: tenant.name,
                schemaName: tenant.schemaName,
            },
            criteria,
        };
    }

    @Patch('decision-criteria/:id')
    async updateDecisionCriterion(
        @CurrentFlowShipAuth()
        auth: FlowShipAuthContext,

        @Param('id')
        id: string,

        @Body()
        dto: UpdateDecisionCriterionDto,
    ) {
        const tenant = auth.tenant;

        const criterion =
            await this.adminService
                .updateDecisionCriterion(
                    tenant,
                    id,
                    dto,
                );

        if (!criterion) {
            throw new NotFoundException(
                'Decision criterion not found',
            );
        }

        return {
            ok: true,
            tenant: {
                id: tenant.id,
                name: tenant.name,
                schemaName: tenant.schemaName,
            },
            criterion,
        };
    }
    @Get('decision-priority-cards')
    async getDecisionPriorityCards(
        @CurrentFlowShipAuth()
        auth: FlowShipAuthContext,
    ) {
        const tenant = auth.tenant;

        const cards =
            await this.adminService
                .getDecisionPriorityCards(tenant);

        return {
            ok: true,
            tenant: {
                id: tenant.id,
                name: tenant.name,
                schemaName: tenant.schemaName,
            },
            cards,
        };
    }
    @Post('decision-priority-cards')
    async createDecisionPriorityCard(
        @CurrentFlowShipAuth()
        auth: FlowShipAuthContext,

        @Body()
        dto: CreateDecisionPriorityCardDto,
    ) {
        const tenant = auth.tenant;

        const card =
            await this.adminService
                .createDecisionPriorityCard(
                    tenant,
                    dto,
                );

        return {
            ok: true,
            tenant: {
                id: tenant.id,
                name: tenant.name,
                schemaName: tenant.schemaName,
            },
            card,
        };
    }
    @Patch('decision-priority-cards/reorder')
    async reorderDecisionPriorityCards(
        @CurrentFlowShipAuth()
        auth: FlowShipAuthContext,

        @Body()
        dto: ReorderDecisionPriorityCardsDto,
    ) {
        const tenant = auth.tenant;

        const cards =
            await this.adminService
                .reorderDecisionPriorityCards(
                    tenant,
                    dto,
                );

        return {
            ok: true,
            tenant: {
                id: tenant.id,
                name: tenant.name,
                schemaName: tenant.schemaName,
            },
            cards,
        };
    }
    @Patch('decision-priority-cards/:id')
    async updateDecisionPriorityCard(
        @CurrentFlowShipAuth()
        auth: FlowShipAuthContext,

        @Param('id')
        id: string,

        @Body()
        dto: UpdateDecisionPriorityCardDto,
    ) {
        const tenant = auth.tenant;

        const card =
            await this.adminService
                .updateDecisionPriorityCard(
                    tenant,
                    id,
                    dto,
                );

        if (!card) {
            throw new NotFoundException(
                'Decision priority card not found',
            );
        }

        return {
            ok: true,
            tenant: {
                id: tenant.id,
                name: tenant.name,
                schemaName: tenant.schemaName,
            },
            card,
        };
    }
    @Delete('decision-priority-cards/:id')
    async deleteDecisionPriorityCard(
        @CurrentFlowShipAuth()
        auth: FlowShipAuthContext,

        @Param('id')
        id: string,
    ) {
        const tenant = auth.tenant;

        const deleted =
            await this.adminService
                .deleteDecisionPriorityCard(
                    tenant,
                    id,
                );

        if (!deleted) {
            throw new NotFoundException(
                'Decision priority card not found',
            );
        }

        return {
            ok: true,
            deletedId: deleted.id,
        };
    }
}