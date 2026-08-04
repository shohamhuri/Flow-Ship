import { Request } from 'express';

import { CurrentTenant } from '../tenants/tenants.service';

export interface AuthenticatedFlowShipUser {
    id: string;
    email: string | null;
    displayName: string | null;
    role: string;
}

export interface FlowShipAuthContext {
    user: AuthenticatedFlowShipUser;
    tenant: CurrentTenant;
}

export interface AuthenticatedRequest extends Request {
    flowShipAuth?: FlowShipAuthContext;
}