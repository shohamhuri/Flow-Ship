import {
    Controller,
    Get,
    UseGuards,
} from '@nestjs/common';

import {
    CurrentFlowShipAuth,
} from './current-auth.decorator';

import { SupabaseAuthGuard } from './supabase-auth.guard';

import type {
    FlowShipAuthContext,
} from './auth.types';

@Controller('auth')
export class AuthController {
    @Get('me')
    @UseGuards(SupabaseAuthGuard)
    getMe(
        @CurrentFlowShipAuth()
        auth: FlowShipAuthContext,
    ) {
        return {
            user: auth.user,
            tenant: auth.tenant,
        };
    }
}