import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core'; import { FormsModule } from '@angular/forms';
import {
  AdminApiService,
  AdminProvider,
} from '../../services/admin-api';

@Component({
  selector: 'app-admin-providers',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-providers.html',
  styleUrl: './admin-providers.scss',
})
export class AdminProvidersComponent implements OnInit {
  loading = false;
  errorMsg = '';
  savingProviderConfig = false;
  providerConfigError = '';
  tenantName = '';
  schemaName = '';

  providers: AdminProvider[] = [];

  constructor(
    private readonly adminApi: AdminApiService,
    private readonly cdr: ChangeDetectorRef,
  ) { }
  ngOnInit(): void {
    this.loadProviders();
  }

  loadProviders(): void {
    this.loading = true;
    this.errorMsg = '';
    this.cdr.detectChanges();

    this.adminApi.getProviders().subscribe({
      next: (res) => {
        console.log('providers response:', res);

        this.tenantName = res.tenant.name;
        this.schemaName = res.tenant.schemaName;
        this.providers = res.providers ?? [];
        this.loading = false;

        console.log('providers:', this.providers);
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('load providers error:', err);
        this.errorMsg = 'שגיאה בטעינת ספקי השילוח';
        this.loading = false;
        this.cdr.detectChanges();
      },
    });
  }

  toggleProvider(provider: AdminProvider): void {
    const newValue = !provider.isActive;

    this.adminApi
      .updateProvider(provider.id, {
        isActive: newValue,
      })
      .subscribe({
        next: (res) => {
          console.log('toggle provider response:', res);
          this.loadProviders();
        },
        error: (err) => {
          console.error(err);
          this.errorMsg = 'שגיאה בעדכון סטטוס ספק';
        },
      });
  }

  savePriority(provider: AdminProvider): void {
    this.adminApi
      .updateProvider(provider.id, {
        priorityScore: Number(provider.priorityScore),
      })
      .subscribe({
        next: (res) => {
          console.log('save priority response:', res);
          this.loadProviders();
        },
        error: (err) => {
          console.error(err);
          this.errorMsg = 'שגיאה בעדכון עדיפות ספק';
        },
      });
  }
  saveProviderConfig(provider: AdminProvider): void {
    if (!provider.settings) {
      return;
    }

    this.providerConfigError = '';
    if (
      provider.configCapabilities['allowedUrgencies'] &&
      !provider.settings.allowedUrgencies?.length
    ) {
      this.providerConfigError =
        'יש לבחור לפחות סוג משלוח אחד.';

      return;
    }
    const vehicleWeightRules =
      provider.settings.vehicleWeightRules;

    if (
      provider.configCapabilities['vehicleWeightRules'] &&
      vehicleWeightRules &&
      vehicleWeightRules.scooterMaxWeightKg >
      vehicleWeightRules.carMaxWeightKg
    ) {
      this.providerConfigError =
        'המשקל המקסימלי לקטנוע לא יכול להיות גבוה מהמשקל המקסימלי לרכב.';

      return;
    }

    this.errorMsg = '';
    this.savingProviderConfig = true;

    this.adminApi
      .updateProviderConfig(
        provider.id,
        provider.settings,
      )
      .subscribe({
        next: () => {
          this.savingProviderConfig = false;
          this.selectedProvider = null;
          this.providerConfigError = '';

          this.loadProviders();
        },

        error: (err) => {
          console.error(
            'save provider config error:',
            err,
          );

          this.savingProviderConfig = false;

          this.providerConfigError =
            'שגיאה בעדכון הגדרות הספק';

          this.cdr.detectChanges();
        },
      });
  }
  selectedProvider: AdminProvider | null = null;

  openProviderSettings(
    provider: AdminProvider,
  ): void {
    this.providerConfigError = '';

    this.selectedProvider = structuredClone(provider);
  }
  toggleAllowedUrgency(
    urgency: 'urgent' | 'express' | 'standard',
    event: Event,
  ): void {
    if (!this.selectedProvider?.settings) {
      return;
    }

    const checkbox = event.target as HTMLInputElement;

    const current =
      this.selectedProvider.settings.allowedUrgencies ?? [];

    if (checkbox.checked) {
      if (!current.includes(urgency)) {
        this.selectedProvider.settings.allowedUrgencies = [
          ...current,
          urgency,
        ];
      }
    } else {
      this.selectedProvider.settings.allowedUrgencies =
        current.filter(
          (item) => item !== urgency,
        );
    }

    this.providerConfigError = '';
  }
}