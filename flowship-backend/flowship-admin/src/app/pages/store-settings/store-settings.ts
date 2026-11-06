import { CommonModule } from '@angular/common';
import {
  ChangeDetectorRef,
  Component,
  OnInit,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  CdkDragDrop,
  DragDropModule,
  moveItemInArray,
} from '@angular/cdk/drag-drop';
import {
  AdminApiService,
  AdminStore,
  WeightEstimationRule,
  SourceDeliveryPermission,
} from '../../services/admin-api';

@Component({
  selector: 'app-store-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, DragDropModule],
  templateUrl: './store-settings.html',
  styleUrl: './store-settings.scss',
})
export class StoreSettings implements OnInit {
  expressMaxMinutes: number | null = null;
  sameDayMaxMinutes: number | null = null;
  pickupLeadTimeMinutes: number | null = null;
  expressCutoffTime: string | null = null;

  expressAfterCutoffMode: 'extended' | 'disabled' = 'extended';

  expressAfterCutoffMaxMinutes: number | null = null;
  isLoading = true;
  isSaving = false;

  errorMessage = '';
  successMessage = '';
  activeTab: 'delivery' | 'weight' | 'selfDelivery' = 'delivery';
  weightRules: WeightEstimationRule[] = [];
  isLoadingWeightRules = false;
  weightRulesLoaded = false;
  isCreatingWeightRuleSaving = false;
  stores: AdminStore[] = [];
  selectedStoreId = '';
  isLoadingStores = false;
  sourcePermissions: SourceDeliveryPermission[] = [];
  isLoadingSourcePermissions = false;
  sourcePermissionsError = '';
  setActiveTab(
    tab: 'delivery' | 'weight' | 'selfDelivery',
  ): void {
    this.activeTab = tab;
    this.errorMessage = '';
    this.successMessage = '';

    if (
      tab === 'weight' &&
      !this.weightRulesLoaded
    ) {
      this.loadWeightRules();
    }
    if (tab === 'selfDelivery' && this.stores.length === 0) {
      this.loadStores();
    }
  }

  constructor(
    private readonly adminApiService: AdminApiService,
    private readonly cdr: ChangeDetectorRef,
  ) { }

  ngOnInit(): void {
    this.loadSettings();
  }

  loadSettings(): void {
    this.isLoading = true;
    this.errorMessage = '';

    this.adminApiService.getStoreSettings().subscribe({
      next: (response) => {
        this.expressMaxMinutes =
          response.settings.expressMaxMinutes;
        this.sameDayMaxMinutes =
          response.settings.sameDayMaxMinutes;
        this.pickupLeadTimeMinutes =
          response.settings.pickupLeadTimeMinutes;
        this.expressCutoffTime =
          response.settings.expressCutoffTime?.slice(0, 5) ?? null;

        this.expressAfterCutoffMode =
          response.settings.expressAfterCutoffMode;

        this.expressAfterCutoffMaxMinutes =
          response.settings.expressAfterCutoffMaxMinutes;
        this.isLoading = false;
        this.cdr.detectChanges();
      },

      error: () => {
        this.errorMessage =
          '׳׳ ׳ ׳™׳×׳ ׳׳˜׳¢׳•׳ ׳׳× ׳”׳’׳“׳¨׳•׳× ׳”׳—׳ ׳•׳×.';

        this.isLoading = false;
        this.cdr.detectChanges();
      },
    });
  }

