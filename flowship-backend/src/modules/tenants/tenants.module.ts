import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { TenantsService } from './tenants.service';

@Module({
    imports: [DatabaseModule],
    providers: [TenantsService],
    exports: [TenantsService],
})
export class TenantsModule { }