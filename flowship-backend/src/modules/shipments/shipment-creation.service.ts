import { Injectable } from '@nestjs/common';
import {
    DbService,
} from '../../infrastructure/database/db.service';
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
        private readonly db:
            DbService,
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

        /*
         * קודם מאמתים את כל הקבוצות.
         * בשלב הזה אסור לכתוב שום דבר ל-DB.
         */
        const validatedGroups =
            selectedDeliveryOption.selectedGroupQuotes.map(
                (selectedGroupQuote) => {
                    const shipmentGroup =
                        winningPlan.grouping!.shipmentGroups.find(
                            (group) =>
                                group.groupId ===
                                selectedGroupQuote.groupId,
                        );

                    if (!shipmentGroup) {
                        throw new Error(
                            `Shipment group ${selectedGroupQuote.groupId} was not found in plan ${winningPlan.id}`,
                        );
                    }

                    if (
                        !shipmentGroup.sources ||
                        shipmentGroup.sources.length === 0
                    ) {
                        throw new Error(
                            `Shipment group ${shipmentGroup.groupId} has no supply sources`,
                        );
                    }

                    for (
                        const source of shipmentGroup.sources
                    ) {
                        if (!source.location) {
                            throw new Error(
                                `Source ${source.id} has no location`,
                            );
                        }
                    }

                    return {
                        selectedGroupQuote,
                        shipmentGroup,
                    };
                },
            );

        /*
         * רק אם כל הקבוצות עברו validation,
         * מתחילים ליצור shipments.
         */
        return this.db.transaction(
            async (tx) => {
                const createdShipments:
                    CreatedShipmentResult[] = [];


                for (
                    const {
                        selectedGroupQuote,
                        shipmentGroup,
                    } of validatedGroups
                ) {
                    const quote =
                        selectedGroupQuote.quote;


                    const shipmentId =
                        await this
                            .shipmentsRepository
                            .createShipment(
                                tenant,
                                {
                                    checkoutId,

                                    orderId:
                                        checkout.orderId,

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

                                    status:
                                        'created',
                                },

                                tx,
                            );


                    const pickupAddresses =
                        shipmentGroup.sources.map(
                            (source) => ({
                                sourceId:
                                    source.id,

                                sourceName:
                                    source.name,

                                sourceType:
                                    source.type,

                                country:
                                    source.location.country,

                                city:
                                    source.location.city,

                                street:
                                    source.location.street,

                                houseNumber:
                                    source.location.houseNumber,

                                latitude:
                                    source.location.latitude,

                                longitude:
                                    source.location.longitude,
                            }),
                        );


                    const dropoffAddress = {
                        country:
                            checkout.destination.country,

                        city:
                            checkout.destination.city,

                        street:
                            checkout.destination.street,

                        houseNumber:
                            checkout.destination.houseNumber,

                        postalCode:
                            checkout.destination.postalCode,
                    };


                    await this
                        .shipmentsRepository
                        .createShipmentStops(
                            tenant,
                            shipmentId,
                            pickupAddresses,
                            dropoffAddress,
                            tx,
                        );


                    createdShipments.push({
                        shipmentId,

                        shipmentGroupId:
                            shipmentGroup.groupId,
                    });
                }


                return createdShipments;
            },
        );
    }
}