  saveSettings(): void {
    this.errorMessage = '';
    this.successMessage = '';

    const minutes = this.expressMaxMinutes;
    const sameDayMinutes = this.sameDayMaxMinutes;
    if (
      minutes === null ||
      !Number.isSafeInteger(minutes) ||
      minutes <= 0
    ) {
      this.errorMessage =
        '׳™׳© ׳׳”׳–׳™׳ ׳׳¡׳₪׳¨ ׳“׳§׳•׳× ׳©׳׳ ׳•׳’׳“׳•׳ ׳׳׳₪׳¡.';
      return;
    }
    if (
      sameDayMinutes === null ||
      !Number.isSafeInteger(sameDayMinutes) ||
      sameDayMinutes <= 0
    ) {
      this.errorMessage =
        '׳™׳© ׳׳”׳–׳™׳ ׳–׳׳ ׳×׳§׳™׳ ׳׳׳©׳׳•׳— ׳׳”׳™׳•׳ ׳׳”׳™׳•׳.';
      return;
    }
    const cutoffTime = this.expressCutoffTime?.trim() || null;

    if (
      cutoffTime !== null &&
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(cutoffTime)
    ) {
      this.errorMessage = '׳™׳© ׳׳”׳–׳™׳ ׳©׳¢׳× ׳—׳™׳×׳•׳ ׳×׳§׳™׳ ׳”.';
      return;
    }

    if (
      cutoffTime !== null &&
      this.expressAfterCutoffMode === 'extended' &&
      (
        this.expressAfterCutoffMaxMinutes === null ||
        !Number.isSafeInteger(this.expressAfterCutoffMaxMinutes) ||
        this.expressAfterCutoffMaxMinutes <= 0
      )
    ) {
      this.errorMessage =
        '׳™׳© ׳׳”׳–׳™׳ ׳׳¡׳₪׳¨ ׳“׳§׳•׳× ׳×׳§׳™׳ ׳׳—׳׳•׳ ׳”׳׳•׳¨׳—׳‘.';
      return;
    }
    if (
      this.pickupLeadTimeMinutes === null ||
      !Number.isSafeInteger(this.pickupLeadTimeMinutes) ||
      this.pickupLeadTimeMinutes < 0
    ) {
      this.errorMessage =
        '׳–׳׳ ׳”׳”׳׳×׳ ׳” ׳׳׳™׳¡׳•׳£ ׳—׳™׳™׳‘ ׳׳”׳™׳•׳× ׳׳¡׳₪׳¨ ׳©׳׳ ׳©׳׳™׳ ׳• ׳©׳׳™׳׳™.';
      return;
    }
    this.isSaving = true;

    this.adminApiService.updateStoreSettings({
      expressMaxMinutes: minutes,
      sameDayMaxMinutes: sameDayMinutes,
      expressCutoffTime: cutoffTime,
      expressAfterCutoffMode: this.expressAfterCutoffMode,
      pickupLeadTimeMinutes: this.pickupLeadTimeMinutes,
      expressAfterCutoffMaxMinutes:
        cutoffTime !== null &&
          this.expressAfterCutoffMode === 'extended'
          ? this.expressAfterCutoffMaxMinutes
          : null,
    })
      .subscribe({
        next: (response) => {
          this.expressMaxMinutes =
            response.settings.expressMaxMinutes;
          this.sameDayMaxMinutes =
            response.settings.sameDayMaxMinutes;
          this.expressCutoffTime =
            response.settings.expressCutoffTime?.slice(0, 5) ?? null;
          this.pickupLeadTimeMinutes =
            response.settings.pickupLeadTimeMinutes;

          this.expressAfterCutoffMode =
            response.settings.expressAfterCutoffMode;

          this.expressAfterCutoffMaxMinutes =
            response.settings.expressAfterCutoffMaxMinutes;
          this.successMessage =
            '׳”׳’׳“׳¨׳•׳× ׳”׳—׳ ׳•׳× ׳ ׳©׳׳¨׳• ׳‘׳”׳¦׳׳—׳”.';

          this.isSaving = false;
          this.cdr.detectChanges();
        },

        error: () => {
          this.errorMessage =
            '׳©׳׳™׳¨׳× ׳”׳’׳“׳¨׳•׳× ׳”׳—׳ ׳•׳× ׳ ׳›׳©׳׳”.';

          this.isSaving = false;
          this.cdr.detectChanges();
        },
      });
  }
  get sameDayMaxHours(): number | null {
    if (this.sameDayMaxMinutes === null) {
      return null;
    }

    return this.sameDayMaxMinutes / 60;
  }

