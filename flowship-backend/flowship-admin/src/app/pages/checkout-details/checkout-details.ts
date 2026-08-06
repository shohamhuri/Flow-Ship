import { CommonModule } from '@angular/common';
import {
  ChangeDetectorRef,
  Component,
  OnInit,
} from '@angular/core'; import { ActivatedRoute, Router } from '@angular/router';

import {
  AdminApiService,
  CheckoutDetails,
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

      default:
        return reason;
    }
  }

}