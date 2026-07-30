import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
export type ProviderLogStatus = 'success' | 'failed';
import { environment } from '../../environments/environment';
export interface ProviderCallLog {
  id: string;
  providerId: string | null;
  providerCode: string | null;
  providerName: string | null;
  action: string;
  status: ProviderLogStatus;
  responseTimeMs: number | null;
  errorMessage: string | null;
  request: unknown;
  response: unknown;
  createdAt: string;
}

export interface ProviderLogsFilters {
  status?: string;
  providerCode?: string;
  action?: string;
  search?: string;
  fromDate?: string;
  toDate?: string;
  limit?: number;
  offset?: number;
}

export interface ProviderLogsResponse {
  ok: boolean;

  tenant: {
    id: string;
    name: string;
    schemaName: string;
  };

  filters: ProviderLogsFilters;
  count: number;
  total: number;
  logs: ProviderCallLog[];
}
export type AdminProvider = {
  id: string;
  code: string;
  name: string;
  adapterKey: string;
  isMock: boolean;
  isActive: boolean;
  priorityScore: number;
  createdAt: string;
  updatedAt: string;
};
export type DecisionPriorityCard = {
  id: string;

  providerId: string | null;
  providerName: string;
  providerCode: string;

  criterionKey: string;
  criterionLabel: string;
  criterionDescription: string;

  title: string;
  priorityRank: number;
  isActive: boolean;
  config: Record<string, unknown>;

  createdAt: string;
  updatedAt: string;
};

export type DecisionCriterion = {
  id: string;
  key: string;
  label: string;
  description: string;
  weight: number;
  isActive: boolean;
};

export type AdminProviderOption = {
  id: string;
  code: string;
  name: string;
  adapterKey: string;
  isMock: boolean;
  isActive: boolean;
  priorityScore: number;
  createdAt: string;
  updatedAt: string;
};
type ProvidersResponse = {
  ok: boolean;
  tenant: {
    id: string;
    name: string;
    schemaName: string;
  };
  providers: AdminProvider[];
};

type UpdateProviderResponse = {
  ok: boolean;
  tenant: {
    id: string;
    name: string;
    schemaName: string;
  };
  provider: AdminProvider;
};
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
export interface CheckoutDetailsItem {
  id: string;
  sku: string;
  name: string;
  quantity: number;
  unitWeight: string | number | null;
  unitPrice: string | number | null;
  supplierId: string | null;
  category: string | null;
}

export interface CheckoutShipmentGroupItem {
  checkoutItemId: string;
  sku: string;
  quantity: number;
  unitWeight: string | number | null;
  unitPrice: string | number | null;
  category: string | null;
}

export interface CheckoutShipmentGroup {
  id: string;
  sourceId: string;
  sourceName: string;
  sourceType: string;
  supplierId: string | null;
  handlingGroup: string | null;
  totalItems: number;
  totalWeight: string | number;
  totalPrice: string | number;
  groupingReasons: string[];
  status: string;
  items: CheckoutShipmentGroupItem[];
}

export interface CheckoutShipmentStop {
  id: string;
  stopOrder: number;
  stopType: string;
  address: Record<string, unknown>;
}

export interface CheckoutShipment {
  id: string;
  shipmentGroupId: string;
  orderId: string;
  selectedPlanId: string;
  selectedDeliveryOptionKey: string;
  providerId: string | null;
  providerCode: string | null;
  adapterKey: string | null;
  carrierName: string;
  serviceName: string;
  price: string | number;
  currency: string;
  estimatedDeliveryDays: number;
  status: string;
  createdAt: string;
  updatedAt: string | null;
  stops: CheckoutShipmentStop[];
}

export interface CheckoutDetails {
  id: string;
  orderId: string;
  storeId: string | null;
  platform: string;
  status: string;
  customer: Record<string, unknown>;
  destination: {
    city?: string;
    street?: string;
    country?: string;
    postalCode?: string;
    houseNumber?: string;
  } | null;
  totalItems: number;
  totalPrice: number;
  createdAt: string;
  updatedAt: string | null;
  items: CheckoutDetailsItem[];
  shipmentGroups: CheckoutShipmentGroup[];
  shipments: CheckoutShipment[];
}
@Injectable({
  providedIn: 'root',
})
export class AdminApiService {
  private readonly baseUrl = environment.apiUrl;
  private readonly apiKey = 'flow_ship_test_key_123';

  constructor(private readonly http: HttpClient) { }

