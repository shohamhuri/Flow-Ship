import {
    Body,
    Controller,
    Delete,
    Get,
    Headers,
    NotFoundException,
    Param,
    Patch,
    Query,
    Post,
    UnauthorizedException,
} from '@nestjs/common';
import { TenantsService } from '../tenants/tenants.service';
import { AdminService } from './admin.service';
import { UpdateProviderDto } from './dto/update-provider.dto';
import { UpdateDecisionSettingsDto } from './dto/update-decision-settings.dto';
import { UpdateDecisionCriterionDto } from './dto/update-decision-criterion.dto';
import { CreateDecisionPriorityCardDto } from './dto/create-decision-priority-card.dto';
import { UpdateDecisionPriorityCardDto } from './dto/update-decision-priority-card.dto';
import { ReorderDecisionPriorityCardsDto } from './dto/reorder-decision-priority-cards.dto';
@Controller('admin')
export class AdminController {
    constructor(
        private readonly adminService: AdminService,
        private readonly tenantsService: TenantsService,
    ) { }

    @Get('providers')
    async getProviders(
        @Headers('x-api-key') apiKey: string | undefined,
    ) {
        if (!apiKey) {
            throw new UnauthorizedException('Missing x-api-key header');
        }

        const tenant = await this.tenantsService.findByApiKey(apiKey);

        if (!tenant) {
            throw new UnauthorizedException('Invalid API key');
        }

        const providers = await this.adminService.getProviders(tenant);

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
        @Headers('x-api-key') apiKey: string | undefined,
    ) {
        if (!apiKey) {
            throw new UnauthorizedException('Missing x-api-key header');
        }

        const tenant = await this.tenantsService.findByApiKey(apiKey);

        if (!tenant) {
            throw new UnauthorizedException('Invalid API key');
        }

        const settings = await this.adminService.getDecisionSettings(tenant);

        if (!settings) {
            throw new NotFoundException('Decision settings not found');
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
        @Headers('x-api-key') apiKey: string | undefined,
        @Body() dto: UpdateDecisionSettingsDto,
    ) {
        if (!apiKey) {
            throw new UnauthorizedException('Missing x-api-key header');
        }

        const tenant = await this.tenantsService.findByApiKey(apiKey);

        if (!tenant) {
            throw new UnauthorizedException('Invalid API key');
        }

        const settings = await this.adminService.updateDecisionSettings(
            tenant,
            dto,
        );

        if (!settings) {
            throw new NotFoundException('Decision settings not found');
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
        @Headers('x-api-key') apiKey: string,
        @Query('status') status?: string,
        @Query('providerCode') providerCode?: string,
        @Query('action') action?: string,
        @Query('search') search?: string,
        @Query('fromDate') fromDate?: string,
        @Query('toDate') toDate?: string,
        @Query('limit') limit?: string,
        @Query('offset') offset?: string,
    ) {
        const tenant = await this.resolveTenant(apiKey);

        const result = await this.adminService.getProviderCallLogs(tenant, {
            status,
            providerCode,
            action,
            search,
            fromDate,
            toDate,
            limit: limit ? Number(limit) : undefined,
            offset: offset ? Number(offset) : undefined,
        });

        return {
            ok: true,
            tenant: {
                id: tenant.id,
                name: tenant.name,
                schemaName: tenant.schemaName,
            },
            filters: {
                status: status ?? null,
                providerCode: providerCode ?? null,
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
        @Headers('x-api-key') apiKey: string | undefined,
        @Param('id') providerId: string,
        @Body() dto: UpdateProviderDto,
    ) {
        if (!apiKey) {
            throw new UnauthorizedException('Missing x-api-key header');
        }

        const tenant = await this.tenantsService.findByApiKey(apiKey);

        if (!tenant) {
            throw new UnauthorizedException('Invalid API key');
        }

        const provider = await this.adminService.updateProvider(
            tenant,
            providerId,
            dto,
        );

        if (!provider) {
            throw new NotFoundException('Provider not found');
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
    async getDecisionCriteria(@Headers('x-api-key') apiKey: string) {
        const tenant = await this.resolveTenant(apiKey);

        const criteria = await this.adminService.getDecisionCriteria(tenant);

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
    private async resolveTenant(apiKey: string) {
        if (!apiKey) {
            throw new UnauthorizedException('Missing x-api-key header');
        }

        const tenant = await this.tenantsService.findByApiKey(apiKey);

        if (!tenant) {
            throw new UnauthorizedException('Invalid API key');
        }

        return tenant;
    }
    @Patch('decision-criteria/:id')
    async updateDecisionCriterion(
        @Headers('x-api-key') apiKey: string,
        @Param('id') id: string,
        @Body() dto: UpdateDecisionCriterionDto,
    ) {
        const tenant = await this.resolveTenant(apiKey);

        const criterion = await this.adminService.updateDecisionCriterion(
            tenant,
            id,
            dto,
        );

        if (!criterion) {
            throw new NotFoundException('Decision criterion not found');
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
    async getDecisionPriorityCards(@Headers('x-api-key') apiKey: string) {
        const tenant = await this.resolveTenant(apiKey);

        const cards = await this.adminService.getDecisionPriorityCards(tenant);

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
        @Headers('x-api-key') apiKey: string,
        @Body() dto: CreateDecisionPriorityCardDto,
    ) {
        const tenant = await this.resolveTenant(apiKey);

        const card = await this.adminService.createDecisionPriorityCard(
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
        @Headers('x-api-key') apiKey: string,
        @Body() dto: ReorderDecisionPriorityCardsDto,
    ) {
        const tenant = await this.resolveTenant(apiKey);

        const cards = await this.adminService.reorderDecisionPriorityCards(
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
        @Headers('x-api-key') apiKey: string,
        @Param('id') id: string,
        @Body() dto: UpdateDecisionPriorityCardDto,
    ) {
        const tenant = await this.resolveTenant(apiKey);

        const card = await this.adminService.updateDecisionPriorityCard(
            tenant,
            id,
            dto,
        );

        if (!card) {
            throw new NotFoundException('Decision priority card not found');
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
        @Headers('x-api-key') apiKey: string,
        @Param('id') id: string,
    ) {
        const tenant = await this.resolveTenant(apiKey);

        const deleted = await this.adminService.deleteDecisionPriorityCard(
            tenant,
            id,
        );

        if (!deleted) {
            throw new NotFoundException('Decision priority card not found');
        }

        return {
            ok: true,
            deletedId: deleted.id,
        };
    }
}