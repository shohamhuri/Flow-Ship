import {
    createParamDecorator,
    ExecutionContext,
} from '@nestjs/common';

import {
    AuthenticatedRequest,
    FlowShipAuthContext,
} from './auth.types';

export const CurrentFlowShipAuth =
    createParamDecorator(
        (
            _data: unknown,
            context: ExecutionContext,
        ): FlowShipAuthContext => {
            const request =
                context
                    .switchToHttp()
                    .getRequest<AuthenticatedRequest>();

            if (!request.flowShipAuth) {
                throw new Error(
                    'FlowShip auth context is missing. Did you forget SupabaseAuthGuard?',
                );
            }

            return request.flowShipAuth;
        },
    );