  getProviders() {
    return this.http.get<ProvidersResponse>(
      `${this.baseUrl}/admin/providers`,
      {
        headers: {
          'x-api-key': this.apiKey,
        },
      },
    );
  }

  updateProvider(
    providerId: string,
    body: {
      isActive?: boolean;
      priorityScore?: number;
    },
  ) {
    return this.http.patch<UpdateProviderResponse>(
      `${this.baseUrl}/admin/providers/${providerId}`,
      body,
      {
        headers: {
          'x-api-key': this.apiKey,
        },
      },
    );
  }
  getDecisionPriorityCards() {
    return this.http.get<{
      ok: boolean;
      tenant: { id: string; name: string; schemaName: string };
      cards: DecisionPriorityCard[];
    }>(`${this.baseUrl}/admin/decision-priority-cards`, {
      headers: { 'x-api-key': this.apiKey },
    });
  }

  createDecisionPriorityCard(body: {
    providerId?: string | null;
    criterionKey: string;
    title?: string;
    isActive?: boolean;
    config?: Record<string, unknown>;
  }) {
    return this.http.post<{
      ok: boolean;
      tenant: { id: string; name: string; schemaName: string };
      card: DecisionPriorityCard;
    }>(`${this.baseUrl}/admin/decision-priority-cards`, body, {
      headers: { 'x-api-key': this.apiKey },
    });
  }

  updateDecisionPriorityCard(
    cardId: string,
    body: {
      providerId?: string | null;
      criterionKey?: string;
      title?: string;
      priorityRank?: number;
      isActive?: boolean;
      config?: Record<string, unknown>;
    },
  ) {
    return this.http.patch<{
      ok: boolean;
      tenant: { id: string; name: string; schemaName: string };
      card: DecisionPriorityCard;
    }>(`${this.baseUrl}/admin/decision-priority-cards/${cardId}`, body, {
      headers: { 'x-api-key': this.apiKey },
    });
  }

  reorderDecisionPriorityCards(
    cards: { id: string; priorityRank: number }[],
  ) {
    return this.http.patch<{
      ok: boolean;
      tenant: {
        id: string;
        name: string;
        schemaName: string;
      };
      cards: DecisionPriorityCard[];
    }>(
      `${this.baseUrl}/admin/decision-priority-cards/reorder`,
      { cards },
      {
        headers: {
          'x-api-key': this.apiKey,
        },
      },
    );
  }

  deleteDecisionPriorityCard(cardId: string) {
    return this.http.delete<{
      ok: boolean;
      deletedId: string;
    }>(`${this.baseUrl}/admin/decision-priority-cards/${cardId}`, {
      headers: { 'x-api-key': this.apiKey },
    });
  }

  getDecisionCriteria() {
    return this.http.get<{
      ok: boolean;
      tenant: { id: string; name: string; schemaName: string };
      criteria: DecisionCriterion[];
    }>(`${this.baseUrl}/admin/decision-criteria`, {
      headers: { 'x-api-key': this.apiKey },
    });
  }
  getProviderCallLogs(
    filters: ProviderLogsFilters = {},
  ) {
    let params = new HttpParams();

    if (filters.status) {
      params = params.set('status', filters.status);
    }

    if (filters.providerCode) {
      params = params.set(
        'providerCode',
        filters.providerCode,
      );
    }

    if (filters.action) {
      params = params.set('action', filters.action);
    }

    if (filters.search?.trim()) {
      params = params.set(
        'search',
        filters.search.trim(),
      );
    }

    if (filters.fromDate) {
      params = params.set(
        'fromDate',
        filters.fromDate,
      );
    }

    if (filters.toDate) {
      params = params.set(
        'toDate',
        filters.toDate,
      );
    }

    params = params.set(
      'limit',
      String(filters.limit ?? 10),
    );

    params = params.set(
      'offset',
      String(filters.offset ?? 0),
    );

    return this.http.get<ProviderLogsResponse>(
      `${this.baseUrl}/admin/provider-call-logs`,
      {
        params,
        headers: {
          'x-api-key': this.apiKey,
        },
      },
    );
  }
  getCheckouts() {
    return this.http.get<CheckoutListItem[]>(
      `${this.baseUrl}/checkout`,
      {
        headers: {
          'x-api-key': this.apiKey,
        },
      },
    );
  }
  getCheckoutById(checkoutId: string) {
    return this.http.get<CheckoutDetails>(
      `${this.baseUrl}/checkout/${checkoutId}`,
      {
        headers: {
          'x-api-key': this.apiKey,
        },
      },
    );
  }
}