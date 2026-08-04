import { CommonModule } from '@angular/common';
import {
  ChangeDetectorRef,
  Component,
  OnInit,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

import {
  AdminApiService,
  GroupingStrategy,
  GroupingStrategyKey,
} from '../../services/admin-api';

@Component({
  selector: 'app-grouping-management',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
  ],
  templateUrl: './grouping-management.html',
  styleUrl: './grouping-management.scss',
})
export class GroupingManagement implements OnInit {
  strategies: GroupingStrategy[] = [];

  isLoading = true;
  isSaving = false;

  errorMessage = '';
  successMessage = '';

  editingStrategyId: string | null = null;
  draggedStrategyId: string | null = null;
  dragOverStrategyId: string | null = null;

  isReordering = false;
  constructor(
    private readonly adminApiService: AdminApiService,
    private readonly cdr: ChangeDetectorRef,
  ) { }

  ngOnInit(): void {
    this.loadStrategies();
  }

  loadStrategies(): void {
    this.isLoading = true;
    this.errorMessage = '';
    this.successMessage = '';

    this.adminApiService
      .getGroupingStrategies()
      .subscribe({
        next: (response) => {
          this.strategies = [
            ...response.strategies,
          ].sort(
            (first, second) =>
              first.executionOrder -
              second.executionOrder,
          );

          this.isLoading = false;
          this.cdr.detectChanges();
        },

        error: (error) => {
          console.error(
            'Failed to load grouping strategies',
            error,
          );

          this.errorMessage =
            'לא הצלחנו לטעון את הגדרות קיבוץ המשלוחים.';

          this.isLoading = false;
          this.cdr.detectChanges();
        },
      });
  }

  startEditing(
    strategy: GroupingStrategy,
  ): void {
    this.editingStrategyId = strategy.id;
    this.errorMessage = '';
    this.successMessage = '';
  }

  cancelEditing(): void {
    this.editingStrategyId = null;
    this.loadStrategies();
  }

  toggleStrategy(
    strategy: GroupingStrategy,
    event: Event,
  ): void {
    const input =
      event.target as HTMLInputElement;

    const previousValue =
      strategy.isEnabled;

    const newValue =
      input.checked;

    this.errorMessage = '';
    this.successMessage = '';

    /*
     * עדכון מיידי במסך:
     * גם הסליידר וגם הכיתוב משתנים יחד.
     */
    strategy.isEnabled = newValue;
    this.cdr.detectChanges();

    this.adminApiService
      .updateGroupingStrategy(
        strategy.id,
        {
          isEnabled: newValue,
        },
      )
      .subscribe({
        next: (response) => {
          this.replaceStrategy(
            response.strategy,
          );

          this.successMessage =
            response.strategy.isEnabled
              ? 'האסטרטגיה הופעלה בהצלחה.'
              : 'האסטרטגיה כובתה בהצלחה.';

          this.cdr.detectChanges();
        },

        error: (error) => {
          console.error(
            'Failed to toggle strategy',
            error,
          );

          /*
           * אם העדכון נכשל,
           * מחזירים את המצב הקודם.
           */
          strategy.isEnabled =
            previousValue;

          input.checked =
            previousValue;

          this.errorMessage =
            'לא הצלחנו לעדכן את מצב האסטרטגיה.';

          this.cdr.detectChanges();
        },
      });
  }
  saveStrategy(
    strategy: GroupingStrategy,
  ): void {
    const config = this.buildConfig(
      strategy,
    );

    if (!config) {
      return;
    }

    this.isSaving = true;
    this.errorMessage = '';
    this.successMessage = '';

    this.adminApiService
      .updateGroupingStrategy(
        strategy.id,
        {
          isEnabled:
            strategy.isEnabled,

          conflictPriority:
            Number(strategy.conflictPriority),

          config,
        },
      )
      .subscribe({
        next: (response) => {
          this.replaceStrategy(
            response.strategy,
          );

          this.editingStrategyId = null;
          this.isSaving = false;

          this.successMessage =
            'הגדרות האסטרטגיה נשמרו בהצלחה.';

          this.cdr.detectChanges();
        },

        error: (error) => {
          console.error(
            'Failed to save grouping strategy',
            error,
          );

          this.errorMessage =
            'לא הצלחנו לשמור את הגדרות האסטרטגיה.';

          this.isSaving = false;
          this.cdr.detectChanges();
        },
      });
  }

