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
  WeightEstimationRule,
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
  isLoading = true;
  isSaving = false;

  errorMessage = '';
  successMessage = '';
  activeTab: 'delivery' | 'weight' = 'delivery';
  weightRules: WeightEstimationRule[] = [];
  isLoadingWeightRules = false;
  weightRulesLoaded = false;
  isCreatingWeightRuleSaving = false;
  setActiveTab(
    tab: 'delivery' | 'weight',
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

        this.isLoading = false;
        this.cdr.detectChanges();
      },

      error: () => {
        this.errorMessage =
          'לא ניתן לטעון את הגדרות החנות.';

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
        'יש להזין מספר דקות שלם וגדול מאפס.';
      return;
    }
    if (
      sameDayMinutes === null ||
      !Number.isSafeInteger(sameDayMinutes) ||
      sameDayMinutes <= 0
    ) {
      this.errorMessage =
        'יש להזין זמן תקין למשלוח מהיום להיום.';
      return;
    }
    this.isSaving = true;

    this.adminApiService.updateStoreSettings({
      expressMaxMinutes: minutes,
      sameDayMaxMinutes: sameDayMinutes,
    }).subscribe({
      next: (response) => {
        this.expressMaxMinutes =
          response.settings.expressMaxMinutes;
        this.sameDayMaxMinutes =
          response.settings.sameDayMaxMinutes;

        this.successMessage =
          'הגדרות החנות נשמרו בהצלחה.';

        this.isSaving = false;
        this.cdr.detectChanges();
      },

      error: () => {
        this.errorMessage =
          'שמירת הגדרות החנות נכשלה.';

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
            'לא ניתן לטעון את כללי הערכת המשקל.';

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

    // מחזירים את הערכים מהשרת
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
        'המשקל המשוער חייב להיות גדול מאפס.';
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
            'כלל הערכת המשקל נשמר בהצלחה.';

          this.cdr.detectChanges();
        },

        error: (error) => {
          console.error(
            'Failed to update weight estimation rule',
            error,
          );
          this.errorMessage =
            error.status === 409
              ? 'כבר קיים כלל עם אותה קטגוריה, סוג מוצר ומידה.'
              : 'שמירת כלל הערכת המשקל נכשלה.';
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
        'המשקל המשוער חייב להיות גדול מאפס.';
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

        // כלל חדש נכנס כרגע בסוף סדר העדיפות
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
            'כלל הערכת המשקל נוסף בהצלחה.';

          this.cdr.detectChanges();
        },

        error: (error) => {
          console.error(
            'Failed to create weight estimation rule',
            error,
          );

          this.errorMessage =
            error.status === 409
              ? 'כבר קיים כלל עם אותה קטגוריה, סוג מוצר ומידה.'
              : 'יצירת כלל הערכת המשקל נכשלה.';

          this.isCreatingWeightRuleSaving = false;
          this.cdr.detectChanges();
        },
      });
  }
}