import { CommonModule } from '@angular/common';
import {
    ChangeDetectorRef,
    Component,
    OnInit,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

import {
    AdminApiService,
    WeightEstimationRule,
} from '../../services/admin-api';

@Component({
    selector: 'app-weight-estimation-management',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
    ],
    templateUrl:
        './weight-estimation-management.html',
    styleUrl:
        './weight-estimation-management.scss',
})
export class WeightEstimationManagement
    implements OnInit {

    rules: WeightEstimationRule[] = [];

    isLoading = true;
    errorMessage = '';

    constructor(
        private readonly adminApiService:
            AdminApiService,
        private readonly cdr:
            ChangeDetectorRef,
    ) { }

    ngOnInit(): void {
        this.loadRules();
    }

    loadRules(): void {
        this.isLoading = true;
        this.errorMessage = '';

        this.adminApiService
            .getWeightEstimationRules()
            .subscribe({
                next: (response) => {
                    this.rules = response.rules;
                    this.isLoading = false;
                    this.cdr.detectChanges();
                },

                error: (error) => {
                    console.error(
                        'Failed to load weight estimation rules',
                        error,
                    );

                    this.errorMessage =
                        'לא הצלחנו לטעון את כללי הערכת המשקל.';

                    this.isLoading = false;
                    this.cdr.detectChanges();
                },
            });
    }
}