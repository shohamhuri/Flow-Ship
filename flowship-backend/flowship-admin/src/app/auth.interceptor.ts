import {
    HttpInterceptorFn,
} from '@angular/common/http';

import { inject } from '@angular/core';

import {
    from,
    switchMap,
} from 'rxjs';

import { AuthService } from './services/auth';

export const authInterceptor: HttpInterceptorFn =
    (request, next) => {
        const authService = inject(AuthService);

        return from(
            authService.getAccessToken(),
        ).pipe(
            switchMap((token) => {
                if (!token) {
                    return next(request);
                }

                return next(
                    request.clone({
                        setHeaders: {
                            Authorization:
                                `Bearer ${token}`,
                        },
                    }),
                );
            }),
        );
    };