import { Injectable } from '@nestjs/common';

import { GroupingResult } from '../grouping/interfaces/grouping-result.interface';
import { GroupingService } from '../grouping/grouping.service';
import { ShipmentGroupsRepository } from '../grouping/shipment-groups.repository';
import { ShipmentPlanEvaluatorService } from '../planning/shipment-plan-evaluator.service';
import {
    ShipmentPlanCandidate,
    ShipmentPlanGenerationResult,
} from '../planning/interfaces/shipment-plan.interface';
import { ShipmentPlanBuilderService } from '../planning/shipment-plan-builder.service';
import { ShipmentPlanGeneratorService } from '../planning/shipment-plan-generator.service';

import { ItemSourcingResult } from '../sourcing/interfaces/source-ranking.interface';
import { SourcingService } from '../sourcing/sourcing.service';

import { CurrentTenant } from '../tenants/tenants.service';

import { CheckoutProcessingRepository } from './checkout-processing.repository';
import {
    CheckoutDetails,
    CheckoutListRow,
    CheckoutRepository,
} from './checkout.repository'; import { CreateCheckoutDto } from './dto/create-checkout.dto';
import { Checkout } from './interfaces/checkout.interface';
import { ShipmentPlanQuoteService } from '../planning/shipment-plan-quote.service';
import { QuotedShipmentPlan } from '../planning/interfaces/shipment-plan-quote.interface';
import { ShipmentPlanDeliveryOptionsService } from '../planning/shipment-plan-delivery-options.service';

import { ShipmentPlanDeliveryOptionsResult } from '../planning/interfaces/shipment-plan-delivery-option.interface';
import {
    DecisionService,
    ScoredShipmentPlanDeliveryOption,
    WeightedDecisionPriorityCard,
} from '../decision/decision.service';
import {
    GroupingRulesService,
} from '../grouping/grouping-rules.service';
import { ShipmentCreationService } from '../shipments/shipment-creation.service';

export interface CheckoutProcessingResult {
    checkout: Checkout;

    sourcing: ItemSourcingResult[];

    /**
     * הקיבוץ הישן, המבוסס על selectedSource של ה-Sourcing.
     * נשאר זמנית לצורך תאימות לזרימה הקיימת.
     */
    grouping: GroupingResult;

    planning: {
        generation: ShipmentPlanGenerationResult;

        allPlans: ShipmentPlanCandidate[];

        validPlans: ShipmentPlanCandidate[];

        rejectedPlans: ShipmentPlanCandidate[];
        selectedPlans: ShipmentPlanCandidate[];
        quotedPlans: QuotedShipmentPlan[];
        deliveryOptions: ShipmentPlanDeliveryOptionsResult[];
        decision: {
            priorityCards:
            WeightedDecisionPriorityCard[];

            evaluatedOptionsCount: number;

            winner:
            ScoredShipmentPlanDeliveryOption | null;
        };
    }
}

@Injectable()
export class CheckoutService {
    constructor(
        private readonly sourcingService: SourcingService,
        private readonly groupingService: GroupingService,

        private readonly shipmentPlanGeneratorService:
            ShipmentPlanGeneratorService,

        private readonly shipmentPlanBuilderService:
            ShipmentPlanBuilderService,

        private readonly checkoutRepository:
            CheckoutRepository,

        private readonly checkoutProcessingRepository:
            CheckoutProcessingRepository,

        private readonly shipmentGroupsRepository:
            ShipmentGroupsRepository,
        private readonly shipmentPlanEvaluatorService:
            ShipmentPlanEvaluatorService,
        private readonly shipmentPlanQuoteService:
            ShipmentPlanQuoteService,
        private readonly shipmentPlanDeliveryOptionsService:
            ShipmentPlanDeliveryOptionsService,
        private readonly decisionService:
            DecisionService,
        private readonly groupingRulesService:
            GroupingRulesService,
        private readonly shipmentCreationService: ShipmentCreationService,

    ) { }
    async getCheckouts(
        tenant: CurrentTenant,
    ): Promise<CheckoutListRow[]> {
        return this.checkoutRepository.getCheckouts(tenant);
    }
    async getCheckoutById(
        tenant: CurrentTenant,
        checkoutId: string,
    ): Promise<CheckoutDetails | null> {
        return this.checkoutRepository.getCheckoutById(
            tenant,
            checkoutId,
        );
    }

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
            /*
             * שלב 1:
             * מציאת כל מקורות האספקה האפשריים לכל פריט.
             */
            const sourcing =
                await this.sourcingService.findSourcesForCheckout(
                    checkout,
                    tenant,
                );
            const activeGroupingStrategies =
                await this.groupingRulesService
                    .getActiveStrategies(tenant);

