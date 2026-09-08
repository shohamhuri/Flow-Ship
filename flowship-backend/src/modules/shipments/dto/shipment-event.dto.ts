import {
    IsEnum,
    IsInt,
    IsISO8601,
    IsOptional,
    IsString,
    IsUUID,
    Min,
} from 'class-validator';
export enum ShipmentEventType {
    PICKED_UP = 'picked_up',
    IN_TRANSIT = 'in_transit',
    DELIVERED = 'delivered',
    FAILED = 'failed',
}

export class ShipmentEventDto {
    @IsUUID()
    shipmentId!: string;

    @IsEnum(ShipmentEventType)
    event!: ShipmentEventType;

    @IsOptional()
    @IsString()
    reason?: string;

    @IsOptional()
    @IsISO8601()
    occurredAt?: string;
    @IsOptional()
    @IsInt()
    @Min(1)
    stopOrder?: number;
}