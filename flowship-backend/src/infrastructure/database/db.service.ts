import {
    Injectable,
    OnModuleDestroy,
} from '@nestjs/common';

import {
    ConfigService,
} from '@nestjs/config';

import {
    Pool,
    PoolClient,
} from 'pg';


export interface DbTransaction {
    query<T = any>(
        sql: string,
        params?: any[],
    ): Promise<T[]>;

    queryOne<T = any>(
        sql: string,
        params?: any[],
    ): Promise<T | null>;
}


@Injectable()
export class DbService
    implements OnModuleDestroy {

    private readonly pool: Pool;


    constructor(
        private readonly configService:
            ConfigService,
    ) {
        const connectionString =
            this.configService.get<string>(
                'DATABASE_URL',
            );


        if (!connectionString) {
            throw new Error(
                'DATABASE_URL is not configured',
            );
        }


        this.pool =
            new Pool({
                connectionString,

                ssl: {
                    rejectUnauthorized:
                        false,
                },
            });
    }


    async query<T = any>(
        sql: string,
        params: any[] = [],
    ): Promise<T[]> {
        const result =
            await this.pool.query(
                sql,
                params,
            );

        return result.rows;
    }


    async queryOne<T = any>(
        sql: string,
        params: any[] = [],
    ): Promise<T | null> {
        const rows =
            await this.query<T>(
                sql,
                params,
            );

        return rows[0] ?? null;
    }


    async transaction<T>(
        callback: (
            tx: DbTransaction,
        ) => Promise<T>,
    ): Promise<T> {
        const client:
            PoolClient =
            await this.pool.connect();


        try {
            await client.query(
                'BEGIN',
            );


            const tx: DbTransaction = {
                query:
                    async <R = any>(
                        sql: string,
                        params: any[] = [],
                    ): Promise<R[]> => {
                        const result =
                            await client.query(
                                sql,
                                params,
                            );

                        return result.rows;
                    },


                queryOne:
                    async <R = any>(
                        sql: string,
                        params: any[] = [],
                    ): Promise<R | null> => {
                        const result =
                            await client.query(
                                sql,
                                params,
                            );

                        return (
                            result.rows[0] ??
                            null
                        );
                    },
            };


            const result =
                await callback(
                    tx,
                );


            await client.query(
                'COMMIT',
            );


            return result;
        } catch (error) {
            await client.query(
                'ROLLBACK',
            );


            throw error;
        } finally {
            client.release();
        }
    }


    async onModuleDestroy():
        Promise<void> {
        await this.pool.end();
    }
}