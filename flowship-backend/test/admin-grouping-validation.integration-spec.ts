import 'reflect-metadata';
import {
    plainToInstance,
} from 'class-transformer';

import {
    validate,
    ValidationError,
} from 'class-validator';

import {
    UpdateProviderDto,
} from '../src/modules/admin/dto/update-provider.dto';

import {
    UpdateDecisionSettingsDto,
} from '../src/modules/admin/dto/update-decision-settings.dto';

import {
    UpdateGroupingStrategyDto,
} from '../src/modules/grouping/dto/update-grouping-strategy.dto';

import {
    ReorderGroupingStrategiesDto,
} from '../src/modules/grouping/dto/reorder-grouping-strategies.dto';


describe(
    'Admin / Grouping DTO Validation Integration',
    () => {

        function getConstraints(
            errors: ValidationError[],
        ): string[] {

            const constraints: string[] = [];

            function collect(
                error: ValidationError,
            ): void {

                if (error.constraints) {
                    constraints.push(
                        ...Object.values(
                            error.constraints,
                        ),
                    );
                }

                for (
                    const child
                    of error.children ?? []
                ) {
                    collect(child);
                }
            }

            for (const error of errors) {
                collect(error);
            }

            return constraints;
        }


        it(
            '1. accepts a valid provider priorityScore',
            async () => {

                const dto =
                    plainToInstance(
                        UpdateProviderDto,
                        {
                            isActive: true,
                            priorityScore: 0.75,
                        },
                    );


                const errors =
                    await validate(dto);


                expect(errors)
                    .toHaveLength(0);
            },
        );


        it(
            '2. rejects provider priorityScore greater than 1',
            async () => {

                const dto =
                    plainToInstance(
                        UpdateProviderDto,
                        {
                            priorityScore: 1.01,
                        },
                    );


                const errors =
                    await validate(dto);


                expect(errors.length)
                    .toBeGreaterThan(0);


                expect(
                    getConstraints(errors)
                        .join(' '),
                ).toContain(
                    'must not be greater than 1',
                );
            },
        );


        it(
            '3. rejects provider priorityScore lower than 0',
            async () => {

                const dto =
                    plainToInstance(
                        UpdateProviderDto,
                        {
                            priorityScore: -0.01,
                        },
                    );


                const errors =
                    await validate(dto);


                expect(errors.length)
                    .toBeGreaterThan(0);


                expect(
                    getConstraints(errors)
                        .join(' '),
                ).toContain(
                    'must not be less than 0',
                );
            },
        );


        it(
            '4. rejects a non-number provider priorityScore',
            async () => {

                const dto =
                    plainToInstance(
                        UpdateProviderDto,
                        {
                            priorityScore: 'high',
                        },
                    );


                const errors =
                    await validate(dto);


                expect(errors.length)
                    .toBeGreaterThan(0);


                expect(
                    getConstraints(errors)
                        .join(' '),
                ).toContain(
                    'must be a number',
                );
            },
        );


        it(
            '5. accepts valid decision settings weights',
            async () => {

                const dto =
                    plainToInstance(
                        UpdateDecisionSettingsDto,
                        {
                            priceWeight: 0.5,
                            speedWeight: 0.3,
                            providerPriorityWeight:
                                0.2,
                        },
                    );


                const errors =
                    await validate(dto);


                expect(errors)
                    .toHaveLength(0);
            },
        );


        it(
            '6. rejects a decision settings weight greater than 1',
            async () => {

                const dto =
                    plainToInstance(
                        UpdateDecisionSettingsDto,
                        {
                            priceWeight: 1.5,
                        },
                    );


                const errors =
                    await validate(dto);


                expect(errors.length)
                    .toBeGreaterThan(0);


                expect(
                    getConstraints(errors)
                        .join(' '),
                ).toContain(
                    'must not be greater than 1',
                );
            },
        );


        it(
            '7. accepts a valid grouping strategy update payload',
            async () => {

                const dto =
                    plainToInstance(
                        UpdateGroupingStrategyDto,
                        {
                            displayName:
                                'Supplier grouping',

                            isEnabled: true,

                            executionOrder: 2,

                            conflictPriority: 0,

                            config: {
                                strict: true,
                            },
                        },
                    );


                const errors =
                    await validate(dto);


                expect(errors)
                    .toHaveLength(0);
            },
        );


        it(
            '8. rejects grouping executionOrder lower than 1',
            async () => {

                const dto =
                    plainToInstance(
                        UpdateGroupingStrategyDto,
                        {
                            executionOrder: 0,
                        },
                    );


                const errors =
                    await validate(dto);


                expect(errors.length)
                    .toBeGreaterThan(0);


                expect(
                    getConstraints(errors)
                        .join(' '),
                ).toContain(
                    'must not be less than 1',
                );
            },
        );


        it(
            '9. rejects grouping isEnabled when it is not boolean',
            async () => {

                const dto =
                    plainToInstance(
                        UpdateGroupingStrategyDto,
                        {
                            isEnabled: 'true',
                        },
                    );


                const errors =
                    await validate(dto);


                expect(errors.length)
                    .toBeGreaterThan(0);


                expect(
                    getConstraints(errors)
                        .join(' '),
                ).toContain(
                    'must be a boolean value',
                );
            },
        );


        it(
            '10. validates nested grouping reorder items',
            async () => {

                const dto =
                    plainToInstance(
                        ReorderGroupingStrategiesDto,
                        {
                            items: [
                                {
                                    id:
                                        'not-a-valid-uuid',

                                    executionOrder:
                                        0,

                                    conflictPriority:
                                        -1,
                                },
                            ],
                        },
                    );


                const errors =
                    await validate(dto);


                expect(errors.length)
                    .toBeGreaterThan(0);


                const constraints =
                    getConstraints(errors)
                        .join(' ');


                expect(constraints)
                    .toContain(
                        'must be a UUID',
                    );


                expect(constraints)
                    .toContain(
                        'must not be less than 1',
                    );


                expect(constraints)
                    .toContain(
                        'must not be less than 0',
                    );
            },
        );
    },
);