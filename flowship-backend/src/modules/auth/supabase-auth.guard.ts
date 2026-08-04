import {
    CanActivate,
    ExecutionContext,
    Injectable,
    UnauthorizedException,
} from '@nestjs/common';

import { AuthService } from './auth.service';
import { AuthenticatedRequest } from './auth.types';

@Injectable()
export class SupabaseAuthGuard
    implements CanActivate {

    constructor(
        private readonly authService: AuthService,
    ) { }

    async canActivate(
        context: ExecutionContext,
    ): Promise<boolean> {
        const request =
            context
                .switchToHttp()
                .getRequest<AuthenticatedRequest>();

        const authorizationHeader =
            request.headers.authorization;

        const accessToken =
            this.extractBearerToken(
                authorizationHeader,
            );

        request.flowShipAuth =
            await this.authService
                .authenticateAccessToken(
                    accessToken,
                );

        return true;
    }

    private extractBearerToken(
        authorizationHeader:
            string | undefined,
    ): string {
        if (!authorizationHeader) {
            throw new UnauthorizedException(
                'Authorization header is missing',
            );
        }

        const [
            scheme,
            token,
        ] = authorizationHeader.split(' ');

        if (
            scheme?.toLowerCase() !== 'bearer' ||
            !token
        ) {
            throw new UnauthorizedException(
                'Authorization header must use Bearer token',
            );
        }

        return token;
    }
}