            console.dir(
                {
                    activeGroupingStrategies,
                },
                {
                    depth: null,
                },
            );
            await this.checkoutProcessingRepository
                .markSourcingCompleted(
                    tenant,
                    checkoutId,
                );

            /*
             * שלב 2:
             * יצירת כל הקצאות המקורות האפשריות,
             * בכפוף להגנות שהוגדרו ב-Generator.
             */
            const generation =
                this.shipmentPlanGeneratorService.generatePlans(
                    sourcing,
                );

            /*
             * שלב 3:
             * הפיכת כל הקצאת מקורות לתוכנית המכילה
             * Shipment Groups אמיתיים בזיכרון.
             */
            const allPlans =
                this.shipmentPlanBuilderService.buildPlans(
                    checkout,
                    generation.plans,
                    activeGroupingStrategies,
                );
            const validPlans = allPlans.filter(
                (plan) => plan.status === 'grouped',
            );
            const selectedPlans =
                this.shipmentPlanEvaluatorService
                    .evaluateAndSelect(validPlans);
            const quotedPlans =
                await this.shipmentPlanQuoteService
                    .getQuotesForPlans(
                        selectedPlans,
                        checkout.destination.city,
                        tenant,
                    );
            const deliveryOptions =
                this.shipmentPlanDeliveryOptionsService
                    .generateForPlans(quotedPlans);
            const priorityCards =
                await this.decisionService
                    .getActivePriorityCards(tenant);

            const allDeliveryOptions =
                deliveryOptions.flatMap(
                    (result) =>
                        result.deliveryOptions,
                );

            const selectedDeliveryOption =
                this.decisionService
                    .selectBestDeliveryOption(
                        allDeliveryOptions,
                        priorityCards,
                    );
            if (!selectedDeliveryOption) {
                throw new Error(
                    'No delivery option could be selected',
                );
            }

            const winningPlan =
                validPlans.find(
                    (plan) =>
                        plan.id ===
                        selectedDeliveryOption.planId,
                );

            if (!winningPlan) {
                throw new Error(
                    `Winning shipment plan not found: ${selectedDeliveryOption.planId}`,
                );
            }

            if (!winningPlan.grouping) {
                throw new Error(
                    `Winning shipment plan has no grouping result: ${winningPlan.id}`,
                );
            }

            const grouping = winningPlan.grouping;

            await this.decisionService.saveShipmentDecision(
                tenant,
                checkoutId,
                checkout.orderId,
                selectedDeliveryOption,
                priorityCards,
                allDeliveryOptions.length,
            );

