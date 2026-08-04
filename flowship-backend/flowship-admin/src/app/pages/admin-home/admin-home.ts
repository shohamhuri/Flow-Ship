import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

type PortalCard = {
  title: string;
  description: string;
  route: string;
  badge: string;
};

@Component({
  selector: 'app-admin-home',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './admin-home.html',
  styleUrl: './admin-home.scss',
})
export class AdminHomeComponent {
  cards: PortalCard[] = [
    {
      title: 'חיבור לחברת שליחויות',
      description: 'ניהול ספקים, הפעלה/כיבוי, חיבורי Adapter והעדפות ספק.',
      route: '/admin/providers',
      badge: 'Providers',
    },
    {
      title: 'ניהול קריטריונים',
      description: 'שליטה במשקלים, קריטריונים פעילים והעדפות מנוע ההחלטות.',
      route: '/admin/decision-criteria',
      badge: 'Decision Engine',
    },
    {
      title: 'הצגת לוגים',
      description: 'לוגים לפי חברה, סינונים, חיפושים וניתוח קריאות לספקים.',
      route: '/admin/provider-logs',
      badge: 'Logs',
    },
    {
      title: 'ניהול קיבוץ משלוחים',
      description: 'ניהול Grouping Engine ופיצול / קיבוץ של משלוחים.',
      route: '/admin/grouping-management',
      badge: 'Grouping',
    },
    {
      title: 'היסטוריית משלוחים',
      description: 'צפייה במשלוחים, סטטוסים, פילטרים ותיעוד היסטורי.',
      route: '/admin/shipments-history',
      badge: 'Shipments',
    },
    {
      title: 'רכישות קבוצתיות',
      description: 'ניהול קבוצות, משתתפים, חלוקה, קודים וסטטוסים.',
      route: '/admin/group-purchases',
      badge: 'Shared Buying',
    },
  ];
}