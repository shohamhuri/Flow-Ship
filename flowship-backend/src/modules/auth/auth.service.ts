import {
    Injectable,
    UnauthorizedException,
} from '@nestjs/common';

import {
    createClient,
    SupabaseClient,
    User,
} from '@supabase/supabase-js';

import { DbService } from '../../infrastructure/database/db.service';

import { CurrentTenant } from '../tenants/tenants.service';

import {
    AuthenticatedFlowShipUser,
    FlowShipAuthContext,
} from './auth.types';

interface UserTenantRow {
    user_id: string;
    display_name: string | null;
    user_role: string;
    user_status: string;

    tenant_id: string;
    tenant_name: string;
    schema_name: string;
    tenant_status: string;
}

@Injectable()
export class AuthService {
    private readonly supabase: SupabaseClient;

    constructor(
        private readonly databaseService: DbService,
    ) {
        const supabaseUrl =
            process.env.SUPABASE_URL;

        const supabasePublishableKey =
            process.env.SUPABASE_PUBLISHABLE_KEY;

        if (!supabaseUrl) {
            throw new Error(
                'SUPABASE_URL environment variable is missing',
            );
        }

        if (!supabasePublishableKey) {
            throw new Error(
                'SUPABASE_PUBLISHABLE_KEY environment variable is missing',
            );
        }

        this.supabase = createClient(
            supabaseUrl,
            supabasePublishableKey,
            {
                auth: {
                    persistSession: false,
                    autoRefreshToken: false,
                    detectSessionInUrl: false,
                },
            },
        );
    }

    async authenticateAccessToken(
        accessToken: string,
    ): Promise<FlowShipAuthContext> {
        /*
         * Supabase מאמתת את ה-JWT ומחזירה
         * את המשתמש שאליו הוא שייך.
         */
        const {
            data,
            error,
        } = await this.supabase.auth.getUser(
            accessToken,
        );

        if (error || !data.user) {
            throw new UnauthorizedException(
                'Invalid or expired access token',
            );
        }

        return this.loadFlowShipContext(
            data.user,
        );
    }

    private async loadFlowShipContext(
        supabaseUser: User,
    ): Promise<FlowShipAuthContext> {
        const rows =
            await this.databaseService.query<UserTenantRow>(
                `
                select
                    p.user_id,
                    p.display_name,
                    p.role as user_role,
                    p.status as user_status,

                    t.id as tenant_id,
                    t.name as tenant_name,
                    t.schema_name,
                    t.status as tenant_status
                from public.flowship_user_profiles p
                inner join public.flowship_tenants t
                    on t.id = p.tenant_id
                where p.user_id = $1
                limit 1
                `,
                [supabaseUser.id],
            );

        const row = rows[0];

        if (!row) {
            throw new UnauthorizedException(
                'FlowShip profile was not found for this user',
            );
        }

        if (row.user_status !== 'active') {
            throw new UnauthorizedException(
                'FlowShip user is disabled',
            );
        }

        if (row.tenant_status !== 'active') {
            throw new UnauthorizedException(
                'FlowShip tenant is disabled',
            );
        }

        const user: AuthenticatedFlowShipUser = {
            id: row.user_id,
            email: supabaseUser.email ?? null,
            displayName: row.display_name,
            role: row.user_role,
        };

        const tenant: CurrentTenant = {
            id: row.tenant_id,
            name: row.tenant_name,
            schemaName: row.schema_name,
            status: row.tenant_status,
        };

        return {
            user,
            tenant,
        };
    }
}