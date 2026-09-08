import { CommonModule } from '@angular/common';
import {
  ChangeDetectorRef,
  Component,
  OnInit,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

import {
  AdminApiService,
  ShipmentHistoryFilters,
  ShipmentHistoryItem,
  ShipmentHistorySortBy,
  ShipmentHistorySortDirection,
} from '../../services/admin-api';

@Component({
  selector: 'app-shipments-history',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
  ],
  templateUrl: './shipments-history.html',
  styleUrl: './shipments-history.scss',
})
export class ShipmentsHistory implements OnInit {
  items: ShipmentHistoryItem[] = [];

  isLoading = true;
  errorMessage = '';

  expandedCheckoutId: string | null = null;

  search = '';
  resultStatus = '';
  carrierName = '';
  fromDate = '';
  toDate = '';

  sortBy: ShipmentHistorySortBy =
    'completedAt';

  sortDirection: ShipmentHistorySortDirection =
    'desc';

  constructor(
    private readonly adminApiService:
      AdminApiService,

    private readonly cdr:
      ChangeDetectorRef,
  ) { }

  ngOnInit(): void {
    this.loadHistory();
  }

  loadHistory(): void {
    this.isLoading = true;
    this.errorMessage = '';
    this.expandedCheckoutId = null;

    const filters: ShipmentHistoryFilters = {
      search:
        this.search.trim() || undefined,

      resultStatus:
        this.resultStatus === 'delivered' ||
          this.resultStatus === 'failed'
          ? this.resultStatus
          : undefined,

      carrierName:
        this.carrierName.trim() || undefined,

      fromDate:
        this.fromDate || undefined,

      toDate:
        this.toDate || undefined,

      sortBy:
        this.sortBy,

      sortDirection:
        this.sortDirection,
    };

    this.adminApiService
      .getShipmentHistory(filters)
      .subscribe({
        next: (response) => {
          this.items = response.items;
          this.isLoading = false;
          this.cdr.detectChanges();
        },

        error: (error) => {
          console.error(
            'Failed to load shipment history',
            error,
          );

          this.errorMessage =
            'לא הצלחנו לטעון את היסטוריית המשלוחים.';

          this.isLoading = false;
          this.cdr.detectChanges();
        },
      });
  }

  applyFilters(): void {
    this.loadHistory();
  }

  resetFilters(): void {
    this.search = '';
    this.resultStatus = '';
    this.carrierName = '';
    this.fromDate = '';
    this.toDate = '';
    this.sortBy = 'completedAt';
    this.sortDirection = 'desc';

    this.loadHistory();
  }

  onSearchEnter(): void {
    this.applyFilters();
  }

  toggleDetails(
    checkoutId: string,
  ): void {
    this.expandedCheckoutId =
      this.expandedCheckoutId === checkoutId
        ? null
        : checkoutId;
  }

  get deliveredCount(): number {
    return this.items.filter(
      (item) =>
        item.resultStatus === 'delivered',
    ).length;
  }

  get failedCount(): number {
    return this.items.filter(
      (item) =>
        item.resultStatus === 'failed',
    ).length;
  }

  get totalShippingPrice(): number {
    return this.items.reduce(
      (sum, item) =>
        sum + item.totalShippingPrice,
      0,
    );
  }

  getDestinationLabel(
    item: ShipmentHistoryItem,
  ): string {
    const destination =
      item.destination;

    return [
      destination.city,
      destination.street,
      destination.houseNumber,
    ]
      .filter(Boolean)
      .join(', ');
  }

  getCarrierNames(
    item: ShipmentHistoryItem,
  ): string {
    const names = item.shipments
      .map(
        (shipment) =>
          shipment.carrierName,
      )
      .filter(
        (
          name,
        ): name is string =>
          Boolean(name),
      );

    const uniqueNames = [
      ...new Set(names),
    ];

    if (uniqueNames.length === 0) {
      return 'לא נוצר משלוח';
    }

    return uniqueNames.join(' + ');
  }

  getFailureStageLabel(
    stage: string | null,
  ): string {
    switch (stage) {
      case 'carrier_selection':
        return 'בחירת חברת שילוח';

      case 'shipment_delivery':
        return 'מסירת המשלוח';

      case 'quotes':
      case 'awaiting_quotes':
        return 'קבלת הצעות מחיר';

      case 'grouping':
        return 'קיבוץ המשלוחים';

      case 'sourcing':
        return 'איתור מקורות אספקה';
      case 'shipment_creation':
        return 'יצירת המשלוחים';
      case 'failed':
        return 'כשל בתהליך';
      default:
        return stage ?? 'לא ידוע';
    }
  }

  getShipmentStatusLabel(
    status: string,
  ): string {
    switch (status) {
      case 'created':
        return 'נוצר';

      case 'picked_up':
        return 'נאסף';

      case 'in_transit':
        return 'בדרך';

      case 'delivered':
        return 'נמסר';

      case 'failed':
        return 'נכשל';

      default:
        return status;
    }
  }

  getAddressLabel(
    address:
      | Record<string, unknown>
      | null,
  ): string {
    if (!address) {
      return 'לא הוגדרה כתובת';
    }

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

  trackItem(
    _index: number,
    item: ShipmentHistoryItem,
  ): string {
    return item.checkoutId;
  }
}