import { CommonModule } from '@angular/common';
import {
  ChangeDetectorRef,
  Component,
  OnInit,
} from '@angular/core';
import {
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';
import {
  LucideAngularModule,
  Home,
  Truck,
  SlidersHorizontal,
  FileText,
  Copy,
  Compass,
  Package,
  Users,
  LucideIconData,
} from 'lucide-angular';
import { AuthService } from '../../services/auth';
import { AdminApiService } from '../../services/admin-api';

type MenuItem = {
  label: string;
  subtitle: string;
  route: string;
  icon: LucideIconData;
};
@Component({
  selector: 'app-admin-shell',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    LucideAngularModule,
  ],
  templateUrl: './admin-shell.html',
  styleUrl: './admin-shell.scss',
})
export class AdminShellComponent implements OnInit {
  userEmail = '';
  userDisplayName = 'משתמש FlowShip';
  tenantName = 'FLOW_SHIP_TEST';

  isUserMenuOpen = false;
  isLoggingOut = false;

  menuItems: MenuItem[] = [
    {
      label: 'דף בית',
      subtitle: 'סקירה כללית',
      route: '/admin/home',
      icon: Home,
    },
    {
      label: 'חיבור לחברת שליחויות',
      subtitle: 'ניהול ספקים וחיבורים',
      route: '/admin/providers',
      icon: Truck,
    },
    {
      label: 'ניהול קריטריונים',
      subtitle: 'משקלים והעדפות החלטה',
      route: '/admin/decision-criteria',
      icon: SlidersHorizontal,
    },
    {
      label: 'הצגת לוגים',
      subtitle: 'חיפושים, סינונים וקריאות',
      route: '/admin/provider-logs',
      icon: FileText,
    },
    {
      label: 'ניהול קיבוץ משלוחים',
      subtitle: 'Grouping Engine',
      route: '/admin/grouping-management',
      icon: Copy,
    },
    {
      label: 'תהליכי Checkout',
      subtitle: 'הזמנות, תוכניות ותוצאות',
      route: '/admin/checkouts',
      icon: Compass,
    },
    {
      label: 'היסטוריית משלוחים',
      subtitle: 'משלוחים, סטטוסים וסינונים',
      route: '/admin/shipments-history',
      icon: Package,
    },
    {
      label: 'רכישות קבוצתיות',
      subtitle: 'Shared / Group Buying',
      route: '/admin/group-purchases',
      icon: Users,
    },
  ];

  constructor(
    private readonly authService: AuthService,
    private readonly router: Router,
    private readonly cdr: ChangeDetectorRef,
    private readonly adminApiService: AdminApiService,
  ) { }

  ngOnInit(): void {
    this.adminApiService.getMe().subscribe({
      next: (response) => {
        this.userEmail =
          response.user.email ?? '';

        this.userDisplayName =
          response.user.displayName ??
          response.user.email?.split('@')[0] ??
          'משתמש FlowShip';

        this.tenantName =
          response.tenant.name;

        this.cdr.detectChanges();
      },

      error: (error) => {
        console.error(
          'Failed to load authenticated user',
          error,
        );

        void this.router.navigate(['/login']);
      },
    });
  }

  toggleUserMenu(): void {
    this.isUserMenuOpen =
      !this.isUserMenuOpen;
  }

  closeUserMenu(): void {
    this.isUserMenuOpen = false;
  }

  async logout(): Promise<void> {
    if (this.isLoggingOut) {
      return;
    }

    this.isLoggingOut = true;

    try {
      await this.authService.logout();

      await this.router.navigate([
        '/login',
      ]);
    } finally {
      this.isLoggingOut = false;
      this.cdr.detectChanges();
    }
  }

  get userInitial(): string {
    const value =
      this.userDisplayName ||
      this.userEmail ||
      'F';

    return value
      .trim()
      .charAt(0)
      .toUpperCase();
  }
}