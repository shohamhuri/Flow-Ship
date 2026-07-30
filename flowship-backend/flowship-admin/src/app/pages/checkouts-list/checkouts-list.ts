import { CommonModule } from '@angular/common';
import {
  ChangeDetectorRef,
  Component,
  OnInit,
} from '@angular/core'; import { Router } from '@angular/router';

import {
  AdminApiService,
  CheckoutListItem,
} from '../../services/admin-api';

@Component({
  selector: 'app-checkouts-list',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './checkouts-list.html',
  styleUrl: './checkouts-list.scss',
})
export class CheckoutsList implements OnInit {
  checkouts: CheckoutListItem[] = [];

  isLoading = true;
  errorMessage = '';
  constructor(
    private readonly adminApiService: AdminApiService,
    private readonly router: Router,
    private readonly cdr: ChangeDetectorRef,
  ) { }

  ngOnInit(): void {
    this.loadCheckouts();
  }

  loadCheckouts(): void {
    console.log('Starting checkout request');

    this.isLoading = true;
    this.errorMessage = '';

    this.adminApiService.getCheckouts().subscribe({
      next: (checkouts) => {
        console.log('Checkouts received:', checkouts);

        this.checkouts = checkouts;
        this.isLoading = false;

        this.cdr.detectChanges();
      },
      error: (error) => {
        console.error('Failed to load checkouts', error);

        this.errorMessage =
          'לא הצלחנו לטעון את תהליכי ה־Checkout.';

        this.isLoading = false;

        this.cdr.detectChanges();
      },
      complete: () => {
        console.log('Checkout request completed');
      },
    });
  }
  openCheckout(checkoutId: string): void {
    void this.router.navigate([
      '/admin/checkouts',
      checkoutId,
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

      default:
        return status;
    }
  }

  getDestinationLabel(
    destination: CheckoutListItem['destination'],
  ): string {
    if (!destination) {
      return 'לא הוגדר יעד';
    }

    const addressParts = [
      destination.city,
      destination.street,
      destination.houseNumber,
    ].filter(Boolean);

    return addressParts.join(', ');
  }
  get groupedCount(): number {
    return this.checkouts.filter(
      (checkout) => checkout.status === 'grouped',
    ).length;
  }

  get failedCount(): number {
    return this.checkouts.filter(
      (checkout) => checkout.status === 'failed',
    ).length;
  }
}