            console.dir(
                {
                    deliveryOptions:
                        deliveryOptions.map((result) => ({
                            planId:
                                result.quotedPlan.plan.id,

                            statistics:
                                result.statistics,

                            options:
                                result.deliveryOptions.map(
                                    (option) => ({
                                        id: option.id,

                                        totalShippingPrice:
                                            option.metrics
                                                .totalShippingPrice,

                                        estimatedDeliveryDays:
                                            option.metrics
                                                .estimatedDeliveryDays,

                                        averageProviderPriority:
                                            option.metrics
                                                .averageProviderPriority,

                                        shipmentCount:
                                            option.metrics
                                                .shipmentCount,

                                        selectedQuotes:
                                            option.selectedGroupQuotes.map(
                                                (selected) => ({
                                                    groupId:
                                                        selected.groupId,

                                                    carrierName:
                                                        selected.quote
                                                            .carrierName,

                                                    serviceName:
                                                        selected.quote
                                                            .serviceName,

                                                    price:
                                                        selected.quote
                                                            .price,

                                                    estimatedDays:
                                                        selected.quote
                                                            .estimatedDays,
                                                }),
                                            ),
                                    }),
                                ),
                        })),
                },
                {
                    depth: null,
                },
            );
            console.dir(
                {
                    quotedPlans: quotedPlans.map(
                        (quotedPlan) => ({
                            planId: quotedPlan.plan.id,
                            status: quotedPlan.status,

                            quoteMetrics:
                                quotedPlan.quoteMetrics,

                            groups:
                                quotedPlan.groupQuotes.map(
                                    (groupQuote) => ({
                                        groupId:
                                            groupQuote.groupId,

                                        pickupCities:
                                            groupQuote.pickupCities,

                                        destinationCity:
                                            groupQuote.destinationCity,

                                        weightKg:
                                            groupQuote.weightKg,

                                        quotesCount:
                                            groupQuote.quotes.length,

                                        failedProvidersCount:
                                            groupQuote
                                                .failedProviders
                                                .length,
                                    }),
                                ),
                        }),
                    ),
                },
                {
                    depth: null,
                },
            );
            const rejectedPlans = allPlans.filter(
                (plan) => plan.status === 'rejected',
            );

            /*
             * אם לא הצלחנו ליצור אפילו תוכנית חוקית אחת,
             * אין אפשרות להמשיך לתהליך המשלוחים.
             */
            if (validPlans.length === 0) {
                const unresolvedSummary =
                    generation.unresolvedItems
                        .map(
                            (item) =>
                                `${item.sku} (itemIndex: ${item.itemIndex}, quantity: ${item.requestedQuantity})`,
                        )
                        .join(' | ');

                throw new Error(
                    unresolvedSummary
                        ? `No valid shipment plans could be generated. Unresolved items: ${unresolvedSummary}`
                        : 'No valid shipment plans could be generated',
                );
            }
            console.dir(
                {
                    generatedPlansCount:
                        generation.statistics.generatedPlansCount,

                    validPlansCount:
                        validPlans.length,

                    selectedPlansCount:
                        selectedPlans.length,

                    selectedPlans:
                        selectedPlans.map((plan) => ({
                            id: plan.id,

                            shipmentCount:
                                plan.metrics?.shipmentCount,

                            averageSourceScore:
                                plan.metrics?.averageSourceScore,

                            assignments:
                                plan.assignments.map(
                                    (assignment) => ({
                                        sku: assignment.sku,
                                        sourceId:
                                            assignment
                                                .selectedSource
                                                .source.id,
                                    }),
                                ),
                        })),
                },
                {
                    depth: null,
                },
            );
            /*
             * לוג זמני לצורך בדיקת מנגנון התוכניות.
             * לאחר שנראה שהכול תקין, אפשר להסיר אותו.
             */
            console.dir(
                {
                    checkoutId,
                    orderId: checkout.orderId,

                    generationStatistics:
                        generation.statistics,

                    unresolvedItems:
                        generation.unresolvedItems,

                    validPlansCount:
                        validPlans.length,

                    rejectedPlansCount:
                        rejectedPlans.length,

                    plans: validPlans.map((plan) => ({
                        id: plan.id,

                        shipmentCount:
                            plan.grouping?.totalGroups ?? 0,

                        assignments:
                            plan.assignments.map(
                                (assignment) => ({
                                    itemIndex:
                                        assignment.itemIndex,

                                    sku:
                                        assignment.sku,

                                    sourceId:
                                        assignment
                                            .selectedSource
                                            .source.id,

                                    sourceName:
                                        assignment
                                            .selectedSource
                                            .source.name,

                                    sourceType:
                                        assignment
                                            .selectedSource
                                            .source.type,

                                    sourceScore:
                                        assignment
                                            .selectedSource
                                            .totalScore,
                                }),
                            ),

                        groups:
                            plan.grouping
                                ?.shipmentGroups.map(
                                    (group) => ({
                                        groupId:
                                            group.groupId,

                                        sources:
                                            group.sources.map(
                                                (source) => ({
                                                    sourceId:
                                                        source.id,

                                                    sourceName:
                                                        source.name,

                                                    sourceType:
                                                        source.type,
                                                }),
                                            ),

                                        handlingGroup:
                                            group.handlingGroup,

                                        totalItems:
                                            group.totalItems,

                                        totalWeight:
                                            group.totalWeight,

                                        items:
                                            group.items.map(
                                                (item) => ({
                                                    sku:
                                                        item.sku,

                                                    quantity:
                                                        item.quantity,

                                                    sourceId:
                                                        item.sourceId,

                                                    supplierId:
                                                        item.supplierId,
                                                }),
                                            ),
                                    }),
                                ) ?? [],
                    })),
                },
                {
                    depth: null,
                },
            );