  set sameDayMaxHours(hours: number | null) {
    if (hours === null) {
      this.sameDayMaxMinutes = null;
      return;
    }

    this.sameDayMaxMinutes = hours * 60;
  }
  loadWeightRules(): void {
    this.isLoadingWeightRules = true;
    this.errorMessage = '';

    this.adminApiService
      .getWeightEstimationRules()
      .subscribe({
        next: (response) => {
          this.weightRules = response.rules;
          this.weightRulesLoaded = true;
          this.isLoadingWeightRules = false;

          this.cdr.detectChanges();
        },

        error: (error) => {
          console.error(
            'Failed to load weight estimation rules',
            error,
          );

          this.errorMessage =
            '׳׳ ׳ ׳™׳×׳ ׳׳˜׳¢׳•׳ ׳׳× ׳›׳׳׳™ ׳”׳¢׳¨׳›׳× ׳”׳׳©׳§׳.';

          this.isLoadingWeightRules = false;
          this.cdr.detectChanges();
        },
      });
  }
  editingWeightRuleId: string | null = null;
  isSavingWeightRule = false;
  isCreatingWeightRule = false;
  newWeightRule = {
    category: '',
    productType: '',
    size: '',
    estimatedWeightKg: 0.1,
    isActive: true,
  };
  startEditingWeightRule(
    rule: WeightEstimationRule,
  ): void {
    this.editingWeightRuleId = rule.id;
    this.errorMessage = '';
    this.successMessage = '';
  }

  cancelEditingWeightRule(): void {
    this.editingWeightRuleId = null;

    // ׳׳—׳–׳™׳¨׳™׳ ׳׳× ׳”׳¢׳¨׳›׳™׳ ׳׳”׳©׳¨׳×
    this.weightRulesLoaded = false;
    this.loadWeightRules();
  }
  saveWeightRule(
    rule: WeightEstimationRule,
  ): void {
    const weight = Number(
      rule.estimatedWeightKg,
    );

    if (
      !Number.isFinite(weight) ||
      weight <= 0
    ) {
      this.errorMessage =
        '׳”׳׳©׳§׳ ׳”׳׳©׳•׳¢׳¨ ׳—׳™׳™׳‘ ׳׳”׳™׳•׳× ׳’׳“׳•׳ ׳׳׳₪׳¡.';
      return;
    }

    this.isSavingWeightRule = true;
    this.errorMessage = '';
    this.successMessage = '';

    this.adminApiService
      .updateWeightEstimationRule(
        rule.id,
        {
          category:
            rule.category?.trim() || null,

          productType:
            rule.productType?.trim() || null,

          size:
            rule.size?.trim() || null,

          estimatedWeightKg: weight,
          isActive: rule.isActive,
        },
      )
      .subscribe({
        next: (response) => {
          this.weightRules =
            this.weightRules.map(
              (currentRule) =>
                currentRule.id ===
                  response.rule.id
                  ? response.rule
                  : currentRule,
            );

          this.editingWeightRuleId = null;
          this.isSavingWeightRule = false;

          this.successMessage =
            '׳›׳׳ ׳”׳¢׳¨׳›׳× ׳”׳׳©׳§׳ ׳ ׳©׳׳¨ ׳‘׳”׳¦׳׳—׳”.';

          this.cdr.detectChanges();
        },

        error: (error) => {
          console.error(
            'Failed to update weight estimation rule',
            error,
          );
          this.errorMessage =
            error.status === 409
              ? '׳›׳‘׳¨ ׳§׳™׳™׳ ׳›׳׳ ׳¢׳ ׳׳•׳×׳” ׳§׳˜׳’׳•׳¨׳™׳”, ׳¡׳•׳’ ׳׳•׳¦׳¨ ׳•׳׳™׳“׳”.'
              : '׳©׳׳™׳¨׳× ׳›׳׳ ׳”׳¢׳¨׳›׳× ׳”׳׳©׳§׳ ׳ ׳›׳©׳׳”.';
          this.isSavingWeightRule = false;
          this.cdr.detectChanges();
        },
      });
  }
  dropWeightRule(
    event: CdkDragDrop<WeightEstimationRule[]>,
  ): void {
    if (
      event.previousIndex ===
      event.currentIndex
    ) {
      return;
    }

    moveItemInArray(
      this.weightRules,
      event.previousIndex,
      event.currentIndex,
    );

    this.weightRules.forEach(
      (rule, index) => {
        const priority =
          (index + 1) * 10;

        rule.priority = priority;

        this.adminApiService
          .updateWeightEstimationRule(
            rule.id,
            {
              priority,
            },
          )
          .subscribe({
            error: (error) => {
              console.error(
                'Failed to save weight rule order',
                error,
              );
            },
          });
      },
    );
  }
  startCreatingWeightRule(): void {
    this.isCreatingWeightRule = true;
    this.editingWeightRuleId = null;
    this.errorMessage = '';
    this.successMessage = '';
  }

