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
}