import { Injectable } from '@nestjs/common';
import {
    DbService,
    DbTransaction,
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
        externalTx?: DbTransaction,
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
        const selectedGroupIds =
            selectedDeliveryOption.selectedGroupQuotes.map(
                (group) => group.groupId,
            );

        const uniqueSelectedGroupIds = new Set(selectedGroupIds);

        if (uniqueSelectedGroupIds.size !== selectedGroupIds.length) {
            throw new Error('Duplicate selected shipment group');
        }

        const requiredGroupIds = new Set(
            winningPlan.grouping.shipmentGroups.map(
                (group) => group.groupId,
            ),
        );
        for (const groupId of selectedGroupIds) {
            if (!requiredGroupIds.has(groupId)) {
                throw new Error(
                    `Shipment group ${groupId} was not found in plan ${winningPlan.id}`,
                );
            }
        }
        if (
            selectedGroupIds.length > 0 &&
            (
                uniqueSelectedGroupIds.size !== requiredGroupIds.size ||
                [...requiredGroupIds].some(
                    (groupId) => !uniqueSelectedGroupIds.has(groupId),
                )
            )
        ) {
            throw new Error('Incomplete shipment group coverage');
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

                    const requiredSourceIds = new Set(
                        shipmentGroup.items.map((item) => item.sourceId),
                    );

                    const selectedShipments =
                        selectedGroupQuote.shipments ?? [];
                    const selectedVehicleKeys = new Set<string>();

                    for (const shipment of selectedShipments) {
                        if (
                            !shipment.sourceId ||
                            !Number.isInteger(shipment.vehicleIndex) ||
                            shipment.vehicleIndex < 0
                        ) {
                            throw new Error(
                                `Invalid physical shipment in group ${shipmentGroup.groupId}`,
                            );
                        }

                        const vehicleKey =
                            `${shipment.sourceId}:${shipment.vehicleIndex}`;

                        if (selectedVehicleKeys.has(vehicleKey)) {
                            throw new Error(
                                `Duplicate physical shipment ${vehicleKey} in group ${shipmentGroup.groupId}`,
                            );
                        }

                        selectedVehicleKeys.add(vehicleKey);
                    }
                    const selectedSourceIds = new Set(
                        selectedShipments.map((shipment) => shipment.sourceId),
                    );

                    if (
                        requiredSourceIds.size === 0 ||
                        [...requiredSourceIds].some(
                            (sourceId) => !selectedSourceIds.has(sourceId),
                        ) ||
                        [...selectedSourceIds].some(
                            (sourceId) => !requiredSourceIds.has(sourceId),
                        )
                    ) {
                        throw new Error(
                            `Incomplete shipment coverage for group ${shipmentGroup.groupId}`,
                        );

                    }
                    for (const shipment of selectedShipments) {
                        const source = shipmentGroup.sources.find(
                            (candidate) => candidate.id === shipment.sourceId,
                        );

                        if (!source) {
                            throw new Error(
                                `Source ${shipment.sourceId} not found in group ${shipmentGroup.groupId}`,
                            );
                        }
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
        const persistShipments = async (
            tx: DbTransaction,
        ): Promise<CreatedShipmentResult[]> => {
            const createdShipments:
                CreatedShipmentResult[] = [];



            for (const { selectedGroupQuote, shipmentGroup } of validatedGroups) {
                const shipments = selectedGroupQuote.shipments;

                if (!shipments?.length) {
                    throw new Error(
                        `Group ${shipmentGroup.groupId} has no physical shipments`,
                    );
                }

                for (const shipment of shipments) {
                    const source = shipmentGroup.sources.find(
                        (candidate) => candidate.id === shipment.sourceId,
                    );

                    if (!source) {
                        throw new Error(
                            `Source ${shipment.sourceId} not found in group ${shipmentGroup.groupId}`,
                        );
                    }

                    const quote = shipment.quote;

                    const shipmentId = await this.shipmentsRepository.createShipment(
                        tenant,
                        {
                            checkoutId,
                            orderId: checkout.orderId,
                            shipmentGroupId: shipmentGroup.groupId,
                            selectedPlanId: winningPlan.id,
                            selectedDeliveryOptionKey: selectedDeliveryOption.id,
                            providerId: quote.providerId,
                            providerCode: quote.providerCode,
                            adapterKey: quote.adapterKey,
                            carrierName: quote.carrierName,
                            serviceName: quote.serviceName,
                            price: quote.price,
                            currency: quote.currency,
                            estimatedDeliveryDays: quote.estimatedDays,
                            status: 'created',
                            metadata: {
                                sourceId: shipment.sourceId,
                                vehicleIndex: shipment.vehicleIndex,
                                vehicleType: shipment.vehicleType,
                                assignedWeightKg: shipment.assignedWeightKg,
                                items: shipment.items?.map((item) => ({
                                    sku: item.sku,
                                    quantity: item.quantity,
                                    unitWeightKg: item.unitWeightKg,
                                })),
                            },
                        },
                        tx,
                    );

                    const pickupAddress = {
                        sourceId: source.id,
                        sourceName: source.name,
                        sourceType: source.type,
                        country: source.location.country,
                        city: source.location.city,
                        street: source.location.street,
                        houseNumber: source.location.houseNumber,
                        latitude: source.location.latitude,
                        longitude: source.location.longitude,
                    };

                    const dropoffAddress = {
                        country: checkout.destination.country,
                        city: checkout.destination.city,
                        street: checkout.destination.street,
                        houseNumber: checkout.destination.houseNumber,
                        postalCode: checkout.destination.postalCode,
                    };

                    await this.shipmentsRepository.createShipmentStops(
                        tenant,
                        shipmentId,
                        [pickupAddress],
                        dropoffAddress,
                        tx,
                    );

                    createdShipments.push({
                        shipmentId,
                        shipmentGroupId: shipmentGroup.groupId,
                    });
                }
            }

            return createdShipments;
        };

        return externalTx
            ? persistShipments(externalTx)
            : this.db.transaction(persistShipments);
    }
}