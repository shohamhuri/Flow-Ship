import { Injectable } from '@nestjs/common';

import { CurrentTenant } from '../tenants/tenants.service';
import { Checkout } from '../checkout/interfaces/checkout.interface';

import { ShipmentPlanCandidate } from '../planning/interfaces/shipment-plan.interface';
import { ShipmentPlanDeliveryOption } from '../planning/interfaces/shipment-plan-delivery-option.interface';

import { ShipmentsRepository } from './shipments.repository';

export interface CreatedShipmentResult {
    shipmentId: string;
    shipmentGroupId: string;
}

@Injectable()
export class ShipmentCreationService {
    constructor(
        private readonly shipmentsRepository: ShipmentsRepository,
    ) { }

    async createShipments(
        tenant: CurrentTenant,
        checkoutId: string,
        checkout: Checkout,
        winningPlan: ShipmentPlanCandidate,
        selectedDeliveryOption: ShipmentPlanDeliveryOption,
    ): Promise<CreatedShipmentResult[]> {
        if (!winningPlan.grouping) {
            throw new Error(
                `Cannot create shipments: plan ${winningPlan.id} has no grouping result`,
            );
        }

        if (
            selectedDeliveryOption.planId !==
            winningPlan.id
        ) {
            throw new Error(
                `Delivery option ${selectedDeliveryOption.id} does not belong to plan ${winningPlan.id}`,
            );
        }

        const createdShipments: CreatedShipmentResult[] = [];

        for (
            const selectedGroupQuote of
            selectedDeliveryOption.selectedGroupQuotes
        ) {
            const shipmentGroup =
                winningPlan.grouping.shipmentGroups.find(
                    (group) =>
                        group.groupId ===
                        selectedGroupQuote.groupId,
                );

            if (!shipmentGroup) {
                throw new Error(
                    `Shipment group ${selectedGroupQuote.groupId} was not found in plan ${winningPlan.id}`,
                );
            }

            /*
             * Shipment בלי מקור איסוף אינו חוקי.
             * חשוב לבדוק את זה לפני יצירת רשומת shipment,
             * כדי לא להשאיר shipment יתום ב-DB.
             */
            if (shipmentGroup.sources.length === 0) {
                throw new Error(
                    `Shipment group ${shipmentGroup.groupId} has no supply sources`,
                );
            }

            const quote = selectedGroupQuote.quote;

            const shipmentId =
                await this.shipmentsRepository.createShipment(
                    tenant,
                    {
                        checkoutId,
                        orderId: checkout.orderId,

                        shipmentGroupId:
                            shipmentGroup.groupId,

                        selectedPlanId:
                            winningPlan.id,

                        selectedDeliveryOptionKey:
                            selectedDeliveryOption.id,

                        providerId:
                            quote.providerId,

                        providerCode:
                            quote.providerCode,

                        adapterKey:
                            quote.adapterKey,

                        carrierName:
                            quote.carrierName,

                        serviceName:
                            quote.serviceName,

                        price:
                            quote.price,

                        currency:
                            quote.currency,

                        estimatedDeliveryDays:
                            quote.estimatedDays,

                        status: 'created',
                    },
                );

            /*
             * כרגע ל-SupplySource יש עיר וקואורדינטות,
             * אך אין בהכרח רחוב ומספר בית.
             *
             * לכן שומרים רק את המידע שקיים בפועל,
             * ולא ממציאים כתובת שאינה קיימת.
             */
            const pickupAddresses =
                shipmentGroup.sources.map(
                    (source) => ({
                        sourceId: source.id,
                        sourceName: source.name,
                        sourceType: source.type,

                        country: source.location.country,
                        city: source.location.city,
                        street: source.location.street,
                        houseNumber:
                            source.location.houseNumber,

                        latitude:
                            source.location.latitude,

                        longitude:
                            source.location.longitude,
                    }),
                );

            const dropoffAddress = {
                country: checkout.destination.country,
                city: checkout.destination.city,
                street: checkout.destination.street,
                houseNumber:
                    checkout.destination.houseNumber,
                postalCode:
                    checkout.destination.postalCode,
            };

            await this.shipmentsRepository.createShipmentStops(
                tenant,
                shipmentId,
                pickupAddresses,
                dropoffAddress,
            );

            createdShipments.push({
                shipmentId,
                shipmentGroupId:
                    shipmentGroup.groupId,
            });
        }

        return createdShipments;
    }
}