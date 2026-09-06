import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  CdkDragDrop,
  DragDropModule,
  moveItemInArray,
} from '@angular/cdk/drag-drop';
import { forkJoin } from 'rxjs';

import {
  AdminApiService,
  AdminProvider,
  DecisionCriterion,
  DecisionPriorityCard,
} from '../../services/admin-api';

@Component({
  selector: 'app-decision-criteria',
  standalone: true,
  imports: [CommonModule, FormsModule, DragDropModule],
  templateUrl: './decision-criteria.html',
  styleUrl: './decision-criteria.scss',
})
export class DecisionCriteriaComponent implements OnInit {
  loading = false;
  saving = false;
  errorMsg = '';
  successMsg = '';
  cardPendingDelete: DecisionPriorityCard | null = null;
  isDeleting = false;
  cards: DecisionPriorityCard[] = [];
  criteria: DecisionCriterion[] = [];
  providers: AdminProvider[] = [];

  showCreatePanel = false;

  newCard = {
    providerId: null as string | null,
    criterionKey: '',
  };

  constructor(
    private readonly adminApi: AdminApiService,
    private readonly cdr: ChangeDetectorRef,
  ) { }

  ngOnInit(): void {
    this.loadPage();
  }

  loadPage(
    clearMessages: boolean = true,
  ): void {
    this.loading = true;

    if (clearMessages) {
      this.errorMsg = '';
      this.successMsg = '';
    }

    this.cdr.detectChanges();

    forkJoin({
      cardsRes:
        this.adminApi
          .getDecisionPriorityCards(),

      criteriaRes:
        this.adminApi
          .getDecisionCriteria(),

      providersRes:
        this.adminApi
          .getProviders(),
    }).subscribe({
      next: ({
        cardsRes,
        criteriaRes,
        providersRes,
      }) => {
        this.cards =
          cardsRes.cards ?? [];

        this.criteria =
          criteriaRes.criteria ?? [];

        this.providers =
          providersRes.providers ?? [];

        this.loading = false;

        this.cdr.detectChanges();
      },

      error: (err) => {
        console.error(
          'load decision criteria page error:',
          err,
        );

        this.errorMsg =
          'שגיאה בטעינת עמוד הקריטריונים';

        this.loading = false;

        this.cdr.detectChanges();
      },
    });
  }
  drop(event: CdkDragDrop<DecisionPriorityCard[]>): void {
    if (event.previousIndex === event.currentIndex) {
      return;
    }

    moveItemInArray(this.cards, event.previousIndex, event.currentIndex);

    this.cards = this.cards.map((card, index) => ({
      ...card,
      priorityRank: index + 1,
    }));

    this.saveOrder();
  }

  saveOrder(): void {
    this.saving = true;
    this.errorMsg = '';
    this.successMsg = '';
    this.cdr.detectChanges();

    const payload = this.cards.map((card, index) => ({
      id: card.id,
      priorityRank: index + 1,
    }));

    console.log('reorder payload:', payload);

    this.adminApi.reorderDecisionPriorityCards(payload).subscribe({
      next: (res) => {
        console.log('reorder response:', res);

        this.cards = res.cards ?? this.cards;
        this.successMsg = 'הסדר נשמר בהצלחה';
      },
      error: (err) => {
        console.error('reorder error:', err);
        console.error('validation message:', err?.error?.message);

        this.errorMsg = Array.isArray(err?.error?.message)
          ? err.error.message.join(', ')
          : 'שגיאה בשמירת הסדר';

        this.saving = false;
        this.loadPage();
      },
      complete: () => {
        this.saving = false;
        this.cdr.detectChanges();
      },
    });
  }
  isDuplicateNewCard(): boolean {
    return this.cards.some((card) => {
      const sameProvider =
        (card.providerId ?? null) === (this.newCard.providerId ?? null);

      const sameCriterion =
        card.criterionKey === this.newCard.criterionKey;

      return sameProvider && sameCriterion;
    });
  }
  toggleCard(card: DecisionPriorityCard): void {
    this.adminApi
      .updateDecisionPriorityCard(card.id, {
        isActive: !card.isActive,
      })
      .subscribe({
        next: () => {
          this.loadPage();
        },
        error: (err) => {
          console.error(err);
          this.errorMsg = 'שגיאה בעדכון הקובייה';
          this.cdr.detectChanges();
        },
      });
  }

