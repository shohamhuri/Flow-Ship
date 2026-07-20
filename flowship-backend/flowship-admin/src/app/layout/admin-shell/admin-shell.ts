import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

type MenuItem = {
  label: string;
  subtitle: string;
  route: string;
  icon: string;
};

@Component({
  selector: 'app-admin-shell',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './admin-shell.html',
  styleUrl: './admin-shell.scss',
})
export class AdminShellComponent {
  menuItems: MenuItem[] = [
    {
      label: 'דף בית',
      subtitle: 'סקירה כללית',
      route: '/admin/home',
      icon: '⌂',
    },
    {
      label: 'חיבור לחברת שליחויות',
      subtitle: 'ניהול ספקים וחיבורים',
      route: '/admin/providers',
      icon: '🚚',
    },
    {
      label: 'ניהול קריטריונים',
      subtitle: 'משקלים והעדפות החלטה',
      route: '/admin/decision-criteria',
      icon: '◫',
    },
    {
      label: 'הצגת לוגים',
      subtitle: 'חיפושים, סינונים וקריאות',
      route: '/admin/provider-logs',
      icon: '📝',
    },
    {
      label: 'ניהול קיבוץ משלוחים',
      subtitle: 'Grouping Engine',
      route: '/admin/shipment-grouping',
      icon: '⧉',
    },
    {
      label: 'היסטוריית משלוחים',
      subtitle: 'משלוחים, סטטוסים וסינונים',
      route: '/admin/shipments-history',
      icon: '📦',
    },
    {
      label: 'רכישות קבוצתיות',
      subtitle: 'Shared / Group Buying',
      route: '/admin/group-purchases',
      icon: '👥',
    },
  ];
}