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
  criterionLabel: string | null;
  criterionDescription: string | null;

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
  description: string | null;
  weight: number;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
};
export type DecisionSettings = {
  id: string;
  priceWeight: number;
  speedWeight: number;
  providerPriorityWeight: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};
export type AdminTenantInfo = {
  id: string;
  name: string;
  schemaName: string;
};
export type DecisionSettingsResponse = {
  ok: boolean;
  tenant: AdminTenantInfo;
  settings: DecisionSettings;
};

export type DecisionCriteriaResponse = {
  ok: boolean;
  tenant: AdminTenantInfo;
  criteria: DecisionCriterion[];
};

export type DecisionCriterionResponse = {
  ok: boolean;
  tenant: AdminTenantInfo;
  criterion: DecisionCriterion;
};

export type DecisionPriorityCardsResponse = {
  ok: boolean;
  tenant: AdminTenantInfo;
  cards: DecisionPriorityCard[];
};

export type DecisionPriorityCardResponse = {
  ok: boolean;
  tenant: AdminTenantInfo;
  card: DecisionPriorityCard;
};
export type UpdateDecisionSettingsPayload = {
  priceWeight?: number;
  speedWeight?: number;
  providerPriorityWeight?: number;
};

export type UpdateDecisionCriterionPayload = {
  weight?: number;
  isActive?: boolean;
};

export type CreateDecisionPriorityCardPayload = {
  providerId?: string | null;
  criterionKey: string;
  title?: string | null;
  isActive?: boolean;
  config?: Record<string, unknown>;
};

export type UpdateDecisionPriorityCardPayload = {
  providerId?: string | null;
  criterionKey?: string;
  title?: string | null;
  priorityRank?: number;
  isActive?: boolean;
  config?: Record<string, unknown>;
};

export type ReorderDecisionPriorityCardItem = {
  id: string;
  priorityRank: number;
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
  groupingSplitReasons: string[];
}
export interface AuthMeResponse {
  user: {
    id: string;
    email: string | null;
    displayName: string | null;
    role: string;
  };

  tenant: {
    id: string;
    name: string;
    schemaName: string;
    status?: string;
  };
}
export type GroupingStrategyKey =
  | 'group_by_source'
  | 'split_by_max_weight'
  | 'split_by_max_items';

export interface GroupingStrategyConfig {
  maxWeightKg?: number;
  maxItems?: number;
}

export interface GroupingStrategy {
  id: string;
  strategyKey: GroupingStrategyKey;
  displayName: string;
  isEnabled: boolean;
  executionOrder: number;
  conflictPriority: number;
  config: GroupingStrategyConfig;
  createdAt: string;
  updatedAt: string;
}

export interface GroupingStrategiesResponse {
  ok: boolean;

  tenant: {
    id: string;
    name: string;
    schemaName: string;
  };

  strategies: GroupingStrategy[];
}

export interface GroupingStrategyResponse {
  ok: boolean;
  strategy: GroupingStrategy;
}

export interface UpdateGroupingStrategyPayload {
  displayName?: string;
  isEnabled?: boolean;
  executionOrder?: number;
  conflictPriority?: number;
  config?: GroupingStrategyConfig;
}

export interface ReorderGroupingStrategyItem {
  id: string;
  executionOrder: number;
  conflictPriority: number;
}
export interface ShipmentHistoryShipment {
  id: string;

  externalShipmentId: string | null;
  shipmentGroupId: string | null;

  status: string;

  carrierName: string | null;
  serviceName: string | null;

  price: number | null;
  currency: string;

  trackingNumber: string | null;
  trackingUrl: string | null;

  pickup: Record<string, unknown> | null;
  dropoff: Record<string, unknown> | null;

  failureReason: string | null;

  deliveredAt: string | null;
  failedAt: string | null;
  createdAt: string;
}

export interface ShipmentHistoryItem {
  checkoutId: string;
  orderId: string;
  platform: string;

  resultStatus:
  | 'delivered'
  | 'failed';

  checkoutStatus: string;

  failureStage: string | null;
  failureReason: string | null;

  destination: {
    city?: string;
    street?: string;
    houseNumber?: string;
    postalCode?: string;
    country?: string;
  };

  totalShipments: number;
  deliveredShipments: number;
  failedShipments: number;

  totalShippingPrice: number;
  currency: string;

  createdAt: string;
  completedAt: string | null;

  shipments: ShipmentHistoryShipment[];
}

export interface ShipmentHistoryResponse {
  ok: boolean;

  tenant: {
    id: string;
    name: string;
    schemaName: string;
  };

  count: number;
  items: ShipmentHistoryItem[];
}
export type ShipmentHistoryResultStatus =
  | 'delivered'
  | 'failed';

export type ShipmentHistorySortBy =
  | 'completedAt'
  | 'totalShippingPrice'
  | 'totalShipments';

