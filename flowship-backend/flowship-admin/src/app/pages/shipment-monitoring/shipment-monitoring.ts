
import {
  ChangeDetectorRef,
  Component,
  OnInit,
  inject,
} from '@angular/core'; import { CommonModule } from '@angular/common';

import {
  AdminApiService,
  ShipmentMonitoringAnomaly,
  ShipmentAnomalyStatus,
} from '../../services/admin-api';

@Component({
  selector: 'app-shipment-monitoring',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './shipment-monitoring.html',
  styleUrl: './shipment-monitoring.scss',
})
export class ShipmentMonitoring implements OnInit {
  private readonly api = inject(AdminApiService);
  private readonly cdr = inject(ChangeDetectorRef);
  anomalies: ShipmentMonitoringAnomaly[] = [];
  allAnomalies: ShipmentMonitoringAnomaly[] = [];
  selectedStatus: ShipmentAnomalyStatus | 'all' = 'all';

  loading = false;
  errorMessage = '';
  processingAnomalyId: string | null = null;

  ngOnInit(): void {
    this.loadAnomalies();
  }
  loadAnomalies(): void {
    this.loading = true;
    this.errorMessage = '';
    this.cdr.detectChanges();

    this.api.getShipmentMonitoringAnomalies().subscribe({
      next: (anomalies) => {
        this.allAnomalies = anomalies;
        this.applyFilter();
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.errorMessage = 'שגיאה בטעינת חריגות המשלוחים';
        this.loading = false;
        this.cdr.detectChanges();
      },
    });
  }

  changeStatus(status: ShipmentAnomalyStatus | 'all'): void {
    this.selectedStatus = status;
    this.applyFilter();
  }

  private applyFilter(): void {
    this.anomalies =
      this.selectedStatus === 'all'
        ? [...this.allAnomalies]
        : this.allAnomalies.filter(
          anomaly => anomaly.status === this.selectedStatus
        );
  }
  acknowledge(anomaly: ShipmentMonitoringAnomaly): void {
    if (anomaly.status !== 'open' || this.processingAnomalyId) {
      return;
    }

    this.processingAnomalyId = anomaly.id;
    this.errorMessage = '';
    this.cdr.detectChanges();

    this.api.acknowledgeShipmentMonitoringAnomaly(anomaly.id)
      .subscribe({
        next: () => {
          this.processingAnomalyId = null;
          this.loadAnomalies();
        },
        error: () => {
          this.processingAnomalyId = null;
          this.errorMessage = 'לא ניתן לסמן את החריגה כבטיפול';
          this.cdr.detectChanges();
        },
      });
  }

  get openCount(): number {
    return this.allAnomalies.filter(
      a => a.status === 'open'
    ).length;
  }

  get acknowledgedCount(): number {
    return this.allAnomalies.filter(
      a => a.status === 'acknowledged'
    ).length;
  }

  get resolvedCount(): number {
    return this.allAnomalies.filter(
      a => a.status === 'resolved'
    ).length;
  }
}
