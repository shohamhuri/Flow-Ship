import {
    Body,
    Controller,
    Get,
    NotFoundException,
    Param,
    Patch,
    UseGuards,
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

import {
    GroupingRulesService,
} from './grouping-rules.service';

import {
    UpdateGroupingStrategyDto,
} from './dto/update-grouping-strategy.dto';

import {
    ReorderGroupingStrategiesDto,
} from './dto/reorder-grouping-strategies.dto';

@Controller('admin/grouping-strategies')
@UseGuards(SupabaseAuthGuard)
export class GroupingAdminController {
    constructor(
        private readonly groupingRulesService:
            GroupingRulesService,
    ) { }

    @Get()
    async getStrategies(
        @CurrentFlowShipAuth()
        auth: FlowShipAuthContext,
    ) {
        const strategies =
            await this.groupingRulesService
                .getAllStrategies(auth.tenant);

        return {
            ok: true,
            tenant: {
                id: auth.tenant.id,
                name: auth.tenant.name,
                schemaName:
                    auth.tenant.schemaName,
            },
            strategies,
        };
    }

    @Patch('reorder')
    async reorderStrategies(
        @CurrentFlowShipAuth()
        auth: FlowShipAuthContext,

        @Body()
        dto: ReorderGroupingStrategiesDto,
    ) {
        const strategies =
            await this.groupingRulesService
                .reorderStrategies(
                    auth.tenant,
                    dto.items,
                );

        return {
            ok: true,
            strategies,
        };
    }

    @Patch(':id')
    async updateStrategy(
        @CurrentFlowShipAuth()
        auth: FlowShipAuthContext,

        @Param('id')
        strategyId: string,

        @Body()
        dto: UpdateGroupingStrategyDto,
    ) {
        const strategy =
            await this.groupingRulesService
                .updateStrategy(
                    auth.tenant,
                    strategyId,
                    dto,
                );

        if (!strategy) {
            throw new NotFoundException(
                'Grouping strategy not found',
            );
        }

        return {
            ok: true,
            strategy,
        };
    }
}