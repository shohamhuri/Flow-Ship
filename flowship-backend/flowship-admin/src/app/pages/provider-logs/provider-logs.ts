import {
  CommonModule,
  DatePipe,
  JsonPipe,
} from '@angular/common';
import {
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
  inject,
} from '@angular/core';
import {
  FormBuilder,
  ReactiveFormsModule,
} from '@angular/forms';
import {
  Subject,
  debounceTime,
  distinctUntilChanged,
  finalize,
  takeUntil,
} from 'rxjs';

import {
  AdminApiService,
  ProviderCallLog,
} from '../../services/admin-api';

type ProviderOption = {
  code: string;
  name: string;
};
type LogRequestPayload = {
  weightKg?: number;
  originCity?: string;
  destinationCity?: string;
};

type LogRequest = {
  payload?: LogRequestPayload;
  adapterKey?: string;
  providerCode?: string;
  providerName?: string;
};

type LogResponse = {
  quotesCount?: number;
  quotes?: Array<{
    price?: number;
    currency?: string;
    carrierName?: string;
    serviceName?: string;
    estimatedDays?: number;
  }>;
};

@Component({
  selector: 'app-provider-logs',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    DatePipe,
    JsonPipe,
  ],
  templateUrl: './provider-logs.html',
  styleUrl: './provider-logs.scss',
})
export class ProviderLogs implements OnInit, OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly adminApi = inject(AdminApiService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroy$ = new Subject<void>();

  logs: ProviderCallLog[] = [];
  selectedLog: ProviderCallLog | null = null;

  loading = false;
  errorMessage = '';

  tenantName = '';
  total = 0;
  currentPage = 1;

  readonly providers: ProviderOption[] = [
    {
      code: 'mock',
      name: 'Mock Express',
    },
    {
      code: 'mock_gett',
      name: 'Mock Gett',
    },
    {
      code: 'mock_yango',
      name: 'Mock Yango',
    },
    {
      code: 'mock_hfd',
      name: 'Mock HFD',
    },
  ];

  readonly actions = [
    {
      value: 'get_quote',
      label: 'בקשת הצעת מחיר',
    },
  ];

  readonly pageSizes = [10, 25, 50, 100];

  readonly filterForm = this.fb.group({
    search: [''],
    providerCode: [''],
    status: [''],
    action: [''],
    fromDate: [''],
    toDate: [''],
    limit: [10],
  });

  ngOnInit(): void {
    this.loadLogs();

    this.filterForm.controls.search.valueChanges
      .pipe(
        debounceTime(450),
        distinctUntilChanged(),
        takeUntil(this.destroy$),
      )
      .subscribe(() => {
        this.currentPage = 1;
        this.loadLogs();
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadLogs(): void {
    if (this.loading) {
      return;
    }

    const filters = this.filterForm.getRawValue();

    const limit = Number(filters.limit ?? 10);
    const offset = (this.currentPage - 1) * limit;

    this.loading = true;
    this.errorMessage = '';

    console.log('loading provider logs:', {
      limit,
      offset,
    });

    this.adminApi
      .getProviderCallLogs({
        search: filters.search?.trim() ?? '',
        providerCode: filters.providerCode ?? '',
        status: filters.status ?? '',
        action: filters.action ?? '',
        fromDate: filters.fromDate ?? '',
        toDate: filters.toDate ?? '',
        limit,
        offset,
      })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          console.log('provider logs request finalized');

          this.loading = false;
          this.cdr.detectChanges();
        }),
      )
      .subscribe({
        next: (response) => {
          console.log('provider logs response:', response);

          this.logs = response.logs ?? [];
          this.total = Number(response.total ?? 0);

          this.cdr.detectChanges();
        },

        error: (err) => {
          console.error('provider logs error:', err);

          this.logs = [];
          this.total = 0;

          this.errorMessage =
            err?.error?.message ??
            'שגיאה בטעינת הלוגים';

          this.cdr.detectChanges();
        },
      });
  }

  applyFilters(): void {
    this.currentPage = 1;
    this.loadLogs();
  }

  resetFilters(): void {
    this.filterForm.reset(
      {
        search: '',
        providerCode: '',
        status: '',
        action: '',
        fromDate: '',
        toDate: '',
        limit: 10,
      },
      {
        emitEvent: false,
      },
    );

    this.currentPage = 1;
    this.loadLogs();
  }

  refresh(): void {
    this.loadLogs();
  }

  openLog(log: ProviderCallLog): void {
    this.selectedLog = log;
    console.log('Selected log:', log);
  }

  closeLog(): void {
    this.selectedLog = null;
  }

  nextPage(): void {
    if (!this.hasNextPage) {
      return;
    }

    this.currentPage++;
    this.loadLogs();
  }

  previousPage(): void {
    if (this.currentPage <= 1) {
      return;
    }

    this.currentPage--;
    this.loadLogs();
  }

  get pageSize(): number {
    return Number(
      this.filterForm.controls.limit.value ??
      10,
    );
  }

  get totalPages(): number {
    return Math.max(
      1,
      Math.ceil(this.total / this.pageSize),
    );
  }

  get hasNextPage(): boolean {
    return this.currentPage < this.totalPages;
  }

  get successCount(): number {
    return this.logs.filter(
      (log) => log.status === 'success',
    ).length;
  }

  get failedCount(): number {
    return this.logs.filter(
      (log) => log.status === 'failed',
    ).length;
  }

  get averageResponseTime(): number {
    const validTimes = this.logs
      .map((log) => log.responseTimeMs)
      .filter(
        (value): value is number =>
          typeof value === 'number',
      );

    if (validTimes.length === 0) {
      return 0;
    }

    const sum = validTimes.reduce(
      (total, value) => total + value,
      0,
    );

    return Math.round(
      sum / validTimes.length,
    );
  }

  getActionLabel(action: string): string {
    const match = this.actions.find(
      (item) => item.value === action,
    );

    return match?.label ?? action;
  }

  getStatusLabel(status: string): string {
    switch (status) {
      case 'success':
        return 'הצלחה';

      case 'failed':
        return 'נכשל';

      default:
        return status;
    }
  }

  getRequestRoute(
    log: ProviderCallLog,
  ): string {
    const request = log.request as {
      payload?: {
        originCity?: string;
        destinationCity?: string;
      };
    } | null;

    const origin =
      request?.payload?.originCity ??
      'לא צוין';

    const destination =
      request?.payload?.destinationCity ??
      'לא צוין';

    return `${origin} ← ${destination}`;
  }

  getQuotesCount(
    log: ProviderCallLog,
  ): number {
    const response = log.response as {
      quotesCount?: number;
      quotes?: unknown[];
    } | null;

    if (
      typeof response?.quotesCount ===
      'number'
    ) {
      return response.quotesCount;
    }

    if (Array.isArray(response?.quotes)) {
      return response.quotes.length;
    }

    return 0;
  }

  trackByLogId(
    _index: number,
    log: ProviderCallLog,
  ): string {
    return log.id;
  }
  getLogRequest(log: ProviderCallLog): LogRequest {
    return (log.request ?? {}) as LogRequest;
  }

  getLogResponse(log: ProviderCallLog): LogResponse | null {
    if (!log.response) {
      return null;
    }

    return log.response as LogResponse;
  }

  getOriginCity(log: ProviderCallLog): string {
    return this.getLogRequest(log).payload?.originCity ?? 'לא צוין';
  }

  getDestinationCity(log: ProviderCallLog): string {
    return this.getLogRequest(log).payload?.destinationCity ?? 'לא צוין';
  }

  getWeightKg(log: ProviderCallLog): string {
    const weight = this.getLogRequest(log).payload?.weightKg;

    return typeof weight === 'number'
      ? `${weight} ק"ג`
      : 'לא צוין';
  }

  getProviderDisplayName(log: ProviderCallLog): string {
    return (
      log.providerName ??
      this.getLogRequest(log).providerName ??
      log.providerCode ??
      'ספק לא ידוע'
    );
  }

  getAdapterKey(log: ProviderCallLog): string {
    return this.getLogRequest(log).adapterKey ?? 'לא צוין';
  }

  getReadableError(log: ProviderCallLog): string {
    const error = log.errorMessage?.trim();

    if (!error) {
      return 'לא התקבל פירוט על השגיאה';
    }

    if (error.startsWith('Carrier adapter not found:')) {
      const adapterKey = error
        .replace('Carrier adapter not found:', '')
        .trim();

      return `לא נמצא חיבור פעיל לספק עבור המזהה ${adapterKey}`;
    }

    return error;
  }

  getResponseSummary(log: ProviderCallLog): string {
    const response = this.getLogResponse(log);

    if (!response) {
      return 'לא התקבלה תשובה מהספק';
    }

    const count =
      typeof response.quotesCount === 'number'
        ? response.quotesCount
        : response.quotes?.length ?? 0;

    if (count === 0) {
      return 'הספק לא החזיר הצעות מחיר';
    }

    if (count === 1) {
      return 'התקבלה הצעת מחיר אחת';
    }

    return `התקבלו ${count} הצעות מחיר`;
  }

  getEstimatedDaysLabel(days?: number): string {
    if (typeof days !== 'number') {
      return 'זמן אספקה לא ידוע';
    }

    if (days === 0) {
      return 'אספקה באותו היום';
    }

    if (days === 1) {
      return 'אספקה בתוך יום';
    }

    return `אספקה בתוך ${days} ימים`;
  }
}