  cancelCreatingWeightRule(): void {
    this.isCreatingWeightRule = false;

    this.newWeightRule = {
      category: '',
      productType: '',
      size: '',
      estimatedWeightKg: 0.1,
      isActive: true,
    };
  }
  createWeightRule(): void {
    const weight = Number(
      this.newWeightRule.estimatedWeightKg,
    );

    if (
      !Number.isFinite(weight) ||
      weight <= 0
    ) {
      this.errorMessage =
        '׳”׳׳©׳§׳ ׳”׳׳©׳•׳¢׳¨ ׳—׳™׳™׳‘ ׳׳”׳™׳•׳× ׳’׳“׳•׳ ׳׳׳₪׳¡.';
      return;
    }

    this.isCreatingWeightRuleSaving = true;
    this.errorMessage = '';
    this.successMessage = '';

    this.adminApiService
      .createWeightEstimationRule({
        category:
          this.newWeightRule.category.trim() ||
          undefined,

        productType:
          this.newWeightRule.productType.trim() ||
          undefined,

        size:
          this.newWeightRule.size.trim() ||
          undefined,

        estimatedWeightKg: weight,

        // ׳›׳׳ ׳—׳“׳© ׳ ׳›׳ ׳¡ ׳›׳¨׳’׳¢ ׳‘׳¡׳•׳£ ׳¡׳“׳¨ ׳”׳¢׳“׳™׳₪׳•׳×
        priority:
          (this.weightRules.length + 1) * 10,

        isActive:
          this.newWeightRule.isActive,
      })
      .subscribe({
        next: (response) => {
          this.weightRules.push(
            response.rule,
          );

          this.isCreatingWeightRule = false;
          this.isCreatingWeightRuleSaving = false;

          this.newWeightRule = {
            category: '',
            productType: '',
            size: '',
            estimatedWeightKg: 0.1,
            isActive: true,
          };

          this.successMessage =
            '׳›׳׳ ׳”׳¢׳¨׳›׳× ׳”׳׳©׳§׳ ׳ ׳•׳¡׳£ ׳‘׳”׳¦׳׳—׳”.';

          this.cdr.detectChanges();
        },

        error: (error) => {
          console.error(
            'Failed to create weight estimation rule',
            error,
          );

          this.errorMessage =
            error.status === 409
              ? '׳›׳‘׳¨ ׳§׳™׳™׳ ׳›׳׳ ׳¢׳ ׳׳•׳×׳” ׳§׳˜׳’׳•׳¨׳™׳”, ׳¡׳•׳’ ׳׳•׳¦׳¨ ׳•׳׳™׳“׳”.'
              : '׳™׳¦׳™׳¨׳× ׳›׳׳ ׳”׳¢׳¨׳›׳× ׳”׳׳©׳§׳ ׳ ׳›׳©׳׳”.';

          this.isCreatingWeightRuleSaving = false;
          this.cdr.detectChanges();
        },
      });
  }
  loadStores(): void {
    this.isLoadingStores = true;

    this.adminApiService.getStores().subscribe({
      next: (response) => {
        this.stores = response.stores;
        this.isLoadingStores = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.errorMessage = '׳׳ ׳ ׳™׳×׳ ׳׳˜׳¢׳•׳ ׳׳× ׳¨׳©׳™׳׳× ׳”׳—׳ ׳•׳™׳•׳×';
        this.isLoadingStores = false;
        this.cdr.markForCheck();
      },
    });
  }
  loadSourcePermissions(): void {
    const storeId = this.selectedStoreId;

    this.sourcePermissions = [];
    this.sourcePriceInputs = {};
    this.sourcePermissionsError = '';

    if (!storeId) {
      return;
    }

    this.isLoadingSourcePermissions = true;

    this.adminApiService.getSourceDeliveryPermissions(storeId).subscribe({
      next: (response) => {
        // ׳׳•׳ ׳¢ ׳”׳¦׳’׳× ׳ ׳×׳•׳ ׳™׳ ׳©׳ ׳—׳ ׳•׳× ׳§׳•׳“׳׳×
        if (this.selectedStoreId !== storeId) {
          return;
        }

        this.sourcePermissions = response.permissions;

        this.sourcePriceInputs = Object.fromEntries(
          response.permissions.map((source) => [
            source.sourceId,
            source.selfDeliveryPrice == null
              ? ''
              : String(source.selfDeliveryPrice),
          ]),
        );

        this.isLoadingSourcePermissions = false;
        this.cdr.markForCheck();
      },
      error: () => {
        if (this.selectedStoreId !== storeId) {
          return;
        }

        this.sourcePermissionsError =
          '׳׳ ׳ ׳™׳×׳ ׳׳˜׳¢׳•׳ ׳׳× ׳”׳¨׳©׳׳•׳× ׳”׳׳©׳׳•׳— ׳”׳¢׳¦׳׳™';

        this.isLoadingSourcePermissions = false;
        this.cdr.markForCheck();
      },
    });
  }
  sourcePriceInputs: Record<string, string> = {};

