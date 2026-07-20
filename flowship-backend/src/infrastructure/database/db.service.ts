import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';

@Injectable()
export class DbService implements OnModuleDestroy {
    private readonly pool: Pool;

    constructor(private readonly config: ConfigService) {
        this.pool = new Pool({
            connectionString: this.config.get<string>('DATABASE_URL'),
            ssl: {
                rejectUnauthorized: false,
            },
        });
    }

    async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
        const result = await this.pool.query(sql, params);
        return result.rows;
    }

    async queryOne<T = any>(sql: string, params: any[] = []): Promise<T | null> {
        const rows = await this.query<T>(sql, params);
        return rows[0] ?? null;
    }

    async onModuleDestroy() {
        await this.pool.end();
    }
}