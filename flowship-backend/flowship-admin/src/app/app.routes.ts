import { Routes } from '@angular/router';

import { Login } from './pages/login/login';
import { AdminProvidersComponent } from './pages/admin-providers/admin-providers';
import { AdminShellComponent } from './layout/admin-shell/admin-shell';
import { AdminHomeComponent } from './pages/admin-home/admin-home';
import { DecisionCriteriaComponent } from './pages/decision-criteria/decision-criteria';
import { ProviderLogs } from './pages/provider-logs/provider-logs';
import { GroupingManagement } from './pages/grouping-management/grouping-management';
import { ShipmentsHistory } from './pages/shipments-history/shipments-history';
import { GroupPurchases } from './pages/group-purchases/group-purchases';
import { CheckoutsList } from './pages/checkouts-list/checkouts-list';
import { CheckoutDetailsComponent } from './pages/checkout-details/checkout-details';
import { authGuard } from './guards/auth-guard';

export const routes: Routes = [
    {
        path: '',
        redirectTo: 'login',
        pathMatch: 'full',
    },

    {
        path: 'login',
        component: Login,
    },

    {
        path: 'admin',
        component: AdminShellComponent,
        canActivate: [authGuard],
        children: [
            {
                path: '',
                redirectTo: 'home',
                pathMatch: 'full',
            },
            {
                path: 'home',
                component: AdminHomeComponent,
            },
            {
                path: 'providers',
                component: AdminProvidersComponent,
            },
            {
                path: 'decision-criteria',
                component: DecisionCriteriaComponent,
            },
            {
                path: 'provider-logs',
                component: ProviderLogs,
            },
            {
                path: 'grouping-management',
                component: GroupingManagement,
            },
            {
                path: 'shipments-history',
                component: ShipmentsHistory,
            },
            {
                path: 'group-purchases',
                component: GroupPurchases,
            },
            {
                path: 'checkouts',
                component: CheckoutsList,
            },
            {
                path: 'checkouts/:checkoutId',
                component: CheckoutDetailsComponent,
            },
        ],
    },

    {
        path: '**',
        redirectTo: 'login',
    },
];