  saveSourceDeliveryPrice(source: SourceDeliveryPermission): void {
    const storeId = this.selectedStoreId;

    if (!storeId || this.savingSourceIds.has(source.sourceId)) {
      return;
    }

    const rawPrice = this.sourcePriceInputs[source.sourceId]?.trim() ?? '';

    const price = rawPrice === '' ? null : Number(rawPrice);

    if (
      price !== null &&
      (!Number.isFinite(price) ||
        price < 0 ||
        price > 99999999.99 ||
        Math.abs(price * 100 - Math.round(price * 100)) > 0.000001)
    ) {
      this.errorMessage = 'מחיר משלוח חייב להיות מספר תקין עם עד שתי ספרות אחרי הנקודה.';
      this.cdr.markForCheck();
      return;
    }

    this.savingSourceIds.add(source.sourceId);
    this.errorMessage = '';
    this.successMessage = '';

    this.adminApiService.updateSourceDeliveryPermission(
      source.sourceId,
      {
        storeId,
        selfDeliveryAllowed: source.selfDeliveryAllowed,
        selfDeliveryPrice: price,
      },
    ).subscribe({
      next: (response) => {
        if (this.selectedStoreId === storeId) {
          source.selfDeliveryPrice = response.permission.selfDeliveryPrice;
          this.successMessage = 'מחיר המשלוח העצמי נשמר בהצלחה';
        }

        this.savingSourceIds.delete(source.sourceId);
        this.cdr.markForCheck();
      },
      error: () => {
        if (this.selectedStoreId === storeId) {
          this.errorMessage = 'שמירת מחיר המשלוח העצמי נכשלה';
        }

        this.savingSourceIds.delete(source.sourceId);
        this.cdr.markForCheck();
      },
    });
  }
  savingSourceIds = new Set<string>();

  saveSourcePermission(
    source: SourceDeliveryPermission,
    allowed: boolean,
  ): void {
    const storeId = this.selectedStoreId;

    if (!storeId || this.savingSourceIds.has(source.sourceId)) {
      return;
    }

    this.savingSourceIds.add(source.sourceId);
    this.errorMessage = '';
    this.successMessage = '';

    this.adminApiService.updateSourceDeliveryPermission(
      source.sourceId,
      {
        storeId,
        selfDeliveryAllowed: allowed,
      },
    ).subscribe({
      next: (response) => {
        if (this.selectedStoreId === storeId) {
          source.selfDeliveryAllowed =
            response.permission.selfDeliveryAllowed;

          this.successMessage = '׳”׳¨׳©׳׳× ׳”׳׳©׳׳•׳— ׳”׳¢׳¦׳׳™ ׳ ׳©׳׳¨׳” ׳‘׳”׳¦׳׳—׳”';
        }

        this.savingSourceIds.delete(source.sourceId);
        this.cdr.markForCheck();
      },
      error: () => {
        if (this.selectedStoreId === storeId) {
          this.errorMessage = '׳©׳׳™׳¨׳× ׳”׳¨׳©׳׳× ׳”׳׳©׳׳•׳— ׳”׳¢׳¦׳׳™ ׳ ׳›׳©׳׳”';
        }

        this.savingSourceIds.delete(source.sourceId);
        this.cdr.markForCheck();
      },
    });
  }
}


