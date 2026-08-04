import { Injectable } from '@angular/core';

import { SupabaseService } from './supabase';

@Injectable({
    providedIn: 'root',
})
export class AuthService {
    constructor(
        private readonly supabaseService: SupabaseService,
    ) { }

    async login(
        email: string,
        password: string,
    ): Promise<void> {
        const { error } =
            await this.supabaseService.client.auth
                .signInWithPassword({
                    email,
                    password,
                });

        if (error) {
            throw error;
        }
    }

    async logout(): Promise<void> {
        const { error } =
            await this.supabaseService.client.auth.signOut();

        if (error) {
            throw error;
        }
    }

    async getAccessToken(): Promise<string | null> {
        const { data, error } =
            await this.supabaseService.client.auth.getSession();

        if (error) {
            throw error;
        }

        return data.session?.access_token ?? null;
    }

    async isLoggedIn(): Promise<boolean> {
        const { data, error } =
            await this.supabaseService.client.auth.getUser();

        if (error) {
            return false;
        }

        return Boolean(data.user);
    }
    async getCurrentUser() {
        const { data, error } =
            await this.supabaseService.client.auth.getUser();

        if (error) {
            throw error;
        }

        return data.user;
    }

}