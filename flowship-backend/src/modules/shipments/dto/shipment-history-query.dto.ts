import {
    IsDateString,
    IsEnum,
    IsOptional,
    IsString,
} from 'class-validator';

export enum ShipmentHistoryResultStatus {
    DELIVERED = 'delivered',
    FAILED = 'failed',
}

export enum ShipmentHistorySortBy {
    COMPLETED_AT = 'completedAt',
    CREATED_AT = 'createdAt',
    TOTAL_SHIPPING_PRICE = 'totalShippingPrice',
    TOTAL_SHIPMENTS = 'totalShipments',
}

export enum ShipmentHistorySortDirection {
    ASC = 'asc',
    DESC = 'desc',
}

export class ShipmentHistoryQueryDto {
    @IsOptional()
    @IsEnum(ShipmentHistoryResultStatus)
    resultStatus?: ShipmentHistoryResultStatus;

    @IsOptional()
    @IsString()
    carrierName?: string;

    @IsOptional()
    @IsString()
    search?: string;

    @IsOptional()
    @IsDateString()
    fromDate?: string;

    @IsOptional()
    @IsDateString()
    toDate?: string;

    @IsOptional()
    @IsEnum(ShipmentHistorySortBy)
    sortBy: ShipmentHistorySortBy =
        ShipmentHistorySortBy.COMPLETED_AT;

    @IsOptional()
    @IsEnum(ShipmentHistorySortDirection)
    sortDirection:
        ShipmentHistorySortDirection =
        ShipmentHistorySortDirection.DESC;
}