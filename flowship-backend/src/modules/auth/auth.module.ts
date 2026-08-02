import {
    Global,
    Module,
} from '@nestjs/common';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SupabaseAuthGuard } from './supabase-auth.guard';
import {
    DatabaseModule,
} from '../../infrastructure/database/database.module';

@Global()
@Module({
    imports: [
        DatabaseModule,
    ],
    controllers: [
        AuthController,
    ],
    providers: [
        AuthService,
        SupabaseAuthGuard,
    ],
    exports: [
        AuthService,
        SupabaseAuthGuard,
    ],
})
export class AuthModule { }