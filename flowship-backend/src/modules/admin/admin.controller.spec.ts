
import { ForbiddenException } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { DeliverySettingsService } from
    '../planning/delivery-settings.service';
import type { FlowShipAuthContext } from
    '../auth/auth.types';

describe('AdminController - source delivery permissions', () => {
    const tenant = {
        id: 'tenant-1',
        name: 'QUEEN',
        schemaName: 'queen',
        status: 'active',
        timezone: 'Asia/Jerusalem',
    };

    const createAuth = (role: string): FlowShipAuthContext => ({
        user: {
            id: 'user-1',
            email: 'test@example.com',
            displayName: 'Test User',
            role,
        },
        tenant,
    });

    const adminServiceMock = {
        getSourceDeliveryPermissions: jest.fn(),
        updateSourceDeliveryPermission: jest.fn(),
    };

    const controller = new AdminController(
        adminServiceMock as unknown as AdminService,
        {} as DeliverySettingsService,
    );

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('allows admin to read permissions', async () => {
        adminServiceMock.getSourceDeliveryPermissions
            .mockResolvedValue([]);

        await expect(
            controller.getSourceDeliveryPermissions(
                createAuth('admin'),
                'store-1',
            ),
        ).resolves.toEqual({
            ok: true,
            permissions: [],
        });

        expect(
            adminServiceMock.getSourceDeliveryPermissions,
        ).toHaveBeenCalledWith(tenant, 'store-1');
    });

    it('rejects non-admin reading permissions', async () => {
        await expect(
            controller.getSourceDeliveryPermissions(
                createAuth('viewer'),
                'store-1',
            ),
        ).rejects.toThrow(ForbiddenException);

        expect(
            adminServiceMock.getSourceDeliveryPermissions,
        ).not.toHaveBeenCalled();
    });

    it('allows admin to update permissions', async () => {
        const permission = {
            storeId: 'store-1',
            sourceId: 'WAREHOUSE-SOUTH',
            selfDeliveryAllowed: true,
            selfDeliveryPrice: null,
        };

        adminServiceMock.updateSourceDeliveryPermission
            .mockResolvedValue(permission);

        await expect(
            controller.updateSourceDeliveryPermission(
                createAuth('admin'),
                'WAREHOUSE-SOUTH',
                {
                    storeId: 'store-1',
                    selfDeliveryAllowed: true,
                },
            ),
        ).resolves.toEqual({
            ok: true,
            permission,
        });

        expect(
            adminServiceMock.updateSourceDeliveryPermission,
        ).toHaveBeenCalledWith(
            tenant,
            'store-1',
            'WAREHOUSE-SOUTH',
            true,
            undefined,
        );
    });

    it('rejects non-admin updating permissions', async () => {
        await expect(
            controller.updateSourceDeliveryPermission(
                createAuth('viewer'),
                'WAREHOUSE-SOUTH',
                {
                    storeId: 'store-1',
                    selfDeliveryAllowed: true,
                },
            ),
        ).rejects.toThrow(ForbiddenException);

        expect(
            adminServiceMock.updateSourceDeliveryPermission,
        ).not.toHaveBeenCalled();
    });
});
