import { Injectable } from '@nestjs/common';
import { SourcingService } from '../sourcing/sourcing.service';
import { ItemSourcingResult } from '../sourcing/interfaces/source-ranking.interface';
import { CreateCheckoutDto } from './dto/create-checkout.dto';
import { Checkout } from './interfaces/checkout.interface';
import { CurrentTenant } from '../tenants/tenants.service';
import { GroupingService } from '../grouping/grouping.service';
import { GroupingResult } from '../grouping/interfaces/grouping-result.interface';
import { CheckoutRepository } from './checkout.repository';
import { CheckoutProcessingRepository } from './checkout-processing.repository';
import { ShipmentGroupsRepository } from '../grouping/shipment-groups.repository';

export interface CheckoutProcessingResult {
    checkout: Checkout;
    sourcing: ItemSourcingResult[];
    grouping: GroupingResult;

}

@Injectable()
export class CheckoutService {
    constructor(
        private readonly sourcingService: SourcingService,
        private readonly groupingService: GroupingService,

        private readonly checkoutRepository: CheckoutRepository,
        private readonly checkoutProcessingRepository:
            CheckoutProcessingRepository,
        private readonly shipmentGroupsRepository:
            ShipmentGroupsRepository,
    ) { }

    async createCheckout(
        createCheckoutDto: CreateCheckoutDto,
        tenant: CurrentTenant,
    ): Promise<CheckoutProcessingResult> {
        const checkout =
            this.mapToInternalCheckout(createCheckoutDto);

        const checkoutId =
            await this.checkoutRepository.saveCheckout(
                tenant,
                checkout,
                'manual',
            );

        const checkoutItemIdsBySku =
            await this.checkoutRepository.saveCheckoutItems(
                tenant,
                checkoutId,
                checkout,
            );

        await this.checkoutProcessingRepository.create(
            tenant,
            checkoutId,
        );

        try {
            const sourcing =
                await this.sourcingService.findSourcesForCheckout(
                    checkout,
                    tenant,
                );

            await this.checkoutProcessingRepository
                .markSourcingCompleted(
                    tenant,
                    checkoutId,
                );

            const grouping =
                this.groupingService.groupCheckout(
                    checkout,
                    sourcing,
                );

            await this.shipmentGroupsRepository
                .saveGroupingResult(
                    tenant,
                    checkoutId,
                    grouping,
                    checkoutItemIdsBySku,
                );

            await this.checkoutProcessingRepository
                .markGroupingCompleted(
                    tenant,
                    checkoutId,
                );

            await this.checkoutRepository.updateStatus(
                tenant,
                checkoutId,
                grouping.hasUngroupedItems
                    ? 'partially_grouped'
                    : 'grouped',
            );

            return {
                checkout,
                sourcing,
                grouping,
            };
        } catch (error) {
            const errorMessage =
                error instanceof Error
                    ? error.message
                    : 'Unknown checkout processing error';

            await this.checkoutProcessingRepository.markFailed(
                tenant,
                checkoutId,
                errorMessage,
            );

            await this.checkoutRepository.updateStatus(
                tenant,
                checkoutId,
                'failed',
            );

            throw error;
        }
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