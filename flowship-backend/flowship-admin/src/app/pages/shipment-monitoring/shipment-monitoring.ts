
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
  ActiveShipment,
  ShipmentHistoryEvent,
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
  activeShipments: ActiveShipment[] = [];
  shipmentsLoading = false;
  shipmentsError = '';
  selectedStatus: ShipmentAnomalyStatus | 'all' = 'all';
  expandedShipmentId: string | null = null;
  shipmentEvents: ShipmentHistoryEvent[] = [];
  shipmentEventsLoading = false;
  shipmentEventsError = '';
  activeTab: 'shipments' | 'anomalies' = 'shipments';

  loading = false;
  errorMessage = '';
  processingAnomalyId: string | null = null;

  ngOnInit(): void {
    this.loadAnomalies();
    this.loadActiveShipments();
  }
  changeTab(tab: 'shipments' | 'anomalies'): void {
    this.activeTab = tab;

    if (tab === 'shipments') {
      this.loadActiveShipments();
    } else {
      this.loadAnomalies();
    }
  }

  refreshCurrentTab(): void {
    if (this.activeTab === 'shipments') {
      this.loadActiveShipments();
    } else {
      this.loadAnomalies();
    }
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
  loadActiveShipments(): void {
    this.shipmentsLoading = true;
    this.shipmentsError = '';

    this.api.getActiveShipments().subscribe({
      next: (shipments) => {
        this.activeShipments = shipments;
        this.shipmentsLoading = false;
        this.cdr.detectChanges();
      },
      error: (error) => {
        console.error('Failed to load active shipments', error);
        this.shipmentsError = 'שגיאה בטעינת המשלוחים הפעילים';
        this.shipmentsLoading = false;
        this.cdr.detectChanges();
      },
    });
  }
  getShipmentStatusLabel(status: string | null): string {
    const labels: Record<string, string> = {
      created: 'נוצר',
      pending: 'ממתין',
      confirmed: 'אושר',
      preparing: 'בהכנה',
      ready_for_pickup: 'מוכן לאיסוף',
      picked_up: 'נאסף',
      in_transit: 'בדרך ליעד',
      out_for_delivery: 'יצא למסירה',
      delivered: 'נמסר',
      failed: 'נכשל',
      cancelled: 'בוטל',
      canceled: 'בוטל',
    };

    return status ? (labels[status] ?? status) : 'לא ידוע';
  }
  toggleShipmentEvents(shipmentId: string): void {
    if (this.expandedShipmentId === shipmentId) {
      this.expandedShipmentId = null;
      this.shipmentEvents = [];
      this.shipmentEventsError = '';
      this.shipmentEventsLoading = false;
      return;
    }

    this.expandedShipmentId = shipmentId;
    this.shipmentEvents = [];
    this.shipmentEventsLoading = true;
    this.shipmentEventsError = '';

    this.api.getShipmentHistoryEvents(shipmentId).subscribe({
      next: (response) => {
        if (this.expandedShipmentId !== shipmentId) {
          return;
        }

        this.shipmentEvents = response.events;
        this.shipmentEventsLoading = false;
        this.cdr.detectChanges();
      },
      error: (error) => {
        if (this.expandedShipmentId !== shipmentId) {
          return;
        }

        console.error('Failed to load shipment events', error);
        this.shipmentEventsError =
          'שגיאה בטעינת היסטוריית העדכונים';
        this.shipmentEventsLoading = false;
        this.cdr.detectChanges();
      },
    });
  }
}
