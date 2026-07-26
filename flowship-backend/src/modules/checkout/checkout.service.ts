import { Injectable } from '@nestjs/common';
import { SourcingService } from '../sourcing/sourcing.service';
import { ItemSourcingResult } from '../sourcing/interfaces/source-ranking.interface';
import { CreateCheckoutDto } from './dto/create-checkout.dto';
import { Checkout } from './interfaces/checkout.interface';
import { CurrentTenant } from '../tenants/tenants.service';

export interface CheckoutProcessingResult {
    checkout: Checkout;
    sourcing: ItemSourcingResult[];
}

@Injectable()
export class CheckoutService {
    constructor(
        private readonly sourcingService: SourcingService,
    ) { }

    async createCheckout(
        createCheckoutDto: CreateCheckoutDto,
        tenant: CurrentTenant,

    ): Promise<CheckoutProcessingResult> {
        const checkout = this.mapToInternalCheckout(
            createCheckoutDto,
        );

        const sourcing =
            await this.sourcingService.findSourcesForCheckout(
                checkout,
                tenant,
            );
        return {
            checkout,
            sourcing,
        };
    }

    private mapToInternalCheckout(
        createCheckoutDto: CreateCheckoutDto,
    ): Checkout {
        const totalItems = createCheckoutDto.items.reduce(
            (sum, item) => sum + item.quantity,
            0,
        );

        const totalPrice = createCheckoutDto.items.reduce(
            (sum, item) => sum + item.price * item.quantity,
            0,
        );

        return {
            orderId: createCheckoutDto.orderId,
            storeId: createCheckoutDto.storeId,

            destination: {
                country: createCheckoutDto.destination.country,
                city: createCheckoutDto.destination.city,
                street: createCheckoutDto.destination.street,
                houseNumber:
                    createCheckoutDto.destination.houseNumber,
                postalCode:
                    createCheckoutDto.destination.postalCode,
            },

            items: createCheckoutDto.items.map((item) => ({
                sku: item.sku,
                name: item.name,
                quantity: item.quantity,
                unitWeight: item.weight,
                supplierId: item.supplierId,
                category: item.category,
                unitPrice: item.price,
            })),

            totalItems,
            totalPrice,
            createdAt: new Date(),
        };
    }
}