import { Injectable } from '@nestjs/common';
import { CreateCheckoutDto } from './dto/create-checkout.dto';
import { Checkout } from './interfaces/checkout.interface';

@Injectable()
export class CheckoutService {
    createCheckout(createCheckoutDto: CreateCheckoutDto): Checkout {
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
                houseNumber: createCheckoutDto.destination.houseNumber,
                postalCode: createCheckoutDto.destination.postalCode,
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