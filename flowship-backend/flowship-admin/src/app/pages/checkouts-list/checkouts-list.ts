import { CommonModule } from '@angular/common';
import {
  ChangeDetectorRef,
  Component,
  OnInit,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import {
  AdminApiService,
  CheckoutListItem,
} from '../../services/admin-api';

type CheckoutSortField =
  | 'createdAt'
  | 'totalPrice';

type SortDirection =
  | 'asc'
  | 'desc';

@Component({
  selector: 'app-checkouts-list',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
  ],
  templateUrl: './checkouts-list.html',
  styleUrl: './checkouts-list.scss',
})
export class CheckoutsList implements OnInit {
  checkouts: CheckoutListItem[] = [];

  isLoading = true;
  errorMessage = '';

  searchTerm = '';
  selectedStatus = '';
  selectedPlatform = '';
  fromDate = '';
  toDate = '';

  sortField: CheckoutSortField = 'createdAt';
  sortDirection: SortDirection = 'desc';

  constructor(
    private readonly adminApiService: AdminApiService,
    private readonly router: Router,
    private readonly cdr: ChangeDetectorRef,
  ) { }

  ngOnInit(): void {
    this.loadCheckouts();
  }

  loadCheckouts(): void {
    this.isLoading = true;
    this.errorMessage = '';

    this.adminApiService.getCheckouts().subscribe({
      next: (checkouts) => {
        this.checkouts = checkouts;
        this.isLoading = false;

        this.cdr.detectChanges();
      },
      error: (error) => {
        console.error(
          'Failed to load checkouts',
          error,
        );

        this.errorMessage =
          'לא הצלחנו לטעון את תהליכי ה־Checkout.';

        this.isLoading = false;

        this.cdr.detectChanges();
      },
    });
  }

  openCheckout(checkoutId: string): void {
    void this.router.navigate([
      '/admin/checkouts',
      checkoutId,
    ]);
  }

  get filteredCheckouts(): CheckoutListItem[] {
    const normalizedSearch =
      this.searchTerm.trim().toLowerCase();

    const filtered = this.checkouts.filter(
      (checkout) => {
        const matchesSearch =
          !normalizedSearch ||
          checkout.orderId
            ?.toLowerCase()
            .includes(normalizedSearch) ||
          checkout.id
            .toLowerCase()
            .includes(normalizedSearch) ||
          checkout.platform
            ?.toLowerCase()
            .includes(normalizedSearch);

        const matchesStatus =
          !this.selectedStatus ||
          checkout.status === this.selectedStatus;

        const matchesPlatform =
          !this.selectedPlatform ||
          checkout.platform ===
          this.selectedPlatform;

        const createdAt = new Date(
          checkout.createdAt,
        );

        const matchesFromDate =
          !this.fromDate ||
          createdAt >=
          this.getStartOfDay(this.fromDate);

        const matchesToDate =
          !this.toDate ||
          createdAt <=
          this.getEndOfDay(this.toDate);

        return (
          matchesSearch &&
          matchesStatus &&
          matchesPlatform &&
          matchesFromDate &&
          matchesToDate
        );
      },
    );

    return filtered.sort((first, second) => {
      const comparison =
        this.sortField === 'totalPrice'
          ? this.compareNumbers(
            first.totalPrice,
            second.totalPrice,
          )
          : this.compareDates(
            first.createdAt,
            second.createdAt,
          );

      return this.sortDirection === 'asc'
        ? comparison
        : comparison * -1;
    });
  }

  get platforms(): string[] {
    return [
      ...new Set(
        this.checkouts
          .map((checkout) => checkout.platform)
          .filter(
            (platform): platform is string =>
              Boolean(platform),
          ),
      ),
    ].sort((first, second) =>
      first.localeCompare(second),
    );
  }

  resetFilters(): void {
    this.searchTerm = '';
    this.selectedStatus = '';
    this.selectedPlatform = '';
    this.fromDate = '';
    this.toDate = '';

    this.sortField = 'createdAt';
    this.sortDirection = 'desc';
  }

  setSort(
    field: CheckoutSortField,
  ): void {
    if (this.sortField === field) {
      this.sortDirection =
        this.sortDirection === 'asc'
          ? 'desc'
          : 'asc';

      return;
    }

    this.sortField = field;
    this.sortDirection =
      field === 'createdAt'
        ? 'desc'
        : 'asc';
  }

  getSortIcon(
    field: CheckoutSortField,
  ): string {
    if (this.sortField !== field) {
      return '↕';
    }

    return this.sortDirection === 'asc'
      ? '↑'
      : '↓';
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

      default:
        return status;
    }
  }

  getDestinationLabel(
    destination:
      | CheckoutListItem['destination']
      | null
      | undefined,
  ): string {
    if (!destination) {
      return 'לא הוגדר יעד';
    }

    const addressParts = [
      destination.city,
      destination.street,
      destination.houseNumber,
    ].filter(Boolean);

    return (
      addressParts.join(', ') ||
      'לא הוגדר יעד'
    );
  }

  get groupedCount(): number {
    return this.checkouts.filter(
      (checkout) =>
        checkout.status === 'grouped',
    ).length;
  }

  get failedCount(): number {
    return this.checkouts.filter(
      (checkout) =>
        checkout.status === 'failed',
    ).length;
  }

  trackCheckout(
    _index: number,
    checkout: CheckoutListItem,
  ): string {
    return checkout.id;
  }

  private compareNumbers(
    first: number | null | undefined,
    second: number | null | undefined,
  ): number {
    return (
      Number(first ?? 0) -
      Number(second ?? 0)
    );
  }

  private compareDates(
    first: string,
    second: string,
  ): number {
    return (
      new Date(first).getTime() -
      new Date(second).getTime()
    );
  }

  private getStartOfDay(
    dateValue: string,
  ): Date {
    return new Date(`${dateValue}T00:00:00`);
  }

  private getEndOfDay(
    dateValue: string,
  ): Date {
    return new Date(`${dateValue}T23:59:59.999`);
  }
  getPlatformLabel(platform: string): string {
    switch (platform) {
      case 'manual':
        return 'הזנה ידנית';

      case 'api':
        return 'API';

      case 'shopify':
        return 'Shopify';

      case 'woocommerce':
        return 'WooCommerce';

      default:
        return platform;
    }
  }
}