  get activeStrategiesCount(): number {
    return this.strategies.filter(
      (strategy) => strategy.isEnabled,
    ).length;
  }

  get maxWeightStrategy():
    GroupingStrategy | undefined {
    return this.strategies.find(
      (strategy) =>
        strategy.strategyKey ===
        'split_by_max_weight',
    );
  }

  get maxItemsStrategy():
    GroupingStrategy | undefined {
    return this.strategies.find(
      (strategy) =>
        strategy.strategyKey ===
        'split_by_max_items',
    );
  }

  get sourceStrategy():
    GroupingStrategy | undefined {
    return this.strategies.find(
      (strategy) =>
        strategy.strategyKey ===
        'group_by_source',
    );
  }

  getStrategyTitle(
    strategyKey: GroupingStrategyKey,
  ): string {
    switch (strategyKey) {
      case 'group_by_source':
        return 'קיבוץ לפי מקור אספקה';

      case 'split_by_max_weight':
        return 'פיצול לפי משקל מרבי';

      case 'split_by_max_items':
        return 'פיצול לפי כמות פריטים';
    }
  }

  getStrategyDescription(
    strategyKey: GroupingStrategyKey,
  ): string {
    switch (strategyKey) {
      case 'group_by_source':
        return 'פריטים ממחסנים או סניפים שונים מופרדים לקבוצות משלוח שונות.';

      case 'split_by_max_weight':
        return 'כאשר הקבוצה עוברת את המשקל המרבי, היא מפוצלת לקבוצות קטנות יותר.';

      case 'split_by_max_items':
        return 'כאשר הקבוצה מכילה יותר מדי פריטים, היא מפוצלת לקבוצות נוספות.';
    }
  }

  getStrategyEffect(
    strategy: GroupingStrategy,
  ): string {
    switch (strategy.strategyKey) {
      case 'group_by_source':
        return strategy.isEnabled
          ? 'מקורות אספקה שונים יופרדו'
          : 'ניתן לאחד מקורות אספקה שונים';

      case 'split_by_max_weight':
        return `עד ${strategy.config.maxWeightKg ?? '—'
          } ק״ג לקבוצה`;

      case 'split_by_max_items':
        return `עד ${strategy.config.maxItems ?? '—'
          } פריטים לקבוצה`;
    }
  }

  setMaxWeight(
    strategy: GroupingStrategy,
    value: string | number,
  ): void {
    strategy.config = {
      ...strategy.config,
      maxWeightKg: Number(value),
    };
  }

  setMaxItems(
    strategy: GroupingStrategy,
    value: string | number,
  ): void {
    strategy.config = {
      ...strategy.config,
      maxItems: Number(value),
    };
  }

  trackStrategy(
    _index: number,
    strategy: GroupingStrategy,
  ): string {
    return strategy.id;
  }

  private buildConfig(
    strategy: GroupingStrategy,
  ): Record<string, unknown> | null {
    if (
      strategy.strategyKey ===
      'group_by_source'
    ) {
      return {};
    }

    if (
      strategy.strategyKey ===
      'split_by_max_weight'
    ) {
      const maxWeightKg = Number(
        strategy.config.maxWeightKg,
      );

      if (
        !Number.isFinite(maxWeightKg) ||
        maxWeightKg <= 0
      ) {
        this.errorMessage =
          'המשקל המרבי חייב להיות גדול מאפס.';

        return null;
      }

      return {
        maxWeightKg,
      };
    }

    const maxItems = Number(
      strategy.config.maxItems,
    );

    if (
      !Number.isInteger(maxItems) ||
      maxItems <= 0
    ) {
      this.errorMessage =
        'כמות הפריטים המרבית חייבת להיות מספר שלם הגדול מאפס.';

      return null;
    }

    return {
      maxItems,
    };
  }

