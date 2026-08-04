import { Type } from 'class-transformer';
import {
    IsArray,
    IsInt,
    IsUUID,
    Min,
    ValidateNested,
} from 'class-validator';

export class ReorderDecisionPriorityCardItemDto {
    @IsUUID()
    id!: string;

    @IsInt()
    @Min(1)
    priorityRank!: number;
}

export class ReorderDecisionPriorityCardsDto {
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ReorderDecisionPriorityCardItemDto)
    cards!: ReorderDecisionPriorityCardItemDto[];
}