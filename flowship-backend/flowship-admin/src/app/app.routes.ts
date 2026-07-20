import { Routes } from '@angular/router';
import { AdminProvidersComponent } from './pages/admin-providers/admin-providers';
import { AdminShellComponent } from './layout/admin-shell/admin-shell';
import { AdminHomeComponent } from './pages/admin-home/admin-home';
import { DecisionCriteriaComponent } from './pages/decision-criteria/decision-criteria';
import { ProviderLogs } from './pages/provider-logs/provider-logs';
import { ShipmentGrouping } from './pages/shipment-grouping/shipment-grouping';
import { ShipmentsHistory } from './pages/shipments-history/shipments-history';
import { GroupPurchases } from './pages/group-purchases/group-purchases';
export const routes: Routes = [
    {
        path: '',
        component: AdminShellComponent,
        children: [
            { path: '', redirectTo: 'admin/home', pathMatch: 'full' },

            { path: 'admin/home', component: AdminHomeComponent },
            { path: 'admin/providers', component: AdminProvidersComponent },
            { path: 'admin/decision-criteria', component: DecisionCriteriaComponent },
            { path: 'admin/provider-logs', component: ProviderLogs },
            { path: 'admin/shipment-grouping', component: ShipmentGrouping },
            { path: 'admin/shipments-history', component: ShipmentsHistory },
            { path: 'admin/group-purchases', component: GroupPurchases },
        ],
    },
];