  openDeleteDialog(
    card: DecisionPriorityCard,
  ): void {
    this.cardPendingDelete = card;
  }

  closeDeleteDialog(): void {
    if (this.isDeleting) {
      return;
    }

    this.cardPendingDelete = null;
  }

  openCreatePanel(): void {
    this.showCreatePanel = true;
    this.newCard = {
      providerId: null,
      criterionKey: this.criteria[0]?.key ?? '',
    };
  }

  closeCreatePanel(): void {
    this.showCreatePanel = false;
  }

  createCard(): void {
    if (!this.newCard.criterionKey) {
      this.errorMsg = 'צריך לבחור קריטריון';
      return;
    }
    if (this.isDuplicateNewCard()) {
      this.errorMsg = 'קובייה כזאת כבר קיימת';
      return;
    }
    const criterion = this.criteria.find(
      (item) => item.key === this.newCard.criterionKey,
    );

    const provider = this.providers.find(
      (item) => item.id === this.newCard.providerId,
    );

    const providerName = provider?.name ?? 'ALL';
    const criterionLabel = criterion?.label ?? this.newCard.criterionKey;

    this.adminApi
      .createDecisionPriorityCard({
        providerId: this.newCard.providerId,
        criterionKey: this.newCard.criterionKey,
        title: `${providerName} + ${criterionLabel}`,
        isActive: true,
        config: {},
      })
      .subscribe({
        next: () => {
          this.successMsg = 'הקובייה נוצרה בהצלחה';
          this.showCreatePanel = false;
          this.loadPage();
        },
        error: (err) => {
          console.error(
            'create decision card error:',
            err,
          );

          const message =
            err?.error?.message;

          if (Array.isArray(message)) {
            this.errorMsg =
              message.join(', ');
          } else if (typeof message === 'string') {
            this.errorMsg = message;
          } else {
            this.errorMsg =
              'שגיאה בהוספת הקריטריון';
          }

          this.cdr.detectChanges();
        },
      });
  }

  getRankWeight(index: number): number {
    const activeCards = this.cards.filter((card) => card.isActive);

    const currentCard = this.cards[index];

    if (!currentCard?.isActive) {
      return 0;
    }

    const activeIndex = activeCards.findIndex(
      (card) => card.id === currentCard.id,
    );

    const total = activeCards.length;

    if (total === 0 || activeIndex === -1) {
      return 0;
    }

    const sum = (total * (total + 1)) / 2;
    const value = total - activeIndex;

    return Number((value / sum).toFixed(2));
  }

  get activeCardsCount(): number {
    return this.cards.filter((card) => card.isActive).length;
  }

  trackByCardId(index: number, card: DecisionPriorityCard): string {
    return card.id;
  }
  confirmDeleteCard(): void {
    const card = this.cardPendingDelete;

    if (!card || this.isDeleting) {
      return;
    }

    this.isDeleting = true;
    this.errorMsg = '';
    this.successMsg = '';

    this.adminApi
      .deleteDecisionPriorityCard(card.id)
      .subscribe({
        next: () => {
          // נעלים מיד מהמסך
          this.cards = this.cards.filter(
            (item) => item.id !== card.id,
          );

          this.cardPendingDelete = null;

          this.successMsg =
            'הקריטריון נמחק בהצלחה';

          this.isDeleting = false;

          this.cdr.detectChanges();

          // ואז נביא גם את המצב האמיתי מהשרת
          this.loadPage(false);
        },

        error: (err) => {
          console.error(
            'delete decision card error:',
            err,
          );

          this.errorMsg =
            'שגיאה במחיקת הקריטריון';

          this.isDeleting = false;

          this.cdr.detectChanges();
        },
      });
  }
}