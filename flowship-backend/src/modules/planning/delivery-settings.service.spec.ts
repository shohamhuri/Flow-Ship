import { InternalServerErrorException } from '@nestjs/common';
import { DeliverySettingsService } from './delivery-settings.service';
import { DbService } from '../../infrastructure/database/db.service';
import { CurrentTenant } from '../tenants/tenants.service';

describe('DeliverySettingsService', () => {
    let service: DeliverySettingsService;

    const dbMock = {
        queryOne: jest.fn(),
    };

    const tenant = {
        schemaName: 'queen',
    } as CurrentTenant;

    beforeEach(() => {
        jest.clearAllMocks();

        service = new DeliverySettingsService(
            dbMock as unknown as DbService,
        );
    });


    it('should return the tenant delivery settings', async () => {
        dbMock.queryOne.mockResolvedValue({
            express_max_minutes: 120,
            same_day_max_minutes: 1440,
            pickup_lead_time_minutes: 0,
            status_update_timeout_minutes: 60,
            express_cutoff_time: null,
            express_after_cutoff_mode: 'extended',
            express_after_cutoff_max_minutes: null,
        });

        const result = await service.getSettings(tenant);

        expect(result).toEqual({
            expressMaxMinutes: 120,
            sameDayMaxMinutes: 1440,
            expressCutoffTime: null,
            expressAfterCutoffMode: 'extended',
            expressAfterCutoffMaxMinutes: null,
            pickupLeadTimeMinutes: 0,
            statusUpdateTimeoutMinutes: 60,
        });

        expect(dbMock.queryOne).toHaveBeenCalledWith(
            expect.stringContaining(
                'FROM "queen".delivery_settings',
            ),
            [1],
        );
    });


    it('should return express cutoff and extended window settings', async () => {
        dbMock.queryOne.mockResolvedValue({
            express_max_minutes: 180,
            same_day_max_minutes: 1440,
            express_cutoff_time: '12:00:00',
            express_after_cutoff_mode: 'extended',
            express_after_cutoff_max_minutes: 300,
            pickup_lead_time_minutes: 20,
            status_update_timeout_minutes: 60,
        });

        const result = await service.getSettings(tenant);

        expect(result).toEqual({
            expressMaxMinutes: 180,
            sameDayMaxMinutes: 1440,
            expressCutoffTime: '12:00:00',
            expressAfterCutoffMode: 'extended',
            expressAfterCutoffMaxMinutes: 300,
            pickupLeadTimeMinutes: 20,
            statusUpdateTimeoutMinutes: 60,
        });
    });


    it('should support disabling express after cutoff', async () => {
        dbMock.queryOne.mockResolvedValue({
            express_max_minutes: 180,
            same_day_max_minutes: 1440,
            express_cutoff_time: '12:00:00',
            express_after_cutoff_mode: 'disabled',
            express_after_cutoff_max_minutes: null,
            pickup_lead_time_minutes: 0,
            status_update_timeout_minutes: 60,
        });

        const result = await service.getSettings(tenant);

        expect(result.expressCutoffTime).toBe('12:00:00');
        expect(result.expressAfterCutoffMode).toBe('disabled');
        expect(result.expressAfterCutoffMaxMinutes).toBeNull();
    });


    const validSettingsRow = () => ({
        express_max_minutes: 180,
        same_day_max_minutes: 1440,
        express_cutoff_time: null,
        express_after_cutoff_mode: 'extended',
        express_after_cutoff_max_minutes: null,
        pickup_lead_time_minutes: 0,
        status_update_timeout_minutes: 60,
    });

    it('should update the status timeout to 90 minutes', async () => {
        dbMock.queryOne
            .mockResolvedValueOnce(validSettingsRow())
            .mockResolvedValueOnce({
                ...validSettingsRow(),
                status_update_timeout_minutes: 90,
            });

        const result = await service.updateSettings(tenant, {
            expressMaxMinutes: 180,
            statusUpdateTimeoutMinutes: 90,
        });

        expect(result.statusUpdateTimeoutMinutes).toBe(90);
        expect(dbMock.queryOne).toHaveBeenNthCalledWith(
            2,
            expect.stringContaining('status_update_timeout_minutes = $7'),
            [180, 1440, null, 'extended', null, 0, 90, 1],
        );
    });

    it('should preserve the status timeout when omitted', async () => {
        dbMock.queryOne
            .mockResolvedValueOnce(validSettingsRow())
            .mockResolvedValueOnce(validSettingsRow());

        const result = await service.updateSettings(tenant, {
            expressMaxMinutes: 180,
        });

        expect(result.statusUpdateTimeoutMinutes).toBe(60);
        expect(dbMock.queryOne).toHaveBeenNthCalledWith(
            2,
            expect.any(String),
            [180, 1440, null, 'extended', null, 0, 60, 1],
        );
    });

    it.each([0, -1, 1.5])(
        'should reject invalid status timeout %s',
        async (value) => {
            dbMock.queryOne.mockResolvedValueOnce(validSettingsRow());

            await expect(
                service.updateSettings(tenant, {
                    expressMaxMinutes: 180,
                    statusUpdateTimeoutMinutes: value,
                }),
            ).rejects.toThrow(
                'statusUpdateTimeoutMinutes must be a positive integer',
            );

            expect(dbMock.queryOne).toHaveBeenCalledTimes(1);
        },
    );

    it('should reject missing tenant settings', async () => {
        dbMock.queryOne.mockResolvedValue(null);

        await expect(
            service.getSettings(tenant),
        ).rejects.toThrow(InternalServerErrorException);
    });

    it('should reject an invalid tenant schema', async () => {
        const invalidTenant = {
            schemaName: 'queen; DROP TABLE users',
        } as CurrentTenant;

        await expect(
            service.getSettings(invalidTenant),
        ).rejects.toThrow(
            'Invalid tenant schema name',
        );

        expect(dbMock.queryOne).not.toHaveBeenCalled();
    });

    it('should reject an invalid express time limit', async () => {
        dbMock.queryOne.mockResolvedValue({
            express_max_minutes: -10,
        });

        await expect(
            service.getSettings(tenant),
        ).rejects.toThrow(InternalServerErrorException);
    });


});