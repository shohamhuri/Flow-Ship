import { CommonModule } from '@angular/common';
import {
  ChangeDetectorRef,
  Component,
  OnInit,
} from '@angular/core'; import { ActivatedRoute, Router } from '@angular/router';

import {
  AdminApiService,
  CapacityPlanRejectionReason,
  CheckoutCapacityPlanningTrace,
  CheckoutDetails,
  CheckoutPlanningDeliveryOptionsResult,
  CheckoutPlanningQuotedPlan,
  CheckoutShipmentStop,
} from '../../services/admin-api';

@Component({
  selector: 'app-checkout-details',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './checkout-details.html',
  styleUrl: './checkout-details.scss',
})
export class CheckoutDetailsComponent implements OnInit {
  checkout: CheckoutDetails | null = null;

  isLoading = true;
  errorMessage = '';
  expandedDecisionOptionId: string | null = null;
  expandedPlanningPlanIds: string[] = [];

  togglePlanningPlan(planId: string): void {
    if (this.expandedPlanningPlanIds.includes(planId)) {
      this.expandedPlanningPlanIds =
        this.expandedPlanningPlanIds.filter(id => id !== planId);
    } else {
      this.expandedPlanningPlanIds = [
        ...this.expandedPlanningPlanIds,
        planId
      ];
    }
  }
  expandedPlanningSections = new Set<string>();

  togglePlanningSection(
    planId: string,
    section: string
  ): void {
    const key = `${planId}:${section}`;

    const next = new Set(this.expandedPlanningSections);

    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }

