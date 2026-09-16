import {
    IsIn,
    IsNumber,
    IsOptional,
    Min,
    Validate,
    ValidateNested,
    ValidatorConstraint,
    ValidatorConstraintInterface,
    ValidationArguments,
} from 'class-validator';

import { Type } from 'class-transformer';

@ValidatorConstraint({
    name: 'vehicleWeightRulesOrder',
    async: false,
})
class VehicleWeightRulesOrderConstraint
    implements ValidatorConstraintInterface {
    validate(
        _: unknown,
        args: ValidationArguments,
    ): boolean {
        const rules =
            args.object as VehicleWeightRulesDto;

        return (
            rules.scooterMaxWeightKg <=
            rules.carMaxWeightKg
        );
    }

    defaultMessage(): string {
        return 'scooterMaxWeightKg must not be greater than carMaxWeightKg';
    }
}

class VehicleWeightRulesDto {
    @IsNumber()
    @Min(0)
    scooterMaxWeightKg!: number;

    @IsNumber()
    @Min(0)
    @Validate(
        VehicleWeightRulesOrderConstraint,
    )
    carMaxWeightKg!: number;
}

export class UpdateProviderConfigDto {
    @IsOptional()
    @ValidateNested()
    @Type(() => VehicleWeightRulesDto)
    vehicleWeightRules?: VehicleWeightRulesDto;

    @IsOptional()
    @IsIn([
        'urgent',
        'express',
        'standard',
    ])
    defaultUrgency?:
        | 'urgent'
        | 'express'
        | 'standard';
}