  private replaceStrategy(
    updatedStrategy: GroupingStrategy,
  ): void {
    this.strategies = this.strategies
      .map((strategy) =>
        strategy.id === updatedStrategy.id
          ? updatedStrategy
          : strategy,
      )
      .sort(
        (first, second) =>
          first.executionOrder -
          second.executionOrder,
      );
  }
  getEstimatedInfluence(index: number): number {
    const total = this.strategies.length;

    if (total === 0) {
      return 0;
    }

    const strategyWeight = total - index;

    const totalWeight =
      (total * (total + 1)) / 2;

    return Math.round(
      (strategyWeight / totalWeight) * 100,
    );
  }
  onDragStart(
    event: DragEvent,
    strategyId: string,
  ): void {
    this.draggedStrategyId = strategyId;

    event.dataTransfer?.setData(
      'text/plain',
      strategyId,
    );

    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
    }
  }

  onDragOver(
    event: DragEvent,
    strategyId: string,
  ): void {
    event.preventDefault();

    this.dragOverStrategyId = strategyId;

    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
  }

  onDragLeave(strategyId: string): void {
    if (
      this.dragOverStrategyId === strategyId
    ) {
      this.dragOverStrategyId = null;
    }
  }

  onDrop(
    event: DragEvent,
    targetStrategyId: string,
  ): void {
    event.preventDefault();

    const sourceStrategyId =
      this.draggedStrategyId ??
      event.dataTransfer?.getData(
        'text/plain',
      );

    this.draggedStrategyId = null;
    this.dragOverStrategyId = null;

    if (
      !sourceStrategyId ||
      sourceStrategyId === targetStrategyId
    ) {
      return;
    }

    const sourceIndex =
      this.strategies.findIndex(
        (strategy) =>
          strategy.id === sourceStrategyId,
      );

    const targetIndex =
      this.strategies.findIndex(
        (strategy) =>
          strategy.id === targetStrategyId,
      );

    if (
      sourceIndex < 0 ||
      targetIndex < 0
    ) {
      return;
    }

    const reordered = [
      ...this.strategies,
    ];

    const [movedStrategy] =
      reordered.splice(sourceIndex, 1);

    reordered.splice(
      targetIndex,
      0,
      movedStrategy,
    );

    this.applyOrderAndPriority(reordered);
    this.persistStrategyOrder();
  }

  onDragEnd(): void {
    this.draggedStrategyId = null;
    this.dragOverStrategyId = null;
  }
  moveStrategy(
    strategyId: string,
    direction: 'up' | 'down',
  ): void {
    const currentIndex =
      this.strategies.findIndex(
        (strategy) =>
          strategy.id === strategyId,
      );

    if (currentIndex < 0) {
      return;
    }

    const targetIndex =
      direction === 'up'
        ? currentIndex - 1
        : currentIndex + 1;

    if (
      targetIndex < 0 ||
      targetIndex >= this.strategies.length
    ) {
      return;
    }

    const reordered = [
      ...this.strategies,
    ];

    [
      reordered[currentIndex],
      reordered[targetIndex],
    ] = [
        reordered[targetIndex],
        reordered[currentIndex],
      ];

    this.applyOrderAndPriority(reordered);
    this.persistStrategyOrder();
  }
  private applyOrderAndPriority(
    strategies: GroupingStrategy[],
  ): void {
    const total = strategies.length;

    this.strategies = strategies.map(
      (strategy, index) => ({
        ...strategy,

        executionOrder: index + 1,

        conflictPriority:
          total - index,
      }),
    );
  }
  private persistStrategyOrder(): void {
    this.isReordering = true;
    this.errorMessage = '';
    this.successMessage = '';

    const items = this.strategies.map(
      (strategy) => ({
        id: strategy.id,
        executionOrder:
          strategy.executionOrder,
        conflictPriority:
          strategy.conflictPriority,
      }),
    );

    this.adminApiService
      .reorderGroupingStrategies(items)
      .subscribe({
        next: (response) => {
          this.strategies = [
            ...response.strategies,
          ].sort(
            (first, second) =>
              first.executionOrder -
              second.executionOrder,
          );

          this.isReordering = false;

          this.successMessage =
            'סדר העדיפויות נשמר בהצלחה.';

          this.cdr.detectChanges();
        },

        error: (error) => {
          console.error(
            'Failed to reorder grouping strategies',
            error,
          );

          this.errorMessage =
            'לא הצלחנו לשמור את סדר העדיפויות.';

          this.isReordering = false;

          this.loadStrategies();
        },
      });
  }
}