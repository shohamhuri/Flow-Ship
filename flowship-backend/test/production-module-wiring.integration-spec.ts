import {
    INestApplication,
    ValidationPipe,
} from '@nestjs/common';

import {
    Test,
    TestingModule,
} from '@nestjs/testing';

import request from 'supertest';
import {
    AppModule,
} from '../src/app.module';

import {
    AuthService,
} from '../src/modules/auth/auth.service';

import {
    SupabaseAuthGuard,
} from '../src/modules/auth/supabase-auth.guard';

import {
    DbService,
} from '../src/infrastructure/database/db.service';

import {
    TenantsService,
} from '../src/modules/tenants/tenants.service';

import {
    CheckoutService,
} from '../src/modules/checkout/checkout.service';

import {
    ShipmentCreationService,
} from '../src/modules/shipments/shipment-creation.service';

import {
    ShipmentStatusService,
} from '../src/modules/shipments/shipment-status.service';

import {
    ShipmentHistoryService,
} from '../src/modules/shipments/shipment-history.service';


describe(
    'Production Module Wiring Integration',
    () => {
        let moduleRef:
            TestingModule;

        let app:
            INestApplication;


        /*
         * ============================================================
         * TEST 1
         *
         * Compile the REAL AppModule.
         *
         * This catches:
         * - missing providers
         * - missing imports
         * - broken exports
         * - unresolved guards
         * - circular DI problems
         * ============================================================
         */

        it(
            'should compile the real AppModule',
            async () => {
                moduleRef =
                    await Test
                        .createTestingModule({
                            imports: [
                                AppModule,
                            ],
                        })
                        .compile();


                expect(
                    moduleRef,
                ).toBeDefined();
            },
            30000,
        );


        /*
         * ============================================================
         * TEST 2
         *
         * Nest must actually initialize.
         *
         * compile() alone is not enough:
         * some lifecycle/bootstrap problems appear only on init().
         * ============================================================
         */

        it(
            'should initialize the real Nest application',
            async () => {
                if (!moduleRef) {
                    moduleRef =
                        await Test
                            .createTestingModule({
                                imports: [
                                    AppModule,
                                ],
                            })
                            .compile();
                }


                app =
                    moduleRef
                        .createNestApplication();


                app.useGlobalPipes(
                    new ValidationPipe({
                        whitelist:
                            true,

                        forbidNonWhitelisted:
                            true,

                        transform:
                            true,
                    }),
                );


                await app.init();


                expect(
                    app,
                ).toBeDefined();
            },
            30000,
        );


        /*
         * ============================================================
         * TEST 3
         *
         * Important production providers must be resolvable through
         * the REAL application graph.
         * ============================================================
         */

        it(
            'should resolve critical production services and auth guard',
            () => {
                expect(
                    app.get(
                        DbService,
                    ),
                ).toBeDefined();


                expect(
                    app.get(
                        TenantsService,
                    ),
                ).toBeDefined();


                expect(
                    app.get(
                        AuthService,
                    ),
                ).toBeDefined();


                expect(
                    app.get(
                        SupabaseAuthGuard,
                    ),
                ).toBeDefined();


                expect(
                    app.get(
                        CheckoutService,
                    ),
                ).toBeDefined();


                expect(
                    app.get(
                        ShipmentCreationService,
                    ),
                ).toBeDefined();


                expect(
                    app.get(
                        ShipmentStatusService,
                    ),
                ).toBeDefined();


                expect(
                    app.get(
                        ShipmentHistoryService,
                    ),
                ).toBeDefined();
            },
        );


        /*
         * ============================================================
         * TEST 4
         *
         * Real controller + real guard wiring.
         *
         * We intentionally do NOT send Authorization.
         *
         * Expected:
         * route exists
         * controller is registered
         * guard is registered
         * guard executes
         * response = 401
         *
         * A 404 would mean route/controller wiring is broken.
         * A Nest DI error would mean guard/service wiring is broken.
         * ============================================================
         */

        it(
            'should expose GET /auth/me and protect it with SupabaseAuthGuard',
            async () => {
                await request(
                    app.getHttpServer(),
                )
                    .get(
                        '/auth/me',
                    )
                    .expect(
                        401,
                    );
            },
        );


        afterAll(
            async () => {
                if (app) {
                    await app.close();

                    return;
                }


                if (moduleRef) {
                    await moduleRef.close();
                }
            },
            30000,
        );
    },
);