            /*
   * שמירת הקבוצות שנבחרו כחלק מהתוכנית הזוכה.
   */
            /*
           * שמירת סיבות הפיצול הכלליות של התוכנית הזוכה.
           */
            await this.checkoutRepository
                .updateGroupingSplitReasons(
                    tenant,
                    checkoutId,
                    grouping.splitReasons,
                );
            await this.shipmentGroupsRepository
                .saveGroupingResult(
                    tenant,
                    checkoutId,
                    grouping,
                    checkoutItemIdsBySku,
                );

            /*
             * רק לאחר שהקבוצות נשמרו במסד,
             * יוצרים Shipment אחד לכל Shipment Group.
             */
            const createdShipments =
                await this.shipmentCreationService.createShipments(
                    tenant,
                    checkoutId,
                    checkout,
                    winningPlan,
                    selectedDeliveryOption,
                );

            console.log(
                `Created ${createdShipments.length} shipments for checkout ${checkoutId}`,
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

                planning: {
                    generation,
                    allPlans,
                    validPlans,
                    rejectedPlans,
                    selectedPlans,
                    quotedPlans,
                    deliveryOptions,
                    decision: {
                        priorityCards,
                        evaluatedOptionsCount:
                            allDeliveryOptions.length,
                        winner:
                            selectedDeliveryOption,
                    },
                },
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
        const totalItems =
            createCheckoutDto.items.reduce(
                (sum, item) =>
                    sum + item.quantity,
                0,
            );

        const totalPrice =
            createCheckoutDto.items.reduce(
                (sum, item) =>
                    sum +
                    item.price * item.quantity,
                0,
            );

        return {
            orderId:
                createCheckoutDto.orderId,

            storeId:
                createCheckoutDto.storeId,

            destination: {
                country:
                    createCheckoutDto.destination.country,

                city:
                    createCheckoutDto.destination.city,

                street:
                    createCheckoutDto.destination.street,

                houseNumber:
                    createCheckoutDto.destination.houseNumber,

                postalCode:
                    createCheckoutDto.destination.postalCode,
            },

            items:
                createCheckoutDto.items.map(
                    (item) => ({
                        sku: item.sku,
                        name: item.name,
                        quantity: item.quantity,
                        unitWeight: item.weight,
                        supplierId: item.supplierId,
                        category: item.category,
                        unitPrice: item.price,
                    }),
                ),

            totalItems,
            totalPrice,
            createdAt: new Date(),
        };
    }
}