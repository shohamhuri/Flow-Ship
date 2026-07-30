import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

export interface CheckoutListItem {
  id: string;
  orderId: string;
  storeId: string | null;
  platform: string;
  status: string;
  totalItems: number;
  totalPrice: number;
  destination: {
    country?: string;
    city?: string;
    street?: string;
    houseNumber?: string;
    postalCode?: string;
  } | null;
  createdAt: string;
  updatedAt: string | null;
}

@Injectable({
  providedIn: 'root',
})
export class CheckoutService {
  private readonly apiUrl = 'http://localhost:3000/checkout';

  private readonly apiKey = 'שימי-כאן-את-ה-api-key';

  constructor(
    private readonly http: HttpClient,
  ) { }

  getCheckouts(): Observable<CheckoutListItem[]> {
    const headers = new HttpHeaders({
      'x-api-key': this.apiKey,
    });

    return this.http.get<CheckoutListItem[]>(
      this.apiUrl,
      { headers },
    );
  }
}