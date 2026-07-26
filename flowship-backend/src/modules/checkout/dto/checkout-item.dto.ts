import {
    IsInt,
    IsNotEmpty,
    IsNumber,
    IsOptional,
    IsPositive,
    IsString,
    Min,
} from 'class-validator';

export class CheckoutItemDto {
    @IsString()
    @IsNotEmpty()
    sku!: string; //המזהה של המוצר בחנות 

    @IsString()
    @IsNotEmpty()
    name!: string;

    @IsInt()
    @Min(1)
    quantity!: number; //כמה יחידות הוזמנו.

    @IsOptional()
    @IsNumber()
    @IsPositive()
    weight?: number; // משקל של יחידה אחת 



    @IsOptional()
    @IsString()
    supplierId?: string; // מקור האספקה / המחסן 

    @IsOptional()
    @IsString()
    category?: string; //קטגוריית המוצר 

    @IsNumber()
    @Min(0)
    price!: number; //מחיר ליחידה
}