export type ShipmentHistorySortDirection =
  | 'asc'
  | 'desc';

export interface ShipmentHistoryFilters {
  resultStatus?: ShipmentHistoryResultStatus;
  carrierName?: string;
  search?: string;
  fromDate?: string;
  toDate?: string;
  sortBy?: ShipmentHistorySortBy;
  sortDirection?: ShipmentHistorySortDirection;
}
@Injectable({
  providedIn: 'root',
})
export class AdminApiService {
  private readonly baseUrl = environment.apiUrl;

  constructor(private readonly http: HttpClient) { }

  getProviders() {
    return this.http.get<ProvidersResponse>(
      `${this.baseUrl}/admin/providers`,
      {

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
        },
      },
    );
  }
  getDecisionPriorityCards() {
    return this.http.get<DecisionPriorityCardsResponse>(
      `${this.baseUrl}/admin/decision-priority-cards`,
    );
  }

  createDecisionPriorityCard(
    body: CreateDecisionPriorityCardPayload,
  ) {
    return this.http.post<DecisionPriorityCardResponse>(
      `${this.baseUrl}/admin/decision-priority-cards`,
      body,
    );
  }

  updateDecisionPriorityCard(
    cardId: string,
    body: UpdateDecisionPriorityCardPayload,
  ) {
    return this.http.patch<DecisionPriorityCardResponse>(
      `${this.baseUrl}/admin/decision-priority-cards/${cardId}`,
      body,
    );
  }

  reorderDecisionPriorityCards(
    cards: ReorderDecisionPriorityCardItem[],
  ) {
    return this.http.patch<DecisionPriorityCardsResponse>(
      `${this.baseUrl}/admin/decision-priority-cards/reorder`,
      {
        cards,
      },
    );
  }

  deleteDecisionPriorityCard(
    cardId: string,
  ) {
    return this.http.delete<{
      ok: boolean;
      deletedId: string;
    }>(
      `${this.baseUrl}/admin/decision-priority-cards/${cardId}`,
    );
  }
  getDecisionCriteria() {
    return this.http.get<DecisionCriteriaResponse>(
      `${this.baseUrl}/admin/decision-criteria`,
    );
  }
  updateDecisionCriterion(
    criterionId: string,
    body: UpdateDecisionCriterionPayload,
  ) {
    return this.http.patch<DecisionCriterionResponse>(
      `${this.baseUrl}/admin/decision-criteria/${criterionId}`,
      body,
    );
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
        },
      },
    );
  }
  getCheckouts() {
    return this.http.get<CheckoutListItem[]>(
      `${this.baseUrl}/checkout`,
      {
        headers: {
        },
      },
    );
  }
  getCheckoutById(checkoutId: string) {
    return this.http.get<CheckoutDetails>(
      `${this.baseUrl}/checkout/${checkoutId}`,
      {
        headers: {
        },
      },
    );
  }
  getMe() {
    return this.http.get<AuthMeResponse>(
      `${this.baseUrl}/auth/me`,
    );
  }
  getDecisionSettings() {
    return this.http.get<DecisionSettingsResponse>(
      `${this.baseUrl}/admin/decision-settings`,
    );
  }
  updateDecisionSettings(
    body: UpdateDecisionSettingsPayload,
  ) {
    return this.http.patch<DecisionSettingsResponse>(
      `${this.baseUrl}/admin/decision-settings`,
      body,
    );
  }
  getGroupingStrategies() {
    return this.http.get<GroupingStrategiesResponse>(
      `${this.baseUrl}/admin/grouping-strategies`,
    );
  }

  updateGroupingStrategy(
    strategyId: string,
    body: UpdateGroupingStrategyPayload,
  ) {
    return this.http.patch<GroupingStrategyResponse>(
      `${this.baseUrl}/admin/grouping-strategies/${strategyId}`,
      body,
    );
  }

  reorderGroupingStrategies(
    items: ReorderGroupingStrategyItem[],
  ) {
    return this.http.patch<GroupingStrategiesResponse>(
      `${this.baseUrl}/admin/grouping-strategies/reorder`,
      {
        items,
      },
    );
  }
  getShipmentHistory(
    filters: ShipmentHistoryFilters = {},
  ) {
    let params = new HttpParams();

    if (filters.resultStatus) {
      params = params.set(
        'resultStatus',
        filters.resultStatus,
      );
    }

    if (filters.carrierName?.trim()) {
      params = params.set(
        'carrierName',
        filters.carrierName.trim(),
      );
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
      'sortBy',
      filters.sortBy ?? 'completedAt',
    );

    params = params.set(
      'sortDirection',
      filters.sortDirection ?? 'desc',
    );

    return this.http.get<ShipmentHistoryResponse>(
      `${this.baseUrl}/admin/shipment-history`,
      {
        params,
      },
    );
  }
}