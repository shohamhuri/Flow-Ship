import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import {
    UpdateProviderConfigDto,
} from './update-provider-config.dto';

describe('UpdateProviderConfigDto', () => {
    it('should reject scooter max weight greater than car max weight', async () => {
        const dto = plainToInstance(
            UpdateProviderConfigDto,
            {
                vehicleWeightRules: {
                    scooterMaxWeightKg: 60,
                    carMaxWeightKg: 50,
                },
            },
        );

        const errors = await validate(dto);

        expect(errors).toHaveLength(1);

        const vehicleWeightRulesError =
            errors[0];

        expect(
            vehicleWeightRulesError.property,
        ).toBe('vehicleWeightRules');

        expect(
            vehicleWeightRulesError.children,
        ).toBeDefined();

        const carMaxWeightError =
            vehicleWeightRulesError.children?.find(
                (error) =>
                    error.property ===
                    'carMaxWeightKg',
            );

        expect(
            carMaxWeightError?.constraints,
        ).toEqual(
            expect.objectContaining({
                vehicleWeightRulesOrder:
                    'scooterMaxWeightKg must not be greater than carMaxWeightKg',
            }),
        );
    });
    it('should reject empty allowedUrgencies', async () => {
        const dto = plainToInstance(
            UpdateProviderConfigDto,
            {
                allowedUrgencies: [],
            },
        );

        const errors = await validate(dto);

        expect(errors).toHaveLength(1);

        expect(errors[0].property).toBe(
            'allowedUrgencies',
        );

        expect(errors[0].constraints).toEqual(
            expect.objectContaining({
                arrayMinSize:
                    'allowedUrgencies must contain at least 1 elements',
            }),
        );
    });
});