    this.expandedPlanningSections = next;
  }

  isPlanningSectionExpanded(
    planId: string,
    section: string
  ): boolean {
    return this.expandedPlanningSections.has(
      `${planId}:${section}`
    );
  }
  isPlanningPlanExpanded(planId: string): boolean {
    return this.expandedPlanningPlanIds.includes(planId);
  }
  toggleDecisionOption(optionId: string): void {
    this.expandedDecisionOptionId =
      this.expandedDecisionOptionId === optionId
        ? null
        : optionId;
  }
  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly adminApiService: AdminApiService,
    private readonly cdr: ChangeDetectorRef,
  ) { }

  ngOnInit(): void {
    const checkoutId =
      this.route.snapshot.paramMap.get('checkoutId');

    console.log(
      'Checkout ID from route:',
      checkoutId,
    );

    if (!checkoutId) {
      this.errorMessage = 'מזהה Checkout חסר.';
      this.isLoading = false;
      return;
    }

    this.loadCheckout(checkoutId);
  }

  loadCheckout(checkoutId: string): void {
    console.log(
      'Loading checkout details:',
      checkoutId,
    );

    this.isLoading = true;
    this.errorMessage = '';

    this.adminApiService
      .getCheckoutById(checkoutId)
      .subscribe({
        next: (checkout) => {
          console.log(
            'Checkout details received:',
            checkout,
          );

          this.checkout = checkout;
          this.isLoading = false;

          this.cdr.detectChanges();
        },

        error: (error) => {
          console.error(
            'Failed to load checkout details',
            error,
          );

          this.errorMessage =
            'לא הצלחנו לטעון את פרטי ה־Checkout.';

          this.isLoading = false;

          this.cdr.detectChanges();
        },
      });
  }
  hasShipmentForGroup(groupId: string): boolean {
    return (
      this.checkout?.shipments?.some(
        (shipment) =>
          shipment.shipmentGroupId === groupId,
      ) ?? false
    );
  }

  getShipmentGroupStatusLabel(group: {
    id: string;
    status: string;
  }): string {
    if (group.status === 'failed') {
      return 'נכשל';
    }

    if (this.hasShipmentForGroup(group.id)) {
      return 'נוצר משלוח';
    }

    switch (group.status) {
      case 'ready':
        return 'ממתין ליצירת משלוח';

      case 'processing':
        return 'בעיבוד';

      case 'planned':
        return 'מתוכנן';

      default:
        return group.status;
    }
  }

  getShipmentGroupStatusClass(group: {
    id: string;
    status: string;
  }): string {
    if (group.status === 'failed') {
      return 'group-status-failed';
    }

    if (this.hasShipmentForGroup(group.id)) {
      return 'group-status-created';
    }

    if (group.status === 'ready') {
      return 'group-status-waiting';
    }

    if (group.status === 'processing') {
      return 'group-status-processing';
    }

    return 'group-status-planned';
  }
  goBack(): void {
    void this.router.navigate([
      '/admin/checkouts',
    ]);
  }

  getStatusLabel(status: string): string {
    switch (status) {
      case 'grouped':
        return 'הושלם';

      case 'partially_grouped':
        return 'הושלם חלקית';

      case 'processing':
        return 'בתהליך';

      case 'failed':
        return 'נכשל';

      case 'created':
        return 'נוצר';

      case 'planned':
        return 'מתוכנן';

      default:
        return status;
    }
  }

  getAddressLabel(
    address: Record<string, unknown>,
  ): string {
    const sourceName =
      typeof address['sourceName'] === 'string'
        ? address['sourceName']
        : null;

    const city =
      typeof address['city'] === 'string'
        ? address['city']
        : null;

    const street =
      typeof address['street'] === 'string'
        ? address['street']
        : null;

    const houseNumber =
      typeof address['houseNumber'] === 'string'
        ? address['houseNumber']
        : null;

    return [
      sourceName,
      city,
      street,
      houseNumber,
    ]
      .filter(Boolean)
      .join(', ');
  }

  getStopLabel(
    stop: CheckoutShipmentStop,
  ): string {
    return stop.stopType === 'pickup'
      ? 'איסוף'
      : 'מסירה';
  }
  getSplitReasonLabel(
    reason: string,
  ): string {
    switch (reason) {
      case 'DIFFERENT_SUPPLY_SOURCES':
        return 'הפריטים סופקו ממקורות אספקה שונים';

      case 'DIFFERENT_SUPPLIERS':
        return 'הפריטים שייכים לספקים שונים';

      case 'INCOMPATIBLE_HANDLING_GROUPS':
        return 'הפריטים דורשים קבוצות טיפול שונות';

      case 'COMPATIBLE_HANDLING_GROUP':
        return 'הפריטים בעלי תנאי טיפול תואמים';

      case 'SAME_SUPPLY_SOURCE':
        return 'הפריטים מגיעים מאותו מקור אספקה';

      case 'SAME_SUPPLIER':
        return 'הפריטים שייכים לאותו ספק';

      case 'MAX_WEIGHT_EXCEEDED':
        return 'הקבוצה פוצלה בגלל חריגה מהמשקל המרבי';

      case 'MAX_ITEMS_EXCEEDED':
        return 'הקבוצה פוצלה בגלל חריגה ממספר הפריטים המרבי';

      default:
        return reason;
    }
  }
  getSourcingRejectionReasonLabel(
    reason: string,
  ): string {
    switch (reason) {
      case 'SOURCE_INACTIVE':
        return 'מקור האספקה אינו פעיל';

      case 'INSUFFICIENT_INVENTORY':
        return 'אין מספיק מלאי';

      default:
        return reason;
    }
  }
  getSourceTypeLabel(
    sourceType: string,
  ): string {
    switch (sourceType) {
      case 'warehouse':
        return 'מחסן';

      case 'branch':
        return 'סניף';

      default:
        return sourceType;
    }
  }
  getDecisionCriterionLabel(
    criterionKey: string
  ): string {
    switch (criterionKey) {
      case 'price':
        return 'מחיר';

      case 'speed':
        return 'מהירות אספקה';

      case 'provider_priority':
        return 'עדיפות חברת משלוחים';

      case 'shipment_count':
        return 'מספר משלוחים';

      default:
        return criterionKey;
    }
  }
  groupVehicleItems(
    items: Array<{
      sku: string;
      quantity: number;
      unitWeightKg: number;
    }>
  ): Array<{
    sku: string;
    quantity: number;
    unitWeightKg: number;
    totalWeightKg: number;
  }> {
    const grouped = new Map<
      string,
      {
        sku: string;
        quantity: number;
        unitWeightKg: number;
        totalWeightKg: number;
      }
    >();

    for (const item of items) {
      const existing = grouped.get(item.sku);

      if (existing) {
        existing.quantity += item.quantity;
        existing.totalWeightKg +=
          item.quantity * item.unitWeightKg;
      } else {
        grouped.set(item.sku, {
          sku: item.sku,
          quantity: item.quantity,
          unitWeightKg: item.unitWeightKg,
          totalWeightKg:
            item.quantity * item.unitWeightKg
        });
      }
    }

    return Array.from(grouped.values());
  }
  showAllDecisionOptions = false;

  toggleAllDecisionOptions(): void {
    this.showAllDecisionOptions =
      !this.showAllDecisionOptions;
  }
  getDecisionOptionProviders(
    option: NonNullable<
      NonNullable<typeof this.checkout>['decision']
    >['evaluatedOptions'][number]
  ): string {
    const providers = option.selectedGroupQuotes.map(
      group =>
        group.quote.providerCode ||
        group.quote.carrierName
    );

    return [...new Set(providers)].join(', ');
  }

  getDecisionOptionServices(
    option: NonNullable<
      NonNullable<typeof this.checkout>['decision']
    >['evaluatedOptions'][number]
  ): string {
    const services = option.selectedGroupQuotes.map(
      group => {
        if (group.vehiclePlan) {
          switch (group.quote.urgency) {
            case 'urgent':
              return 'תוכנית רכב דחופה';

            case 'express':
              return 'תוכנית רכב אקספרס';

            case 'standard':
              return 'תוכנית רכב רגילה';

            default:
              return 'תוכנית רכב';
          }
        }

        return group.quote.serviceName;
      }
    );

    const counts = new Map<string, number>();

    for (const service of services) {
      counts.set(
        service,
        (counts.get(service) ?? 0) + 1
      );
    }

    return Array.from(counts.entries())
      .map(([service, count]) =>
        count > 1
          ? `${service} × ${count}`
          : service
      )
      .join(', ');
  }

  isPlanningPlanValid(
    planId: string
  ): boolean {
    return (
      this.checkout?.decision?.planning?.validPlans
        ?.some((plan) => plan.id === planId) ??
      false
    );
  }

  isPlanningPlanRejected(
    planId: string
  ): boolean {
    return (
      this.checkout?.decision?.planning?.rejectedPlans
        ?.some((plan) => plan.id === planId) ??
      false
    );
  }
  isPlanningPlanSelected(
    planId: string
  ): boolean {
    return (
      this.checkout?.decision?.planning?.selectedPlans
        ?.some((plan) => plan.id === planId) ??
      false
    );
  }
  getPlanningQuotedPlan(
    planId: string
  ): CheckoutPlanningQuotedPlan | null {
    return (
      this.checkout?.decision?.planning?.quotedPlans
        ?.find((quotedPlan) => quotedPlan.plan.id === planId) ??
      null
    );
  }
  getPlanningDeliveryOptions(
    planId: string
  ): CheckoutPlanningDeliveryOptionsResult | null {
    return (
      this.checkout?.decision?.planning?.deliveryOptions
        ?.find(
          (result) =>
            result.quotedPlan.plan.id === planId
        ) ??
      null
    );
  }
  getPlanningEvaluatedOptionsCount(
    planId: string
  ): number {
    return (
      this.checkout?.decision?.evaluatedOptions
        ?.filter((option) => option.planId === planId)
        .length ?? 0
    );
  }

  isPlanningWinningPlan(
    planId: string
  ): boolean {
    return (
      this.checkout?.decision?.selectedPlanId === planId
    );
  }
  getPlanningRejectionReasonLabel(
    reason: string
  ): string {
    switch (reason) {
      case 'SOURCE_ASSIGNMENT_NOT_FOUND':
        return 'לא נמצא שיוך למקור אספקה';

      case 'NO_SUPPLY_SOURCE_SELECTED':
        return 'לא נבחר מקור אספקה';

      default:
        return reason;
    }
  }
  getPlanningConfirmationAttempt(
    planId: string
  ) {
    return (
      this.checkout?.decision?.planning
        ?.confirmationAttempts
        ?.find(
          (attempt) =>
            attempt.plan.id === planId
        ) ?? null
    );
  }
  getConfirmationFailureReasonLabel(
    reason: string
  ): string {
    switch (reason) {
      case 'SOURCE_NOT_AVAILABLE':
        return 'מקור האספקה אינו זמין';

      case 'INVALID_PREPARATION_TIME':
        return 'זמן ההכנה שהתקבל אינו תקין';

      case 'INSUFFICIENT_QUANTITY':
        return 'אין כמות מספקת במקור האספקה';

      case 'INVALID_SOURCE_RESPONSE':
        return 'התקבלה תגובה לא תקינה ממקור האספקה';

      case 'CONFIRMATION_PROVIDER_ERROR':
        return 'אירעה שגיאה בעת אימות מקור האספקה';

      default:
        return reason;
    }
  }
  getCapacityRejectionReasonLabel(
    reason: CapacityPlanRejectionReason | null
  ): string {
    switch (reason) {
      case 'INSUFFICIENT_TOTAL_CAPACITY':
        return 'אין קיבולת כוללת מספקת';

      case 'NON_MINIMAL_COMMERCIAL_PLAN':
        return 'תוכנית מסחרית כוללת רכב נוסף שאינו נדרש';

      case 'ITEMS_DO_NOT_FIT_VEHICLES':
        return 'לא ניתן לשבץ את כל הפריטים ברכבים';

      case 'UNUSED_VEHICLE':
        return 'התוכנית כוללת רכב שלא נעשה בו שימוש';

      default:
        return '';
    }
  }
  getVehicleTypeLabel(
    vehicleType:
      | 'scooter'
      | 'car'
      | 'commercial'
  ): string {
    switch (vehicleType) {
      case 'scooter':
        return 'קטנוע';

      case 'car':
        return 'רכב';

      case 'commercial':
        return 'רכב מסחרי';

      default:
        return vehicleType;
    }
  }
  getProvidersWithoutCapacity(
    traces: CheckoutCapacityPlanningTrace[] | undefined
  ): string {
    return (
      traces
        ?.filter(
          (trace) =>
            trace.capacities.length === 0
        )
        .map(
          (trace) =>
            trace.providerCode
        )
        .join(', ') ?? ''
    );
  }
  getEvaluatedDecisionOption(
    optionId: string
  ) {
    return (
      this.checkout?.decision
        ?.evaluatedOptions
        ?.find(
          (option) =>
            option.id === optionId
        ) ?? null
    );
  }
  getDecisionDonutStyle(): string {
    const cards =
      this.checkout?.decision?.winner
        ?.scoreBreakdown?.cardScores ?? [];

    if (cards.length === 0) {
      return 'conic-gradient(#e5e7eb 0% 100%)';
    }

    const totalWeight = cards.reduce(
      (sum, card) => sum + card.weight,
      0
    );

    if (totalWeight <= 0) {
      return 'conic-gradient(#e5e7eb 0% 100%)';
    }

    const colors = [
      '#2563eb',
      '#10b981',
      '#f59e0b',
      '#8b5cf6',
      '#06b6d4',
      '#ec4899'
    ];

    let currentPercent = 0;

    const segments = cards.map(
      (card, index) => {
        const percent =
          (card.weight / totalWeight) * 100;

        const start = currentPercent;
        const end =
          currentPercent + percent;

        currentPercent = end;

        const color = card.applied
          ? colors[index % colors.length]
          : '#d1d5db';

        return `${color} ${start}% ${end}%`;
      }
    );

    return `conic-gradient(${segments.join(', ')})`;
  }
  getDecisionCardColor(
    index: number,
    applied: boolean
  ): string {
    if (!applied) {
      return '#d1d5db';
    }

    const colors = [
      '#2563eb',
      '#10b981',
      '#f59e0b',
      '#8b5cf6',
      '#06b6d4',
      '#ec4899'
    ];

    return colors[index % colors.length];
  }
}